import { systemPrisma as db } from '../config/db.js';
import { env } from '../config/env.js';

// Seeds the first platform SUPER_ADMIN from SUPER_ADMIN_EMAIL. Their first
// Google sign-in with that (verified) email links to this record.
export async function ensureSuperAdmin(email = env.superAdminEmail) {
  if (!email) return null;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return existing.isSuperAdmin ? existing : db.user.update({ where: { id: existing.id }, data: { isSuperAdmin: true } });
  }
  return db.user.create({ data: { email, firstName: 'Platform', lastName: 'Admin', isSuperAdmin: true } });
}

// Legacy admins had no email, so they cannot be matched on their first
// Google sign-in. DEFAULT_ORG_ADMIN_EMAIL attaches an email to the migrated
// admin of the Default Organisation (preferring the 'admin' username).
export async function linkDefaultOrgAdmin(email = env.defaultOrgAdminEmail) {
  if (!email) return null;
  if (await db.user.findUnique({ where: { email } })) return null;
  const candidates = await db.membership.findMany({
    where: { role: 'ORG_ADMIN', organization: { slug: 'default' }, user: { googleSub: null, email: null } },
    include: { user: true },
    orderBy: { userId: 'asc' },
  });
  const target = candidates.find((m) => m.user.username === 'admin') || candidates[0];
  if (!target) return null;
  return db.user.update({ where: { id: target.userId }, data: { email } });
}

export async function runBootstrap() {
  await ensureSuperAdmin();
  await linkDefaultOrgAdmin();
}
