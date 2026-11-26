import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getFuelAnalyticsProvider, HttpFuelAnalyticsProvider, NullFuelAnalyticsProvider } from '../src/fuel/providers/index.js';
import { runFuelAnalysisForTenant, startFuelAnalysisScheduler } from '../src/fuel/analysisJob.js';
import { bearer, createMember, db, truncateAll } from './helpers.js';
import { seedTenant } from './seedTenants.js';

const app = createApp();
let A, B, recordB, cardB, calibrationB, anomalyB;

beforeAll(async () => {
  await truncateAll();
  A = await seedTenant('AAA', { fuelHubEnabled: true });
  B = await seedTenant('ZZB', { fuelHubEnabled: true });
  recordB = await db.fuelRecord.create({
    data: { organizationId: B.org.id, busId: B.bus.id, litres: 50, totalCost: 9000, filledAt: new Date(), station: 'Station ZZB' },
  });
  cardB = await db.fuelCard.create({ data: { organizationId: B.org.id, label: 'Card ZZB', last4: '9999' } });
  await db.vehicleFuelProfile.create({
    data: { organizationId: B.org.id, busId: B.bus.id, fuelType: 'DIESEL', tankCapacityLitres: 200, expectedConsumptionL100km: 25 },
  });
  calibrationB = await db.calibrationRecord.create({ data: { organizationId: B.org.id, busId: B.bus.id, calibratedAt: new Date(), notes: 'Cal ZZB' } });
  anomalyB = await db.fuelAnomaly.create({
    data: { organizationId: B.org.id, busId: B.bus.id, type: 'ZZB_TYPE', severity: 'HIGH', score: 0.9, explanation: { summary: 'ZZB' } },
  });
});
afterAll(() => db.$disconnect());

const as = (member) => ({
  get: (p) => request(app).get(p).set('Authorization', bearer(member)),
  post: (p, b) => request(app).post(p).set('Authorization', bearer(member)).send(b),
  put: (p, b) => request(app).put(p).set('Authorization', bearer(member)).send(b),
  patch: (p, b) => request(app).patch(p).set('Authorization', bearer(member)).send(b),
  del: (p) => request(app).delete(p).set('Authorization', bearer(member)),
});

describe('feature flag', () => {
  it('Fuel Hub is 404 when fuelHubEnabled is off', async () => {
    const C = await seedTenant('CCC');
    expect((await as(C.admin).get('/api/fuel/records')).status).toBe(404);
  });
});

describe('fuel records', () => {
  let recordId;

  it('staff create a record and the total cost is derived from the price', async () => {
    const res = await as(A.officer).post('/api/fuel/records', {
      busId: A.bus.id, litres: 40, pricePerLitre: 180.5, odometer: 12000, station: 'Shell Westlands',
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.record.totalCost)).toBe(7220);
    expect(res.body.record.source).toBe('MANUAL');
    recordId = res.body.record.id;
  });

  it('validates input', async () => {
    expect((await as(A.officer).post('/api/fuel/records', { busId: A.bus.id, litres: -1 })).status).toBe(400);
    expect((await as(A.officer).post('/api/fuel/records', { litres: 10 })).status).toBe(400);
    expect((await as(A.officer).post('/api/fuel/records', { busId: A.bus.id, litres: 10, receiptImageUrl: 'http://x' })).status).toBe(400);
  });

  it('reads, updates and deletes a record', async () => {
    expect((await as(A.officer).get(`/api/fuel/records/${recordId}`)).body.record.station).toBe('Shell Westlands');
    const upd = await as(A.officer).patch(`/api/fuel/records/${recordId}`, { totalCost: 8000 });
    expect(Number(upd.body.record.pricePerLitre)).toBe(200);
    expect((await as(A.officer).del(`/api/fuel/records/${recordId}`)).status).toBe(200);
    expect((await as(A.officer).get(`/api/fuel/records/${recordId}`)).status).toBe(404);
  });

  it('drivers log fuel only for their own bus and see only their own records', async () => {
    const res = await as(A.driver).post('/api/fuel/records', { busId: 999999, litres: 30, totalCost: 5400 });
    expect(res.status).toBe(201);
    expect(res.body.record).toMatchObject({ busId: A.bus.id, driverId: A.driver.profile.id });

    const other = await createMember(A.org, 'DRIVER');
    expect((await as(other).get('/api/fuel/records')).body.records).toEqual([]);
    expect((await as(other).get(`/api/fuel/records/${res.body.record.id}`)).status).toBe(404);
    expect((await as(A.driver).patch(`/api/fuel/records/${res.body.record.id}`, { litres: 1 })).status).toBe(403);
  });

  it('a record linked to a fuel card is sourced FUEL_CARD', async () => {
    const card = await as(A.admin).post('/api/fuel/cards', { label: 'Main card', last4: '1234' });
    const res = await as(A.officer).post('/api/fuel/records', { busId: A.bus.id, litres: 10, totalCost: 1800, fuelCardId: card.body.card.id });
    expect(res.body.record.source).toBe('FUEL_CARD');
  });

  it('fuel logged through the old vehicle log is mirrored into the Fuel Hub', async () => {
    const res = await as(A.driver).post('/api/vehicles/logs', { type: 'FUEL', fuelLiters: 25, fuelCost: 4500, odometer: 15000 });
    expect(res.status).toBe(201);
    const mirrored = await db.fuelRecord.findFirst({ where: { legacyVehicleLogId: res.body.log.id } });
    expect(mirrored).toMatchObject({ busId: A.bus.id, organizationId: A.org.id });
    expect(Number(mirrored.pricePerLitre)).toBe(180);
  });
});

