import { PrismaClient, Prisma } from '@prisma/client';
import { getContext, runWithContext } from '../context/requestContext.js';

// Two connections with different database roles:
//
//  - The tenant client (default export) connects as the application role,
//    which is subject to PostgreSQL row-level security. Every query on a
//    tenant model gets the caller's organizationId injected (layer 1) and
//    runs in a transaction that sets app.current_org so the RLS policies
//    apply (layer 2). Without a tenant context it refuses to run.
//
//  - systemPrisma connects as a role with BYPASSRLS. It is only for code
//    that legitimately works across tenants: authentication, the M-Pesa
//    callback, platform (SUPER_ADMIN) operations and scheduled jobs.

// Models that hold tenant data. Must match the tables with RLS policies.
export const TENANT_MODELS = new Set([
  'Student', 'Driver', 'Route', 'PickupPoint', 'Bus', 'PickupSlot',
  'TripRoster', 'VehicleLog', 'GpsLog', 'Payment',
  'Membership', 'Invitation', 'AccessRequest', 'PassengerGuardian',
]);

// Global models the tenant client must never touch directly; they would
// expose other organisations' users or sessions. Relation includes still work.
const SYSTEM_ONLY_MODELS = new Set(['User', 'Organization', 'RefreshToken']);

export class TenantContextError extends Error {
  constructor(message = 'No tenant context for a tenant-scoped query.') {
    super(message);
    this.status = 500;
  }
}

const base = new PrismaClient();

export const systemPrisma = process.env.DATABASE_URL_SYSTEM
  ? new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_SYSTEM } } })
  : base;

function rejectOrgChange(data) {
  if (data && ('organizationId' in data || 'organization' in data)) {
    throw new TenantContextError('organizationId cannot be set or changed by tenant code.');
  }
  return data;
}

// Layer 1: add the tenant filter / value to the query arguments. Anything
// the caller passed for organizationId in a where clause is overwritten.
export function scopeArgs(operation, args = {}, organizationId) {
  const scoped = { ...args };
  switch (operation) {
    case 'create':
      scoped.data = { ...rejectOrgChange(args.data), organizationId };
      break;
    case 'createMany':
    case 'createManyAndReturn':
      scoped.data = [].concat(args.data).map((d) => ({ ...rejectOrgChange(d), organizationId }));
      break;
    case 'upsert':
      scoped.where = { ...args.where, organizationId };
      scoped.create = { ...rejectOrgChange(args.create), organizationId };
      scoped.update = rejectOrgChange(args.update);
      break;
    case 'update':
    case 'updateMany':
      scoped.where = { ...args.where, organizationId };
      scoped.data = rejectOrgChange(args.data);
      break;
    default:
      // findUnique(OrThrow), findFirst(OrThrow), findMany, count, aggregate,
      // groupBy, delete, deleteMany
      scoped.where = { ...args.where, organizationId };
  }
  return scoped;
}

function setOrgSql(organizationId) {
  return base.$executeRaw`SELECT set_config('app.current_org', ${String(organizationId)}, true)`;
}

const tenantPrisma = base.$extends({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (SYSTEM_ONLY_MODELS.has(model)) {
          throw new TenantContextError(`${model} is not accessible from the tenant client.`);
        }
        if (!TENANT_MODELS.has(model)) return query(args);

        const ctx = getContext();
        if (!ctx?.organizationId) throw new TenantContextError();
        const scoped = scopeArgs(operation, args, ctx.organizationId);

        // Inside tenantTransaction() app.current_org is already set on the
        // transaction's connection.
        if (ctx.inTenantTransaction) return query(scoped);

        // Layer 2: run the query in a transaction that sets the RLS setting.
        const [, result] = await base.$transaction([setOrgSql(ctx.organizationId), query(scoped)]);
        return result;
      },
    },
  },
});

// Runs fn(tx) in one interactive transaction scoped to the current tenant.
// Use it whenever several writes must succeed or fail together.
export function tenantTransaction(fn, options) {
  const ctx = getContext();
  if (!ctx?.organizationId) throw new TenantContextError();
  return runWithContext({ ...ctx, inTenantTransaction: true }, () =>
    tenantPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_org', ${String(ctx.organizationId)}, true)`;
      return fn(tx);
    }, options)
  );
}

// Runs fn inside a tenant context for trusted system code (e.g. the M-Pesa
// callback or a scheduled job), after the organisation has been resolved.
export function asTenant(organizationId, fn) {
  return runWithContext({ organizationId, userId: null, role: 'SYSTEM' }, fn);
}

// Warns (or, in production, refuses to start) when the application role
// would bypass row-level security, which silently disables layer 2.
export async function checkDatabaseRoles({ production }) {
  const [role] = await base.$queryRaw`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  if (role?.rolsuper || role?.rolbypassrls) {
    const msg = 'DATABASE_URL connects as a superuser or BYPASSRLS role, so row-level security is not enforced. '
      + 'Connect as the application role (see README: Database roles).';
    if (production) throw new Error(msg);
    console.warn(`WARNING: ${msg}`);
  }
}

export { Prisma };
export default tenantPrisma;
