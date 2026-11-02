import axios from 'axios';
import { getAccessToken, setAccessToken } from './tokenStore';

// Base Axios instance. The Vite dev server proxies /api to the Express
// server (see vite.config.js), so no hardcoded host/port is needed here.
const api = axios.create({ baseURL: '/api', withCredentials: true });

// Cookie-authenticated auth endpoints require this header (CSRF defence).
export const APP_HEADERS = { 'X-Transtrack-Request': '1' };

let refreshing = null;
let onSessionExpired = () => {};

export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

// Exchanges the refresh cookie for a new access token. Concurrent callers
// share one request, and tabs take turns via the Web Locks API so they
// never present the same (single-use) refresh token twice.
export function refreshSession() {
  if (!refreshing) {
    const run = () => axios
      .post('/api/auth/refresh', null, { withCredentials: true, headers: APP_HEADERS })
      .then((r) => {
        setAccessToken(r.data.accessToken);
        return r.data;
      });
    refreshing = (navigator.locks ? navigator.locks.request('transtrack-refresh', run) : run())
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

// Attach the in-memory access token to every outgoing request.
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On a 401, try one silent refresh and replay the request. If the refresh
// fails the session is over and the app returns to the sign-in screen.
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (err.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        setAccessToken(null);
        onSessionExpired();
      }
    }
    return Promise.reject(err);
  }
);

export default api;
