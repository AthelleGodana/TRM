import api from './api';

// Fleet management (staff): vehicles, drivers, maintenance and documents.
const data = (r) => r.data;

// ── Vehicles ──────────────────────────────────────────────────────────────
export const listVehicles = (params) => api.get('/admin/buses', { params }).then(data);
export const getVehicle = (id) => api.get(`/admin/buses/${id}`).then(data);
export const createVehicle = (body) => api.post('/admin/buses', body).then(data);
export const updateVehicle = (id, body) => api.put(`/admin/buses/${id}`, body).then(data);
export const assignVehicleDriver = (id, driverId) => api.post(`/admin/buses/${id}/assign`, { driverId: driverId || null }).then(data);
export const updateOdometer = (id, odometerKm) => api.put(`/admin/buses/${id}/odometer`, { odometerKm }).then(data);
export const archiveVehicle = (id) => api.post(`/admin/buses/${id}/archive`).then(data);
export const restoreVehicle = (id) => api.post(`/admin/buses/${id}/restore`).then(data);
export const setVehicleStatus = (busId, status) => api.put('/admin/buses/status', { busId, status }).then(data);

// ── Drivers ───────────────────────────────────────────────────────────────
export const listDriverProfiles = () => api.get('/admin/drivers').then(data);
export const getDriverProfile = (id) => api.get(`/admin/drivers/${id}`).then(data);
export const updateDriverProfile = (id, body) => api.put(`/admin/drivers/${id}`, body).then(data);

// ── Maintenance ───────────────────────────────────────────────────────────
export const listDue = () => api.get('/admin/maintenance/due').then(data);
export const listSchedules = (busId) => api.get('/admin/maintenance/schedules', { params: busId ? { busId } : {} }).then(data);
export const createSchedule = (body) => api.post('/admin/maintenance/schedules', body).then(data);
export const updateSchedule = (id, body) => api.put(`/admin/maintenance/schedules/${id}`, body).then(data);
export const deleteSchedule = (id) => api.delete(`/admin/maintenance/schedules/${id}`).then(data);
export const listServiceRecords = (params) => api.get('/admin/maintenance/services', { params }).then(data);
export const createServiceRecord = (body) => api.post('/admin/maintenance/services', body).then(data);
export const deleteServiceRecord = (id) => api.delete(`/admin/maintenance/services/${id}`).then(data);
export const listDefects = (params) => api.get('/admin/maintenance/defects', { params }).then(data);
export const updateDefect = (id, body) => api.patch(`/admin/maintenance/defects/${id}`, body).then(data);

// ── Documents ─────────────────────────────────────────────────────────────
export const listDocuments = (params) => api.get('/admin/documents', { params }).then(data);
export const createDocument = (body) => api.post('/admin/documents', body).then(data);
export const updateDocument = (id, body) => api.put(`/admin/documents/${id}`, body).then(data);
export const deleteDocument = (id) => api.delete(`/admin/documents/${id}`).then(data);
export function uploadDocumentFile(id, file) {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/admin/documents/${id}/file`, form).then(data);
}

// Fetches a document's file with the signed-in user's token and opens it
// (files are never public links). `driver` uses the driver endpoint.
export async function openDocumentFile(id, { driver = false, fileName = 'document' } = {}) {
  const path = driver ? `/drivers/documents/${id}/file` : `/admin/documents/${id}/file`;
  const res = await api.get(path, { responseType: 'blob', params: { inline: 1 } });
  const url = URL.createObjectURL(res.data);
  // A blob: URL from our own origin, so opening it without noopener is safe
  // (and lets us detect a blocked pop-up).
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Overview ──────────────────────────────────────────────────────────────
export const getFleetOverview = () => api.get('/admin/fleet/overview').then(data);
