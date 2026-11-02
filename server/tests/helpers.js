import prisma from '../src/config/db.js';
import { signAccessToken } from '../src/services/token.service.js';

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
  return prisma.organization.create({
    data: { name: name || `Org ${seq}`, slug: `org-${seq}-${Date.now()}`, profile, status, ...rest },
  });
}

// Creates a user with a membership in `org`, plus the Student/Driver profile
// record their role needs. Returns { user, membership, profile }.
export async function createMember(org, role, { firstName = role, lastName = `#${++seq}`, email } = {}) {
  const user = await prisma.user.create({
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
    profile = await prisma.student.create({ data: { userId: user.id, organizationId: org.id } });
  } else if (role === 'DRIVER') {
    profile = await prisma.driver.create({ data: { userId: user.id, organizationId: org.id } });
  }
  return { user, membership: user.memberships[0], profile };
}

// Removes every row from every application table between test files.
export async function truncateAll() {
  const tables = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
