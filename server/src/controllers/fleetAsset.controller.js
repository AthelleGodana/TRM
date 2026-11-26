import prisma, { tenantTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  BadRequest, compact, expiryStatus, idParam, optDate, optEnum, optInt, optString, scheduleStatus, userName,
} from '../services/fleet.js';

// Vehicle registry: every vehicle in the fleet with its details, current
// driver (and assignment history), maintenance, documents and defects.
// Vehicles are stored in the Bus table; the UI calls them vehicles.

export const VEHICLE_TYPES = ['BUS', 'MINIBUS', 'VAN', 'CAR', 'PICKUP', 'TRUCK', 'MOTORCYCLE', 'OTHER'];
export const VEHICLE_STATUSES = ['OPERATIONAL', 'IN_SERVICE', 'OUT_OF_FUEL', 'IN_MAINTENANCE', 'OUT_OF_SERVICE'];
const OWNERSHIP = ['OWNED', 'LEASED', 'RENTED'];
const FUEL_TYPES = ['DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID', 'CNG', 'LPG'];

const driverInclude = { include: { user: { select: { firstName: true, lastName: true, email: true } } } };

// Vehicle fields accepted on create and update.
function vehicleData(body) {
  const year = optInt(body.year, 'Year', { min: 1950 });
  if (year && year > new Date().getFullYear() + 1) throw new BadRequest('Year is in the future.');
  return compact({
    licensePlate: optString(body.licensePlate, { max: 20 }),
    capacity: optInt(body.capacity, 'Capacity', { min: 1 }),
    vehicleType: optEnum(body.vehicleType, VEHICLE_TYPES, 'Vehicle type') ?? undefined,
    make: optString(body.make, { max: 60 }),
    model: optString(body.model, { max: 60 }),
    year,
    vin: body.vin === undefined ? undefined : optString(body.vin, { max: 32 })?.toUpperCase() ?? null,
    color: optString(body.color, { max: 30 }),
    fuelType: optEnum(body.fuelType, FUEL_TYPES, 'Fuel type'),
    odometerKm: optInt(body.odometerKm, 'Odometer'),
    acquiredAt: optDate(body.acquiredAt, 'Acquired date'),
    ownership: optEnum(body.ownership, OWNERSHIP, 'Ownership'),
    notes: optString(body.notes, { max: 2000 }),
    status: optEnum(body.status, VEHICLE_STATUSES, 'Status') ?? undefined,
    routeId: body.routeId === undefined ? undefined : idParam(body.routeId),
  });
}

// Shape of a vehicle in lists: the record plus an "attention" summary.
function presentVehicle(bus, now = new Date()) {
  const schedules = (bus.maintenanceSchedules || []).filter((s) => s.active)
    .map((s) => scheduleStatus(s, bus.odometerKm, now));
  const docs = (bus.documents || []).map((d) => expiryStatus(d.expiresAt, now));
  const { maintenanceSchedules, documents, defects, gpsLogs, ...rest } = bus;
  return {
    ...rest,
    driverName: bus.driver ? userName(bus.driver.user) : null,
    lastSeenAt: gpsLogs?.[0]?.recordedAt || null,
    attention: {
      maintenanceOverdue: schedules.filter((s) => s.status === 'OVERDUE').length,
      maintenanceDueSoon: schedules.filter((s) => s.status === 'DUE_SOON').length,
      documentsExpired: docs.filter((s) => s === 'EXPIRED').length,
      documentsExpiring: docs.filter((s) => s === 'EXPIRING').length,
      openDefects: (defects || []).length,
    },
  };
}

