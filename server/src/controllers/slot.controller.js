import prisma, { tenantTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { cleanOverrides, stopTimes, TIME_RE } from '../services/timetable.js';
import {
  DATE_RE, DIRECTIONS, localDateString, loadRouteRides, ridersOn, runsOn,
} from '../services/rides.js';
import { passengerName } from '../services/passenger.service.js';
import { clearStandingRide, setStandingRide } from './rides.controller.js';

// Runs (stored as PickupSlot): the scheduled trips of a route. Admins set a
// direction, a start time, the weekdays and a capacity; stop times are
// worked out from the road route and can be adjusted per stop.

const dwell = () => ({ dwellSeconds: env.rides.stopDwellSeconds });
const httpError = (status, message) => Object.assign(new Error(message), { status });

function cleanDays(raw) {
  if (raw === undefined) return undefined;
  const days = [...new Set((Array.isArray(raw) ? raw : []).map(Number))].filter((d) => d >= 1 && d <= 7).sort();
  if (!days.length) throw httpError(400, 'Choose at least one day for the run.');
  return days;
}

// Fields shared by create and update; `route` is the run's route with stops.
function runData(body, route) {
  const data = {};
  if (body.time !== undefined) {
    if (!TIME_RE.test(body.time)) throw httpError(400, 'Start time must look like 06:30.');
    data.time = body.time;
  }
  if (body.direction !== undefined) {
    if (!DIRECTIONS.includes(body.direction)) throw httpError(400, 'Direction must be PICKUP or DROPOFF.');
    data.direction = body.direction;
  }
  if (body.label !== undefined) data.label = String(body.label || '').trim().slice(0, 60) || null;
  if (body.capacity !== undefined) {
    const n = Number(body.capacity);
    if (!Number.isInteger(n) || n < 1) throw httpError(400, 'Capacity must be at least 1.');
    data.capacity = n;
  }
  if (body.busId !== undefined) data.busId = body.busId ? Number(body.busId) : null;
  const days = cleanDays(body.daysOfWeek);
  if (days) data.daysOfWeek = days;
  if (body.stopTimeOverrides !== undefined) {
    data.stopTimeOverrides = cleanOverrides(body.stopTimeOverrides, route.pickupPoints.map((p) => p.id));
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  return data;
}

const defaultLabel = (direction, time) => `${direction === 'DROPOFF' ? 'Drop-off' : 'Pickup'} ${time}`;

async function routeWithStops(id) {
  return prisma.route.findUnique({ where: { id: Number(id) || 0 }, include: { pickupPoints: { orderBy: { order: 'asc' } } } });
}

// The shape admins see: the run plus its computed timetable and, for the
// given day, how many passengers board at each stop.
function presentRun(slot, ctx, day) {
  const riders = ridersOn(slot, day, ctx.bookings, ctx.exceptions);
  const standing = ctx.bookings.filter((b) => b.slotId === slot.id).length;
  return {
    ...slot,
    runsToday: runsOn(slot, day),
    standingBookings: standing,
    ridersOnDay: riders.length,
    stops: stopTimes(ctx.route, slot, dwell()).map((s) => ({
      ...s,
      riders: riders.filter((r) => r.pickupPointId === s.pickupPointId).length,
    })),
  };
}

// ── Admin ──────────────────────────────────────────────────────────────────

// POST /admin/slots { routeId, direction, time, daysOfWeek, capacity, busId, label, stopTimeOverrides }
export const createSlot = asyncHandler(async (req, res) => {
  const route = await routeWithStops(req.body.routeId);
  if (!route) return res.status(404).json({ error: 'Route not found.' });
  if (!req.body.time) return res.status(400).json({ error: 'routeId and time are required.' });
  const data = runData({ direction: 'PICKUP', ...req.body }, route);
  const slot = await prisma.pickupSlot.create({
    data: {
      capacity: 30,
      ...data,
      routeId: route.id,
      label: data.label || defaultLabel(data.direction, data.time),
    },
  });
  res.status(201).json({ slot });
});

// PUT /admin/slots/:id
export const updateSlot = asyncHandler(async (req, res) => {
  const existing = await prisma.pickupSlot.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!existing) return res.status(404).json({ error: 'Run not found.' });
  const route = await routeWithStops(existing.routeId);
  const data = runData(req.body, route);
  if (data.direction && data.direction !== existing.direction) {
    const booked = await prisma.rideBooking.count({ where: { slotId: existing.id } });
    if (booked) return res.status(409).json({ error: 'Passengers are booked on this run, so its direction cannot change.' });
  }
  if (data.label === null) data.label = defaultLabel(data.direction || existing.direction, data.time || existing.time);
  res.json({ slot: await prisma.pickupSlot.update({ where: { id: existing.id }, data }) });
});

// DELETE /admin/slots/:id — stops the run. Passengers booked on it lose that
// booking and choose another run.
export const deleteSlot = asyncHandler(async (req, res) => {
  const existing = await prisma.pickupSlot.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!existing) return res.status(404).json({ error: 'Run not found.' });
  const affected = await tenantTransaction(async (tx) => {
    const { count } = await tx.rideBooking.deleteMany({ where: { slotId: existing.id } });
    await tx.rideException.deleteMany({ where: { slotId: existing.id } });
    await tx.pickupSlot.update({ where: { id: existing.id }, data: { isActive: false } });
    return count;
  });
  res.json({ message: affected ? `Run stopped. ${affected} passenger booking(s) were removed.` : 'Run stopped.' });
});

