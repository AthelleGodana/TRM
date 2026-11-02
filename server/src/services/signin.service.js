import { systemPrisma as db } from '../config/db.js';
import { env } from '../config/env.js';
import { addMember, activeMemberships } from './membership.service.js';

function splitName(name) {
  const parts = (name || '').trim().split(/\s+/);
  return { firstName: parts[0] || 'User', lastName: parts.slice(1).join(' ') };
}

// Finds the user for a verified Google profile. Users are identified by
// Google "sub"; on a first sign-in an existing account with the same
// (verified) email and no Google link yet is claimed, which migrates
// legacy password users and pre-seeded admins.
async function upsertGoogleUser(profile) {
  const isSuperAdmin = Boolean(env.superAdminEmail && profile.email === env.superAdminEmail);
  const fields = { name: profile.name, picture: profile.picture, lastLoginAt: new Date() };

  let user = await db.user.findUnique({ where: { googleSub: profile.sub } });
  if (!user) {
    const byEmail = await db.user.findUnique({ where: { email: profile.email } });
    if (byEmail && !byEmail.googleSub) {
      user = await db.user.update({ where: { id: byEmail.id }, data: { googleSub: profile.sub } });
    } else if (byEmail) {
      // The email belongs to a different Google account; keep it with them.
      user = await db.user.create({ data: { googleSub: profile.sub, ...splitName(profile.name), ...fields } });
      return user;
    } else {
      user = await db.user.create({
        data: { googleSub: profile.sub, email: profile.email, ...splitName(profile.name), ...fields },
      });
    }
  }

  // Keep the stored email in step with Google unless another account has it.
  const emailTaken = profile.email !== user.email
    && (await db.user.findUnique({ where: { email: profile.email } }));
  return db.user.update({
    where: { id: user.id },
    data: {
      ...fields,
      ...(emailTaken ? {} : { email: profile.email }),
      ...(isSuperAdmin ? { isSuperAdmin: true } : {}),
    },
  });
}

// Creates the pupils named on a PARENT invitation (CSV import) and links
// them to the parent. A pupil with the same name already linked to this
// parent is reused, so re-importing the same file does not duplicate.
async function linkInvitedChildren(tx, invitation, user) {
  const children = Array.isArray(invitation.metadata?.children) ? invitation.metadata.children : [];
  const organizationId = invitation.organizationId;
  for (const child of children) {
    const firstName = String(child?.firstName || '').trim().slice(0, 80);
    const lastName = String(child?.lastName || '').trim().slice(0, 80);
    if (!firstName || !lastName) continue;
    const pupil = await tx.student.findFirst({
      where: { organizationId, userId: null, firstName, lastName, guardians: { some: { userId: user.id } } },
    }) || await tx.student.create({ data: { organizationId, firstName, lastName } });
    await tx.passengerGuardian.upsert({
      where: { organizationId_studentId_userId: { organizationId, studentId: pupil.id, userId: user.id } },
      update: {},
      create: { organizationId, studentId: pupil.id, userId: user.id },
    });
  }
}

// Turns pending, unexpired invitations for this email into memberships.
async function acceptInvitations(user) {
  if (!user.email) return;
  const invitations = await db.invitation.findMany({
    where: {
      email: user.email,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
      organization: { status: { not: 'SUSPENDED' } },
    },
  });
  for (const invitation of invitations) {
    await db.$transaction(async (tx) => {
      const existing = await tx.membership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
      });
      // An existing membership keeps its role; the invitation is just used up.
      if (!existing) {
        await addMember({ organizationId: invitation.organizationId, userId: user.id, role: invitation.role }, tx);
      }
      if (invitation.role === 'PARENT') await linkInvitedChildren(tx, invitation, user);
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: user.id },
      });
    });
  }
}

// Decides what a verified Google user gets:
//   { status: 'PLATFORM', user }                 SUPER_ADMIN session
//   { status: 'ACTIVE', user, membership }       organisation session
//   { status: 'ORG_PENDING' | 'ORG_SUSPENDED' }   cannot sign in yet
//   { status: 'ACCESS_PENDING', user, organizations }   request awaiting an admin
//   { status: 'ACCESS_REJECTED', user, organizations }  every request was declined
//   { status: 'NEEDS_ONBOARDING', user }          request access / register
export async function signInWithGoogle(profile) {
  const user = await upsertGoogleUser(profile);
  await acceptInvitations(user);
  return resolveSignInOutcome(user);
}

// The outcome for an already-identified user (shared by Google sign-in and
// the development-only demo login).
export async function resolveSignInOutcome(user) {
  if (user.isSuperAdmin) return { status: 'PLATFORM', user };

  const active = await activeMemberships(user.id);
  if (active.length) return { status: 'ACTIVE', user, membership: active[0] };

  const others = await db.membership.findMany({
    where: { userId: user.id },
    include: { organization: { select: { name: true, status: true } } },
  });
  if (others.some((m) => m.organization.status === 'PENDING')) {
    return { status: 'ORG_PENDING', user, organizations: others.map((m) => m.organization.name) };
  }
  if (others.some((m) => m.organization.status === 'SUSPENDED')) {
    return { status: 'ORG_SUSPENDED', user };
  }

  const requests = await db.accessRequest.findMany({
    where: { userId: user.id, status: { in: ['PENDING', 'REJECTED'] }, organization: { status: 'ACTIVE' } },
    include: { organization: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const pending = requests.filter((r) => r.status === 'PENDING');
  if (pending.length) {
    return { status: 'ACCESS_PENDING', user, organizations: pending.map((r) => r.organization.name) };
  }
  if (requests.length) {
    return { status: 'ACCESS_REJECTED', user, organizations: requests.map((r) => r.organization.name) };
  }
  return { status: 'NEEDS_ONBOARDING', user };
}
