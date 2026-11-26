import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { addDays, localDateString } from '../src/services/rides.js';
import { bearer, createMember, createOrg, db, truncateAll } from './helpers.js';

// Passenger rides: admin-scheduled runs, standing pickup / drop-off
// choices, one-day changes, seat limits, cut-off, tiers and parents.
const app = createApp();
const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
const today = localDateString();
const tomorrow = addDays(today, 1);

let uni, officer, driver, s1, s2, s3, route, stops, morning, morning2, evening, bus;
let school, parent, pupil, schoolRoute, schoolRun;

const as = (member) => ({
  get: (path) => request(app).get(path).set('Authorization', bearer(member)),
  put: (path, body) => request(app).put(path).set('Authorization', bearer(member)).send(body),
  post: (path, body) => request(app).post(path).set('Authorization', bearer(member)).send(body),
  del: (path) => request(app).delete(path).set('Authorization', bearer(member)),
});

beforeAll(async () => {
  await truncateAll();
  uni = await createOrg({ profile: 'UNIVERSITY' });
  officer = await createMember(uni, 'FLEET_MANAGER');
  driver = await createMember(uni, 'DRIVER');
  s1 = await createMember(uni, 'STUDENT', { firstName: 'Amina' });
  s2 = await createMember(uni, 'STUDENT', { firstName: 'Brian' });
  s3 = await createMember(uni, 'STUDENT', { firstName: 'Chebet' });
  route = await db.route.create({
    data: {
      organizationId: uni.id,
      name: 'Westlands',
      legs: [{ durationSeconds: 600 }, { durationSeconds: 600 }],
      pickupPoints: {
        create: [
          { organizationId: uni.id, name: 'Sarit', tier: 'TOWN', order: 0, lat: -1.26, lng: 36.80 },
          { organizationId: uni.id, name: 'Lavington Mall', tier: 'LAVINGTON', order: 1, lat: -1.28, lng: 36.77 },
          { organizationId: uni.id, name: 'Campus', tier: 'TOWN', order: 2, lat: -1.31, lng: 36.81 },
        ],
      },
    },
    include: { pickupPoints: { orderBy: { order: 'asc' } } },
  });
  stops = route.pickupPoints;
  bus = await db.bus.create({ data: { organizationId: uni.id, licensePlate: 'KCX 1', routeId: route.id, driverId: driver.profile.id } });
  for (const s of [s1, s2, s3]) await db.student.update({ where: { id: s.profile.id }, data: { routeId: route.id } });
});
afterAll(() => db.$disconnect());

