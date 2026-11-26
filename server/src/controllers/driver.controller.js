import prisma, { tenantTransaction } from '../config/db.js';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { presentPassenger, passengerName } from '../services/passenger.service.js';
import { stopTimes } from '../services/timetable.js';
import { localDateString, loadRouteRides, ridersOn, runsOn } from '../services/rides.js';
import {
  daysUntil, expiryStatus, idParam, optEnum, optInt, optString, scheduleStatus,
} from '../services/fleet.js';
import { alertStaff } from '../socket/emitter.js';

// Endpoints for the signed-in driver: their route, today's runs and
// passengers, their vehicle and documents, and defect / odometer reports.

const myDriver = (req) => prisma.driver.findFirst({ where: { userId: req.user.id } });
const dwell = () => ({ dwellSeconds: env.rides.stopDwellSeconds });

export const getMyRoute = asyncHandler(async (req, res) => {
  const driver = await myDriver(req);
  if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });

  const bus = await prisma.bus.findFirst({
    where: { driverId: driver.id },
    include: {
      route: {
        include: {
          pickupPoints: { orderBy: { order: 'asc' } },
          students: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });

  if (!bus) return res.status(404).json({ error: 'No bus assigned to you yet.' });

  res.json({
    bus: {
      id: bus.id,
      licensePlate: bus.licensePlate,
      capacity: bus.capacity,
      make: bus.make,
      model: bus.model,
      status: bus.status,
      route: bus.route && { ...bus.route, students: bus.route.students.map(presentPassenger) },
      passengerCount: bus.route?.students?.length || 0,
    },
  });
});

// GET /drivers/runs/today — runs of the driver's vehicle (or, if none is
// tied to a vehicle, of its route) operating today, each with its stop
// times and how many passengers board at each stop.
export const getTodayRuns = asyncHandler(async (req, res) => {
  const driver = await myDriver(req);
  const bus = driver && await prisma.bus.findFirst({ where: { driverId: driver.id } });
  if (!bus) return res.status(404).json({ error: 'No vehicle assigned to you yet.' });
  if (!bus.routeId) return res.json({ date: localDateString(), route: null, runs: [] });

  const day = localDateString();
  const ctx = await loadRouteRides(prisma, bus.routeId, day, day);
  const mine = ctx.slots.filter((s) => runsOn(s, day) && (s.busId === bus.id || s.busId == null));
  res.json({
    date: day,
    route: {
      id: ctx.route.id,
      name: ctx.route.name,
      geometry: ctx.route.geometry,
      pickupPoints: ctx.route.pickupPoints,
    },
    runs: mine.map((slot) => {
      const riders = ridersOn(slot, day, ctx.bookings, ctx.exceptions);
      return {
        id: slot.id,
        label: slot.label,
        direction: slot.direction,
        time: slot.time,
        passengers: riders.length,
        stops: stopTimes(ctx.route, slot, dwell()).map((s) => ({
          ...s,
          riders: riders.filter((r) => r.pickupPointId === s.pickupPointId).length,
        })),
      };
    }),
  });
});

// GET /drivers/roster?slotId= — passengers to pick up. With a run, the
// passengers booked on it today (grouped by stop); without one, everyone
// on the vehicle's route.
export const getRoster = asyncHandler(async (req, res) => {
  const driver = await myDriver(req);
  const bus = driver && await prisma.bus.findFirst({ where: { driverId: driver.id } });
  if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });

  const day = localDateString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slotId = idParam(req.query.slotId);

  let riders = null;
  let stopOrder = new Map();
  if (slotId && bus.routeId) {
    const ctx = await loadRouteRides(prisma, bus.routeId, day, day);
    const slot = ctx.slotsById.get(slotId);
    if (!slot) return res.status(404).json({ error: 'Run not found.' });
    riders = ridersOn(slot, day, ctx.bookings, ctx.exceptions);
    stopOrder = new Map(stopTimes(ctx.route, slot, dwell()).map((s, i) => [s.pickupPointId, { i, time: s.time }]));
  }

  const students = await prisma.student.findMany({
    where: riders ? { id: { in: riders.map((r) => r.studentId) } } : { routeId: bus.routeId ?? -1 },
    include: { user: { select: { firstName: true, lastName: true } }, arrivePickupPoint: true, departPickupPoint: true },
    orderBy: { id: 'asc' },
  });
  const points = new Map((await prisma.pickupPoint.findMany({ where: { routeId: bus.routeId ?? -1 } })).map((p) => [p.id, p]));
  const entries = await prisma.tripRoster.findMany({
    where: { busId: bus.id, tripDate: { gte: today }, ...(slotId ? { slotId } : {}) },
  });

  const roster = students.map((s) => {
    const entry = entries.find((e) => e.studentId === s.id);
    const pickupPointId = riders ? riders.find((r) => r.studentId === s.id)?.pickupPointId : s.arrivePickupPointId;
    return {
      id: s.id,
      name: passengerName(s),
      pickupPointId: pickupPointId ?? null,
      pickup: points.get(pickupPointId)?.name || s.arrivePickupPoint?.name || '—',
      stopTime: stopOrder.get(pickupPointId)?.time || null,
      status: entry?.status || 'PENDING',
    };
  }).sort((a, b) => (stopOrder.get(a.pickupPointId)?.i ?? 999) - (stopOrder.get(b.pickupPointId)?.i ?? 999)
    || a.name.localeCompare(b.name));

  const boarded = roster.filter((r) => r.status === 'BOARDED').length;
  const noShow = roster.filter((r) => r.status === 'NO_SHOW').length;
  res.json({ roster, total: roster.length, boarded, noShow, remaining: roster.length - boarded - noShow });
});

