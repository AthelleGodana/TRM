import prisma, { tenantTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isStaff } from '../config/roles.js';
import { findDriverBus as getBusForDriver } from '../services/busAccess.js';

// Staff pick the bus explicitly; it must exist in their organisation.
async function getBusForStaff(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id)) return null;
  return prisma.bus.findUnique({ where: { id } });
}

// ── Bus status toggle (drivers + staff) ──────────────────────────────
export const setBusStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  // Drivers report day-to-day states; staff can also take a vehicle off the road.
  const valid = isStaff(req.user.role)
    ? ['OPERATIONAL', 'IN_SERVICE', 'OUT_OF_FUEL', 'IN_MAINTENANCE', 'OUT_OF_SERVICE']
    : ['OPERATIONAL', 'IN_SERVICE', 'OUT_OF_FUEL'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status.' });

  let bus;
  if (isStaff(req.user.role)) {
    bus = await getBusForStaff(req.body.busId);
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
  if (isStaff(req.user.role)) {
    const bus = await getBusForStaff(req.body.busId);
    if (!bus) return res.status(404).json({ error: 'Bus not found.' });
    busId = bus.id;
  } else {
    const bus = await getBusForDriver(req.user.id);
    if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });
    busId = bus.id;
  }

  const log = await tenantTransaction(async (tx) => {
    const created = await tx.vehicleLog.create({
      data: {
        busId,
        type,
        fuelLiters: fuelLiters ? Number(fuelLiters) : null,
        fuelCost: fuelCost ? Number(fuelCost) : null,
        odometer: odometer ? Number(odometer) : null,
        notes,
      },
    });
    // Fuel logged through the existing vehicle log also lands in the Fuel
    // Hub, so both views stay in step. VehicleLog itself is unchanged.
    if (type === 'FUEL' && created.fuelLiters > 0) {
      const bus = await tx.bus.findUnique({ where: { id: busId } });
      await tx.fuelRecord.create({
        data: {
          busId,
          driverId: bus?.driverId ?? null,
          litres: created.fuelLiters,
          totalCost: created.fuelCost,
          pricePerLitre: created.fuelCost ? Math.round((Number(created.fuelCost) / created.fuelLiters) * 100) / 100 : null,
          odometer: created.odometer,
          notes: created.notes,
          filledAt: created.createdAt,
          createdById: req.user.id,
          legacyVehicleLogId: created.id,
        },
      });
    }
    return created;
  });
  res.status(201).json({ log });
});

// ── List vehicle logs for a bus (drivers: own bus; staff: any) ───────
export const listVehicleLogs = asyncHandler(async (req, res) => {
  let busId;
  if (isStaff(req.user.role)) {
    const bus = await getBusForStaff(req.params.busId || req.query.busId);
    if (!bus) return res.status(404).json({ error: 'Bus not found.' });
    busId = bus.id;
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
  if (isStaff(req.user.role)) {
    const bus = await getBusForStaff(req.params.busId || req.query.busId);
    if (!bus) return res.status(404).json({ error: 'Bus not found.' });
    busId = bus.id;
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
  if (isStaff(req.user.role)) {
    const bus = await getBusForStaff(req.body.busId);
    if (!bus) return res.status(404).json({ error: 'Bus not found.' });
    busId = bus.id;
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
