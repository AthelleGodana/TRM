import prisma from '../config/db.js';
import { resolveSession } from '../middleware/auth.js';
import { runWithContext } from '../context/requestContext.js';
import { isStaff } from '../config/roles.js';
import { findDriverBus, findViewableBus } from '../services/busAccess.js';

// Room names are always prefixed with the organisation, and only the server
// decides which rooms a socket joins, so events never cross tenants.
export const rooms = {
  org: (orgId) => `org:${orgId}`,
  staff: (orgId) => `org:${orgId}:staff`,
  bus: (orgId, busId) => `org:${orgId}:bus:${busId}`,
};

// Registers all GPS-related Socket.io event handlers.
//
// Flow:
//  1. Every connection must present a valid access token in the handshake
//     (auth.token). The socket joins its organisation's room, and staff also
//     join the organisation's staff room.
//  2. A driver emits 'driver:join'; the server joins them to their own
//     bus's room (the busId in the payload is ignored).
//  3. Students and staff emit 'student:watchBus' with a busId; the server
//     only joins them if they may see that bus within their organisation.
//  4. 'driver:location' is persisted and broadcast to that bus's room and to
//     the organisation's staff.
export function registerGpsSocket(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required.'));
    try {
      const session = await resolveSession(token);
      if (session.error || !session.user.organizationId) return next(new Error(session.error || 'Organisation session required.'));
      socket.data.user = session.user;
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const orgId = user.organizationId;
    socket.join(rooms.org(orgId));
    if (isStaff(user.role)) socket.join(rooms.staff(orgId));

    // Runs a handler inside the socket's tenant context and never lets an
    // error escape to crash the process.
    const on = (event, handler) => {
      socket.on(event, (payload = {}) =>
        runWithContext({ userId: user.id, organizationId: orgId, role: user.role }, async () => {
          try {
            await handler(payload || {});
          } catch (err) {
            console.error(`Socket handler ${event} failed:`, err.message);
          }
        })
      );
    };

    // The driver's bus, looked up once per socket.
    const driverBus = async () => {
      if (user.role !== 'DRIVER') return null;
      if (!socket.data.busId) {
        const bus = await findDriverBus(user.id);
        socket.data.busId = bus?.id || null;
      }
      return socket.data.busId;
    };

    on('driver:join', async () => {
      const busId = await driverBus();
      if (busId) socket.join(rooms.bus(orgId, busId));
    });

    on('student:watchBus', async ({ busId }) => {
      const bus = await findViewableBus(user, busId);
      if (bus) socket.join(rooms.bus(orgId, bus.id));
    });

    on('driver:location', async ({ lat, lng }) => {
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const busId = await driverBus();
      if (!busId) return;

      const log = await prisma.gpsLog.create({ data: { busId, lat, lng } });
      const payload = { busId, lat, lng, recordedAt: log.recordedAt };
      io.to(rooms.bus(orgId, busId)).to(rooms.staff(orgId)).emit('bus:location', payload);
    });

    on('driver:emergency', async ({ message }) => {
      const busId = await driverBus();
      if (!busId) return;
      const text = typeof message === 'string' && message ? message.slice(0, 500) : '🚨 Emergency reported by the driver.';
      const at = new Date().toISOString();
      io.to(rooms.bus(orgId, busId)).emit('bus:emergency', { busId, message: text, at });
      io.to(rooms.staff(orgId)).emit('admin:alert', { type: 'EMERGENCY', busId, message: text, at });
    });

    on('driver:delay', async ({ minutes }) => {
      const busId = await driverBus();
      if (!busId) return;
      const mins = Math.min(Math.max(Number(minutes) || 5, 1), 240);
      const at = new Date().toISOString();
      io.to(rooms.bus(orgId, busId)).emit('bus:delay', { busId, minutes: mins, at });
      io.to(rooms.staff(orgId)).emit('admin:alert', { type: 'DELAY', busId, minutes: mins, at });
    });

    on('boarding:update', async ({ studentId, status }) => {
      const busId = await driverBus();
      if (!busId) return;
      io.to(rooms.bus(orgId, busId)).to(rooms.staff(orgId))
        .emit('boarding:changed', { busId, studentId: Number(studentId), status });
    });

    on('slot:update', async ({ routeId }) => {
      if (!isStaff(user.role)) return;
      io.to(rooms.org(orgId)).emit('slot:changed', { routeId: Number(routeId) });
    });
  });
}
