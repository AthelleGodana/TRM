import api from './api';

// Passenger rides: a standing pickup and drop-off (stop + run) plus
// one-day changes. Students use /students/rides; parents act for a child.
const data = (r) => r.data;

export function ridesApi(childId = null) {
  const base = childId ? `/parents/children/${childId}/rides` : '/students/rides';
  return {
    get: () => api.get(base).then(data),
    setStanding: (direction, pickupPointId, slotId) => api.put(`${base}/${direction}`, { pickupPointId, slotId }).then(data),
    clearStanding: (direction) => api.delete(`${base}/${direction}`).then(data),
    setDay: (direction, date, body) => api.put(`${base}/${direction}/dates/${date}`, body).then(data),
    clearDay: (direction, date) => api.delete(`${base}/${direction}/dates/${date}`).then(data),
  };
}

// ── Admin: runs of a route ───────────────────────────────────────────────
export const listRuns = (routeId, date) => api.get('/admin/slots', { params: { routeId, date } }).then(data);
export const createRun = (body) => api.post('/admin/slots', body).then(data);
export const updateRun = (id, body) => api.put(`/admin/slots/${id}`, body).then(data);
export const deleteRun = (id) => api.delete(`/admin/slots/${id}`).then(data);
export const getRunTimetable = (id, date) => api.get(`/admin/slots/${id}/timetable`, { params: { date } }).then(data);
export const setStudentRoute = (studentId, routeId) => api.put(`/admin/students/${studentId}/route`, { routeId: routeId || null }).then(data);
