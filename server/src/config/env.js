import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

if (nodeEnv === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

const bool = (value, fallback) => (value == null || value === '' ? fallback : value === 'true');
const int = (value, fallback) => (value ? Number.parseInt(value, 10) : fallback);
const lower = (value) => (value ? value.trim().toLowerCase() : null);

if (nodeEnv === 'production' && process.env.DEV_LOGIN === 'true') {
  throw new Error('DEV_LOGIN must not be enabled in production.');
}

export const env = {
  port: process.env.PORT || 5000,
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  refreshTokenTtlDays: int(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
  // A refresh token presented again within this window after rotation is
  // treated as a concurrent refresh (e.g. two tabs), not as theft.
  refreshReuseGraceSeconds: int(process.env.REFRESH_REUSE_GRACE_SECONDS, 10),
  cookieSecure: bool(process.env.COOKIE_SECURE, true),
  invitationTtlDays: int(process.env.INVITATION_TTL_DAYS, 14),
  superAdminEmail: lower(process.env.SUPER_ADMIN_EMAIL),
  defaultOrgAdminEmail: lower(process.env.DEFAULT_ORG_ADMIN_EMAIL),
  legacyPasswordLogin: bool(process.env.LEGACY_PASSWORD_LOGIN, false),
  // Development-only "sign in as a demo user" for seeded @demo.transtrack.local
  // accounts. Refused in production (see the check below).
  devLogin: bool(process.env.DEV_LOGIN, false),
  // GPS points older than this are deleted daily; 0 keeps them forever.
  gpsRetentionDays: int(process.env.GPS_RETENTION_DAYS, 90),

  fuel: {
    // 'null' (default) or 'http'. 'http' is only used for organisations
    // with aiFuelAnalyticsEnabled; everyone else gets the null provider.
    provider: (process.env.FUEL_ANALYTICS_PROVIDER || 'null').toLowerCase(),
    serviceUrl: process.env.AI_FUEL_SERVICE_URL || '',
    serviceSecret: process.env.AI_FUEL_SERVICE_SECRET || '',
    timeoutMs: int(process.env.AI_FUEL_SERVICE_TIMEOUT_MS, 30000),
    jobEnabled: bool(process.env.FUEL_ANALYSIS_JOB_ENABLED, false),
    jobIntervalMinutes: int(process.env.FUEL_ANALYSIS_INTERVAL_MINUTES, 1440),
    lookbackDays: int(process.env.FUEL_ANALYSIS_LOOKBACK_DAYS, 90),
  },

  mpesa: {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
  },
};
