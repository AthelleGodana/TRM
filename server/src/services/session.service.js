import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { systemPrisma as db } from '../config/db.js';
import { env } from '../config/env.js';
import {
  PASSENGER_LABELS, VEHICLE_LABELS, profileFeatures, roleLabel, rolesForProfile, SUPER_ADMIN,
} from '../config/roles.js';
import { signAccessToken } from './token.service.js';
import { activeMemberships, touchMembership } from './membership.service.js';

export const REFRESH_COOKIE = 'tt_refresh';
const COOKIE_PATH = '/api/auth';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

export function clearRefreshCookie(res) {
  const { maxAge, ...opts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
}

async function createRefreshToken({ userId, organizationId, familyId }) {
  const value = crypto.randomBytes(32).toString('base64url');
  await db.refreshToken.create({
    data: {
      userId,
      organizationId: organizationId ?? null,
      familyId: familyId || crypto.randomUUID(),
      tokenHash: hash(value),
      expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000),
    },
  });
  return value;
}

export async function revokeFamily(familyId) {
  await db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// The session description the client renders from: who the user is, the
// active organisation (with its feature flags and role labels) and every
// organisation they can switch to.
export async function describeSession(user, membership) {
  const memberships = user.isSuperAdmin ? [] : await activeMemberships(user.id);
  const org = membership?.organization || null;
  return {
    user: {
      id: user.id,
      name: user.name || `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      picture: user.picture,
    },
    superAdmin: Boolean(user.isSuperAdmin),
    role: membership ? membership.role : SUPER_ADMIN,
    roleLabel: roleLabel(org?.profile, membership ? membership.role : SUPER_ADMIN),
    organization: org && {
      id: org.id,
      name: org.name,
      slug: org.slug,
      profile: org.profile,
      branding: org.branding,
      passengerLabel: PASSENGER_LABELS[org.profile],
      vehicleLabel: VEHICLE_LABELS[org.profile]?.one || 'Vehicle',
      vehiclesLabel: VEHICLE_LABELS[org.profile]?.many || 'Vehicles',
      roles: rolesForProfile(org.profile),
      features: {
        ...profileFeatures(org.profile),
        fuelHub: org.fuelHubEnabled,
        aiFuelAnalytics: org.aiFuelAnalyticsEnabled,
      },
    },
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      name: m.organization.name,
      role: m.role,
      roleLabel: roleLabel(m.organization.profile, m.role),
    })),
  };
}

// Issues an access token and a fresh refresh-token family (new sign-in),
// or continues an existing family (refresh / organisation switch).
export async function issueSession(res, { user, membership, familyId }) {
  const organizationId = membership?.organizationId ?? null;
  const refresh = await createRefreshToken({ userId: user.id, organizationId, familyId });
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
  if (membership) await touchMembership(membership.id);

  const accessToken = signAccessToken({
    userId: user.id,
    organizationId,
    role: membership?.role ?? null,
    superAdmin: !membership && user.isSuperAdmin,
  });
  return { accessToken, session: await describeSession(user, membership) };
}

export class SessionError extends Error {
  constructor(message, status = 401, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Validates and rotates a refresh token. Each token works once; presenting
// a rotated token again (outside a short grace window for concurrent tabs)
// is treated as theft and revokes the whole family.
export async function rotateRefreshToken(value) {
  if (!value) throw new SessionError('Not signed in.');
  const record = await db.refreshToken.findUnique({ where: { tokenHash: hash(value) }, include: { user: true } });
  if (!record || record.expiresAt < new Date()) throw new SessionError('Your session has expired. Please sign in again.');

  const withinGrace = (rotatedAt) =>
    rotatedAt && Date.now() - rotatedAt.getTime() < env.refreshReuseGraceSeconds * 1000;
  // A family with no live token was logged out or revoked for reuse.
  const familyAlive = async () =>
    (await db.refreshToken.count({ where: { familyId: record.familyId, revokedAt: null } })) > 0;

  if (record.revokedAt) {
    if (!withinGrace(record.rotatedAt) || !(await familyAlive())) {
      await revokeFamily(record.familyId);
      throw new SessionError('Your session has expired. Please sign in again.');
    }
  } else {
    const now = new Date();
    const claimed = await db.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: now, rotatedAt: now },
    });
    // Lost a race with a concurrent refresh of the same token.
    if (claimed.count === 0) {
      const fresh = await db.refreshToken.findUnique({ where: { id: record.id } });
      if (!withinGrace(fresh.rotatedAt)) {
        await revokeFamily(record.familyId);
        throw new SessionError('Your session has expired. Please sign in again.');
      }
    }
  }

  return record;
}

// Resolves which membership a refreshed session continues with.
export async function membershipForRefresh(record) {
  if (record.organizationId == null) {
    if (record.user.isSuperAdmin) return null;
    throw new SessionError('Your session has expired. Please sign in again.');
  }
  const membership = (await activeMemberships(record.userId))
    .find((m) => m.organizationId === record.organizationId);
  if (!membership) {
    throw new SessionError('You no longer have access to this organisation.', 403, 'MEMBERSHIP_INACTIVE');
  }
  return membership;
}

// Short-lived token that only lets a signed-in Google user without an
// organisation request access or register a new organisation.
export function signOnboardingToken(userId) {
  return jwt.sign({ typ: 'onboarding', userId }, env.jwtSecret, { expiresIn: '30m', issuer: 'transtrack' });
}

export function verifyOnboardingToken(token) {
  const payload = jwt.verify(token, env.jwtSecret, { issuer: 'transtrack', algorithms: ['HS256'] });
  if (payload.typ !== 'onboarding') throw new Error('Not an onboarding token');
  return payload;
}
