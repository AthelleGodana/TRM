import api from './api';

export const createRoute = (payload) => api.post('/admin/routes', payload).then((r) => r.data);
export const listRoutes = () => api.get('/admin/routes').then((r) => r.data);

export const createBus = (payload) => api.post('/admin/buses', payload).then((r) => r.data);
export const listBuses = () => api.get('/admin/buses').then((r) => r.data);
export const updateBusAssignment = (id, payload) => api.put(`/admin/buses/${id}`, payload).then((r) => r.data);

export const listDrivers = () => api.get('/admin/drivers').then((r) => r.data);
export const removeDrivers = (driverIds) => api.post('/admin/drivers/remove', { driverIds }).then((r) => r.data);

export const listStudents = () => api.get('/admin/students').then((r) => r.data);
export const removeStudents = (studentIds) => api.post('/admin/students/remove', { studentIds }).then((r) => r.data);

export const listAllPayments = (status) =>
  api.get('/admin/payments', { params: status ? { status } : {} }).then((r) => r.data);

export const getBillingOverview = () => api.get('/admin/billing/overview').then((r) => r.data);
