import { systemPrisma as db } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyGoogleIdToken } from '../services/google.service.js';
import { signInWithGoogle, resolveSignInOutcome } from '../services/signin.service.js';
import { activeMemberships } from '../services/membership.service.js';
import {
  REFRESH_COOKIE, clearRefreshCookie, describeSession, issueSession, membershipForRefresh,
  revokeFamily, rotateRefreshToken, signOnboardingToken, SessionError,
} from '../services/session.service.js';

const OUTCOME_ERRORS = {
  ORG_PENDING: 'Your organisation is awaiting approval by the Transtrack team. You can sign in once it is approved.',
  ORG_SUSPENDED: 'Your organisation has been suspended. Contact your administrator.',
};

// Turns a sign-in outcome into { status, httpStatus, body }. A refresh
// cookie is set only for a successful session.
async function respondToOutcome(res, outcome) {
  if (outcome.status === 'PLATFORM' || outcome.status === 'ACTIVE') {
    const { accessToken, session } = await issueSession(res, outcome);
    return { status: 'ACTIVE', httpStatus: 200, body: { status: 'ACTIVE', accessToken, session } };
  }
  if (outcome.status === 'NEEDS_ONBOARDING') {
    return {
      status: outcome.status,
      httpStatus: 200,
      body: {
        status: outcome.status,
        onboardingToken: signOnboardingToken(outcome.user.id),
        user: { name: outcome.user.name, email: outcome.user.email, picture: outcome.user.picture },
      },
    };
  }
  return {
    status: outcome.status,
    httpStatus: 403,
    body: { status: outcome.status, code: outcome.status, error: OUTCOME_ERRORS[outcome.status] },
  };
}

async function completeGoogleSignIn(res, credential) {
  const profile = await verifyGoogleIdToken(credential);
  return respondToOutcome(res, await signInWithGoogle(profile));
}

// POST /auth/google — { credential } from Google Identity Services (popup / One Tap).
export const googleSignIn = asyncHandler(async (req, res) => {
  const result = await completeGoogleSignIn(res, req.body?.credential);
  res.status(result.httpStatus).json(result.body);
});

// POST /auth/google/redirect — Google's redirect-mode form post, used where
// popups are unreliable (e.g. an installed iOS PWA). Google sets a
// g_csrf_token cookie and posts the same value; both must match.
export const googleRedirect = asyncHandler(async (req, res) => {
  const cookieToken = req.cookies?.g_csrf_token;
  if (!cookieToken || cookieToken !== req.body?.g_csrf_token) {
    return res.redirect(303, `${env.clientUrl}/login?error=CSRF`);
  }
  try {
    const result = await completeGoogleSignIn(res, req.body?.credential);
    if (result.status === 'ACTIVE') return res.redirect(303, `${env.clientUrl}/auth/callback`);
    if (result.status === 'NEEDS_ONBOARDING') {
      // The fragment never reaches a server or logs.
      return res.redirect(303, `${env.clientUrl}/onboarding#token=${encodeURIComponent(result.body.onboardingToken)}`);
    }
    return res.redirect(303, `${env.clientUrl}/login?error=${result.status}`);
  } catch (err) {
    if (err.status === 401) return res.redirect(303, `${env.clientUrl}/login?error=GOOGLE`);
    throw err;
  }
});

// Cookie-authenticated endpoints also require this header. Cross-site forms
// cannot send custom headers, which adds CSRF protection on top of SameSite.
export function requireAppHeader(req, res, next) {
  if (req.get('X-Transtrack-Request') !== '1') {
    return res.status(403).json({ error: 'Missing request header.' });
  }
  next();
}

function sendSessionError(res, err) {
  clearRefreshCookie(res);
  return res.status(err.status).json({ error: err.message, code: err.code });
}

// POST /auth/refresh — rotates the refresh cookie and returns a new access token.
export const refresh = asyncHandler(async (req, res) => {
  try {
    const record = await rotateRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    const membership = await membershipForRefresh(record);
    const result = await issueSession(res, { user: record.user, membership, familyId: record.familyId });
    res.json(result);
  } catch (err) {
    if (err instanceof SessionError) return sendSessionError(res, err);
    throw err;
  }
});

// POST /auth/switch-org — { organizationId }. The requested organisation is
// only used after checking the caller's own active memberships; data
// queries never take an organisation from the request.
export const switchOrganization = asyncHandler(async (req, res) => {
  const organizationId = Number(req.body?.organizationId);
  const membership = (await activeMemberships(req.user.id)).find((m) => m.organizationId === organizationId);
  if (!membership) return res.status(404).json({ error: 'Organisation not found.' });

  try {
    const record = await rotateRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    if (record.userId !== req.user.id) throw new SessionError('Session mismatch.');
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    res.json(await issueSession(res, { user, membership, familyId: record.familyId }));
  } catch (err) {
    if (err instanceof SessionError) return sendSessionError(res, err);
    throw err;
  }
});

// POST /auth/logout — revokes every refresh token from this sign-in.
export const logout = asyncHandler(async (req, res) => {
  const value = req.cookies?.[REFRESH_COOKIE];
  if (value) {
    const record = await rotateRefreshToken(value).catch(() => null);
    if (record) await revokeFamily(record.familyId);
  }
  clearRefreshCookie(res);
  res.json({ message: 'Signed out.' });
});

// GET /auth/me — the current session description.
export const me = asyncHandler(async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.user.id } });
  const membership = req.user.superAdmin
    ? null
    : (await activeMemberships(req.user.id)).find((m) => m.organizationId === req.user.organizationId);
  res.json({ session: await describeSession(user, membership) });
});

// ── Development-only demo login ───────────────────────────────────────
// Lets developers sign in as seeded demo users without a Google client.
// Hidden (404) unless DEV_LOGIN=true outside production, and limited to
// @demo.transtrack.local accounts, so it can never reach a real account.
export const DEMO_EMAIL_DOMAIN = '@demo.transtrack.local';
const devLoginEnabled = () => env.devLogin && env.nodeEnv !== 'production';

export function requireDevLogin(req, res, next) {
  if (!devLoginEnabled()) return res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found.` });
  next();
}

// GET /auth/dev-accounts — the seeded demo users to choose from.
export const listDevAccounts = asyncHandler(async (req, res) => {
  const users = await db.user.findMany({
    where: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
    include: { memberships: { include: { organization: { select: { name: true, status: true } } } } },
    orderBy: { email: 'asc' },
  });
  res.json({
    accounts: users.map((u) => ({
      email: u.email,
      name: u.name || `${u.firstName} ${u.lastName}`.trim(),
      superAdmin: u.isSuperAdmin,
      memberships: u.memberships.map((m) => ({ organization: m.organization.name, role: m.role })),
    })),
  });
});

// POST /auth/dev-login — { email } of a demo user. Same session handling
// (cookie, rotation, pending/suspended checks) as Google sign-in.
export const devLogin = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email.endsWith(DEMO_EMAIL_DOMAIN)) {
    return res.status(403).json({ error: 'Only demo accounts can use development sign-in.' });
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'Demo account not found. Run npm run db:seed.' });
  const result = await respondToOutcome(res, await resolveSignInOutcome(user));
  res.status(result.httpStatus).json(result.body);
});

// GET /auth/config — public settings the sign-in page needs.
export const publicConfig = (req, res) => {
  res.json({
    googleClientId: env.googleClientId,
    legacyPasswordLogin: env.legacyPasswordLogin,
    devLogin: devLoginEnabled(),
  });
};
