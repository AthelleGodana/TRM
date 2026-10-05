import api from './api';

export const initiatePayment = (payload) => api.post('/payments/initiate', payload).then((r) => r.data);
export const getPaymentHistory = () => api.get('/payments/history').then((r) => r.data);
