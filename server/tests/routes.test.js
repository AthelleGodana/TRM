import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { simplify } from '../src/services/routing.js';
import { bearer, db, truncateAll } from './helpers.js';
import { seedTenant } from './seedTenants.js';

// Road routes: stored geometry from OSRM on save, editing stops, preview,
// best order and place search. The routing services are stubbed.
const app = createApp();
let A, B;
const calls = [];

const STOPS = [
  { name: 'Town Stage', tier: 'TOWN', lat: -1.2864, lng: 36.8172 },
  { name: 'Lavington Mall', tier: 'LAVINGTON', lat: -1.278, lng: 36.77 },
  { name: 'Adams Arcade', tier: 'ADAMS', lat: -1.3, lng: 36.78 },
];

function osrmRoute(points) {
  return {
    code: 'Ok',
    routes: [{
      distance: 9876.4,
      duration: 1234.6,
      geometry: { coordinates: points.flatMap((p) => [[p[0], p[1]], [p[0] + 0.0001, p[1]]]) },
      legs: points.slice(1).map((_, i) => ({ distance: 1000 * (i + 1), duration: 100 * (i + 1) })),
    }],
  };
}

// Stubbed fetch: OSRM route/trip and Nominatim search.
function stubServices({ failRouting = false } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    calls.push(String(url));
    const u = new URL(url);
    const json = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });
    if (u.hostname === 'osrm.test') {
      if (failRouting) return json({}, false);
      const coords = decodeURIComponent(u.pathname.split('/').pop()).split(';').map((c) => c.split(',').map(Number));
      if (u.pathname.includes('/trip/')) {
        // Reverse the middle stops.
        const n = coords.length;
        return json({ code: 'Ok', waypoints: coords.map((_, i) => ({ waypoint_index: i === 0 || i === n - 1 ? i : n - 1 - i })) });
      }
      return json(osrmRoute(coords));
    }
    if (u.hostname === 'places.test') {
      return json([{ name: 'Sarit Centre', display_name: 'Sarit Centre, Westlands, Nairobi, Kenya', lat: '-1.2610', lon: '36.8020' }]);
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
}

beforeAll(async () => {
  await truncateAll();
  A = await seedTenant('AAA');
  B = await seedTenant('ZZB');
  env.routing.url = 'http://osrm.test';
  env.geocoding.url = 'http://places.test';
});
afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; });
afterAll(async () => {
  env.routing.url = '';
  env.geocoding.url = '';
  await db.$disconnect();
});

const post = (path, body, who = A.admin) => request(app).post(path).set('Authorization', bearer(who)).send(body);
const put = (path, body, who = A.admin) => request(app).put(path).set('Authorization', bearer(who)).send(body);

describe('saving routes with road geometry', () => {
  it('stores the road route through the pinned stops', async () => {
    stubServices();
    const res = await post('/api/admin/routes', { name: 'Westlands', schoolArrival: '07:00', pickupPoints: STOPS });
    expect(res.status).toBe(201);
    expect(res.body.routing).toEqual({ ok: true });
    expect(calls[0]).toContain('/route/v1/driving/36.817200,-1.286400;36.770000,-1.278000;36.780000,-1.300000');
    const route = await db.route.findUnique({ where: { id: res.body.route.id } });
    expect(route.organizationId).toBe(A.org.id);
    expect(route).toMatchObject({ distanceMeters: 9876, durationSeconds: 1235 });
    expect(route.legs).toEqual([{ distanceMeters: 1000, durationSeconds: 100 }, { distanceMeters: 2000, durationSeconds: 200 }]);
    expect(route.geometry[0]).toEqual([-1.2864, 36.8172]);
    expect(res.body.route.pickupPoints.map((p) => p.name)).toEqual(['Town Stage', 'Lavington Mall', 'Adams Arcade']);
  });

  it('still saves when routing fails, without geometry', async () => {
    stubServices({ failRouting: true });
    const res = await post('/api/admin/routes', { name: 'Offline', pickupPoints: STOPS });
    expect(res.status).toBe(201);
    expect(res.body.routing.ok).toBe(false);
    expect(res.body.route.geometry).toBeNull();
  });

  it('validates names and times', async () => {
    expect((await post('/api/admin/routes', { name: '', pickupPoints: [] })).status).toBe(400);
    expect((await post('/api/admin/routes', { name: 'X', schoolArrival: '7am' })).status).toBe(400);
    expect((await post('/api/admin/routes', { name: 'X', pickupPoints: [{ name: '' }] })).status).toBe(400);
  });
});