describe('fuel cards, profiles and calibrations', () => {
  it('cards store only the last four digits', async () => {
    expect((await as(A.admin).post('/api/fuel/cards', { label: 'X', cardNumber: '4111111111111111', last4: '1111' })).status).toBe(400);
    expect((await as(A.admin).post('/api/fuel/cards', { label: 'X', last4: '12' })).status).toBe(400);
    const res = await as(A.admin).post('/api/fuel/cards', { label: 'Total card', last4: '4321', provider: 'TotalEnergies', busId: A.bus.id });
    expect(res.status).toBe(201);
    const id = res.body.card.id;
    expect((await as(A.admin).patch(`/api/fuel/cards/${id}`, { status: 'BLOCKED' })).body.card.status).toBe('BLOCKED');
    expect((await as(A.admin).get('/api/fuel/cards')).body.cards.some((c) => c.id === id)).toBe(true);
    expect((await as(A.admin).del(`/api/fuel/cards/${id}`)).status).toBe(200);
    expect((await as(A.driver).get('/api/fuel/cards')).status).toBe(403);
  });

  it('one fuel profile per vehicle: create, update, delete', async () => {
    expect((await as(A.officer).put(`/api/fuel/profiles/${A.bus.id}`, { fuelType: 'DIESEL' })).status).toBe(400);
    const created = await as(A.officer).put(`/api/fuel/profiles/${A.bus.id}`, {
      fuelType: 'DIESEL', tankCapacityLitres: 150, expectedConsumptionL100km: 22.5,
    });
    expect(created.status).toBe(201);
    const updated = await as(A.officer).put(`/api/fuel/profiles/${A.bus.id}`, { calibrationNotes: 'Dipstick checked' });
    expect(updated.status).toBe(200);
    expect(updated.body.profile.calibrationNotes).toBe('Dipstick checked');
    expect((await as(A.officer).get('/api/fuel/profiles')).body.profiles).toHaveLength(1);
    expect((await as(A.officer).del(`/api/fuel/profiles/${A.bus.id}`)).status).toBe(200);
  });

  it('calibration records CRUD', async () => {
    const res = await as(A.officer).post('/api/fuel/calibrations', { busId: A.bus.id, calibratedAt: '2026-10-01', odometer: 11000, method: 'Full-tank test' });
    expect(res.status).toBe(201);
    const id = res.body.calibration.id;
    expect((await as(A.officer).patch(`/api/fuel/calibrations/${id}`, { measuredConsumptionL100km: 24 })).status).toBe(200);
    expect((await as(A.officer).get(`/api/fuel/calibrations?busId=${A.bus.id}`)).body.calibrations).toHaveLength(1);
    expect((await as(A.officer).del(`/api/fuel/calibrations/${id}`)).status).toBe(200);
  });
});

describe('anomalies', () => {
  it('lists an empty set until a model produces anomalies', async () => {
    const res = await as(A.officer).get('/api/fuel/anomalies');
    expect(res.status).toBe(200);
    expect(res.body.anomalies).toEqual([]);
  });

  it('reviewing an anomaly records who reviewed it', async () => {
    const anomaly = await db.fuelAnomaly.create({
      data: { organizationId: A.org.id, busId: A.bus.id, type: 'CONSUMPTION_SPIKE', severity: 'MEDIUM', score: 0.6, explanation: { summary: 'test' } },
    });
    const res = await as(A.officer).patch(`/api/fuel/anomalies/${anomaly.id}`, { status: 'CONFIRMED', reviewNote: 'Leak found' });
    expect(res.body.anomaly).toMatchObject({ status: 'CONFIRMED', reviewedById: A.officer.user.id });
    expect((await as(A.officer).patch(`/api/fuel/anomalies/${anomaly.id}`, { status: 'BOGUS' })).status).toBe(400);
    await db.fuelAnomaly.delete({ where: { id: anomaly.id } });
  });
});

