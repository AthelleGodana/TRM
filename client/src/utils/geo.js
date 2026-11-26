// Geometry and timing helpers for live tracking. Points are { lat, lng }.

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg) => (deg * Math.PI) / 180;

export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Position of p along segment a→b as a fraction 0..1 (flat-earth
// approximation, fine over a few kilometres).
function segmentFraction(p, a, b) {
  const kx = Math.cos(rad(a.lat));
  const ax = a.lng * kx; const bx = b.lng * kx; const px = p.lng * kx;
  const dx = bx - ax; const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  return Math.max(0, Math.min(1, ((px - ax) * dx + (p.lat - a.lat) * dy) / len2));
}

const lerp = (a, b, t) => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });

// Distance in metres the bus still has to travel to reach the stop at
// index `target` of the ordered `stops`, following the route. The bus is
// snapped to the nearest route segment. Returns null if the bus has
// already passed the stop (or there are too few mapped stops), in which
// case callers can fall back to the straight-line distance.
export function remainingAlongRoute(bus, stops, target) {
  const pts = stops.filter((s) => s.lat != null && s.lng != null);
  const goal = pts.findIndex((s) => s.id === stops[target]?.id);
  if (goal < 0) return null;
  if (pts.length < 2) return distanceMeters(bus, pts[goal]);

  let best = { dist: Infinity, seg: 0, point: pts[0] };
  for (let i = 0; i < pts.length - 1; i += 1) {
    const point = lerp(pts[i], pts[i + 1], segmentFraction(bus, pts[i], pts[i + 1]));
    const dist = distanceMeters(bus, point);
    if (dist < best.dist) best = { dist, seg: i, point };
  }
  // The first stop is approached from outside the route (e.g. the depot):
  // count it as passed once the bus is more than 100 m along the route.
  if (goal === 0) {
    const along = best.seg === 0 ? distanceMeters(pts[0], best.point) : Infinity;
    return along > 100 ? null : distanceMeters(bus, pts[0]);
  }
  // Segment i runs from stop i to stop i + 1, so a bus on segment `goal`
  // or later has passed the stop.
  if (best.seg >= goal) return null;
  let total = best.dist + distanceMeters(best.point, pts[best.seg + 1]);
  for (let i = best.seg + 1; i < goal; i += 1) total += distanceMeters(pts[i], pts[i + 1]);
  return total;
}

// Typical city bus speed used when the bus is stopped or has no speed yet.
export const FALLBACK_SPEED_KMH = 20;

// Minutes to cover `meters` at `speedKmh` (never below the fallback, so a
// bus waiting at a light does not show an infinite ETA).
export function etaMinutes(meters, speedKmh) {
  const kmh = Math.max(speedKmh || 0, FALLBACK_SPEED_KMH);
  return Math.max(1, Math.round((meters / 1000 / kmh) * 60));
}

export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

// Re-exported from utils/format.js (kept here for existing imports).
export { timeAgo } from './format';

// Live status of a bus from its latest position.
export const MOVING_KMH = 5;
export const STALE_MS = 2 * 60_000;
export function busStatus(position, { offline = false, now = Date.now() } = {}) {
  if (!position) return { key: 'offline', label: 'No signal yet' };
  const age = now - new Date(position.recordedAt).getTime();
  if (offline || age > STALE_MS) return { key: 'offline', label: 'Offline' };
  if ((position.speedKmh ?? 0) >= MOVING_KMH) return { key: 'moving', label: 'Moving' };
  return { key: 'stopped', label: 'Stopped' };
}

// "06:30" today as a Date.
export function todayAt(hhmm, now = new Date()) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}