// POST /drivers/roster/status { studentId, status, slotId? }
export const setRosterStatus = asyncHandler(async (req, res) => {
  const { studentId, status } = req.body;
  if (!['BOARDED', 'NO_SHOW', 'PENDING'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const driver = await myDriver(req);
  const bus = driver && await prisma.bus.findFirst({ where: { driverId: driver.id } });
  if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });

  const slotId = idParam(req.body.slotId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const where = { busId: bus.id, studentId: Number(studentId), tripDate: { gte: today }, ...(slotId ? { slotId } : {}) };
  const existing = await prisma.tripRoster.findFirst({ where });
  if (existing) await prisma.tripRoster.update({ where: { id: existing.id }, data: { status } });
  else await prisma.tripRoster.create({ data: { busId: bus.id, studentId: Number(studentId), slotId, status } });
  res.json({ message: 'Roster updated.', studentId: Number(studentId), status });
});

// GET /drivers/me — profile, licence, documents and assignment history.
export const getMe = asyncHandler(async (req, res) => {
  const driver = await prisma.driver.findFirst({
    where: { userId: req.user.id },
    include: {
      user: { select: { firstName: true, lastName: true, email: true, picture: true } },
      documents: { orderBy: { expiresAt: 'asc' } },
      assignments: {
        include: { bus: { select: { id: true, licensePlate: true, make: true, model: true } } },
        orderBy: { startedAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });
  const now = new Date();
  res.json({
    driver: {
      ...driver,
      licenseStatus: expiryStatus(driver.licenseExpiry, now),
      licenseDaysLeft: daysUntil(driver.licenseExpiry, now),
      documents: driver.documents.map(({ storageKey, ...d }) => ({ ...d, hasFile: Boolean(storageKey), expiry: expiryStatus(d.expiresAt, now) })),
    },
  });
});

// GET /drivers/my-vehicle — the vehicle, next services, open defects and
// its documents' expiry.
export const getMyVehicle = asyncHandler(async (req, res) => {
  const driver = await myDriver(req);
  const bus = driver && await prisma.bus.findFirst({
    where: { driverId: driver.id },
    include: {
      route: { select: { id: true, name: true } },
      maintenanceSchedules: { where: { active: true } },
      defects: { where: { status: { not: 'RESOLVED' } }, orderBy: { createdAt: 'desc' } },
      documents: { orderBy: { expiresAt: 'asc' } },
    },
  });
  if (!bus) return res.status(404).json({ error: 'No vehicle assigned to you yet.' });
  const now = new Date();
  const { maintenanceSchedules, documents, ...rest } = bus;
  res.json({
    vehicle: {
      ...rest,
      services: maintenanceSchedules.map((s) => ({ id: s.id, name: s.name, due: scheduleStatus(s, bus.odometerKm, now) }))
        .sort((a, b) => (a.due.daysLeft ?? Infinity) - (b.due.daysLeft ?? Infinity)),
      documents: documents.map(({ storageKey, ...d }) => ({ ...d, hasFile: Boolean(storageKey), expiry: expiryStatus(d.expiresAt, now) })),
    },
  });
});

// POST /drivers/defects { description, severity } — reports a problem with
// the driver's vehicle. Critical defects alert staff straight away.
export const reportDefect = asyncHandler(async (req, res) => {
  const driver = await myDriver(req);
  const bus = driver && await prisma.bus.findFirst({ where: { driverId: driver.id } });
  if (!bus) return res.status(404).json({ error: 'No vehicle assigned to you yet.' });
  const description = optString(req.body.description, { max: 2000 });
  if (!description) return res.status(400).json({ error: 'Describe the problem.' });
  const severity = optEnum(req.body.severity, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], 'Severity') || 'MEDIUM';

  const defect = await prisma.defectReport.create({
    data: { busId: bus.id, driverId: driver.id, description, severity, reportedById: req.user.id },
  });
  alertStaff(req.user.organizationId, {
    type: 'DEFECT',
    severity,
    busId: bus.id,
    defectId: defect.id,
    message: `${bus.licensePlate}: ${description.slice(0, 140)}`,
  });
  res.status(201).json({ defect });
});

// POST /drivers/odometer { odometerKm }
export const reportOdometer = asyncHandler(async (req, res) => {
  const odometerKm = optInt(req.body.odometerKm, 'Odometer');
  if (odometerKm == null) return res.status(400).json({ error: 'Enter the odometer reading.' });
  const driver = await myDriver(req);
  const result = await tenantTransaction(async (tx) => {
    const bus = driver && await tx.bus.findFirst({ where: { driverId: driver.id } });
    if (!bus) throw Object.assign(new Error('No vehicle assigned to you yet.'), { status: 404 });
    if (bus.odometerKm != null && odometerKm < bus.odometerKm) {
      throw Object.assign(new Error(`That is lower than the last reading (${bus.odometerKm} km).`), { status: 400 });
    }
    return tx.bus.update({ where: { id: bus.id }, data: { odometerKm }, select: { id: true, odometerKm: true } });
  });
  res.json({ vehicle: result });
});
