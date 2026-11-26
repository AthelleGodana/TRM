import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { bearer, createMember, createOrg, db, truncateAll } from './helpers.js';

// Fleet management: vehicle registry, driver assignments, maintenance,
// defects, documents, and the COMPANY profile's feature flags.
const app = createApp();
let company, admin, driverA, driverB, other, otherAdmin, otherDriver;

const as = (member) => ({
  get: (path) => request(app).get(path).set('Authorization', bearer(member)),
  post: (path, body) => request(app).post(path).set('Authorization', bearer(member)).send(body),
  put: (path, body) => request(app).put(path).set('Authorization', bearer(member)).send(body),
  patch: (path, body) => request(app).patch(path).set('Authorization', bearer(member)).send(body),
});

// Smallest valid PDF header is enough: files are recognised by their first bytes.
const PDF = Buffer.from('%PDF-1.4\n%test\n');

beforeAll(async () => {
  await truncateAll();
  company = await createOrg({ profile: 'COMPANY', name: 'Haulage Co' });
  admin = await createMember(company, 'ORG_ADMIN');
  driverA = await createMember(company, 'DRIVER', { firstName: 'Otieno' });
  driverB = await createMember(company, 'DRIVER', { firstName: 'Akinyi' });
  other = await createOrg({ profile: 'COMPANY', name: 'Other Co' });
  otherAdmin = await createMember(other, 'ORG_ADMIN');
  otherDriver = await createMember(other, 'DRIVER');
});
afterAll(() => db.$disconnect());

describe('company profile', () => {
  it('turns passenger features off in the session and the API', async () => {
    const me = await as(admin).get('/api/auth/me');
    expect(me.body.session.organization).toMatchObject({
      vehiclesLabel: 'Vehicles',
      features: { passengers: false, studentBilling: false },
    });
    expect((await as(admin).get('/api/admin/students')).status).toBe(403);
    expect((await as(admin).get('/api/admin/payments')).status).toBe(403);
    expect((await as(admin).get('/api/admin/buses')).status).toBe(200);
  });
});

