import prisma, { systemPrisma, tenantTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { isRoleAllowed, rolesForProfile } from '../config/roles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addMember } from '../services/membership.service.js';

// Organisation administration for ORG_ADMIN: members, invitations, access
// requests and branding. All reads and writes of tenant tables go through
// the tenant client, so ids from another organisation are simply not found.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const userFields = { select: { id: true, name: true, firstName: true, lastName: true, email: true, picture: true, googleSub: true } };

function requireAllowedRole(req, res) {
  const role = req.body?.role;
  if (!isRoleAllowed(req.org.profile, role)) {
    res.status(400).json({ error: 'That role is not available for this organisation.' });
    return null;
  }
  return role;
}

function presentMember(m) {
  const { googleSub, ...user } = m.user;
  return {
    id: m.id, role: m.role, createdAt: m.createdAt, lastUsedAt: m.lastUsedAt,
    user: { ...user, googleLinked: Boolean(googleSub) },
  };
}

// ── Organisation settings ─────────────────────────────────────────────
export const getOrganization = asyncHandler(async (req, res) => {
  const org = req.org;
  res.json({
    organization: {
      id: org.id, name: org.name, slug: org.slug, profile: org.profile, status: org.status,
      branding: org.branding, roles: rolesForProfile(org.profile),
      features: { fuelHub: org.fuelHubEnabled, aiFuelAnalytics: org.aiFuelAnalyticsEnabled },
    },
  });
});

// Branding only; profile, status and feature flags are platform decisions.
export const updateBranding = asyncHandler(async (req, res) => {
  const { displayName, primaryColor, logoUrl } = req.body || {};
  if (primaryColor && !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
    return res.status(400).json({ error: 'primaryColor must be a hex colour like #1d4ed8.' });
  }
  if (logoUrl && !/^https:\/\//.test(logoUrl)) {
    return res.status(400).json({ error: 'logoUrl must be an https URL.' });
  }
  const branding = {
    ...(req.org.branding || {}),
    ...(displayName !== undefined ? { displayName: String(displayName).slice(0, 80) } : {}),
    ...(primaryColor !== undefined ? { primaryColor } : {}),
    ...(logoUrl !== undefined ? { logoUrl } : {}),
  };
  const org = await systemPrisma.organization.update({ where: { id: req.org.id }, data: { branding } });
  res.json({ branding: org.branding });
});

// ── Members ───────────────────────────────────────────────────────────
export const listMembers = asyncHandler(async (req, res) => {
  const members = await prisma.membership.findMany({ include: { user: userFields }, orderBy: { createdAt: 'asc' } });
  res.json({ members: members.map(presentMember) });
});

async function countAdmins(tx) {
  return tx.membership.count({ where: { role: 'ORG_ADMIN' } });
}

export const updateMemberRole = asyncHandler(async (req, res) => {
  const role = requireAllowedRole(req, res);
  if (!role) return;
  const member = await prisma.membership.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  if (member.role === 'ORG_ADMIN' && role !== 'ORG_ADMIN' && (await countAdmins(prisma)) <= 1) {
    return res.status(400).json({ error: 'An organisation needs at least one admin.' });
  }
  const updated = await addMember({ organizationId: req.org.id, userId: member.userId, role });
  res.json({ member: updated });
});

export const removeMember = asyncHandler(async (req, res) => {
  const member = await prisma.membership.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!member) return res.status(404).json({ error: 'Member not found.' });
  if (member.userId === req.user.id) return res.status(400).json({ error: 'You cannot remove yourself.' });
  if (member.role === 'ORG_ADMIN' && (await countAdmins(prisma)) <= 1) {
    return res.status(400).json({ error: 'An organisation needs at least one admin.' });
  }
  await tenantTransaction(async (tx) => {
    await tx.student.deleteMany({ where: { userId: member.userId } });
    await tx.driver.deleteMany({ where: { userId: member.userId } });
    await tx.membership.delete({ where: { id: member.id } });
  });
  res.json({ message: 'Member removed.' });
});

// Lets an admin attach an email to a migrated account that has no Google
// sign-in yet, so its owner's first Google sign-in claims it. Only allowed
// for users who belong to this organisation alone, so an admin can never
// take over an account that another organisation relies on.
export const setLegacyMemberEmail = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

  const member = await prisma.membership.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!member) return res.status(404).json({ error: 'Member not found.' });

  const user = await systemPrisma.user.findUnique({
    where: { id: member.userId },
    include: { memberships: { select: { organizationId: true } } },
  });
  if (user.googleSub) return res.status(409).json({ error: 'This person already signs in with Google.' });
  if (user.memberships.some((m) => m.organizationId !== req.org.id)) {
    return res.status(409).json({ error: 'This person also belongs to another organisation; ask them to sign in with Google directly.' });
  }
  if (await systemPrisma.user.findUnique({ where: { email } })) {
    return res.status(409).json({ error: 'That email is already used by another account.' });
  }
  await systemPrisma.user.update({ where: { id: user.id }, data: { email } });
  res.json({ message: 'Email saved. They can now sign in with that Google account.' });
});

// ── Invitations ───────────────────────────────────────────────────────
export const listInvitations = asyncHandler(async (req, res) => {
  const invitations = await prisma.invitation.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    invitations: invitations.map((i) => ({ ...i, expired: i.expiresAt < new Date() })),
  });
});

export const createInvitation = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const role = requireAllowedRole(req, res);
  if (!role) return;

  const member = await prisma.membership.findFirst({ where: { user: { email } } });
  if (member) return res.status(409).json({ error: 'That person is already a member.' });

  const invitation = await tenantTransaction(async (tx) => {
    // Re-inviting replaces any pending invitation for the same email.
    await tx.invitation.updateMany({ where: { email, status: 'PENDING' }, data: { status: 'REVOKED' } });
    return tx.invitation.create({
      data: {
        email, role, invitedById: req.user.id,
        expiresAt: new Date(Date.now() + env.invitationTtlDays * 24 * 60 * 60 * 1000),
      },
    });
  });
  res.status(201).json({ invitation });
});

export const revokeInvitation = asyncHandler(async (req, res) => {
  const result = await prisma.invitation.updateMany({
    where: { id: Number(req.params.id) || 0, status: 'PENDING' },
    data: { status: 'REVOKED' },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Invitation not found.' });
  res.json({ message: 'Invitation revoked.' });
});

// ── Access requests ───────────────────────────────────────────────────
export const listAccessRequests = asyncHandler(async (req, res) => {
  const requests = await prisma.accessRequest.findMany({
    where: { status: 'PENDING' },
    include: { user: { select: { name: true, email: true, picture: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ requests });
});

export const approveAccessRequest = asyncHandler(async (req, res) => {
  const role = requireAllowedRole(req, res);
  if (!role) return;
  const request = await prisma.accessRequest.findFirst({ where: { id: Number(req.params.id) || 0, status: 'PENDING' } });
  if (!request) return res.status(404).json({ error: 'Request not found.' });

  await addMember({ organizationId: req.org.id, userId: request.userId, role });
  await prisma.accessRequest.update({
    where: { id: request.id },
    data: { status: 'APPROVED', reviewedById: req.user.id, reviewedAt: new Date() },
  });
  res.json({ message: 'Access approved.' });
});

export const rejectAccessRequest = asyncHandler(async (req, res) => {
  const result = await prisma.accessRequest.updateMany({
    where: { id: Number(req.params.id) || 0, status: 'PENDING' },
    data: { status: 'REJECTED', reviewedById: req.user.id, reviewedAt: new Date() },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Request not found.' });
  res.json({ message: 'Request rejected.' });
});
