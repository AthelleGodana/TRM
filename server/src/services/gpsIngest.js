import prisma from '../config/db.js';

// Live GPS handling. Driver phones send a reading about every 5 seconds;
// the server validates it, broadcasts at most every BROADCAST_MS and stores
// a point only every PERSIST_MS or after PERSIST_METERS of movement, so the
// map stays smooth while the database stays small.
export const GPS = {
  MAX_ACCURACY_M: 100,
  BROADCAST_MS: 2000,
  PERSIST_MS: 15000,
  PERSIST_METERS: 50,
  MAX_SPEED_KMH: 200,
  // Device timestamps outside this window are replaced by the server time.
  MAX_FUTURE_MS: 60_000,
  MAX_PAST_MS: 5 * 60_000,
};

// In-memory state per bus, keyed by organisation and bus so tenants never
// share entries: { last, persisted, broadcastAt }.
const buses = new Map();
// Driver sockets currently connected, per bus.
const online = new Map();
const key = (orgId, busId) => `${orgId}:${busId}`;

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in metres between { lat, lng } points.
export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// Validates a driver's reading. Returns null for anything unusable.
export function parseReading(payload, now = Date.now()) {
  const { lat, lng, accuracy, speed, heading, at } = payload || {};
  if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (finite(accuracy) && accuracy > GPS.MAX_ACCURACY_M) return null;

  const time = finite(at) && at <= now + GPS.MAX_FUTURE_MS && at >= now - GPS.MAX_PAST_MS ? at : now;
  return {
    lat,
    lng,
    accuracy: finite(accuracy) && accuracy >= 0 ? Math.round(accuracy) : null,
    // Devices report metres per second.
    speedKmh: finite(speed) && speed >= 0 ? Math.min(speed * 3.6, GPS.MAX_SPEED_KMH) : null,
    heading: finite(heading) && heading >= 0 && heading <= 360 ? heading : null,
    recordedAt: new Date(time),
  };
}

const present = (busId, p) => ({
  busId,
  lat: p.lat,
  lng: p.lng,
  speedKmh: p.speedKmh == null ? null : Math.round(p.speedKmh),
  heading: p.heading ?? null,
  accuracy: p.accuracy ?? null,
  recordedAt: new Date(p.recordedAt).toISOString(),
});

// Records a validated reading for a bus. Must run inside the driver's
// tenant context (the tenant client stores the point). Returns the payload
// to broadcast, or null when the reading is throttled.
export async function ingestReading(orgId, busId, reading) {
  const k = key(orgId, busId);
  const entry = buses.get(k) || {};
  const t = reading.recordedAt.getTime();

  // Ignore out-of-order readings (e.g. a delayed packet).
  if (entry.last && t < new Date(entry.last.recordedAt).getTime()) return null;

  if (reading.speedKmh == null && entry.last) {
    const dt = (t - new Date(entry.last.recordedAt).getTime()) / 1000;
    if (dt > 0) reading.speedKmh = Math.min((distanceMeters(entry.last, reading) / dt) * 3.6, GPS.MAX_SPEED_KMH);
  }

  const shouldPersist = !entry.persisted
    || t - new Date(entry.persisted.recordedAt).getTime() >= GPS.PERSIST_MS
    || distanceMeters(entry.persisted, reading) >= GPS.PERSIST_METERS;
  if (shouldPersist) {
    await prisma.gpsLog.create({
      data: {
        busId, lat: reading.lat, lng: reading.lng, recordedAt: reading.recordedAt,
        speedKmh: reading.speedKmh, heading: reading.heading, accuracy: reading.accuracy,
      },
    });
    entry.persisted = reading;
  }

  entry.last = reading;
  const broadcast = !entry.broadcastAt || t - entry.broadcastAt >= GPS.BROADCAST_MS;
  if (broadcast) entry.broadcastAt = t;
  buses.set(k, entry);
  return broadcast ? present(busId, reading) : null;
}

// Latest known position for a bus: the in-memory reading if there is one,
// otherwise the newest stored point. Runs in a tenant context.
export async function lastPosition(orgId, busId) {
  const entry = buses.get(key(orgId, busId));
  if (entry?.last) return present(busId, entry.last);
  const log = await prisma.gpsLog.findFirst({ where: { busId }, orderBy: { recordedAt: 'desc' } });
  return log ? present(busId, log) : null;
}

// Tracks connected driver sockets so staff can see which buses are online.
// Returns true when this was the bus's last driver socket.
export function setDriverOnline(orgId, busId, socketId, isOnline) {
  const k = key(orgId, busId);
  const set = online.get(k) || new Set();
  if (isOnline) set.add(socketId); else set.delete(socketId);
  if (set.size) online.set(k, set); else online.delete(k);
  return !isOnline && set.size === 0;
}

export const isDriverOnline = (orgId, busId) => online.has(key(orgId, busId));

// Test helper.
export function resetGpsState() {
  buses.clear();
  online.clear();
}
