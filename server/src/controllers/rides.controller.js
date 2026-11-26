import prisma, { tenantTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { canAccessPickupPoint } from '../utils/tier.js';
import { stopTimeMap } from '../services/timetable.js';
import {
  DATE_RE, DIRECTIONS, changeDeadline, dateValue, dayOf, effectiveRide, horizonDays, loadRouteRides,
  localDateString, runsOn, seatsLeft,
} from '../services/rides.js';

// Passenger rides. Every passenger has a standard route (Student.routeId).
// For each direction (PICKUP to campus/site, DROPOFF home) they choose a
// stop on that route and one of the admin-scheduled runs; that choice
// stands every day the run operates. Single days can be skipped or changed
// until shortly before the run reaches their stop (BOOKING_CUTOFF_MINUTES).
//
// Students call these for themselves (/api/students/rides); parents call
// them for a child (/api/parents/children/:id/rides).

const httpError = (status, message) => Object.assign(new Error(message), { status });
const dwell = () => ({ dwellSeconds: env.rides.stopDwellSeconds });
// Student columns mirroring the standing stop, read by tracking screens.
const STOP_COLUMN = { PICKUP: 'arrivePickupPointId', DROPOFF: 'departPickupPointId' };

function parseDirection(raw) {
  const direction = String(raw || '').toUpperCase();
  if (!DIRECTIONS.includes(direction)) throw httpError(400, 'Direction must be PICKUP or DROPOFF.');
  return direction;
}

function requireRoute(student) {
  if (!student.routeId) throw httpError(400, 'You need a standard route first. Ask your transport office to assign one.');
}

// Checks a stop + run choice against the passenger's standard route.
function validateChoice(ctx, student, direction, pickupPointId, slotId) {
  const slot = ctx.slotsById.get(Number(slotId));
  if (!slot || !slot.isActive || slot.direction !== direction) throw httpError(400, 'That run is not available on your route.');
  const point = ctx.route.pickupPoints.find((p) => p.id === Number(pickupPointId));
  if (!point) throw httpError(400, 'That stop is not on your route.');
  if (!canAccessPickupPoint(student.paymentTier, point.tier)) {
    throw httpError(403, `Your plan (${student.paymentTier}) does not include the "${point.name}" stop (${point.tier}).`);
  }
  return { slot, point };
}

// Serialises seat claims on a run so two passengers cannot take its last seat.
const lockSlot = (tx, slotId) => tx.$queryRaw`SELECT id FROM "PickupSlot" WHERE id = ${slotId} FOR UPDATE`;

// ── Overview ───────────────────────────────────────────────────────────────

export async function ridesOverview(student) {
  if (!student.routeId) return { route: null, needsRoute: true, directions: {}, days: [] };
  const days = horizonDays();
  const ctx = await loadRouteRides(prisma, student.routeId, days[0], days[days.length - 1]);
  if (!ctx) return { route: null, needsRoute: true, directions: {}, days: [] };

  const now = new Date();
  const myBookings = Object.fromEntries(DIRECTIONS.map((d) => [d, ctx.bookings.find((b) => b.studentId === student.id && b.direction === d) || null]));
  const myExceptions = ctx.exceptions.filter((e) => e.studentId === student.id);
  const stopById = new Map(ctx.route.pickupPoints.map((p) => [p.id, p]));
  const timesBySlot = new Map(ctx.slots.map((s) => [s.id, stopTimeMap(ctx.route, s, dwell())]));

  const describe = (ride, day) => {
    if (!ride.slotId) return { status: ride.source, locked: false };
    const slot = ctx.slotsById.get(ride.slotId);
    return {
      status: ride.source,
      slotId: ride.slotId,
      pickupPointId: ride.pickupPointId,
      slotLabel: slot.label,
      stopName: stopById.get(ride.pickupPointId)?.name || null,
      time: timesBySlot.get(ride.slotId)?.[ride.pickupPointId] || slot.time,
      locked: changeDeadline(ctx.route, slot, ride.pickupPointId, day) <= now,
    };
  };

  const directions = {};
  for (const direction of DIRECTIONS) {
    const booking = myBookings[direction];
    const runs = ctx.slots.filter((s) => s.isActive && s.direction === direction).map((s) => {
      const standing = ctx.bookings.filter((b) => b.slotId === s.id && b.studentId !== student.id).length;
      return {
        id: s.id,
        label: s.label,
        time: s.time,
        daysOfWeek: s.daysOfWeek,
        capacity: s.capacity,
        bus: s.bus,
        stopTimes: timesBySlot.get(s.id),
        seatsLeft: Math.max(0, s.capacity - standing),
        seatsByDay: seatsLeft(s, days, ctx, student.id),
      };
    });
    directions[direction] = {
      booking: booking && {
        slotId: booking.slotId,
        pickupPointId: booking.pickupPointId,
        slotLabel: ctx.slotsById.get(booking.slotId)?.label,
        stopName: stopById.get(booking.pickupPointId)?.name || null,
        time: timesBySlot.get(booking.slotId)?.[booking.pickupPointId] || null,
      },
      runs,
    };
  }

  const dayRows = days.map((day) => {
    const row = { date: day };
    for (const direction of DIRECTIONS) {
      const ex = myExceptions.find((e) => dayOf(e.date) === day && e.direction === direction);
      row[direction] = describe(effectiveRide(myBookings[direction], ex, ctx.slotsById, day), day);
    }
    return row;
  });

  return {
    route: {
      id: ctx.route.id,
      name: ctx.route.name,
      geometry: ctx.route.geometry,
      pickupPoints: ctx.route.pickupPoints.map((p) => ({
        id: p.id, name: p.name, lat: p.lat, lng: p.lng, tier: p.tier, order: p.order,
        allowed: canAccessPickupPoint(student.paymentTier, p.tier),
      })),
    },
    needsRoute: false,
    paymentTier: student.paymentTier,
    cutoffMinutes: env.rides.bookingCutoffMinutes,
    directions,
    days: dayRows,
  };
}

// ── Standing choices ───────────────────────────────────────────────────────

export async function setStandingRide(student, direction, pickupPointId, slotId) {
  requireRoute(student);
  const days = horizonDays();
  return tenantTransaction(async (tx) => {
    await lockSlot(tx, Number(slotId) || 0);
    const ctx = await loadRouteRides(tx, student.routeId, days[0], days[days.length - 1]);
    const { slot, point } = validateChoice(ctx, student, direction, pickupPointId, slotId);

    // A standing seat is needed on every day the run operates.
    const standing = ctx.bookings.filter((b) => b.slotId === slot.id && b.studentId !== student.id).length;
    const fullDay = Object.entries(seatsLeft(slot, days, ctx, student.id)).find(([, left]) => left === 0);
    if (standing >= slot.capacity || fullDay) {
      throw httpError(409, fullDay && standing < slot.capacity
        ? `This run is full on ${fullDay[0]}. Choose another time.`
        : 'This run is full. Choose another time.');
    }

    const booking = await tx.rideBooking.upsert({
      where: { studentId_direction: { studentId: student.id, direction } },
      create: { studentId: student.id, direction, slotId: slot.id, pickupPointId: point.id },
      update: { slotId: slot.id, pickupPointId: point.id },
    });
    await tx.student.update({ where: { id: student.id }, data: { [STOP_COLUMN[direction]]: point.id } });
    return booking;
  });
}

export async function clearStandingRide(student, direction) {
  await tenantTransaction(async (tx) => {
    await tx.rideBooking.deleteMany({ where: { studentId: student.id, direction } });
    await tx.student.update({ where: { id: student.id }, data: { [STOP_COLUMN[direction]]: null } });
  });
}

// ── One-day changes ────────────────────────────────────────────────────────

function parseDay(raw) {
  const day = String(raw || '');
  const days = horizonDays();
  if (!DATE_RE.test(day) || !days.includes(day)) throw httpError(400, `Pick a date in the next ${days.length} days.`);
  return day;
}

// The ride currently in effect must still be changeable.
function assertNotLocked(ctx, student, direction, day) {
  const booking = ctx.bookings.find((b) => b.studentId === student.id && b.direction === direction);
  const ex = ctx.exceptions.find((e) => e.studentId === student.id && e.direction === direction && dayOf(e.date) === day);
  const ride = effectiveRide(booking, ex, ctx.slotsById, day);
  if (ride.slotId && changeDeadline(ctx.route, ctx.slotsById.get(ride.slotId), ride.pickupPointId, day) <= new Date()) {
    throw httpError(409, `Too late to change this ride: changes close ${env.rides.bookingCutoffMinutes} minutes before pickup.`);
  }
  return { booking, ex };
}

// body: { skip: true } or { pickupPointId, slotId }
export async function setDayRide(student, direction, rawDay, body) {
  requireRoute(student);
  const day = parseDay(rawDay);
  const slotId = Number(body.slotId) || 0;
  return tenantTransaction(async (tx) => {
    if (!body.skip) await lockSlot(tx, slotId);
    const ctx = await loadRouteRides(tx, student.routeId, day, day);
    const { booking } = assertNotLocked(ctx, student, direction, day);
    const key = { studentId_date_direction: { studentId: student.id, date: dateValue(day), direction } };

    if (body.skip) {
      return tx.rideException.upsert({
        where: key,
        create: { studentId: student.id, date: dateValue(day), direction, type: 'SKIP' },
        update: { type: 'SKIP', slotId: null, pickupPointId: null },
      });
    }

    const { slot, point } = validateChoice(ctx, student, direction, body.pickupPointId, slotId);
    if (!runsOn(slot, day)) throw httpError(400, 'That run does not operate on this day.');
    if (changeDeadline(ctx.route, slot, point.id, day) <= new Date()) throw httpError(409, 'That run has already left or is about to.');
    if (seatsLeft(slot, [day], ctx, student.id)[day] <= 0) throw httpError(409, 'That run is full on this day. Choose another time.');

    // Choosing exactly the usual ride is the same as having no change.
    if (booking && booking.slotId === slot.id && booking.pickupPointId === point.id) {
      await tx.rideException.deleteMany({ where: { studentId: student.id, date: dateValue(day), direction } });
      return null;
    }
    return tx.rideException.upsert({
      where: key,
      create: { studentId: student.id, date: dateValue(day), direction, type: 'CHANGE', slotId: slot.id, pickupPointId: point.id },
      update: { type: 'CHANGE', slotId: slot.id, pickupPointId: point.id },
    });
  });
}

export async function clearDayRide(student, direction, rawDay) {
  const day = parseDay(rawDay);
  requireRoute(student);
  await tenantTransaction(async (tx) => {
    const ctx = await loadRouteRides(tx, student.routeId, day, day);
    // Going back to the usual ride needs a seat on it that day.
    const booking = ctx.bookings.find((b) => b.studentId === student.id && b.direction === direction);
    assertNotLocked(ctx, student, direction, day);
    if (booking) {
      const slot = ctx.slotsById.get(booking.slotId);
      if (slot && runsOn(slot, day) && seatsLeft(slot, [day], ctx, student.id)[day] <= 0) {
        throw httpError(409, 'Your usual run is full on this day.');
      }
    }
    await tx.rideException.deleteMany({ where: { studentId: student.id, date: dateValue(day), direction } });
  });
}

// ── HTTP handlers ──────────────────────────────────────────────────────────

const studentFor = (req) => prisma.student.findFirst({ where: { userId: req.user.id } });

// Parents act for a child linked to them.
async function childFor(req) {
  const link = await prisma.passengerGuardian.findFirst({
    where: { userId: req.user.id, studentId: Number(req.params.id) || 0 },
    include: { student: true },
  });
  return link?.student || null;
}

function handlers(resolve) {
  const withStudent = (fn) => asyncHandler(async (req, res) => {
    const student = await resolve(req);
    if (!student) return res.status(404).json({ error: 'Passenger not found.' });
    return fn(req, res, student);
  });
  return {
    get: withStudent(async (req, res, student) => res.json(await ridesOverview(student))),
    setStanding: withStudent(async (req, res, student) => {
      const direction = parseDirection(req.params.direction);
      await setStandingRide(student, direction, req.body.pickupPointId, req.body.slotId);
      res.json({ message: 'Saved.', ...(await ridesOverview(await prisma.student.findUnique({ where: { id: student.id } }))) });
    }),
    clearStanding: withStudent(async (req, res, student) => {
      await clearStandingRide(student, parseDirection(req.params.direction));
      res.json({ message: 'Removed.', ...(await ridesOverview(await prisma.student.findUnique({ where: { id: student.id } }))) });
    }),
    setDay: withStudent(async (req, res, student) => {
      await setDayRide(student, parseDirection(req.params.direction), req.params.date, req.body || {});
      res.json({ message: 'Saved.', ...(await ridesOverview(student)) });
    }),
    clearDay: withStudent(async (req, res, student) => {
      await clearDayRide(student, parseDirection(req.params.direction), req.params.date);
      res.json({ message: 'Back to your usual ride.', ...(await ridesOverview(student)) });
    }),
  };
}

export const studentRides = handlers(studentFor);
export const childRides = handlers(childFor);

// Today's date as the server sees it, for clients that need to align.
export const today = () => localDateString();
