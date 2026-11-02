import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { findViewableBus } from '../src/services/busAccess.js';
import { runWithContext } from '../src/context/requestContext.js';
import { bearer, createMember, createOrg, db, truncateAll } from './helpers.js';

// SCHOOL profile: pupils are passenger records without accounts, linked to
// PARENT members who can follow only their own children's bus.
const app = createApp();
let school, officer, parent, otherParent, driver, route, otherRoute, bus, otherBus, pupilId;

beforeAll(async () => {
  await truncateAll();
  school = await createOrg({ profile: 'SCHOOL' });
  officer = await createMember(school, 'FLEET_MANAGER');
  parent = await createMember(school, 'PARENT', { firstName: 'Mama' });
  otherParent = await createMember(school, 'PARENT', { firstName: 'Baba' });
  driver = await createMember(school, 'DRIVER');
  route = await db.route.create({ data: { organizationId: school.id, name: 'Karen' } });
  otherRoute = await db.route.create({ data: { organizationId: school.id, name: 'Kilimani' } });
  bus = await db.bus.create({ data: { organizationId: school.id, licensePlate: 'KCA 1', routeId: route.id, driverId: driver.profile.id } });
  otherBus = await db.bus.create({ data: { organizationId: school.id, licensePlate: 'KCA 2', routeId: otherRoute.id } });
});
afterAll(() => db.$disconnect());

const as = (member) => ({
  get: (path) => request(app).get(path).set('Authorization', bearer(member)),
  post: (path, body) => request(app).post(path).set('Authorization', bearer(member)).send(body),
});

describe('pupils and parents', () => {
  it('staff create a pupil without an account', async () => {
    const res = await as(officer).post('/api/admin/pupils', { firstName: 'Wanjiru', lastName: 'K', routeId: route.id });
    expect(res.status).toBe(201);
    expect(res.body.pupil).toMatchObject({ hasAccount: false, user: { firstName: 'Wanjiru' } });
    pupilId = res.body.pupil.id;
  });

  it('pupils appear in the passenger list and on the driver roster', async () => {
    const list = await as(officer).get('/api/admin/students');
    expect(list.body.students.map((s) => s.user.firstName)).toContain('Wanjiru');
    const roster = await as(driver).get('/api/drivers/roster');
    expect(roster.body.roster.map((r) => r.name)).toContain('Wanjiru K');
  });

  it('only PARENT members can be linked', async () => {
    expect((await as(officer).post(`/api/admin/pupils/${pupilId}/guardians`, { userId: driver.user.id })).status).toBe(404);
    expect((await as(officer).post(`/api/admin/pupils/${pupilId}/guardians`, { userId: parent.user.id })).status).toBe(201);
  });

  it('a parent sees only their own children and their bus', async () => {
    const kids = await as(parent).get('/api/parents/children');
    expect(kids.body.children.map((c) => c.user.firstName)).toEqual(['Wanjiru']);
    const res = await as(parent).get(`/api/parents/children/${pupilId}/bus`);
    expect(res.body.bus.licensePlate).toBe('KCA 1');

    expect((await as(otherParent).get('/api/parents/children')).body.children).toEqual([]);
    expect((await as(otherParent).get(`/api/parents/children/${pupilId}/bus`)).status).toBe(404);
  });

  it('a parent may watch their child\'s bus but no other', async () => {
    await runWithContext({ organizationId: school.id }, async () => {
      const user = { id: parent.user.id, role: 'PARENT' };
      expect(await findViewableBus(user, bus.id)).toBeTruthy();
      expect(await findViewableBus(user, otherBus.id)).toBeNull();
      expect(await findViewableBus({ id: otherParent.user.id, role: 'PARENT' }, bus.id)).toBeNull();
    });
    expect((await as(parent).get(`/api/gps/history/${bus.id}`)).status).toBe(200);
    expect((await as(parent).get(`/api/gps/history/${otherBus.id}`)).status).toBe(404);
  });

  it('a parent from another organisation cannot be linked', async () => {
    const other = await createOrg({ profile: 'SCHOOL' });
    const foreign = await createMember(other, 'PARENT');
    expect((await as(officer).post(`/api/admin/pupils/${pupilId}/guardians`, { userId: foreign.user.id })).status).toBe(404);
  });

  it('removing a parent from the organisation removes their links', async () => {
    const school2Admin = await createMember(school, 'ORG_ADMIN');
    const res = await request(app).delete(`/api/org/members/${parent.membership.id}`).set('Authorization', bearer(school2Admin));
    expect(res.status).toBe(200);
    expect(await db.passengerGuardian.count({ where: { userId: parent.user.id } })).toBe(0);
  });
});
