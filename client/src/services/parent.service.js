import api from './api';

export const listChildren = () => api.get('/parents/children').then((r) => r.data);
export const getChildBus = (childId) => api.get(`/parents/children/${childId}/bus`).then((r) => r.data);
