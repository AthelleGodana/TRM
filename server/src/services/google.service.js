import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';

const client = new OAuth2Client();

export class GoogleAuthError extends Error {
  constructor(message) {
    super(message);
    this.status = 401;
  }
}

// Verifies a Google ID token (signature, issuer, expiry and audience = our
// client ID) and returns only the profile fields we store. Google access
// and refresh tokens are never requested or stored.
export async function verifyGoogleIdToken(idToken) {
  if (!env.googleClientId) throw new Error('GOOGLE_CLIENT_ID is not configured.');
  if (typeof idToken !== 'string' || !idToken) throw new GoogleAuthError('Missing Google credential.');

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new GoogleAuthError('Invalid or expired Google sign-in. Please try again.');
  }

  if (!payload?.sub || !payload.email) throw new GoogleAuthError('Google did not return an account identifier.');
  if (payload.email_verified !== true) {
    throw new GoogleAuthError('Your Google email address is not verified.');
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email,
    picture: payload.picture || null,
  };
}
