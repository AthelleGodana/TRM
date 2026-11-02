import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import prisma, { TenantContextError, scopeArgs } from '../src/config/db.js';
import { runWithContext } from '../src/context/requestContext.js';
import { bearer, db, truncateAll } from './helpers.js';
import { seedTenant, snapshotTenant } from './seedTenants.js';

// Proves that a user of organisation A can never read or modify
// organisation B's data, through every HTTP endpoint and at each
// enforcement layer (Prisma extension, row-level security, triggers).
const app = createApp();
const MARKER_B = 'ZZB';
let A, B, snapshotB;

beforeAll(async () => {
  await truncateAll();
  A = await seedTenant('AAA');
  B = await seedTenant(MARKER_B);
  snapshotB = await snapshotTenant(B.org.id);
});

afterAll(() => db.$disconnect());

const get = (path, member) => request(app).get(path).set('Authorization', bearer(member));
const send = (method, path, member, body) =>
  request(app)[method](path).set('Authorization', bearer(member)).send(body);

describe('read endpoints never return another tenant\'s data', () => {
  const cases = [
    ['admin', '/api/admin/routes'],
    ['admin', '/api/admin/buses'],
    ['admin', '/api/admin/drivers'],
    ['admin', '/api/admin/students'],
    ['admin', '/api/admin/payments'],
    ['admin', '/api/admin/billing/overview'],
    ['admin', '/api/admin/fleet/overview'],
    ['admin', '/api/admin/slots'],
    ['admin', '/api/admin/vehicles/logs/:busA'],
    ['admin', '/api/admin/vehicles/safety/:busA'],
    ['officer', '/api/admin/buses'],
    ['officer', '/api/slots'],
    ['officer', '/api/vehicles/logs/:busA'],
    ['admin', '/api/gps/history/:busA'],
    ['admin', '/api/auth/me'],
    ['admin', '/api/org'],
    ['admin', '/api/org/members'],
    ['admin', '/api/org/invitations'],
    ['admin', '/api/org/access-requests'],
    ['admin', '/api/org/summary'],
    ['student', '/api/students/profile'],
    ['student', '/api/students/routes'],
    ['student', '/api/students/my-bus'],
    ['student', '/api/slots/my-slots'],
    ['student', '/api/payments/history'],
    ['student', '/api/gps/history/:busA'],
    ['driver', '/api/drivers/my-route'],
    ['driver', '/api/drivers/roster'],
    ['driver', '/api/vehicles/logs'],
    ['driver', '/api/vehicles/safety'],
    ['driver', '/api/gps/history/:busA'],
  ];

  it.each(cases)('%s GET %s', async (who, rawPath) => {
    const path = rawPath.replace(':busA', A.bus.id);
    const res = await get(path, A[who]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(MARKER_B);
  });

  it('fleet and billing totals only count the caller\'s organisation', async () => {
    const fleet = await get('/api/admin/fleet/overview', A.admin);
    expect(fleet.body.totalBuses).toBe(1);
    expect(fleet.body.totalStudents).toBe(1);
    const billing = await get('/api/admin/billing/overview', A.admin);
    expect(billing.body.totalRevenue).toBe(1500);
  });
});

describe('direct access to another tenant\'s records returns 404', () => {
  it.each([
    ['admin', 'get', '/api/gps/history/:busB'],
    ['student', 'get', '/api/gps/history/:busB'],
    ['admin', 'get', '/api/admin/vehicles/logs/:busB'],
    ['admin', 'get', '/api/admin/vehicles/safety/:busB'],
    ['admin', 'put', '/api/admin/buses/:busB', { capacity: 99 }],
    ['admin', 'put', '/api/admin/buses/status', { busId: ':busB', status: 'OUT_OF_FUEL' }],
    ['admin', 'post', '/api/admin/vehicles/logs', { busId: ':busB', type: 'MAINTENANCE', notes: 'x' }],
    ['admin', 'post', '/api/admin/vehicles/safety', { busId: ':busB', item: 'Brakes', passed: false }],
    ['admin', 'post', '/api/admin/slots', { routeId: ':routeB', time: '07:00' }],
    ['admin', 'post', '/api/admin/buses', { licensePlate: 'KXX 999', driverId: ':driverB' }],
    ['admin', 'put', '/api/admin/buses/:busA', { driverId: ':driverB' }],
    ['student', 'post', '/api/slots/book', { slotId: ':slotB' }],
    ['admin', 'patch', '/api/org/members/:memberB', { role: 'DRIVER' }],
    ['admin', 'delete', '/api/org/members/:memberB'],
    ['admin', 'put', '/api/org/members/:memberB/email', { email: 'hijack@test.example' }],
    ['admin', 'delete', '/api/org/invitations/:inviteB'],
    ['admin', 'post', '/api/org/access-requests/:requestB/approve', { role: 'DRIVER' }],
    ['admin', 'post', '/api/org/access-requests/:requestB/reject'],
  ])('%s %s %s', async (who, method, rawPath, rawBody) => {
    const fill = (v) => (typeof v === 'string'
      ? v.replace(':busB', B.bus.id).replace(':busA', A.bus.id).replace(':routeB', B.route.id)
        .replace(':driverB', B.driver.profile.id).replace(':slotB', B.slot.id)
        .replace(':memberB', B.driver.membership.id).replace(':inviteB', B.invitation.id)
        .replace(':requestB', B.accessRequest.id)
      : v);
    const body = rawBody && Object.fromEntries(Object.entries(rawBody).map(([k, v]) => [k, fill(v)]));
    const res = await send(method, fill(rawPath), A[who], body);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(MARKER_B);
  });

  it('student cannot register on another tenant\'s route', async () => {
    const res = await send('post', '/api/students/register-route', A.student, {
      routeId: B.route.id, arrivePickupPointId: B.point.id,
    });
    expect(res.status).toBe(400);
  });

  it('bulk removal ignores other tenants\' ids', async () => {
    await send('post', '/api/admin/students/remove', A.admin, { studentIds: [B.student.profile.id] });
    await send('post', '/api/admin/drivers/remove', A.admin, { driverIds: [B.driver.profile.id] });
  });

  it('organisation B is completely unchanged', async () => {
    expect(await snapshotTenant(B.org.id)).toEqual(snapshotB);
  });
});

describe('enforcement layers', () => {
  it('the tenant client refuses to run without a tenant context', async () => {
    await expect(prisma.bus.findMany()).rejects.toBeInstanceOf(TenantContextError);
  });

  it('the tenant client blocks global models', async () => {
    await runWithContext({ organizationId: A.org.id }, async () => {
      await expect(prisma.user.findMany()).rejects.toBeInstanceOf(TenantContextError);
      await expect(prisma.organization.findMany()).rejects.toBeInstanceOf(TenantContextError);
    });
  });

  it('the extension overrides any organizationId the caller supplies', async () => {
    expect(scopeArgs('findMany', { where: { organizationId: B.org.id } }, A.org.id).where.organizationId).toBe(A.org.id);
    await runWithContext({ organizationId: A.org.id }, async () => {
      const buses = await prisma.bus.findMany({ where: { organizationId: B.org.id } });
      expect(buses.map((b) => b.id)).toEqual([A.bus.id]);
      await expect(prisma.bus.create({ data: { licensePlate: 'X', organizationId: B.org.id } }))
        .rejects.toBeInstanceOf(TenantContextError);
    });
  });

  describe('row-level security without the Prisma extension', () => {
    // A raw connection as the application role, bypassing layer 1 entirely.
    const raw = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    afterAll(() => raw.$disconnect());

    const asOrg = (orgId, sql) => raw.$transaction([
      raw.$executeRaw`SELECT set_config('app.current_org', ${String(orgId)}, true)`,
      sql(),
    ]).then(([, rows]) => rows);

    it('only shows rows of the organisation in app.current_org', async () => {
      const rows = await asOrg(A.org.id, () => raw.$queryRaw`SELECT "organizationId" FROM "Bus"`);
      expect(rows.map((r) => r.organizationId)).toEqual([A.org.id]);
    });

    it('shows nothing when no organisation is set', async () => {
      expect(await raw.$queryRaw`SELECT id FROM "Bus"`).toEqual([]);
      expect(await raw.$queryRaw`SELECT id FROM "Payment"`).toEqual([]);
    });

    it('rejects writes into another organisation', async () => {
      await expect(asOrg(A.org.id, () => raw.$executeRaw`
        INSERT INTO "Route" ("organizationId", "name") VALUES (${B.org.id}, 'sneaky')`)).rejects.toThrow();
      const updated = await asOrg(A.org.id, () => raw.$executeRaw`
        UPDATE "Bus" SET capacity = 1 WHERE id = ${B.bus.id}`);
      expect(updated).toBe(0);
    });

    it('fills organizationId from app.current_org on nested creates', async () => {
      const rows = await asOrg(A.org.id, () => raw.$queryRaw`
        INSERT INTO "Route" ("name") VALUES ('defaulted') RETURNING "organizationId"`);
      expect(rows[0].organizationId).toBe(A.org.id);
    });
  });

  it('the database rejects references to another tenant\'s rows even for system code', async () => {
    await expect(db.bus.create({
      data: { organizationId: A.org.id, licensePlate: 'KTR 001', driverId: B.driver.profile.id },
    })).rejects.toMatchObject({ code: 'P2003' }); // raised by the same_tenant trigger
  });

  it('licence plates are unique per organisation, not globally', async () => {
    await runWithContext({ organizationId: A.org.id }, async () => {
      const bus = await prisma.bus.create({ data: { licensePlate: B.bus.licensePlate } });
      expect(bus.organizationId).toBe(A.org.id);
      await expect(prisma.bus.create({ data: { licensePlate: B.bus.licensePlate } })).rejects.toThrow();
    });
  });
});
