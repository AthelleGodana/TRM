import api from './api';

// ── Driver / Admin shared vehicle & safety endpoints ──────────────────
export const setBusStatus = (payload) => api.put('/vehicles/status', payload).then((r) => r.data);
export const addVehicleLog = (payload) => api.post('/vehicles/logs', payload).then((r) => r.data);
export const listVehicleLogs = (busId) => api.get(`/vehicles/logs${busId ? `/${busId}` : ''}`).then((r) => r.data);
export const getSafetyChecklist = (busId) => api.get(`/vehicles/safety${busId ? `/${busId}` : ''}`).then((r) => r.data);
export const toggleSafetyCheck = (payload) => api.post('/vehicles/safety', payload).then((r) => r.data);

// ── Driver roster endpoints (via /drivers) ────────────────────────────
export const getDriverRoster = () => api.get('/drivers/roster').then((r) => r.data);
export const setRosterStatus = (payload) => api.post('/drivers/roster/status', payload).then((r) => r.data);

// ── Admin fleet analytics ──────────────────────────────────────────────
export const getFleetOverview = () => api.get('/admin/fleet/overview').then((r) => r.data);
