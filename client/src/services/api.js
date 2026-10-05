import axios from 'axios';

// Base Axios instance. The Vite dev server proxies /api to the Express
// server (see vite.config.js), so no hardcoded host/port is needed here.
const api = axios.create({ baseURL: '/api' });

// Attach the JWT token (if present) to every outgoing request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tms_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the server ever responds 401, the token is invalid/expired — clear it
// so the app falls back to the login screen on next render.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('tms_token');
      localStorage.removeItem('tms_user');
    }
    return Promise.reject(err);
  }
);

export default api;
