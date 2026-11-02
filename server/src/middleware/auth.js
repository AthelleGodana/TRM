import { systemPrisma as prisma } from '../config/db.js';
import { runWithContext } from '../context/requestContext.js';
import { verifyAccessToken } from '../services/token.service.js';
import { isRoleAllowed, SUPER_ADMIN } from '../config/roles.js';

// Resolves an access token into the caller's identity. The membership and
// organisation are re-checked on every call so that suspensions, removals
// and role changes take effect immediately rather than when the token
// expires. Returns { user, org } or { error, status, code }.
export async function resolveSession(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return { error: 'Invalid or expired token.', status: 401 };
  }

  if (payload.superAdmin) {
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.isSuperAdmin) return { error: 'Invalid or expired token.', status: 401 };
    return { user: { id: user.id, role: SUPER_ADMIN, superAdmin: true, organizationId: null } };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: payload.userId, organizationId: payload.organizationId } },
    include: { organization: true },
  });
  if (!membership || membership.role !== payload.role) {
    return { error: 'Invalid or expired token.', status: 401 };
  }
  const org = membership.organization;
  if (org.status !== 'ACTIVE') {
    return {
      error: org.status === 'PENDING'
        ? 'This organisation is awaiting approval.'
        : 'This organisation has been suspended.',
      code: `ORG_${org.status}`,
      status: 403,
    };
  }
  if (!isRoleAllowed(org.profile, membership.role)) {
    return { error: 'Your role is not available for this organisation.', status: 403 };
  }

  return {
    user: { id: payload.userId, role: membership.role, superAdmin: false, organizationId: org.id },
    org,
  };
}

// Verifies the Bearer access token and attaches req.user (id, role,
// organizationId, superAdmin) and req.org. The organisation always comes
// from the verified token, never from the request body or query string.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const session = await resolveSession(token);
    if (session.error) {
      return res.status(session.status).json({ error: session.error, code: session.code });
    }
    req.user = session.user;
    req.org = session.org || null;
    // Everything downstream (tenant Prisma client included) reads the
    // organisation from this context.
    runWithContext(
      { userId: session.user.id, organizationId: session.user.organizationId, role: session.user.role },
      next
    );
  } catch (err) {
    next(err);
  }
}

// Restricts a route to specific roles. Use after requireAuth.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    next();
  };
}
