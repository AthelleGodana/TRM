import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { vi } from 'vitest';
import { OAuth2Client } from 'google-auth-library';

// Signs ID tokens the way Google does, with a local RSA key. Only the
// certificate download is stubbed, so google-auth-library still performs
// the real signature, issuer, audience and expiry checks.
const KID = 'test-kid';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

export function stubGoogleCerts() {
  return vi.spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync').mockResolvedValue({
    certs: { [KID]: publicKey.export({ type: 'spki', format: 'pem' }) },
    format: 'PEM',
  });
}

let subSeq = 1000;
export const nextSub = () => String(++subSeq);

export function googleToken({
  sub = nextSub(), email, name = 'Test User', emailVerified = true,
  audience = process.env.GOOGLE_CLIENT_ID, expiresIn = 300, key = privateKey,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: 'https://accounts.google.com', aud: audience, sub, email, email_verified: emailVerified,
      name, picture: 'https://example.com/p.png', iat: now - 10, exp: now + expiresIn,
    },
    key,
    { algorithm: 'RS256', keyid: KID }
  );
}

export const wrongKey = other.privateKey;
