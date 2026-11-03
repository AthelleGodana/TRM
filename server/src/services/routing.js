import { env } from '../config/env.js';

// Road routing and place search on OpenStreetMap data.
//
// - Routes go through OSRM (https://project-osrm.org). They are computed
//   when a route is saved and stored, so even the free public server is
//   only called a handful of times. Production can point ROUTING_URL at a
//   self-hosted OSRM (see docker-compose.yml, profile "routing").
// - Place search uses Nominatim, with a 1 request/second limit and a small
//   cache as its usage policy requires.

export class RoutingError extends Error {}

const USER_AGENT = 'TranstrackKenya/1.0 (transport management)';
const MAX_STOPS = 50;

export const routingEnabled = () => Boolean(env.routing.url);
export const geocodingEnabled = () => Boolean(env.geocoding.url);

async function getJson(url, timeoutMs) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((err) => { throw new RoutingError(`Routing service unreachable: ${err.message}`); });
  if (!res.ok) throw new RoutingError(`Routing service answered ${res.status}.`);
  return res.json();
}

const coordList = (points) => points.map((p) => `${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join(';');

function checkPoints(points) {
  if (!Array.isArray(points) || points.length < 2) throw new RoutingError('At least two pinned stops are needed.');
  if (points.length > MAX_STOPS) throw new RoutingError(`At most ${MAX_STOPS} stops per route.`);
  for (const p of points) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) {
      throw new RoutingError('Every stop needs valid map coordinates.');
    }
  }
}

// Perpendicular distance from p to segment a-b, in degrees scaled for
// latitude (good enough for simplification tolerances of a few metres).
function offset(p, a, b) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  const [px, py, ax, ay, bx, by] = [p[1] * k, p[0], a[1] * k, a[0], b[1] * k, b[0]];
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Douglas-Peucker simplification of [[lat, lng], ...]; ~5 m tolerance keeps
// the line on the road while storing far fewer points.
export function simplify(points, tolerance = 0.00005) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let max = 0; let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = offset(points[i], points[first], points[last]);
      if (d > max) { max = d; index = i; }
    }
    if (max > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

// Driving route through the points in order. Returns
// { geometry: [[lat, lng], ...], distanceMeters, durationSeconds, legs }.
export async function routeThrough(points) {
  if (!routingEnabled()) throw new RoutingError('Road routing is turned off (ROUTING_URL is empty).');
  checkPoints(points);
  const url = `${env.routing.url}/route/v1/${env.routing.profile}/${coordList(points)}`
    + '?overview=full&geometries=geojson&steps=false';
  const data = await getJson(url, env.routing.timeoutMs);
  const route = data?.routes?.[0];
  if (data?.code !== 'Ok' || !route) throw new RoutingError(data?.message || 'No road route was found between these stops.');
  return {
    geometry: simplify(route.geometry.coordinates.map(([lng, lat]) => [round5(lat), round5(lng)])),
    distanceMeters: Math.round(route.distance),
    durationSeconds: Math.round(route.duration),
    legs: route.legs.map((l) => ({ distanceMeters: Math.round(l.distance), durationSeconds: Math.round(l.duration) })),
  };
}

// Shortest driving order for the stops, keeping the first and last fixed
// (start of the route and the destination). Returns the new order as
// indexes into `points`.
export async function bestOrder(points) {
  if (!routingEnabled()) throw new RoutingError('Road routing is turned off (ROUTING_URL is empty).');
  checkPoints(points);
  if (points.length < 4) return points.map((_, i) => i);
  const url = `${env.routing.url}/trip/v1/${env.routing.profile}/${coordList(points)}`
    + '?source=first&destination=last&roundtrip=false&overview=false';
  const data = await getJson(url, env.routing.timeoutMs);
  if (data?.code !== 'Ok' || !Array.isArray(data.waypoints)) {
    throw new RoutingError(data?.message || 'Could not work out a better order.');
  }
  // waypoints[i].waypoint_index is input point i's position in the trip.
  return data.waypoints
    .map((w, input) => ({ input, position: w.waypoint_index }))
    .sort((a, b) => a.position - b.position)
    .map((w) => w.input);
}

// ── Place search ──────────────────────────────────────────────────────
const cache = new Map();
const CACHE_MAX = 500;
let lastSearch = 0;

export async function searchPlaces(query) {
  if (!geocodingEnabled()) throw new RoutingError('Place search is turned off (GEOCODING_URL is empty).');
  const q = String(query || '').trim().slice(0, 120);
  if (q.length < 3) return [];
  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  // Nominatim allows one request per second.
  const wait = lastSearch + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSearch = Date.now();

  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '6', addressdetails: '0' });
  if (env.geocoding.countryCodes) params.set('countrycodes', env.geocoding.countryCodes);
  if (env.geocoding.contactEmail) params.set('email', env.geocoding.contactEmail);
  const data = await getJson(`${env.geocoding.url}/search?${params}`, 8000);
  const results = (Array.isArray(data) ? data : []).map((p) => ({
    name: p.name || p.display_name.split(',')[0],
    address: p.display_name,
    lat: round5(Number(p.lat)),
    lng: round5(Number(p.lon)),
  }));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, results);
  return results;
}