// GET /admin/buses?status=&type=&q=&archived=true
export const listVehicles = asyncHandler(async (req, res) => {
  const { status, type, q } = req.query;
  const where = compact({
    archivedAt: req.query.archived === 'true' ? { not: null } : null,
    status: VEHICLE_STATUSES.includes(status) ? status : undefined,
    vehicleType: VEHICLE_TYPES.includes(type) ? type : undefined,
  });
  if (q) {
    const term = String(q).trim();
    where.OR = [
      { licensePlate: { contains: term, mode: 'insensitive' } },
      { make: { contains: term, mode: 'insensitive' } },
      { model: { contains: term, mode: 'insensitive' } },
      { vin: { contains: term, mode: 'insensitive' } },
    ];
  }
  const buses = await prisma.bus.findMany({
    where,
    include: {
      driver: driverInclude,
      route: { select: { id: true, name: true } },
      maintenanceSchedules: true,
      documents: { select: { expiresAt: true } },
      defects: { where: { status: { not: 'RESOLVED' } }, select: { id: true } },
      gpsLogs: { orderBy: { recordedAt: 'desc' }, take: 1, select: { recordedAt: true } },
    },
    orderBy: { licensePlate: 'asc' },
  });
  const now = new Date();
  res.json({ buses: buses.map((b) => presentVehicle(b, now)) });
});

// GET /admin/buses/:id — everything about one vehicle.
export const getVehicle = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const bus = id && await prisma.bus.findUnique({
    where: { id },
    include: {
      driver: driverInclude,
      route: { select: { id: true, name: true } },
      assignments: { include: { driver: driverInclude }, orderBy: { startedAt: 'desc' }, take: 50 },
      maintenanceSchedules: { orderBy: { name: 'asc' } },
      serviceRecords: { orderBy: { servicedAt: 'desc' }, take: 50 },
      documents: { orderBy: [{ expiresAt: 'asc' }] },
      defects: { include: { driver: driverInclude }, orderBy: { createdAt: 'desc' }, take: 50 },
      fuelRecords: { orderBy: { filledAt: 'desc' }, take: 10 },
      gpsLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
    },
  });
  if (!bus) return res.status(404).json({ error: 'Vehicle not found.' });

  const now = new Date();
  const year = new Date(now.getFullYear(), 0, 1);
  const serviceCostYtd = bus.serviceRecords
    .filter((r) => r.servicedAt >= year)
    .reduce((sum, r) => sum + Number(r.totalCost || 0), 0);

  res.json({
    bus: {
      ...presentVehicle({ ...bus, defects: bus.defects.filter((d) => d.status !== 'RESOLVED') }, now),
      assignments: bus.assignments.map((a) => ({ ...a, driverName: userName(a.driver.user) })),
      maintenanceSchedules: bus.maintenanceSchedules.map((s) => ({ ...s, due: scheduleStatus(s, bus.odometerKm, now) })),
      serviceRecords: bus.serviceRecords,
      documents: bus.documents.map((d) => ({ ...d, expiry: expiryStatus(d.expiresAt, now) })),
      defects: bus.defects.map((d) => ({ ...d, driverName: d.driver ? userName(d.driver.user) : null })),
      fuelRecords: bus.fuelRecords,
      lastLocation: bus.gpsLogs[0] || null,
      serviceCostYtd,
    },
  });
});

// Ends the driver's and the vehicle's open assignments and, when driverId
// is given, starts a new one. Keeps Bus.driverId (the current driver used
// by GPS sharing) in step. A driver drives one vehicle at a time, so they
// are moved off any other vehicle. Returns the vehicle id they left, if any.
export async function assignDriver(tx, busId, driverId, assignedById) {
  const now = new Date();
  await tx.vehicleAssignment.updateMany({ where: { busId, endedAt: null }, data: { endedAt: now } });
  if (!driverId) {
    await tx.bus.update({ where: { id: busId }, data: { driverId: null } });
    return null;
  }

  const driver = await tx.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw Object.assign(new Error('Driver not found.'), { status: 404 });

  const others = await tx.bus.findMany({ where: { driverId, id: { not: busId } }, select: { id: true } });
  if (others.length) {
    await tx.bus.updateMany({ where: { id: { in: others.map((b) => b.id) } }, data: { driverId: null } });
  }
  await tx.vehicleAssignment.updateMany({ where: { driverId, endedAt: null }, data: { endedAt: now } });
  await tx.bus.update({ where: { id: busId }, data: { driverId } });
  await tx.vehicleAssignment.create({ data: { busId, driverId, assignedById, startedAt: now } });
  return others[0]?.id ?? null;
}

