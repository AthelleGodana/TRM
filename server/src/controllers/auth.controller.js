import bcrypt from 'bcryptjs';
import { systemPrisma as prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccessToken } from '../services/token.service.js';
import { activeMemberships } from '../services/membership.service.js';

// Legacy username/password endpoints. Sign-in is now Google-only:
// existing users are migrated by email on their first Google sign-in.
// LEGACY_PASSWORD_LOGIN=true temporarily re-enables password login during
// a migration window; self-registration is gone for good (people now
// request access or are invited).

const GONE = 'Password sign-in has been replaced by Sign in with Google.';

export const register = (req, res) => {
  res.status(410).json({ error: 'Self-registration has been replaced. Sign in with Google to request access or register your organisation.' });
};

export const login = asyncHandler(async (req, res) => {
  if (!env.legacyPasswordLogin) return res.status(410).json({ error: GONE });

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const [membership] = await activeMemberships(user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Your account is not linked to an active organisation.' });
  }

  const token = signAccessToken({
    userId: user.id, organizationId: membership.organizationId, role: membership.role,
  });
  res.json({ token });
});