describe('admin runs', () => {
  it('creates runs whose stop times follow the road route', async () => {
    const res = await as(officer).post('/api/admin/slots', {
      routeId: route.id, direction: 'PICKUP', time: '06:30', daysOfWeek: EVERY_DAY, capacity: 2, busId: bus.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    morning = res.body.slot;
    expect(morning.label).toBe('Pickup 06:30');

    morning2 = (await as(officer).post('/api/admin/slots', { routeId: route.id, direction: 'PICKUP', time: '07:30', daysOfWeek: EVERY_DAY, capacity: 10 })).body.slot;
    evening = (await as(officer).post('/api/admin/slots', { routeId: route.id, direction: 'DROPOFF', time: '17:00', daysOfWeek: EVERY_DAY, capacity: 10 })).body.slot;

    const list = (await as(officer).get(`/api/admin/slots?routeId=${route.id}`)).body.slots;
    const am = list.find((s) => s.id === morning.id);
    expect(am.stops.map((s) => s.time)).toEqual(['06:30', '06:41', '06:52']);
    const pm = list.find((s) => s.id === evening.id);
    expect(pm.stops.map((s) => s.name)).toEqual(['Campus', 'Lavington Mall', 'Sarit']);
  });

  it('lets admins pin a stop time and rejects bad input', async () => {
    const res = await as(officer).put(`/api/admin/slots/${morning2.id}`, { stopTimeOverrides: { [stops[1].id]: '07:45' } });
    expect(res.status).toBe(200);
    expect((await as(officer).put(`/api/admin/slots/${morning2.id}`, { time: '7.30' })).status).toBe(400);
    expect((await as(officer).put(`/api/admin/slots/${morning2.id}`, { daysOfWeek: [] })).status).toBe(400);
  });
});

describe('standing choices', () => {
  it('shows each stop with the time every run reaches it', async () => {
    const res = await as(s1).get('/api/students/rides');
    expect(res.status).toBe(200);
    expect(res.body.route.name).toBe('Westlands');
    const runs = res.body.directions.PICKUP.runs;
    expect(runs.find((r) => r.id === morning2.id).stopTimes[stops[1].id]).toBe('07:45');
    expect(res.body.route.pickupPoints.find((p) => p.name === 'Lavington Mall').allowed).toBe(false);
    expect(res.body.days).toHaveLength(14);
  });

  it('books pickup and drop-off and mirrors the stops on the passenger', async () => {
    const pick = await as(s1).put('/api/students/rides/PICKUP', { pickupPointId: stops[0].id, slotId: morning.id });
    expect(pick.status, JSON.stringify(pick.body)).toBe(200);
    expect(pick.body.directions.PICKUP.booking).toMatchObject({ slotId: morning.id, stopName: 'Sarit', time: '06:30' });
    const drop = await as(s1).put('/api/students/rides/dropoff', { pickupPointId: stops[0].id, slotId: evening.id });
    expect(drop.status).toBe(200);
    const student = await db.student.findUnique({ where: { id: s1.profile.id } });
    expect(student).toMatchObject({ arrivePickupPointId: stops[0].id, departPickupPointId: stops[0].id });
  });

  it('refuses stops above the passenger\'s tier, other routes and the wrong direction', async () => {
    expect((await as(s2).put('/api/students/rides/PICKUP', { pickupPointId: stops[1].id, slotId: morning.id })).status).toBe(403);
    expect((await as(s2).put('/api/students/rides/PICKUP', { pickupPointId: stops[0].id, slotId: evening.id })).status).toBe(400);
    const elsewhere = await db.route.create({ data: { organizationId: uni.id, name: 'Elsewhere' } });
    const run = await db.pickupSlot.create({ data: { organizationId: uni.id, routeId: elsewhere.id, time: '06:00', label: 'X', daysOfWeek: EVERY_DAY } });
    expect((await as(s2).put('/api/students/rides/PICKUP', { pickupPointId: stops[0].id, slotId: run.id })).status).toBe(400);
  });

  it('never overfills a run, even with simultaneous bookings', async () => {
    const results = await Promise.all([s2, s3].map((s) => as(s).put('/api/students/rides/PICKUP', { pickupPointId: stops[0].id, slotId: morning.id })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const booked = await db.rideBooking.count({ where: { slotId: morning.id } });
    expect(booked).toBe(2);
  });
});

describe('one-day changes', () => {
  it('a skip frees the seat for that day only', async () => {
    const loser = (await db.rideBooking.findFirst({ where: { slotId: morning.id, studentId: { not: s1.profile.id } } })).studentId;
    const waiting = loser === s2.profile.id ? s3 : s2;

    expect((await as(s1).put(`/api/students/rides/PICKUP/dates/${tomorrow}`, { skip: true })).status).toBe(200);
    // The full run now has a seat tomorrow, but not as a standing booking.
    expect((await as(waiting).put('/api/students/rides/PICKUP', { pickupPointId: stops[0].id, slotId: morning.id })).status).toBe(409);
    const change = await as(waiting).put(`/api/students/rides/PICKUP/dates/${tomorrow}`, { pickupPointId: stops[0].id, slotId: morning.id });
    expect(change.status, JSON.stringify(change.body)).toBe(200);
    expect(change.body.days.find((d) => d.date === tomorrow).PICKUP).toMatchObject({ status: 'CHANGED', slotId: morning.id });

    const timetable = (await as(officer).get(`/api/admin/slots/${morning.id}/timetable?date=${tomorrow}`)).body.run;
    expect(timetable.ridersOnDay).toBe(2);
    expect(timetable.stops[0].passengers.map((p) => p.name)).not.toContain('Amina');

    // Amina cannot undo her skip now: her seat has been taken for that day.
    expect((await as(s1).del(`/api/students/rides/PICKUP/dates/${tomorrow}`)).status).toBe(409);
  });

  it('closes changes shortly before the run reaches the stop', async () => {
    const soon = new Date(Date.now() + 10 * 60000);
    const hhmm = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
    const run = (await as(officer).post('/api/admin/slots', { routeId: route.id, direction: 'DROPOFF', time: hhmm, daysOfWeek: EVERY_DAY, capacity: 5 })).body.slot;
    const res = await as(s1).put(`/api/students/rides/DROPOFF/dates/${today}`, { pickupPointId: stops[0].id, slotId: run.id });
    expect(res.status).toBe(409);
  });

  it('only accepts dates within the booking window', async () => {
    expect((await as(s1).put(`/api/students/rides/PICKUP/dates/${addDays(today, 30)}`, { skip: true })).status).toBe(400);
    expect((await as(s1).put('/api/students/rides/PICKUP/dates/yesterday', { skip: true })).status).toBe(400);
  });
});

describe('drivers and parents', () => {
  it('the driver sees today\'s runs and the passengers per stop', async () => {
    const res = await as(driver).get('/api/drivers/runs/today');
    expect(res.status).toBe(200);
    const am = res.body.runs.find((r) => r.id === morning.id);
    expect(am.stops[0]).toMatchObject({ name: 'Sarit', riders: 2 });

    const roster = await as(driver).get(`/api/drivers/roster?slotId=${morning.id}`);
    expect(roster.body.total).toBe(2);
    expect(roster.body.roster[0]).toMatchObject({ pickup: 'Sarit', stopTime: '06:30' });
  });

  it('a parent books only for their own child', async () => {
    school = await createOrg({ profile: 'SCHOOL' });
    parent = await createMember(school, 'PARENT');
    const stranger = await createMember(school, 'PARENT');
    schoolRoute = await db.route.create({
      data: { organizationId: school.id, name: 'Karen', pickupPoints: { create: [{ organizationId: school.id, name: 'Gate', tier: 'TOWN' }] } },
      include: { pickupPoints: true },
    });
    pupil = await db.student.create({ data: { organizationId: school.id, firstName: 'Zawadi', lastName: 'M', routeId: schoolRoute.id } });
    await db.passengerGuardian.create({ data: { organizationId: school.id, studentId: pupil.id, userId: parent.user.id } });
    schoolRun = await db.pickupSlot.create({ data: { organizationId: school.id, routeId: schoolRoute.id, time: '06:45', label: 'AM', daysOfWeek: EVERY_DAY } });

    const ok = await as(parent).put(`/api/parents/children/${pupil.id}/rides/PICKUP`, { pickupPointId: schoolRoute.pickupPoints[0].id, slotId: schoolRun.id });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await as(stranger).get(`/api/parents/children/${pupil.id}/rides`)).status).toBe(404);
    const bus = await db.bus.create({ data: { organizationId: school.id, licensePlate: 'KSC 1', routeId: schoolRoute.id } });
    const track = await as(parent).get(`/api/parents/children/${pupil.id}/bus`);
    expect(track.body.bus.id).toBe(bus.id);
    expect(track.body.passenger.today.PICKUP).toMatchObject({ status: 'USUAL', time: '06:45' });
  });

  it('changing a passenger\'s standard route clears their bookings', async () => {
    const other = await db.route.create({ data: { organizationId: uni.id, name: 'Kileleshwa' } });
    expect((await as(officer).put(`/api/admin/students/${s1.profile.id}/route`, { routeId: other.id })).status).toBe(200);
    expect(await db.rideBooking.count({ where: { studentId: s1.profile.id } })).toBe(0);
    expect((await as(s1).post('/api/students/register-route', { routeId: route.id, arrivePickupPointId: stops[0].id })).status).toBe(400);
  });
});
