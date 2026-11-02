import { systemPrisma as db } from '../config/db.js';
import { isRoleAllowed } from '../config/roles.js';

// Profile records some roles need inside an organisation.
async function ensureRoleProfile(tx, organizationId, userId, role) {
  const where = { organizationId_userId: { organizationId, userId } };
  if (role === 'STUDENT') {
    await tx.student.upsert({ where, update: {}, create: { organizationId, userId } });
  } else if (role === 'DRIVER') {
    await tx.driver.upsert({ where, update: {}, create: { organizationId, userId } });
  }
}

// Adds a user to an organisation (or changes their role there), creating
// the Student/Driver record the role needs. Idempotent. Callers must have
// authorised the change; this runs with the system client.
export async function addMember({ organizationId, userId, role }, tx = db) {
  const org = await tx.organization.findUnique({ where: { id: organizationId } });
  if (!org || !isRoleAllowed(org.profile, role)) {
    const err = new Error('That role is not available for this organisation.');
    err.status = 400;
    throw err;
  }
  const membership = await tx.membership.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    update: { role },
    create: { userId, organizationId, role },
  });
  await ensureRoleProfile(tx, organizationId, userId, role);
  return membership;
}

// Memberships the user can sign in with right now, most recently used first.
export async function activeMemberships(userId) {
  const memberships = await db.membership.findMany({
    where: { userId, organization: { status: 'ACTIVE' } },
    include: { organization: true },
    orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  return memberships.filter((m) => isRoleAllowed(m.organization.profile, m.role));
}

export async function touchMembership(membershipId) {
  await db.membership.update({ where: { id: membershipId }, data: { lastUsedAt: new Date() } });
}
