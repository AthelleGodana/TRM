import { rooms } from './gps.socket.js';

// Lets HTTP handlers push events to connected clients. index.js registers
// the Socket.io server; in tests (no server) emits are simply skipped.
let io = null;

export function setSocketServer(server) {
  io = server;
}

// Sends an alert to the organisation's staff (same channel as the driver
// emergency and delay buttons).
export function alertStaff(orgId, payload) {
  if (!io || !orgId) return;
  io.to(rooms.staff(orgId)).emit('admin:alert', { at: new Date().toISOString(), ...payload });
}
