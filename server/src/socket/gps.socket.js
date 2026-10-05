import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';
import { env } from '../config/env.js';

// Registers all GPS-related Socket.io event handlers.
//
// Flow:
//  1. A driver's client connects and emits 'driver:join' with their busId.
//  2. Students viewing the map emit 'student:watchBus' with the busId of
//     the bus assigned to their route, joining a room named `bus:<id>`.
//  3. When the driver emits 'driver:location', the server persists it and
//     broadcasts it to everyone in that bus's room within milliseconds.
export function registerGpsSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(); // allow anonymous connect; specific events still require auth below
    try {
      socket.user = jwt.verify(token, env.jwtSecret);
    } catch {
      // invalid token — leave socket.user undefined, events will reject below
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('driver:join', ({ busId }) => {
      if (!socket.user || socket.user.role !== 'driver') return;
      socket.join(`bus:${busId}`);
      socket.data.busId = busId;
    });

    socket.on('student:watchBus', ({ busId }) => {
      socket.join(`bus:${busId}`);
    });

    socket.on('driver:location', async ({ busId, lat, lng }) => {
      if (!socket.user || socket.user.role !== 'driver') return;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      try {
        const log = await prisma.gpsLog.create({
          data: { busId: Number(busId), lat, lng },
        });

        io.to(`bus:${busId}`).emit('bus:location', {
          busId: Number(busId),
          lat,
          lng,
          recordedAt: log.recordedAt,
        });
      } catch (err) {
        console.error('Failed to persist GPS log:', err.message);
      }
    });

socket.on('driver:emergency', ({ busId, message }) => {
      if (!socket.user || socket.user.role !== 'driver') return;
      io.to(`bus:${busId}`).emit('bus:emergency', {
        busId: Number(busId),
        message: message || '🚨 Emergency reported by the driver.',
        at: new Date().toISOString(),
      });
      // Also notify admins (broadcast room).
      io.emit('admin:alert', {
        type: 'EMERGENCY',
        busId: Number(busId),
        message: message || '🚨 Emergency reported by the driver.',
        at: new Date().toISOString(),
      });
    });

    socket.on('driver:delay', ({ busId, minutes }) => {
      if (!socket.user || socket.user.role !== 'driver') return;
      io.to(`bus:${busId}`).emit('bus:delay', {
        busId: Number(busId),
        minutes: Number(minutes) || 5,
        at: new Date().toISOString(),
      });
      io.emit('admin:alert', {
        type: 'DELAY',
        busId: Number(busId),
        minutes: Number(minutes) || 5,
        at: new Date().toISOString(),
      });
    });

    socket.on('boarding:update', ({ busId, studentId, status }) => {
      io.to(`bus:${busId}`).emit('boarding:changed', { busId, studentId, status });
    });

    socket.on('slot:update', ({ routeId }) => {
      io.emit('slot:changed', { routeId });
    });

    socket.on('disconnect', () => {
      // Rooms are cleaned up automatically by Socket.io on disconnect.
    });
  });
}
