import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { registerGpsSocket } from '../src/socket/gps.socket.js';
import { db, tokenFor, truncateAll } from './helpers.js';
import { seedTenant } from './seedTenants.js';

// Live positions and alerts must never reach another organisation, and an
// unauthenticated socket must not connect at all.
let server, io, url, A, B;
const sockets = [];

function client(member, token = member && tokenFor(member)) {
  const s = connect(url, { auth: token ? { token } : {}, transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(s);
  return s;
}

const connected = (s) => new Promise((resolve, reject) => {
  s.once('connect', resolve);
  s.once('connect_error', reject);
});

// Collects every event of the given names a socket receives.
function record(s, events) {
  const got = [];
  for (const e of events) s.on(e, (payload) => got.push({ e, payload }));
  return got;
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const LIVE_EVENTS = ['bus:location', 'bus:emergency', 'bus:delay', 'admin:alert', 'boarding:changed', 'slot:changed'];

beforeAll(async () => {
  await truncateAll();
  A = await seedTenant('AAA');
  B = await seedTenant('ZZB');
  server = http.createServer(createApp());
  io = new Server(server);
  registerGpsSocket(io);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  io.close();
  await new Promise((r) => server.close(r));
  await db.$disconnect();
});

describe('socket authentication', () => {
  it('rejects a handshake without a token', async () => {
    await expect(connected(client(null))).rejects.toThrow(/Authentication required/);
  });

  it('rejects a handshake with an invalid token', async () => {
    await expect(connected(client(null, 'not-a-token'))).rejects.toThrow(/Invalid or expired token/);
  });

  it('rejects members of a suspended organisation', async () => {
    const C = await seedTenant('CCC');
    await db.organization.update({ where: { id: C.org.id }, data: { status: 'SUSPENDED' } });
    await expect(connected(client(C.admin))).rejects.toThrow(/suspended/);
  });
});

describe('socket tenant isolation', () => {
  it('delivers live events only within the organisation', async () => {
    const driverA = client(A.driver);
    const driverB = client(B.driver);
    const studentA = client(A.student);
    const adminA = client(A.admin);
    const adminB = client(B.admin);
    await Promise.all([driverA, driverB, studentA, adminA, adminB].map(connected));

    const gotStudentA = record(studentA, LIVE_EVENTS);
    const gotAdminA = record(adminA, LIVE_EVENTS);
    const gotAdminB = record(adminB, LIVE_EVENTS);

    // Student A tries to watch both buses; only their own may be joined.
    studentA.emit('student:watchBus', { busId: A.bus.id });
    studentA.emit('student:watchBus', { busId: B.bus.id });
    // Driver B claims to be on bus A; the server ignores the claimed id.
    driverA.emit('driver:join', {});
    driverB.emit('driver:join', { busId: A.bus.id });
    await settle();

    driverB.emit('driver:location', { busId: A.bus.id, lat: 1.5, lng: 2.5 });
    driverB.emit('driver:emergency', { busId: A.bus.id, message: 'ZZB emergency' });
    driverB.emit('driver:delay', { busId: A.bus.id, minutes: 10 });
    await settle();

    expect(gotStudentA).toEqual([]);
    expect(gotAdminA).toEqual([]);
    expect(gotAdminB.map((x) => x.e).sort()).toEqual(['admin:alert', 'admin:alert', 'bus:location']);
    expect(gotAdminB.every((x) => x.payload.busId === B.bus.id)).toBe(true);

    driverA.emit('driver:location', { lat: -1.3, lng: 36.8 });
    await settle();
    expect(gotStudentA.map((x) => x.e)).toEqual(['bus:location']);
    expect(gotAdminA.map((x) => x.e)).toEqual(['bus:location']);
    expect(gotAdminB.filter((x) => x.payload.busId === A.bus.id)).toEqual([]);
  });

  it('stores GPS positions under the driver\'s own organisation', async () => {
    const logsA = await db.gpsLog.findMany({ where: { organizationId: A.org.id } });
    const logsB = await db.gpsLog.findMany({ where: { organizationId: B.org.id } });
    expect(logsA.every((l) => l.busId === A.bus.id)).toBe(true);
    expect(logsB.every((l) => l.busId === B.bus.id)).toBe(true);
    expect(logsB.some((l) => l.lat === 1.5)).toBe(true);
  });

  it('ignores slot broadcasts from non-staff and keeps staff broadcasts in-org', async () => {
    const studentA = client(A.student);
    const officerA = client(A.officer);
    const studentB = client(B.student);
    await Promise.all([studentA, officerA, studentB].map(connected));
    const gotA = record(studentA, ['slot:changed']);
    const gotB = record(studentB, ['slot:changed']);

    studentA.emit('slot:update', { routeId: A.route.id });
    await settle();
    expect(gotA).toEqual([]);

    officerA.emit('slot:update', { routeId: A.route.id });
    await settle();
    expect(gotA).toHaveLength(1);
    expect(gotB).toEqual([]);
  });
});
