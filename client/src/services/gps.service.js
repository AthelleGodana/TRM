import api from './api';

// Staff: every bus with its latest position (live updates come over the socket).
export const getLiveFleet = () => api.get('/gps/live').then((r) => r.data);
// Staff get today's trail; passengers only the latest point.
export const getBusTrail = (busId) => api.get(`/gps/history/${busId}`).then((r) => r.data);