describe('vehicle registry', () => {
  let truck;
  let van;

  it('creates vehicles with their details and a driver', async () => {
    const res = await as(admin).post('/api/admin/buses', {
      licensePlate: 'KDA 100T', vehicleType: 'TRUCK', make: 'Isuzu', model: 'FVZ', year: 2021,
      vin: 'jalfvz34s00001', odometerKm: 120000, fuelType: 'DIESEL', ownership: 'OWNED', driverId: driverA.profile.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    truck = res.body.bus;
    expect(truck).toMatchObject({ vehicleType: 'TRUCK', vin: 'JALFVZ34S00001', driverId: driverA.profile.id });

    van = (await as(admin).post('/api/admin/buses', { licensePlate: 'KDB 200V', vehicleType: 'VAN', odometerKm: 5000 })).body.bus;
  });

  it('rejects a duplicate VIN and bad input', async () => {
    expect((await as(admin).post('/api/admin/buses', { licensePlate: 'KDC 1', vin: 'JALFVZ34S00001' })).status).toBe(409);
    expect((await as(admin).post('/api/admin/buses', { licensePlate: 'KDC 2', vehicleType: 'SPACESHIP' })).status).toBe(400);
    expect((await as(admin).post('/api/admin/buses', { make: 'No plate' })).status).toBe(400);
  });

  it('moves a driver between vehicles and keeps the assignment history', async () => {
    const res = await as(admin).post(`/api/admin/buses/${van.id}/assign`, { driverId: driverA.profile.id });
    expect(res.status).toBe(200);
    expect(res.body.movedFromBusId).toBe(truck.id);

    const truckNow = (await as(admin).get(`/api/admin/buses/${truck.id}`)).body.bus;
    expect(truckNow.driverId).toBeNull();
    expect(truckNow.assignments).toHaveLength(1);
    expect(truckNow.assignments[0].endedAt).not.toBeNull();

    await as(admin).post(`/api/admin/buses/${truck.id}/assign`, { driverId: driverB.profile.id });
    const profile = (await as(admin).get(`/api/admin/drivers/${driverA.profile.id}`)).body.driver;
    expect(profile.vehicle.id).toBe(van.id);
    expect(profile.assignments.map((a) => a.bus.licensePlate)).toEqual(['KDB 200V', 'KDA 100T']);
  });

  it('refuses another organisation\'s driver and vehicle', async () => {
    expect((await as(admin).post(`/api/admin/buses/${van.id}/assign`, { driverId: otherDriver.profile.id })).status).toBe(404);
    expect((await as(otherAdmin).get(`/api/admin/buses/${van.id}`)).status).toBe(404);
  });

  it('never lets the odometer go backwards', async () => {
    expect((await as(admin).put(`/api/admin/buses/${truck.id}/odometer`, { odometerKm: 119000 })).status).toBe(400);
    expect((await as(admin).put(`/api/admin/buses/${truck.id}/odometer`, { odometerKm: 124900 })).status).toBe(200);
  });

  it('updates driver profiles and flags licences', async () => {
    const res = await as(admin).put(`/api/admin/drivers/${driverB.profile.id}`, {
      licenseNumber: 'DL-1', licenseClass: 'CE', licenseExpiry: new Date(Date.now() + 10 * 864e5).toISOString(),
    });
    expect(res.status).toBe(200);
    const list = (await as(admin).get('/api/admin/drivers')).body.drivers;
    expect(list.find((d) => d.id === driverB.profile.id)).toMatchObject({ licenseStatus: 'EXPIRING', vehicle: { id: truck.id } });
  });

  describe('maintenance', () => {
    let schedule;

    it('schedules a service from the current odometer and lists it when due', async () => {
      const res = await as(admin).post('/api/admin/maintenance/schedules', { busId: truck.id, name: 'Oil change', intervalKm: 5000 });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      schedule = res.body.schedule;
      expect(schedule.lastDoneOdometer).toBe(124900);

      await as(admin).put(`/api/admin/buses/${truck.id}/odometer`, { odometerKm: 129600 });
      const due = (await as(admin).get('/api/admin/maintenance/due')).body.items;
      expect(due).toHaveLength(1);
      expect(due[0].due).toMatchObject({ status: 'DUE_SOON', kmLeft: 300 });
    });

    it('recording the service resets the schedule, moves the odometer and resolves defects', async () => {
      const defect = (await as(driverB).post('/api/drivers/defects', { description: 'Oil leak', severity: 'HIGH' })).body.defect;
      expect(defect.busId).toBe(truck.id);

      const res = await as(admin).post('/api/admin/maintenance/services', {
        busId: truck.id, scheduleId: schedule.id, description: 'Oil and filter', odometerKm: 130000,
        partsCost: 4000, labourCost: 1500, defectIds: [defect.id],
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(Number(res.body.record.totalCost)).toBe(5500);

      const bus = (await as(admin).get(`/api/admin/buses/${truck.id}`)).body.bus;
      expect(bus.odometerKm).toBe(130000);
      expect(bus.maintenanceSchedules[0]).toMatchObject({ lastDoneOdometer: 130000, due: { status: 'OK' } });
      expect(bus.attention.openDefects).toBe(0);
      expect((await as(admin).get('/api/admin/maintenance/due')).body.items).toHaveLength(0);
    });

    it('a driver only reports defects on their own vehicle', async () => {
      expect((await as(otherDriver).post('/api/drivers/defects', { description: 'x' })).status).toBe(404);
      const mine = (await as(driverA).get('/api/drivers/my-vehicle')).body.vehicle;
      expect(mine.id).toBe(van.id);
    });
  });

  describe('documents', () => {
    let doc;

    it('stores a document with its file and flags expiry', async () => {
      const res = await as(admin).post('/api/admin/documents', {
        entityType: 'VEHICLE', busId: truck.id, kind: 'INSURANCE', number: 'POL-9',
        expiresAt: new Date(Date.now() - 864e5).toISOString(),
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      doc = res.body.document;
      expect(doc.expiry).toBe('EXPIRED');

      const up = await request(app).post(`/api/admin/documents/${doc.id}/file`)
        .set('Authorization', bearer(admin)).attach('file', PDF, 'policy.pdf');
      expect(up.status, JSON.stringify(up.body)).toBe(200);
      expect(up.body.document).toMatchObject({ hasFile: true, mimeType: 'application/pdf' });

      const overview = (await as(admin).get('/api/admin/fleet/overview')).body;
      expect(overview.documents.expired).toBe(1);
      expect(overview.attention.some((a) => a.kind === 'DOCUMENT')).toBe(true);
    });

    it('rejects files that are not PDF or images', async () => {
      const res = await request(app).post(`/api/admin/documents/${doc.id}/file`)
        .set('Authorization', bearer(admin)).attach('file', Buffer.from('<script>alert(1)</script>'), 'x.pdf');
      expect(res.status).toBe(400);
    });

    it('downloads only for the organisation and the vehicle\'s driver', async () => {
      const file = await request(app).get(`/api/admin/documents/${doc.id}/file`).set('Authorization', bearer(admin));
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect((await request(app).get(`/api/admin/documents/${doc.id}/file`).set('Authorization', bearer(otherAdmin))).status).toBe(404);
      expect((await request(app).get(`/api/drivers/documents/${doc.id}/file`).set('Authorization', bearer(driverB))).status).toBe(200);
      expect((await request(app).get(`/api/drivers/documents/${doc.id}/file`).set('Authorization', bearer(driverA))).status).toBe(404);
    });
  });

  it('archives a vehicle, unassigning its driver', async () => {
    const res = await as(admin).post(`/api/admin/buses/${van.id}/archive`);
    expect(res.status).toBe(200);
    expect(res.body.bus).toMatchObject({ driverId: null, status: 'OUT_OF_SERVICE' });
    const list = (await as(admin).get('/api/admin/buses')).body.buses;
    expect(list.map((b) => b.id)).not.toContain(van.id);
  });
});