// POST /admin/buses
export const createVehicle = asyncHandler(async (req, res) => {
  const data = vehicleData(req.body);
  if (!data.licensePlate) return res.status(400).json({ error: 'Registration (licence plate) is required.' });
  const driverId = idParam(req.body.driverId);

  const bus = await tenantTransaction(async (tx) => {
    const created = await tx.bus.create({ data });
    if (driverId) await assignDriver(tx, created.id, driverId, req.user.id);
    return tx.bus.findUnique({ where: { id: created.id }, include: { driver: driverInclude, route: true } });
  });
  res.status(201).json({ bus });
});

// PUT /admin/buses/:id — details, route, status and (optionally) driver.
export const updateVehicle = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  if (!id) return res.status(404).json({ error: 'Vehicle not found.' });
  const data = vehicleData(req.body);
  if (data.licensePlate === null) return res.status(400).json({ error: 'Registration cannot be empty.' });

  const bus = await tenantTransaction(async (tx) => {
    const existing = await tx.bus.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error('Vehicle not found.'), { status: 404 });
    if (data.odometerKm != null && existing.odometerKm != null && data.odometerKm < existing.odometerKm) {
      throw new BadRequest(`Odometer cannot go backwards (currently ${existing.odometerKm} km).`);
    }
    if (Object.keys(data).length) await tx.bus.update({ where: { id }, data });
    if (req.body.driverId !== undefined) {
      const driverId = idParam(req.body.driverId);
      if (driverId !== existing.driverId) await assignDriver(tx, id, driverId, req.user.id);
    }
    return tx.bus.findUnique({ where: { id }, include: { driver: driverInclude, route: true } });
  });
  res.json({ bus });
});

// POST /admin/buses/:id/assign { driverId | null }
export const assignVehicleDriver = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const driverId = req.body.driverId == null || req.body.driverId === '' ? null : idParam(req.body.driverId);
  if (req.body.driverId && !driverId) return res.status(400).json({ error: 'Invalid driver.' });

  const result = await tenantTransaction(async (tx) => {
    const bus = id && await tx.bus.findUnique({ where: { id } });
    if (!bus) throw Object.assign(new Error('Vehicle not found.'), { status: 404 });
    const movedFromBusId = await assignDriver(tx, id, driverId, req.user.id);
    const updated = await tx.bus.findUnique({ where: { id }, include: { driver: driverInclude } });
    return { bus: updated, movedFromBusId };
  });
  res.json(result);
});

// PUT /admin/buses/:id/odometer { odometerKm }
export const updateOdometer = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const odometerKm = optInt(req.body.odometerKm, 'Odometer');
  if (odometerKm == null) return res.status(400).json({ error: 'Odometer reading is required.' });
  const bus = id && await prisma.bus.findUnique({ where: { id } });
  if (!bus) return res.status(404).json({ error: 'Vehicle not found.' });
  if (bus.odometerKm != null && odometerKm < bus.odometerKm) {
    return res.status(400).json({ error: `Odometer cannot go backwards (currently ${bus.odometerKm} km).` });
  }
  res.json({ bus: await prisma.bus.update({ where: { id }, data: { odometerKm } }) });
});

// POST /admin/buses/:id/archive and /restore. Archiving retires a vehicle:
// it leaves lists and its driver is unassigned, but its history is kept.
export const archiveVehicle = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const bus = await tenantTransaction(async (tx) => {
    const existing = id && await tx.bus.findUnique({ where: { id } });
    if (!existing) throw Object.assign(new Error('Vehicle not found.'), { status: 404 });
    await assignDriver(tx, id, null, req.user.id);
    return tx.bus.update({ where: { id }, data: { archivedAt: new Date(), status: 'OUT_OF_SERVICE', routeId: null } });
  });
  res.json({ bus });
});

export const restoreVehicle = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const bus = id && await prisma.bus.findUnique({ where: { id } });
  if (!bus) return res.status(404).json({ error: 'Vehicle not found.' });
  res.json({ bus: await prisma.bus.update({ where: { id }, data: { archivedAt: null, status: 'OPERATIONAL' } }) });
});
