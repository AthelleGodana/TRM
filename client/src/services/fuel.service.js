import api from './api';

export const listFuelRecords = (params) => api.get('/fuel/records', { params }).then((r) => r.data);
export const createFuelRecord = (body) => api.post('/fuel/records', body).then((r) => r.data);
export const deleteFuelRecord = (id) => api.delete(`/fuel/records/${id}`).then((r) => r.data);

export const listFuelCards = () => api.get('/fuel/cards').then((r) => r.data);
export const createFuelCard = (body) => api.post('/fuel/cards', body).then((r) => r.data);
export const updateFuelCard = (id, body) => api.patch(`/fuel/cards/${id}`, body).then((r) => r.data);
export const deleteFuelCard = (id) => api.delete(`/fuel/cards/${id}`).then((r) => r.data);

export const listAnomalies = (params) => api.get('/fuel/anomalies', { params }).then((r) => r.data);
export const reviewAnomaly = (id, body) => api.patch(`/fuel/anomalies/${id}`, body).then((r) => r.data);
export const listAnalysisRuns = () => api.get('/fuel/analysis/runs').then((r) => r.data);
export const runAnalysis = () => api.post('/fuel/analysis/run').then((r) => r.data);
