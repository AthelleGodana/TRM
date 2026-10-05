import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Helpers ────────────────────────────────────────────────────────────
async function getBusForDriver(userId) {
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (!driver) return null;
  return prisma.bus.findFirst({ where: { driverId: driver.id } });
}

// ── Bus status toggle (drivers + admins) ──────────────────────────────
export const setBusStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['OPERATIONAL', 'IN_SERVICE', 'OUT_OF_FUEL'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  let bus;
  if (req.user.role === 'admin') {
    const { busId } = req.body;
    bus = await prisma.bus.findUnique({ where: { id: Number(busId) } });
    if (!bus) return res.status(404).json({ error: 'Bus not found.' });
    bus = await prisma.bus.update({ where: { id: bus.id }, data: { status } });
  } else {
    bus = await getBusForDriver(req.user.id);
    if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });
    bus = await prisma.bus.update({ where: { id: bus.id }, data: { status } });
  }

  res.json({ bus });
});

// ── Add a fuel or maintenance log entry ───────────────────────────────
export const addVehicleLog = asyncHandler(async (req, res) => {
  const { type, fuelLiters, fuelCost, odometer, notes } = req.body;
  if (!['FUEL', 'MAINTENANCE', 'SAFETY_CHECK'].includes(type)) {
    return res.status(400).json({ error: 'Invalid log type.' });
  }

  let busId;
  if (req.user.role === 'admin') {
    busId = Number(req.body.busId);
  } else {
    const bus = await getBusForDriver(req.user.id);
    if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });
    busId = bus.id;
  }

  const log = await prisma.vehicleLog.create({
    data: {
      busId,
      type,
      fuelLiters: fuelLiters ? Number(fuelLiters) : null,
      fuelCost: fuelCost ? Number(fuelCost) : null,
      odometer: odometer ? Number(odometer) : null,
      notes,
    },
  });
  res.status(201).json({ log });
});

// ── List vehicle logs for a bus (drivers: own bus; admins: any) ───────
export const listVehicleLogs = asyncHandler(async (req, res) => {
  let busId;
  if (req.user.role === 'admin') {
    busId = Number(req.params.busId || req.query.busId);
  } else {
    const bus = await getBusForDriver(req.user.id);
    if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });
    busId = bus.id;
  }

  const logs = await prisma.vehicleLog.findMany({
    where: { busId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ logs });
});

// ── Pre-trip safety checklist ─────────────────────────────────────────
const SAFETY_ITEMS = [
  'Tires & pressure',
  'Brakes',
  'Lights & indicators',
  'Fuel level',
  'Engine oil',
  'Seat belts',
  'First-aid kit',
  'Fire extinguisher',
  'Mirrors',
  'Horn',
];

export const getSafetyChecklist = asyncHandler(async (req, res) => {
  let busId;
  if (req.user.role === 'admin') {
    busId = Number(req.params.busId || req.query.busId);
  } else {
    const bus = await getBusForDriver(req.user.id);
    if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });
    busId = bus.id;
  }

  const logs = await prisma.vehicleLog.findMany({
    where: { busId, type: 'SAFETY_CHECK' },
    orderBy: { createdAt: 'desc' },
  });

  const state = SAFETY_ITEMS.map((item) => {
    const latest = logs.find((l) => l.notes === item);
    return { item, passed: latest ? latest.passed : null };
  });

  res.json({ items: state });
});

export const toggleSafetyCheck = asyncHandler(async (req, res) => {
  const { item, passed } = req.body;
  if (!SAFETY_ITEMS.includes(item)) return res.status(400).json({ error: 'Unknown checklist item.' });

  let busId;
  if (req.user.role === 'admin') {
    busId = Number(req.body.busId);
  } else {
    const bus = await getBusForDriver(req.user.id);
    if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });
    busId = bus.id;
  }

  const log = await prisma.vehicleLog.create({
    data: { busId, type: 'SAFETY_CHECK', notes: item, passed: Boolean(passed) },
  });
  res.status(201).json({ log });
});

// ── Driver roster (students on the assigned bus route) ────────────────
export const getRoster = asyncHandler(async (req, res) => {
  const bus = await getBusForDriver(req.user.id);
  if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });

  const students = await prisma.student.findMany({
    where: { routeId: bus.routeId },
    include: {
      user: { select: { firstName: true, lastName: true } },
      arrivePickupPoint: true,
    },
    orderBy: { user: { firstName: 'asc' } },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const entries = await prisma.tripRoster.findMany({
    where: { busId: bus.id, tripDate: { gte: today } },
  });

  const roster = students.map((s) => {
    const entry = entries.find((e) => e.studentId === s.id);
    return {
      id: s.id,
      name: `${s.user.firstName} ${s.user.lastName}`,
      pickup: s.arrivePickupPoint?.name || '—',
      status: entry?.status || 'PENDING',
    };
  });

  const boarded = roster.filter((r) => r.status === 'BOARDED').length;
  const noShow = roster.filter((r) => r.status === 'NO_SHOW').length;

  res.json({
    roster,
    total: roster.length,
    boarded,
    noShow,
    remaining: roster.length - boarded - noShow,
  });
});

// ── Driver: mark a student boarded / no-show ──────────────────────────
export const setRosterStatus = asyncHandler(async (req, res) => {
  const { studentId, status } = req.body;
  if (!['BOARDED', 'NO_SHOW', 'PENDING'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const bus = await getBusForDriver(req.user.id);
  if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existing = await prisma.tripRoster.findFirst({
    where: { busId: bus.id, studentId: Number(studentId), tripDate: { gte: today } },
  });

  if (existing) {
    await prisma.tripRoster.update({ where: { id: existing.id }, data: { status } });
  } else {
    await prisma.tripRoster.create({
      data: { busId: bus.id, studentId: Number(studentId), status },
    });
  }

  res.json({ message: 'Roster updated.', studentId: Number(studentId), status });
});
