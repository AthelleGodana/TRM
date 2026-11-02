import api, { APP_HEADERS } from './api';

export const getAuthConfig = () => api.get('/auth/config').then((r) => r.data);

// Resolves for 200 outcomes (ACTIVE, NEEDS_ONBOARDING) and for the 403
// "organisation pending/suspended" outcomes, so the page can explain them.
export const signInWithGoogle = (credential) =>
  api.post('/auth/google', { credential })
    .then((r) => r.data)
    .catch((err) => {
      if (err.response?.status === 403 && err.response.data?.status) return err.response.data;
      throw err;
    });

export const logoutSession = () => api.post('/auth/logout', null, { headers: APP_HEADERS });
export const switchOrganization = (organizationId) =>
  api.post('/auth/switch-org', { organizationId }, { headers: APP_HEADERS }).then((r) => r.data);
export const fetchMe = () => api.get('/auth/me').then((r) => r.data);

// Onboarding calls authenticate with the short-lived onboarding token.
const onboarding = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
export const requestAccess = (token, body) =>
  api.post('/onboarding/access-requests', body, onboarding(token)).then((r) => r.data);
export const registerOrganization = (token, body) =>
  api.post('/onboarding/organizations', body, onboarding(token)).then((r) => r.data);

// Development-only demo login (server must run with DEV_LOGIN=true).
export const getDevAccounts = () => api.get('/auth/dev-accounts').then((r) => r.data);
export const devLoginRequest = (email) =>
  api.post('/auth/dev-login', { email })
    .then((r) => r.data)
    .catch((err) => {
      if (err.response?.status === 403 && err.response.data?.status) return err.response.data;
      throw err;
    });

// Legacy username/password login, only offered while LEGACY_PASSWORD_LOGIN is on.
export const loginUser = (payload) => api.post('/auth/login', payload).then((r) => r.data);
