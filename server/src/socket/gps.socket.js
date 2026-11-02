import { resolveSession } from '../middleware/auth.js';
import { runWithContext } from '../context/requestContext.js';
import { isStaff } from '../config/roles.js';
import { findDriverBus, findViewableBus } from '../services/busAccess.js';
import { ingestReading, lastPosition, parseReading, setDriverOnline } from '../services/gpsIngest.js';

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
//  2. A driver joins their own bus's room as soon as they connect
//     ('driver:join' is still accepted; any busId in a payload is ignored).
//  3. Passengers and staff emit 'student:watchBus' with a busId; the server
//     only joins them if they may see that bus within their organisation,
//     and acknowledges with the latest known position. Clients re-emit it
//     after every reconnect.
//  4. 'driver:location' is validated, throttled (see gpsIngest.js) and
//     broadcast to that bus's room and the organisation's staff. When a
//     bus's last driver socket disconnects, 'bus:offline' is sent.
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

    const context = { userId: user.id, organizationId: orgId, role: user.role };
    const inContext = (fn) => runWithContext(context, fn);

    // Runs a handler inside the socket's tenant context and never lets an
    // error escape to crash the process. An optional acknowledgement
    // callback is passed through.
    const on = (event, handler) => {
      socket.on(event, (payload, ack) =>
        inContext(async () => {
          const reply = typeof ack === 'function' ? ack : () => {};
          try {
            await handler(payload && typeof payload === 'object' ? payload : {}, reply);
          } catch (err) {
            console.error(`Socket handler ${event} failed:`, err.message);
            reply({ ok: false });
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

    const joinDriverBus = async () => {
      const busId = await driverBus();
      if (!busId || socket.disconnected) return null;
      socket.join(rooms.bus(orgId, busId));
      setDriverOnline(orgId, busId, socket.id, true);
      return busId;
    };

    // Drivers are placed in their bus's room straight away.
    if (user.role === 'DRIVER') {
      inContext(() => joinDriverBus().catch((err) => console.error('Driver join failed:', err.message)));
    }

    socket.on('disconnect', () => {
      const busId = socket.data.busId;
      if (!busId) return;
      if (setDriverOnline(orgId, busId, socket.id, false)) {
        io.to(rooms.bus(orgId, busId)).to(rooms.staff(orgId))
          .emit('bus:offline', { busId, at: new Date().toISOString() });
      }
    });

    on('driver:join', async (_payload, ack) => {
      const busId = await joinDriverBus();
      ack({ ok: Boolean(busId), busId });
    });

    on('student:watchBus', async ({ busId }, ack) => {
      const bus = await findViewableBus(user, busId);
      if (!bus) return ack({ ok: false });
      socket.join(rooms.bus(orgId, bus.id));
      ack({ ok: true, last: await lastPosition(orgId, bus.id) });
    });

    on('student:unwatchBus', async ({ busId }) => {
      const id = Number(busId);
      if (Number.isInteger(id) && id !== socket.data.busId) socket.leave(rooms.bus(orgId, id));
    });

    on('driver:location', async (payload, ack) => {
      const reading = parseReading(payload);
      if (!reading) return ack({ ok: false, error: 'invalid' });
      const busId = await driverBus();
      if (!busId) return ack({ ok: false, error: 'no-bus' });

      const update = await ingestReading(orgId, busId, reading);
      if (update) io.to(rooms.bus(orgId, busId)).to(rooms.staff(orgId)).emit('bus:location', update);
      ack({ ok: true });
    });

    on('driver:emergency', async ({ message }, ack) => {
      const busId = await driverBus();
      if (!busId) return ack({ ok: false });
      const text = typeof message === 'string' && message.trim() ? message.trim().slice(0, 500) : 'Emergency reported by the driver.';
      const at = new Date().toISOString();
      io.to(rooms.bus(orgId, busId)).emit('bus:emergency', { busId, message: text, at });
      io.to(rooms.staff(orgId)).emit('admin:alert', { type: 'EMERGENCY', busId, message: text, at });
      ack({ ok: true });
    });

    on('driver:delay', async ({ minutes }, ack) => {
      const busId = await driverBus();
      if (!busId) return ack({ ok: false });
      const mins = Math.min(Math.max(Number(minutes) || 5, 1), 240);
      const at = new Date().toISOString();
      io.to(rooms.bus(orgId, busId)).emit('bus:delay', { busId, minutes: mins, at });
      io.to(rooms.staff(orgId)).emit('admin:alert', { type: 'DELAY', busId, minutes: mins, at });
      ack({ ok: true });
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
