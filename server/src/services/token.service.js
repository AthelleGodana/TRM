import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'transtrack';

// Short-lived access token carrying the active organisation and role.
// organizationId and role are null for a platform (SUPER_ADMIN) session.
export function signAccessToken({ userId, organizationId, role, superAdmin = false }) {
  return jwt.sign(
    { typ: 'access', userId, organizationId: organizationId ?? null, role: role ?? null, superAdmin },
    env.jwtSecret,
    { expiresIn: env.accessTokenTtl, issuer: ISSUER, algorithm: 'HS256' }
  );
}

// Throws if the token is invalid, expired or not an access token.
export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtSecret, { issuer: ISSUER, algorithms: ['HS256'] });
  if (payload.typ !== 'access') throw new Error('Not an access token');
  return payload;
}
