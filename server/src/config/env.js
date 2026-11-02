import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

if (nodeEnv === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

export const env = {
  port: process.env.PORT || 5000,
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mpesa: {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
  },
};
