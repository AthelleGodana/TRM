import { PrismaClient } from '@prisma/client';
import { systemPrisma } from '../src/config/db.js';
import { signAccessToken } from '../src/services/token.service.js';

// Fixtures are written with the system (BYPASSRLS) client, the way trusted
// platform code would; the code under test uses the tenant client.
export const db = systemPrisma;

// Owner connection, only used to truncate tables between test files.
const owner = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });

let seq = 0;

export function tokenFor({ user, membership }) {
  return signAccessToken({
    userId: user.id,
    organizationId: membership.organizationId,
    role: membership.role,
  });
}

export function bearer(member) {
  return `Bearer ${tokenFor(member)}`;
}

export async function createOrg({ name, profile = 'UNIVERSITY', status = 'ACTIVE', ...rest } = {}) {
  seq += 1;
  return db.organization.create({
    data: { name: name || `Org ${seq}`, slug: `org-${seq}-${Date.now()}`, profile, status, ...rest },
  });
}

// Creates a user with a membership in `org`, plus the Student/Driver profile
// record their role needs. Returns { user, membership, profile }.
export async function createMember(org, role, { firstName = role, lastName = `#${++seq}`, email } = {}) {
  const user = await db.user.create({
    data: {
      firstName,
      lastName,
      email: email || `${role.toLowerCase()}-${seq}-${Date.now()}@test.example`,
      memberships: { create: { organizationId: org.id, role } },
    },
    include: { memberships: true },
  });
  let profile = null;
  if (role === 'STUDENT') {
    profile = await db.student.create({ data: { userId: user.id, organizationId: org.id } });
  } else if (role === 'DRIVER') {
    profile = await db.driver.create({ data: { userId: user.id, organizationId: org.id } });
  }
  return { user, membership: user.memberships[0], profile };
}

// Removes every row from every application table between test files.
export async function truncateAll() {
  const tables = await owner.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await owner.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
