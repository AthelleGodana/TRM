import api from './api';

export const getStudentProfile = () => api.get('/students/profile').then((r) => r.data);
export const updateStudentProfile = (payload) => api.put('/students/profile', payload).then((r) => r.data);
export const listAvailableRoutes = () => api.get('/students/routes').then((r) => r.data);
export const registerForRoute = (payload) => api.post('/students/register-route', payload).then((r) => r.data);
export const getMyBus = () => api.get('/students/my-bus').then((r) => r.data);
