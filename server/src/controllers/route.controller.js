import prisma, { tenantTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { bestOrder, RoutingError, routeThrough, searchPlaces as findPlaces } from '../services/routing.js';

// Routes and their stops. When a route is saved, the road route through
// its pinned stops is fetched from the routing service and stored, so maps
// draw real roads and ETAs use road distances. A routing failure never
// blocks saving; the route simply keeps straight lines until the next save.

const TIERS = ['TOWN', 'LAVINGTON', 'ADAMS'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_STOPS = 50;

class InputError extends Error {}

function cleanStops(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_STOPS) throw new InputError(`A route can have at most ${MAX_STOPS} stops.`);
  return raw.map((p, i) => {
    const name = String(p?.name || '').trim().slice(0, 80);
    if (!name) throw new InputError(`Stop ${i + 1} needs a name.`);
    const tier = TIERS.includes(p?.tier) ? p.tier : 'TOWN';
    const lat = Number.isFinite(p?.lat) && Math.abs(p.lat) <= 90 ? p.lat : null;
    const lng = Number.isFinite(p?.lng) && Math.abs(p.lng) <= 180 ? p.lng : null;
    const both = lat != null && lng != null;
    return { id: Number.isInteger(p?.id) ? p.id : null, name, tier, lat: both ? lat : null, lng: both ? lng : null, order: i };
  });
}

function cleanRoute(body) {
  const name = String(body?.name || '').trim().slice(0, 120);
  if (!name) throw new InputError('Route name is required.');
  const times = {};
  for (const key of ['schoolArrival', 'schoolDeparture']) {
    const v = body?.[key];
    if (v === undefined) continue;
    if (v === '' || v === null) times[key] = null;
    else if (TIME.test(v)) times[key] = v;
    else throw new InputError('Times must look like 07:30.');
  }
  return { name, ...times, stops: cleanStops(body?.pickupPoints) };
}

const pinned = (stops) => stops.filter((s) => s.lat != null && s.lng != null);

// Fetches and stores the road route; returns { ok, error? }.
async function refreshGeometry(routeId, stops) {
  const points = pinned(stops);
  let data = { geometry: null, distanceMeters: null, durationSeconds: null, legs: null, geometryUpdatedAt: null };
  let result = { ok: points.length < 2 };
  if (points.length >= 2) {
    try {
      data = { ...(await routeThrough(points)), geometryUpdatedAt: new Date() };
      result = { ok: true };
    } catch (err) {
      if (!(err instanceof RoutingError)) throw err;
      result = { ok: false, error: `Saved, but the road route could not be generated: ${err.message}` };
    }
  }
  await prisma.route.update({ where: { id: routeId }, data });
  return result;
}

const withStops = (id) => prisma.route.findUnique({
  where: { id },
  include: { pickupPoints: { orderBy: { order: 'asc' } }, buses: true },
});

function sendInputError(res, err) {
  if (err instanceof InputError || err instanceof RoutingError) return res.status(400).json({ error: err.message });
  throw err;
}

// POST /admin/routes — { name, schoolArrival?, schoolDeparture?, pickupPoints: [{ name, tier, lat?, lng? }] }
export const createRoute = asyncHandler(async (req, res) => {
  let input;
  try { input = cleanRoute(req.body); } catch (err) { return sendInputError(res, err); }
  const { stops, ...fields } = input;
  const route = await prisma.route.create({
    data: {
      ...fields,
      pickupPoints: { create: stops.map(({ id, ...s }) => s) },
    },
  });
  const routing = await refreshGeometry(route.id, stops);
  res.status(201).json({ route: await withStops(route.id), routing });
});

// PUT /admin/routes/:id — same body; stops with an id are updated, new
// ones created, and missing ones removed (passengers using a removed stop
// keep their route but must choose a stop again).
export const updateRoute = asyncHandler(async (req, res) => {
  let input;
  try { input = cleanRoute(req.body); } catch (err) { return sendInputError(res, err); }
  const id = Number(req.params.id) || 0;
  const existing = await prisma.route.findUnique({ where: { id }, include: { pickupPoints: true } });
  if (!existing) return res.status(404).json({ error: 'Route not found.' });

  const { stops, ...fields } = input;
  const ownIds = new Set(existing.pickupPoints.map((p) => p.id));
  const keptIds = new Set(stops.filter((s) => s.id && ownIds.has(s.id)).map((s) => s.id));
  const removed = [...ownIds].filter((pid) => !keptIds.has(pid));

  await tenantTransaction(async (tx) => {
    if (removed.length) {
      await tx.student.updateMany({ where: { arrivePickupPointId: { in: removed } }, data: { arrivePickupPointId: null } });
      await tx.student.updateMany({ where: { departPickupPointId: { in: removed } }, data: { departPickupPointId: null } });
      await tx.pickupPoint.deleteMany({ where: { id: { in: removed } } });
    }
    for (const s of stops) {
      const { id: stopId, ...data } = s;
      if (stopId && keptIds.has(stopId)) await tx.pickupPoint.update({ where: { id: stopId }, data });
      else await tx.pickupPoint.create({ data: { ...data, routeId: id } });
    }
    await tx.route.update({ where: { id }, data: fields });
  });

  const routing = await refreshGeometry(id, stops);
  res.json({ route: await withStops(id), routing });
});

// POST /admin/routes/preview — { pickupPoints } → road route without saving.
export const previewRoute = asyncHandler(async (req, res) => {
  try {
    const points = pinned(cleanStops(req.body?.pickupPoints));
    if (points.length < 2) return res.json({ route: null });
    res.json({ route: await routeThrough(points) });
  } catch (err) {
    if (err instanceof RoutingError) return res.status(502).json({ error: err.message });
    return sendInputError(res, err);
  }
});

// POST /admin/routes/optimise — { pickupPoints } → { order: [indexes] },
// shortest driving order with the first and last stop kept in place.
export const optimiseRoute = asyncHandler(async (req, res) => {
  try {
    const stops = cleanStops(req.body?.pickupPoints);
    if (pinned(stops).length !== stops.length) {
      return res.status(400).json({ error: 'Pin every stop on the map first.' });
    }
    res.json({ order: await bestOrder(stops) });
  } catch (err) {
    if (err instanceof RoutingError) return res.status(502).json({ error: err.message });
    return sendInputError(res, err);
  }
});

// GET /admin/places?q= — place search for adding stops.
export const searchPlaces = asyncHandler(async (req, res) => {
  try {
    res.json({ places: await findPlaces(req.query.q) });
  } catch (err) {
    if (err instanceof RoutingError) return res.status(502).json({ error: 'Place search is unavailable right now.' });
    throw err;
  }
});