describe('fuel data isolation', () => {
  it.each([
    '/api/fuel/records', '/api/fuel/cards', '/api/fuel/profiles', '/api/fuel/calibrations',
    '/api/fuel/anomalies', '/api/fuel/analysis/runs',
  ])('GET %s never includes another tenant', async (path) => {
    const res = await as(A.admin).get(path);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('ZZB');
  });

  it('another tenant\'s fuel records, cards, profiles, calibrations and anomalies are 404', async () => {
    const results = await Promise.all([
      as(A.admin).get(`/api/fuel/records/${recordB.id}`),
      as(A.admin).patch(`/api/fuel/records/${recordB.id}`, { litres: 1 }),
      as(A.admin).del(`/api/fuel/records/${recordB.id}`),
      as(A.admin).patch(`/api/fuel/cards/${cardB.id}`, { status: 'BLOCKED' }),
      as(A.admin).del(`/api/fuel/cards/${cardB.id}`),
      as(A.admin).put(`/api/fuel/profiles/${B.bus.id}`, { fuelType: 'PETROL', tankCapacityLitres: 1, expectedConsumptionL100km: 1 }),
      as(A.admin).del(`/api/fuel/profiles/${B.bus.id}`),
      as(A.admin).patch(`/api/fuel/calibrations/${calibrationB.id}`, { notes: 'x' }),
      as(A.admin).del(`/api/fuel/calibrations/${calibrationB.id}`),
      as(A.admin).patch(`/api/fuel/anomalies/${anomalyB.id}`, { status: 'DISMISSED' }),
      as(A.admin).post('/api/fuel/records', { busId: B.bus.id, litres: 5, totalCost: 900 }),
      as(A.admin).post('/api/fuel/records', { busId: A.bus.id, litres: 5, totalCost: 900, fuelCardId: cardB.id }),
      as(A.admin).post('/api/fuel/cards', { label: 'x', last4: '0000', driverId: B.driver.profile.id }),
      as(A.admin).post('/api/fuel/calibrations', { busId: B.bus.id, calibratedAt: '2026-10-01' }),
    ]);
    expect(results.map((r) => r.status)).toEqual(Array(results.length).fill(404));

    expect(await db.fuelRecord.findUnique({ where: { id: recordB.id } })).toMatchObject({ litres: recordB.litres });
    expect((await db.fuelAnomaly.findUnique({ where: { id: anomalyB.id } })).status).toBe('OPEN');
    expect(await db.fuelCard.findUnique({ where: { id: cardB.id } })).toMatchObject({ status: 'ACTIVE' });
  });
});

