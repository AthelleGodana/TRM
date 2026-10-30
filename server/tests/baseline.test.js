import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import prisma from '../src/config/db.js';
import { tokenFor, truncateAll } from './helpers.js';

// Baseline behaviour of the existing API before multi-tenancy, so later
// steps can detect regressions in core flows.
const app = createApp();
let admin, driverUser, studentUser, route;

beforeAll(async () => {
  await truncateAll();
  admin = await prisma.user.create({
    data: { username: 'admin', password: 'x', firstName: 'A', lastName: 'Admin', role: 'admin' },
  });
  driverUser = await prisma.user.create({
    data: { username: 'driver1', password: 'x', firstName: 'D', lastName: 'Driver', role: 'driver' },
  });
  const driver = await prisma.driver.create({ data: { userId: driverUser.id } });
  studentUser = await prisma.user.create({
    data: { username: 'student1', password: 'x', firstName: 'S', lastName: 'Student', role: 'student' },
  });
  await prisma.student.create({ data: { userId: studentUser.id } });
  route = await prisma.route.create({
    data: { name: 'Route A', pickupPoints: { create: [{ name: 'Town', tier: 'TOWN' }] } },
  });
  await prisma.bus.create({ data: { licensePlate: 'KAA 001A', driverId: driver.id, routeId: route.id } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('baseline API', () => {
  it('health check responds', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('admin routes require auth and the admin role', async () => {
    expect((await request(app).get('/api/admin/buses')).status).toBe(401);
    const res = await request(app)
      .get('/api/admin/buses')
      .set('Authorization', `Bearer ${tokenFor(studentUser)}`);
    expect(res.status).toBe(403);
  });

  it('admin can list buses and routes', async () => {
    const auth = `Bearer ${tokenFor(admin)}`;
    const buses = await request(app).get('/api/admin/buses').set('Authorization', auth);
    expect(buses.status).toBe(200);
    expect(buses.body.buses).toHaveLength(1);
    const routes = await request(app).get('/api/admin/routes').set('Authorization', auth);
    expect(routes.body.routes[0].pickupPoints).toHaveLength(1);
  });

  it('driver sees their route', async () => {
    const res = await request(app)
      .get('/api/drivers/my-route')
      .set('Authorization', `Bearer ${tokenFor(driverUser)}`);
    expect(res.status).toBe(200);
    expect(res.body.bus.licensePlate).toBe('KAA 001A');
  });

  it('student can register on a route', async () => {
    const point = await prisma.pickupPoint.findFirst();
    const res = await request(app)
      .post('/api/students/register-route')
      .set('Authorization', `Bearer ${tokenFor(studentUser)}`)
      .send({ routeId: route.id, arrivePickupPointId: point.id });
    expect(res.status).toBe(200);
    const bus = await request(app)
      .get('/api/students/my-bus')
      .set('Authorization', `Bearer ${tokenFor(studentUser)}`);
    expect(bus.body.bus.licensePlate).toBe('KAA 001A');
  });
});
