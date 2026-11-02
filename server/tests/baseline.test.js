import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { bearer, createMember, createOrg, truncateAll, db as prisma } from './helpers.js';

// Core flows of the existing API, kept as regression coverage while the
// platform becomes multi-tenant.
const app = createApp();
let admin, driver, student, route;

beforeAll(async () => {
  await truncateAll();
  const org = await createOrg();
  admin = await createMember(org, 'ORG_ADMIN');
  driver = await createMember(org, 'DRIVER');
  student = await createMember(org, 'STUDENT');
  route = await prisma.route.create({
    data: {
      name: 'Route A',
      organizationId: org.id,
      pickupPoints: { create: [{ name: 'Town', tier: 'TOWN', organizationId: org.id }] },
    },
  });
  await prisma.bus.create({
    data: { licensePlate: 'KAA 001A', driverId: driver.profile.id, routeId: route.id, organizationId: org.id },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('baseline API', () => {
  it('health check responds', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('admin routes require auth and a staff role', async () => {
    expect((await request(app).get('/api/admin/buses')).status).toBe(401);
    const res = await request(app).get('/api/admin/buses').set('Authorization', bearer(student));
    expect(res.status).toBe(403);
  });

  it('admin can list buses and routes', async () => {
    const buses = await request(app).get('/api/admin/buses').set('Authorization', bearer(admin));
    expect(buses.status).toBe(200);
    expect(buses.body.buses).toHaveLength(1);
    const routes = await request(app).get('/api/admin/routes').set('Authorization', bearer(admin));
    expect(routes.body.routes[0].pickupPoints).toHaveLength(1);
  });

  it('driver sees their route', async () => {
    const res = await request(app).get('/api/drivers/my-route').set('Authorization', bearer(driver));
    expect(res.status).toBe(200);
    expect(res.body.bus.licensePlate).toBe('KAA 001A');
  });

  it('student can register on a route', async () => {
    const point = await prisma.pickupPoint.findFirst();
    const res = await request(app)
      .post('/api/students/register-route')
      .set('Authorization', bearer(student))
      .send({ routeId: route.id, arrivePickupPointId: point.id });
    expect(res.status).toBe(200);
    const bus = await request(app).get('/api/students/my-bus').set('Authorization', bearer(student));
    expect(bus.body.bus.licensePlate).toBe('KAA 001A');
  });
});