// GET /admin/slots?routeId= — all runs (optionally for one route) with
// their timetable and today's passengers per stop.
export const listSlotsAdmin = asyncHandler(async (req, res) => {
  const day = DATE_RE.test(req.query.date || '') ? req.query.date : localDateString();
  const routeIds = req.query.routeId
    ? [Number(req.query.routeId)]
    : (await prisma.pickupSlot.findMany({ distinct: ['routeId'], select: { routeId: true } })).map((s) => s.routeId);

  const slots = [];
  for (const routeId of routeIds) {
    const ctx = await loadRouteRides(prisma, routeId, day, day);
    if (!ctx) continue;
    for (const slot of ctx.slots) {
      slots.push({ ...presentRun(slot, ctx, day), route: { id: ctx.route.id, name: ctx.route.name } });
    }
  }
  res.json({ slots, date: day });
});

// GET /admin/slots/:id/timetable?date= — stop times with the passengers
// boarding at each stop on that day.
export const getSlotTimetable = asyncHandler(async (req, res) => {
  const existing = await prisma.pickupSlot.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!existing) return res.status(404).json({ error: 'Run not found.' });
  const day = DATE_RE.test(req.query.date || '') ? req.query.date : localDateString();
  const ctx = await loadRouteRides(prisma, existing.routeId, day, day);
  const slot = ctx.slotsById.get(existing.id);
  const riders = ridersOn(slot, day, ctx.bookings, ctx.exceptions);
  const students = await prisma.student.findMany({
    where: { id: { in: riders.map((r) => r.studentId) } },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const nameOf = new Map(students.map((s) => [s.id, passengerName(s)]));
  const run = presentRun(slot, ctx, day);
  res.json({
    date: day,
    run: {
      ...run,
      stops: run.stops.map((s) => ({
        ...s,
        passengers: riders.filter((r) => r.pickupPointId === s.pickupPointId)
          .map((r) => ({ id: r.studentId, name: nameOf.get(r.studentId) || '', source: r.source })),
      })),
    },
  });
});

// ── Students (older endpoints, kept for existing clients) ──────────────────
// These map onto the standing PICKUP ride; new screens use /students/rides.

export const listSlotsForStudent = asyncHandler(async (req, res) => {
  const student = await prisma.student.findFirst({ where: { userId: req.user.id } });
  if (!student || !student.routeId) {
    return res.status(404).json({ error: 'Register for a route first to book a pickup slot.' });
  }
  const day = localDateString();
  const ctx = await loadRouteRides(prisma, student.routeId, day, day);
  const mine = ctx.bookings.find((b) => b.studentId === student.id && b.direction === 'PICKUP');
  const pickups = ctx.slots.filter((s) => s.isActive && s.direction === 'PICKUP');
  res.json({
    slots: pickups.map((s) => {
      const booked = ctx.bookings.filter((b) => b.slotId === s.id).length;
      return {
        id: s.id,
        time: s.time,
        label: s.label,
        capacity: s.capacity,
        bookedCount: booked,
        available: Math.max(0, s.capacity - booked),
        busLicensePlate: s.bus?.licensePlate || null,
      };
    }),
    mySlotId: mine?.slotId || null,
  });
});

export const bookSlot = asyncHandler(async (req, res) => {
  const student = await prisma.student.findFirst({ where: { userId: req.user.id } });
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });
  const slot = await prisma.pickupSlot.findUnique({ where: { id: Number(req.body.slotId) || 0 } });
  if (!slot || !slot.isActive) return res.status(404).json({ error: 'Slot not found.' });
  if (slot.routeId !== student.routeId) return res.status(400).json({ error: 'This slot is not on your route.' });
  const stopId = student.arrivePickupPointId
    ?? (await prisma.pickupPoint.findFirst({ where: { routeId: slot.routeId }, orderBy: { order: 'asc' } }))?.id;
  await setStandingRide(student, slot.direction, stopId, slot.id);
  res.status(201).json({ slotId: slot.id, message: 'Slot booked successfully.' });
});

export const cancelSlot = asyncHandler(async (req, res) => {
  const student = await prisma.student.findFirst({ where: { userId: req.user.id } });
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });
  const existing = await prisma.rideBooking.findFirst({ where: { studentId: student.id, direction: 'PICKUP' } });
  if (!existing) return res.status(400).json({ error: 'No active booking to cancel.' });
  await clearStandingRide(student, 'PICKUP');
  res.json({ message: 'Slot booking cancelled.' });
});
