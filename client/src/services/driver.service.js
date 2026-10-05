import api from './api';

export const getMyRoute = () => api.get('/drivers/my-route').then((r) => r.data);