describe('analytics provider switch', () => {
  const httpConfig = { provider: 'http', serviceUrl: 'http://ai:8000', serviceSecret: 's3cret', timeoutMs: 1000 };

  it('defaults to the null provider', () => {
    expect(getFuelAnalyticsProvider({ fuelHubEnabled: true, aiFuelAnalyticsEnabled: true }, { provider: 'null' }))
      .toBeInstanceOf(NullFuelAnalyticsProvider);
  });

  it('uses HTTP only when configured AND the tenant enabled AI analytics', () => {
    const on = { fuelHubEnabled: true, aiFuelAnalyticsEnabled: true };
    expect(getFuelAnalyticsProvider(on, httpConfig)).toBeInstanceOf(HttpFuelAnalyticsProvider);
    expect(getFuelAnalyticsProvider({ ...on, aiFuelAnalyticsEnabled: false }, httpConfig)).toBeInstanceOf(NullFuelAnalyticsProvider);
    expect(getFuelAnalyticsProvider({ ...on, fuelHubEnabled: false }, httpConfig)).toBeInstanceOf(NullFuelAnalyticsProvider);
    expect(getFuelAnalyticsProvider(on, { ...httpConfig, serviceSecret: '' })).toBeInstanceOf(NullFuelAnalyticsProvider);
  });

  it('a run with the null provider is recorded as SKIPPED', async () => {
    const run = await runFuelAnalysisForTenant(A.org, { provider: new NullFuelAnalyticsProvider() });
    expect(run).toMatchObject({ status: 'SKIPPED', provider: 'null', organizationId: A.org.id });
  });

  it('the scheduler hook is off by default', () => {
    const stop = startFuelAnalysisScheduler({ jobEnabled: false });
    expect(typeof stop).toBe('function');
  });

  describe('HTTP provider against a stub AI service', () => {
    let server, url, lastRequest, reply;

    beforeAll(async () => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          lastRequest = { headers: req.headers, path: req.url, body: JSON.parse(body) };
          if (req.headers['x-service-secret'] !== 's3cret') {
            res.writeHead(401).end();
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(reply(lastRequest.body)));
        });
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      url = `http://127.0.0.1:${server.address().port}`;
    });
    afterAll(() => new Promise((r) => server.close(r)));

    const provider = (secret = 's3cret') => new HttpFuelAnalyticsProvider({ url, secret, timeoutMs: 2000 });

    it('sends only the tenant\'s own data with the service secret and stores anomalies', async () => {
      reply = (req) => ({
        organizationId: req.organizationId,
        modelVersion: 'stub-1',
        anomalies: [{
          type: 'CONSUMPTION_SPIKE', severity: 'HIGH', score: 0.87,
          vehicleId: req.vehicles[0].id, fuelRecordId: req.fuelRecords[0].id,
          explanation: { summary: 'Used 40% more fuel than expected.' },
        }],
      });
      const run = await runFuelAnalysisForTenant(A.org, { provider: provider() });
      expect(run.status).toBe('SUCCEEDED');
      expect(run.anomaliesFound).toBe(1);

      expect(lastRequest.path).toBe('/v1/analyze');
      expect(lastRequest.headers['x-service-secret']).toBe('s3cret');
      expect(lastRequest.body.organizationId).toBe(A.org.id);
      expect(lastRequest.body.vehicles.map((v) => v.id)).toEqual([A.bus.id]);
      expect(lastRequest.body.fuelRecords.every((r) => r.vehicleId === A.bus.id)).toBe(true);
      expect(JSON.stringify(lastRequest.body)).not.toContain('ZZB');

      const stored = await as(A.officer).get('/api/fuel/anomalies?status=OPEN');
      expect(stored.body.anomalies.map((a) => a.type)).toEqual(['CONSUMPTION_SPIKE']);
    });

    it('a second run over the same window stores nothing twice', async () => {
      reply = (req) => ({
        organizationId: req.organizationId,
        modelVersion: 'stub-1',
        anomalies: [
          { type: 'CONSUMPTION_SPIKE', severity: 'HIGH', score: 0.87, vehicleId: req.vehicles[0].id,
            fuelRecordId: req.fuelRecords[0].id, explanation: { summary: 'Used 40% more fuel than expected.' } },
          { type: 'EFFICIENCY_DRIFT', severity: 'MEDIUM', score: 0.5, vehicleId: req.vehicles[0].id,
            fuelRecordId: null, explanation: { summary: 'Fuel use up 25%.' } },
        ],
      });
      // The previous test already stored the CONSUMPTION_SPIKE: only the drift is new.
      const first = await runFuelAnalysisForTenant(A.org, { provider: provider() });
      expect(first.anomaliesFound).toBe(1);
      const second = await runFuelAnalysisForTenant(A.org, { provider: provider() });
      expect(second.status).toBe('SUCCEEDED');
      expect(second.anomaliesFound).toBe(0);
      const counts = await db.fuelAnomaly.groupBy({ by: ['type'], where: { organizationId: A.org.id }, _count: true });
      expect(Object.fromEntries(counts.map((c) => [c.type, c._count]))).toMatchObject({ CONSUMPTION_SPIKE: 1, EFFICIENCY_DRIFT: 1 });
    });

    it('rejects a response for another organisation', async () => {
      reply = () => ({ organizationId: B.org.id, anomalies: [] });
      const run = await runFuelAnalysisForTenant(A.org, { provider: provider() });
      expect(run.status).toBe('FAILED');
      expect(run.error).toMatch(/different organisation/);
    });

    it('rejects anomalies that reference data that was not sent', async () => {
      reply = (req) => ({
        organizationId: req.organizationId,
        anomalies: [{ type: 'X', severity: 'LOW', score: 0.1, fuelRecordId: recordB.id, explanation: { summary: 'x' } }],
      });
      const run = await runFuelAnalysisForTenant(A.org, { provider: provider() });
      expect(run.status).toBe('FAILED');
      expect(await db.fuelAnomaly.count({ where: { fuelRecordId: recordB.id, organizationId: A.org.id } })).toBe(0);
    });

    it('a wrong secret fails the run without storing anything', async () => {
      const run = await runFuelAnalysisForTenant(A.org, { provider: provider('wrong') });
      expect(run.status).toBe('FAILED');
      expect(run.error).toMatch(/401/);
    });
  });
});
