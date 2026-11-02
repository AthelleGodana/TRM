import api from './api';

// ORG_ADMIN: people, invitations and access requests for the active organisation.
export const listMembers = () => api.get('/org/members').then((r) => r.data);
export const updateMemberRole = (id, role) => api.patch(`/org/members/${id}`, { role }).then((r) => r.data);
export const removeMember = (id) => api.delete(`/org/members/${id}`).then((r) => r.data);
export const setMemberEmail = (id, email) => api.put(`/org/members/${id}/email`, { email }).then((r) => r.data);

export const listInvitations = () => api.get('/org/invitations').then((r) => r.data);
export const createInvitation = (body) => api.post('/org/invitations', body).then((r) => r.data);
export const revokeInvitation = (id) => api.delete(`/org/invitations/${id}`).then((r) => r.data);

export const listAccessRequests = () => api.get('/org/access-requests').then((r) => r.data);
export const approveAccessRequest = (id, role) => api.post(`/org/access-requests/${id}/approve`, { role }).then((r) => r.data);
export const rejectAccessRequest = (id) => api.post(`/org/access-requests/${id}/reject`).then((r) => r.data);

// Badge counts, and CSV import (the browser parses the file; rows only).
export const getOrgSummary = () => api.get('/org/summary').then((r) => r.data);
export const bulkInvite = (rows) => api.post('/org/invitations/bulk', { rows }).then((r) => r.data);

// SUPER_ADMIN: platform-wide organisation management.
export const listOrganizations = (status) =>
  api.get('/platform/organizations', { params: status ? { status } : {} }).then((r) => r.data);
export const setOrganizationStatus = (id, action) =>
  api.post(`/platform/organizations/${id}/${action}`).then((r) => r.data);
export const updateOrganizationFeatures = (id, features) =>
  api.patch(`/platform/organizations/${id}/features`, features).then((r) => r.data);