describe('editing routes', () => {
  it('updates, reorders, adds and removes stops, and refreshes the road route', async () => {
    stubServices();
    const created = (await post('/api/admin/routes', { name: 'Edit me', pickupPoints: STOPS })).body.route;
    const [town, lav, adams] = created.pickupPoints;
    await db.student.update({ where: { id: A.student.profile.id }, data: { arrivePickupPointId: lav.id } });

    const res = await put(`/api/admin/routes/${created.id}`, {
      name: 'Edited',
      pickupPoints: [
        { ...adams, name: 'Adams' },
        { id: town.id, name: 'Town Stage', tier: 'TOWN', lat: town.lat, lng: town.lng },
        { name: 'Yaya Centre', tier: 'ADAMS', lat: -1.2925, lng: 36.7876 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.route.name).toBe('Edited');
    expect(res.body.route.pickupPoints.map((p) => p.name)).toEqual(['Adams', 'Town Stage', 'Yaya Centre']);
    expect(res.body.route.pickupPoints[0].id).toBe(adams.id);
    expect(await db.pickupPoint.findUnique({ where: { id: lav.id } })).toBeNull();
    expect((await db.student.findUnique({ where: { id: A.student.profile.id } })).arrivePickupPointId).toBeNull();
    expect(calls.at(-1)).toContain('36.780000,-1.300000;36.817200,-1.286400;36.787600,-1.292500');
  });

  it('never touches another organisation\'s stop passed by id', async () => {
    stubServices();
    const created = (await post('/api/admin/routes', { name: 'Mine', pickupPoints: STOPS.slice(0, 1) })).body.route;
    await put(`/api/admin/routes/${created.id}`, {
      name: 'Mine', pickupPoints: [{ id: B.point.id, name: 'Hijacked', tier: 'TOWN' }],
    });
    expect((await db.pickupPoint.findUnique({ where: { id: B.point.id } })).name).toBe('Stop ZZB');
  });

  it('is staff only', async () => {
    expect((await put(`/api/admin/routes/${A.route.id}`, { name: 'X' }, A.student)).status).toBe(403);
  });
});

describe('preview, best order and place search', () => {
  it('previews a road route without saving', async () => {
    stubServices();
    const before = await db.route.count();
    const res = await post('/api/admin/routes/preview', { pickupPoints: STOPS });
    expect(res.body.route).toMatchObject({ distanceMeters: 9876, durationSeconds: 1235 });
    expect(await db.route.count()).toBe(before);
  });

  it('suggests the shortest order keeping the first and last stop', async () => {
    stubServices();
    const four = [...STOPS, { name: 'School', tier: 'TOWN', lat: -1.31, lng: 36.81 }];
    expect((await post('/api/admin/routes/optimise', { pickupPoints: four })).body.order).toEqual([0, 2, 1, 3]);
    expect((await post('/api/admin/routes/optimise', { pickupPoints: [{ name: 'Unpinned' }, ...STOPS] })).status).toBe(400);
  });

  it('searches places in Kenya for staff', async () => {
    stubServices();
    const res = await request(app).get('/api/admin/places?q=Sarit').set('Authorization', bearer(A.officer));
    expect(res.body.places).toEqual([
      { name: 'Sarit Centre', address: 'Sarit Centre, Westlands, Nairobi, Kenya', lat: -1.261, lng: 36.802 },
    ]);
    expect(calls[0]).toContain('countrycodes=ke');
    expect((await request(app).get('/api/admin/places?q=Sarit').set('Authorization', bearer(A.driver))).status).toBe(403);
  });
});

describe('geometry simplification', () => {
  it('drops points on a straight line but keeps corners', () => {
    const line = [[0, 0], [0, 0.001], [0, 0.002], [0.002, 0.002]];
    expect(simplify(line)).toEqual([[0, 0], [0, 0.002], [0.002, 0.002]]);
  });
});
