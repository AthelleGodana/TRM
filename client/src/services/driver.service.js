import api from './api';

const data = (r) => r.data;

export const getMyRoute = () => api.get('/drivers/my-route').then(data);
export const getTodayRuns = () => api.get('/drivers/runs/today').then(data);
export const getRoster = (slotId) => api.get('/drivers/roster', { params: slotId ? { slotId } : {} }).then(data);
export const setRosterStatus = (body) => api.post('/drivers/roster/status', body).then(data);
export const getMe = () => api.get('/drivers/me').then(data);
export const getMyVehicle = () => api.get('/drivers/my-vehicle').then(data);
export const reportDefect = (body) => api.post('/drivers/defects', body).then(data);
export const reportOdometer = (odometerKm) => api.post('/drivers/odometer', { odometerKm }).then(data);
