import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import http from 'http';
import request from 'supertest';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { registerGpsSocket } from '../src/socket/gps.socket.js';
import { distanceMeters, parseReading, resetGpsState } from '../src/services/gpsIngest.js';
import { bearer, db, tokenFor, truncateAll } from './helpers.js';
import { seedTenant } from './seedTenants.js';

// Live GPS: validation, throttled storage, automatic driver rooms,
// immediate last position for watchers, offline notices, and the REST
// endpoints for the staff live map.
const app = createApp();
let server, io, url, A, B;
const sockets = [];

function client(member) {
  const s = connect(url, { auth: { token: tokenFor(member) }, transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(s);
  return s;
}
const connected = (s) => new Promise((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); });
const call = (s, event, payload) => new Promise((resolve) => s.emit(event, payload, resolve));
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const logsFor = (bus) => db.gpsLog.findMany({ where: { busId: bus.id }, orderBy: { recordedAt: 'asc' } });

beforeAll(async () => {
  await truncateAll();
  A = await seedTenant('AAA');
  B = await seedTenant('ZZB');
  server = http.createServer(app);
  io = new Server(server);
  registerGpsSocket(io);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  resetGpsState();
  await db.gpsLog.deleteMany({});
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  io.close();
  await new Promise((r) => server.close(r));
  await db.$disconnect();
});

describe('reading validation', () => {
  it('rejects unusable coordinates and poor accuracy', () => {
    expect(parseReading({ lat: NaN, lng: 36.8 })).toBeNull();
    expect(parseReading({ lat: 91, lng: 36.8 })).toBeNull();
    expect(parseReading({ lat: -1.3, lng: '36.8' })).toBeNull();
    expect(parseReading({ lat: -1.3, lng: 36.8, accuracy: 250 })).toBeNull();
  });

  it('converts speed to km/h and replaces implausible device times', () => {
    const now = Date.now();
    const r = parseReading({ lat: -1.3, lng: 36.8, speed: 10, at: now + 3_600_000 }, now);
    expect(r.speedKmh).toBe(36);
    expect(r.recordedAt.getTime()).toBe(now);
  });

  it('measures distance in metres', () => {
    // 0.001 degrees of latitude is about 111 m.
    expect(Math.round(distanceMeters({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 }))).toBe(111);
  });
});

describe('driver location stream', () => {
  it('ignores invalid readings', async () => {
    const driver = client(A.driver);
    await connected(driver);
    expect(await call(driver, 'driver:location', { lat: 'x', lng: 1 })).toEqual({ ok: false, error: 'invalid' });
    expect(await logsFor(A.bus)).toHaveLength(0);
  });

  it('stores at most one point per 15 s unless the bus moves 50 m', async () => {
    const driver = client(A.driver);
    await connected(driver);
    const t = Date.now() - 60_000;
    await call(driver, 'driver:location', { lat: -1.3, lng: 36.8, at: t });
    await call(driver, 'driver:location', { lat: -1.30001, lng: 36.8, at: t + 1000 });
    expect(await logsFor(A.bus)).toHaveLength(1);

    await call(driver, 'driver:location', { lat: -1.3006, lng: 36.8, at: t + 2000 }); // ~67 m away
    await call(driver, 'driver:location', { lat: -1.3006, lng: 36.8, at: t + 20_000 }); // 15 s later
    const logs = await logsFor(A.bus);
    expect(logs).toHaveLength(3);
    expect(logs.every((l) => l.organizationId === A.org.id)).toBe(true);
    expect(logs[1].speedKmh).toBeGreaterThan(0);
  });

  it('puts drivers in their bus room automatically and tells watchers the last position', async () => {
    const student = client(A.student);
    const driver = client(A.driver);
    await Promise.all([connected(student), connected(driver)]);
    await settle();

    const got = [];
    student.on('bus:location', (p) => got.push(p));
    const ack = await call(student, 'student:watchBus', { busId: A.bus.id });
    expect(ack).toEqual({ ok: true, last: null });

    await call(driver, 'driver:location', { lat: -1.31, lng: 36.81, accuracy: 8, speed: 5 });
    await settle();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ busId: A.bus.id, lat: -1.31, lng: 36.81, speedKmh: 18, accuracy: 8 });

    // A watcher who joins later gets the position straight away.
    const late = client(A.student);
    await connected(late);
    expect((await call(late, 'student:watchBus', { busId: A.bus.id })).last).toMatchObject({ lat: -1.31, lng: 36.81 });
  });

  it('refuses to let someone watch another organisation\'s bus', async () => {
    const student = client(A.student);
    await connected(student);
    expect(await call(student, 'student:watchBus', { busId: B.bus.id })).toEqual({ ok: false });
  });

  it('announces when a bus\'s driver goes offline, only within the organisation', async () => {
    const adminA = client(A.admin);
    const adminB = client(B.admin);
    const driver = client(A.driver);
    await Promise.all([connected(adminA), connected(adminB), connected(driver)]);
    await settle();
    const gotA = [];
    const gotB = [];
    adminA.on('bus:offline', (p) => gotA.push(p));
    adminB.on('bus:offline', (p) => gotB.push(p));
    driver.disconnect();
    await settle();
    expect(gotA.map((p) => p.busId)).toEqual([A.bus.id]);
    expect(gotB).toEqual([]);
  });
});

describe('GPS REST endpoints', () => {
  it('lists the live fleet for staff only, within the organisation', async () => {
    const driver = client(A.driver);
    await connected(driver);
    await settle();
    await call(driver, 'driver:location', { lat: -1.32, lng: 36.83 });

    const res = await request(app).get('/api/gps/live').set('Authorization', bearer(A.officer));
    expect(res.status).toBe(200);
    expect(res.body.buses.map((b) => b.id)).toEqual([A.bus.id]);
    expect(res.body.buses[0]).toMatchObject({ online: true, last: { lat: -1.32, lng: 36.83 } });
    expect((await request(app).get('/api/gps/live').set('Authorization', bearer(A.student))).status).toBe(403);
  });

  it('gives staff today\'s trail and passengers only the latest point', async () => {
    const now = Date.now();
    await db.gpsLog.createMany({
      data: [3, 2, 1].map((m) => ({
        organizationId: A.org.id, busId: A.bus.id, lat: -1.3 - m / 1000, lng: 36.8, recordedAt: new Date(now - m * 60_000),
      })),
    });
    const staff = await request(app).get(`/api/gps/history/${A.bus.id}`).set('Authorization', bearer(A.admin));
    expect(staff.body.logs.map((l) => l.lat)).toEqual([-1.303, -1.302, -1.301]);
    const student = await request(app).get(`/api/gps/history/${A.bus.id}`).set('Authorization', bearer(A.student));
    expect(student.body.logs.map((l) => l.lat)).toEqual([-1.301]);
  });

  it('returns the passenger\'s stop and booked pickup time with their bus', async () => {
    const res = await request(app).get('/api/students/my-bus').set('Authorization', bearer(A.student));
    expect(res.status).toBe(200);
    expect(res.body.passenger).toMatchObject({ morningStopId: A.point.id, bookedSlot: { time: '06:30' } });
  });
});
