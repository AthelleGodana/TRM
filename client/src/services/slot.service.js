import api from './api';

// Student-facing slot endpoints
export const listMySlots = () => api.get('/slots/my-slots').then((r) => r.data);
export const bookSlot = (slotId) => api.post('/slots/book', { slotId }).then((r) => r.data);
export const cancelSlotBooking = () => api.post('/slots/cancel').then((r) => r.data);

// Admin slot endpoints
export const createSlot = (payload) => api.post('/slots', payload).then((r) => r.data);
export const listAllSlots = () => api.get('/slots').then((r) => r.data);
