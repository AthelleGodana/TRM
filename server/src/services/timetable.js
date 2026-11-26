// Stop times for a run (PickupSlot) of a route. Pure functions: no database.
//
// A PICKUP run starts at the route's first stop at `run.time` and visits
// the stops in order (the last stop is normally the campus or site). A
// DROPOFF run starts at the last stop at `run.time` and visits them in
// reverse. Travel time between stops comes from the road route stored on
// the route (Route.legs, from OSRM); stops without a road leg use a
// straight-line estimate. Each stop adds a dwell time. Admins can pin any
// stop's time by hand with run.stopTimeOverrides = { "<pickupPointId>": "HH:MM" }.

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FALLBACK_SPEED_KMH = 25;

export function toMinutes(hhmm) {
  if (!TIME_RE.test(hhmm || '')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total) {
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const isPinned = (s) => s.lat != null && s.lng != null;

// Seconds to drive between each pair of consecutive stops (in route order).
// Route.legs holds one leg per pair of consecutive *pinned* stops. A stop
// without coordinates gets no travel time of its own (it is assumed to be
// next to the previous stop).
export function legSeconds(stops, legs) {
  const pinned = stops.filter(isPinned);
  const legByPinnedIndex = Array.isArray(legs) && legs.length === pinned.length - 1 ? legs : null;
  const out = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (!isPinned(a) || !isPinned(b)) { out.push(0); continue; }
    const k = pinned.indexOf(a);
    const leg = legByPinnedIndex?.[k];
    if (leg && Number.isFinite(leg.durationSeconds)) out.push(leg.durationSeconds);
    else out.push((haversineMeters(a, b) / 1000 / FALLBACK_SPEED_KMH) * 3600);
  }
  return out;
}

// [{ pickupPointId, name, lat, lng, tier, order, time: "HH:MM", minutes, overridden }]
// in the order the run visits them.
export function stopTimes(route, run, { dwellSeconds = 60 } = {}) {
  const stops = [...(route.pickupPoints || [])].sort((a, b) => a.order - b.order || a.id - b.id);
  if (!stops.length) return [];
  const legs = legSeconds(stops, route.legs);

  const reverse = run.direction === 'DROPOFF';
  const visit = reverse ? [...stops].reverse() : stops;
  const travel = reverse ? [...legs].reverse() : legs;
  const overrides = run.stopTimeOverrides && typeof run.stopTimeOverrides === 'object' ? run.stopTimeOverrides : {};

  const start = toMinutes(run.time) ?? 0;
  let elapsed = 0;
  return visit.map((stop, i) => {
    if (i > 0) elapsed += travel[i - 1] + dwellSeconds;
    const computed = start + elapsed / 60;
    const override = toMinutes(overrides[stop.id] ?? overrides[String(stop.id)]);
    const minutes = override ?? computed;
    return {
      pickupPointId: stop.id,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      tier: stop.tier,
      order: stop.order,
      minutes: Math.round(minutes),
      time: fromMinutes(minutes),
      overridden: override != null,
    };
  });
}

// { [pickupPointId]: "HH:MM" } for quick lookups.
export function stopTimeMap(route, run, opts) {
  return Object.fromEntries(stopTimes(route, run, opts).map((s) => [s.pickupPointId, s.time]));
}

// Validates a stopTimeOverrides object from a request: keys must be stop ids
// on the route and values HH:MM. Returns the cleaned object or throws.
export function cleanOverrides(raw, stopIds) {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error('stopTimeOverrides must be an object.'), { status: 400 });
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value == null || value === '') continue;
    if (!stopIds.includes(Number(key))) throw Object.assign(new Error('A stop time refers to a stop that is not on this route.'), { status: 400 });
    if (!TIME_RE.test(value)) throw Object.assign(new Error('Stop times must look like 07:30.'), { status: 400 });
    out[Number(key)] = value;
  }
  return Object.keys(out).length ? out : null;
}
