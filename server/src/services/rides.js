import { env } from '../config/env.js';
import { stopTimeMap, toMinutes } from './timetable.js';

// Passenger rides: standing bookings (RideBooking, one per direction) plus
// one-day changes (RideException). Dates are calendar days in the server's
// time zone, written "YYYY-MM-DD"; RideException.date stores them as DATE.

export const DIRECTIONS = ['PICKUP', 'DROPOFF'];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Dates ──────────────────────────────────────────────────────────────────

export function localDateString(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The DATE column value for a "YYYY-MM-DD" day (UTC midnight, as Prisma
// reads and writes @db.Date).
export const dateValue = (day) => new Date(`${day}T00:00:00.000Z`);
export const dayOf = (date) => (date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10));

// ISO weekday: 1 = Monday ... 7 = Sunday.
export function isoWeekday(day) {
  const w = dateValue(day).getUTCDay();
  return w === 0 ? 7 : w;
}

export function addDays(day, n) {
  const d = dateValue(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayOf(d);
}

export function dayRange(start, count) {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

// The local moment a run reaches a stop on a given day.
export function stopMoment(day, hhmm) {
  const [y, m, d] = day.split('-').map(Number);
  const minutes = toMinutes(hhmm) ?? 0;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
}

export const runsOn = (slot, day) => slot.isActive && (slot.daysOfWeek || []).includes(isoWeekday(day));

// ── Effective rides ────────────────────────────────────────────────────────

// What a passenger actually rides on `day` in one direction, given their
// standing booking and that day's exception (either may be missing):
// { slotId, pickupPointId, source: 'USUAL' | 'CHANGED' } or a SKIPPED/NONE
// marker with slotId null.
export function effectiveRide(booking, exception, slotsById, day) {
  if (exception?.type === 'SKIP') return { source: 'SKIPPED', slotId: null, pickupPointId: null };
  if (exception?.type === 'CHANGE') {
    const slot = slotsById.get(exception.slotId);
    if (slot && runsOn(slot, day)) return { source: 'CHANGED', slotId: exception.slotId, pickupPointId: exception.pickupPointId };
  }
  if (booking) {
    const slot = slotsById.get(booking.slotId);
    if (slot && runsOn(slot, day)) return { source: 'USUAL', slotId: booking.slotId, pickupPointId: booking.pickupPointId };
  }
  return { source: 'NONE', slotId: null, pickupPointId: null };
}

// Everyone riding `slot` on `day`: [{ studentId, pickupPointId, source }].
// `bookings` and `exceptions` may be supersets (other slots, other days).
export function ridersOn(slot, day, bookings, exceptions) {
  if (!runsOn(slot, day)) return [];
  const dayExceptions = new Map(
    exceptions.filter((e) => dayOf(e.date) === day && e.direction === slot.direction).map((e) => [e.studentId, e]),
  );
  const riders = new Map();
  for (const b of bookings) {
    if (b.slotId !== slot.id || b.direction !== slot.direction) continue;
    const ex = dayExceptions.get(b.studentId);
    if (ex && (ex.type === 'SKIP' || ex.slotId !== slot.id)) continue;
    riders.set(b.studentId, { studentId: b.studentId, pickupPointId: ex?.pickupPointId ?? b.pickupPointId, source: ex ? 'CHANGED' : 'USUAL' });
  }
  for (const ex of dayExceptions.values()) {
    if (ex.type === 'CHANGE' && ex.slotId === slot.id) {
      riders.set(ex.studentId, { studentId: ex.studentId, pickupPointId: ex.pickupPointId, source: 'CHANGED' });
    }
  }
  return [...riders.values()];
}

// The latest moment a passenger may still change the ride that reaches
// `pickupPointId` on `slot` on `day`.
export function changeDeadline(route, slot, pickupPointId, day) {
  const time = stopTimeMap(route, slot, { dwellSeconds: env.rides.stopDwellSeconds })[pickupPointId] ?? slot.time;
  return new Date(stopMoment(day, time).getTime() - env.rides.bookingCutoffMinutes * 60000);
}

// ── Loading ────────────────────────────────────────────────────────────────

// Everything needed to work out rides on a route between two days: the
// route with its stops, its runs, every standing booking on those runs and
// the exceptions touching them.
export async function loadRouteRides(db, routeId, fromDay, toDay) {
  const route = await db.route.findUnique({
    where: { id: routeId },
    include: { pickupPoints: { orderBy: { order: 'asc' } } },
  });
  if (!route) return null;
  const slots = await db.pickupSlot.findMany({
    where: { routeId },
    include: { bus: { select: { id: true, licensePlate: true } } },
    orderBy: [{ direction: 'asc' }, { time: 'asc' }],
  });
  const slotIds = slots.map((s) => s.id);
  const bookings = await db.rideBooking.findMany({ where: { slotId: { in: slotIds } } });
  const studentIds = [...new Set(bookings.map((b) => b.studentId))];
  const exceptions = await db.rideException.findMany({
    where: {
      date: { gte: dateValue(fromDay), lte: dateValue(toDay) },
      OR: [{ slotId: { in: slotIds } }, { studentId: { in: studentIds } }],
    },
  });
  return { route, slots, slotsById: new Map(slots.map((s) => [s.id, s])), bookings, exceptions };
}

// Seats left on `slot` on each of `days`, given a loaded context. Pass
// `ignoreStudentId` to leave a passenger's own seat out of the count (when
// they are switching).
export function seatsLeft(slot, days, ctx, ignoreStudentId = null) {
  return Object.fromEntries(days.map((day) => {
    const riders = ridersOn(slot, day, ctx.bookings, ctx.exceptions).filter((r) => r.studentId !== ignoreStudentId);
    return [day, runsOn(slot, day) ? Math.max(0, slot.capacity - riders.length) : null];
  }));
}

export const horizonDays = () => dayRange(localDateString(), env.rides.horizonDays);
