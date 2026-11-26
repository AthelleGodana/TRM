import prisma, { tenantTransaction } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  BadRequest, DUE_SOON_DAYS, DUE_SOON_KM, compact, idParam, optDate, optEnum, optInt, optNumber, optString,
  scheduleStatus, userName,
} from '../services/fleet.js';

// Maintenance for staff: recurring service schedules, the due list, the
// service history (with costs) and defects reported by drivers.

const SERVICE_TYPES = ['SERVICE', 'REPAIR', 'TYRES', 'INSPECTION', 'OTHER'];
const DEFECT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
const busSelect = { select: { id: true, licensePlate: true, make: true, model: true, odometerKm: true } };

const notFound = (what) => Object.assign(new Error(`${what} not found.`), { status: 404 });

// ── Schedules ──────────────────────────────────────────────────────────────

export const listSchedules = asyncHandler(async (req, res) => {
  const busId = idParam(req.query.busId);
  const schedules = await prisma.maintenanceSchedule.findMany({
    where: compact({ busId: busId ?? undefined }),
    include: { bus: busSelect },
    orderBy: [{ busId: 'asc' }, { name: 'asc' }],
  });
  const now = new Date();
  res.json({ schedules: schedules.map((s) => ({ ...s, due: scheduleStatus(s, s.bus.odometerKm, now) })) });
});

function scheduleData(body) {
  return compact({
    name: optString(body.name, { max: 80 }),
    intervalKm: optInt(body.intervalKm, 'Interval (km)', { min: 1 }),
    intervalDays: optInt(body.intervalDays, 'Interval (days)', { min: 1 }),
    lastDoneAt: optDate(body.lastDoneAt, 'Last done'),
    lastDoneOdometer: optInt(body.lastDoneOdometer, 'Last done odometer'),
    active: body.active === undefined ? undefined : Boolean(body.active),
  });
}

// A new schedule counts from now and from the vehicle's current odometer
// unless the last service is given, so it is not overdue the moment it is made.
export const createSchedule = asyncHandler(async (req, res) => {
  const busId = idParam(req.body.busId);
  const data = scheduleData(req.body);
  if (!data.name) throw new BadRequest('Name is required.');
  if (!data.intervalKm && !data.intervalDays) throw new BadRequest('Set an interval in km, in days, or both.');
  const bus = busId && await prisma.bus.findUnique({ where: { id: busId } });
  if (!bus) throw notFound('Vehicle');

  const schedule = await prisma.maintenanceSchedule.create({
    data: {
      ...data,
      busId,
      lastDoneAt: data.lastDoneAt ?? new Date(),
      lastDoneOdometer: data.lastDoneOdometer ?? bus.odometerKm ?? null,
    },
  });
  res.status(201).json({ schedule });
});

export const updateSchedule = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const existing = id && await prisma.maintenanceSchedule.findUnique({ where: { id } });
  if (!existing) throw notFound('Schedule');
  res.json({ schedule: await prisma.maintenanceSchedule.update({ where: { id }, data: scheduleData(req.body) }) });
});

export const deleteSchedule = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const existing = id && await prisma.maintenanceSchedule.findUnique({ where: { id } });
  if (!existing) throw notFound('Schedule');
  await prisma.maintenanceSchedule.delete({ where: { id } });
  res.json({ message: 'Schedule deleted.' });
});

// GET /admin/maintenance/due?withinKm=500&withinDays=14 — overdue and
// due-soon services across the fleet, most urgent first.
export const listDue = asyncHandler(async (req, res) => {
  const soonKm = optInt(req.query.withinKm, 'withinKm') ?? DUE_SOON_KM;
  const soonDays = optInt(req.query.withinDays, 'withinDays') ?? DUE_SOON_DAYS;
  const schedules = await prisma.maintenanceSchedule.findMany({
    where: { active: true, bus: { archivedAt: null } },
    include: { bus: busSelect },
  });
  const now = new Date();
  const items = schedules
    .map((s) => ({ ...s, due: scheduleStatus(s, s.bus.odometerKm, now, { soonKm, soonDays }) }))
    .filter((s) => s.due.status !== 'OK')
    .sort((a, b) => (a.due.status === b.due.status ? 0 : a.due.status === 'OVERDUE' ? -1 : 1)
      || (a.due.daysLeft ?? Infinity) - (b.due.daysLeft ?? Infinity));
  res.json({ items });
});

// ── Service records ────────────────────────────────────────────────────────

export const listServiceRecords = asyncHandler(async (req, res) => {
  const busId = idParam(req.query.busId);
  const from = optDate(req.query.from, 'from');
  const to = optDate(req.query.to, 'to');
  const records = await prisma.serviceRecord.findMany({
    where: compact({
      busId: busId ?? undefined,
      servicedAt: from || to ? compact({ gte: from ?? undefined, lte: to ?? undefined }) : undefined,
    }),
    include: { bus: busSelect, schedule: { select: { id: true, name: true } } },
    orderBy: { servicedAt: 'desc' },
    take: 500,
  });
  const totalCost = records.reduce((sum, r) => sum + Number(r.totalCost || 0), 0);
  res.json({ records, totalCost });
});

function serviceData(body) {
  const partsCost = optNumber(body.partsCost, 'Parts cost');
  const labourCost = optNumber(body.labourCost, 'Labour cost');
  let totalCost = optNumber(body.totalCost, 'Total cost');
  if (totalCost == null && (partsCost != null || labourCost != null)) totalCost = (partsCost || 0) + (labourCost || 0);
  return compact({
    type: optEnum(body.type, SERVICE_TYPES, 'Type') ?? undefined,
    description: optString(body.description, { max: 2000 }),
    servicedAt: optDate(body.servicedAt, 'Service date'),
    odometerKm: optInt(body.odometerKm, 'Odometer'),
    vendor: optString(body.vendor, { max: 120 }),
    partsCost,
    labourCost,
    totalCost,
  });
}

// Recording a service also: marks the linked schedule as done (so the next
// one is due from here), moves the vehicle's odometer forward, resolves the
// listed defects and, if asked, sets the vehicle's status.
export const createServiceRecord = asyncHandler(async (req, res) => {
  const busId = idParam(req.body.busId);
  const scheduleId = idParam(req.body.scheduleId);
  const data = serviceData(req.body);
  if (!data.description) throw new BadRequest('Description is required.');
  const servicedAt = data.servicedAt ?? new Date();
  const defectIds = Array.isArray(req.body.defectIds) ? req.body.defectIds.map(idParam).filter(Boolean) : [];
  const setStatus = optEnum(req.body.setVehicleStatus, ['OPERATIONAL', 'IN_MAINTENANCE', 'OUT_OF_SERVICE'], 'Vehicle status');

  const record = await tenantTransaction(async (tx) => {
    const bus = busId && await tx.bus.findUnique({ where: { id: busId } });
    if (!bus) throw notFound('Vehicle');
    if (scheduleId) {
      const schedule = await tx.maintenanceSchedule.findUnique({ where: { id: scheduleId } });
      if (!schedule || schedule.busId !== busId) throw new BadRequest('That schedule belongs to another vehicle.');
    }

    const created = await tx.serviceRecord.create({
      data: { ...data, busId, scheduleId, servicedAt, createdById: req.user.id },
    });

    if (scheduleId) {
      await tx.maintenanceSchedule.update({
        where: { id: scheduleId },
        data: { lastDoneAt: servicedAt, lastDoneOdometer: data.odometerKm ?? bus.odometerKm ?? null },
      });
    }
    const busUpdate = {};
    if (data.odometerKm != null && (bus.odometerKm == null || data.odometerKm > bus.odometerKm)) busUpdate.odometerKm = data.odometerKm;
    if (setStatus) busUpdate.status = setStatus;
    if (Object.keys(busUpdate).length) await tx.bus.update({ where: { id: busId }, data: busUpdate });

    if (defectIds.length) {
      await tx.defectReport.updateMany({
        where: { id: { in: defectIds }, busId, status: { not: 'RESOLVED' } },
        data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: req.user.id, serviceRecordId: created.id },
      });
    }
    return created;
  });
  res.status(201).json({ record });
});

export const updateServiceRecord = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const existing = id && await prisma.serviceRecord.findUnique({ where: { id } });
  if (!existing) throw notFound('Service record');
  res.json({ record: await prisma.serviceRecord.update({ where: { id }, data: serviceData(req.body) }) });
});

export const deleteServiceRecord = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const existing = id && await prisma.serviceRecord.findUnique({ where: { id } });
  if (!existing) throw notFound('Service record');
  await prisma.serviceRecord.delete({ where: { id } });
  res.json({ message: 'Service record deleted.' });
});

// ── Defects ────────────────────────────────────────────────────────────────

export const listDefects = asyncHandler(async (req, res) => {
  const status = DEFECT_STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const busId = idParam(req.query.busId);
  const defects = await prisma.defectReport.findMany({
    where: compact({ status, busId: busId ?? undefined }),
    include: {
      bus: busSelect,
      driver: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });
  res.json({ defects: defects.map((d) => ({ ...d, driverName: d.driver ? userName(d.driver.user) : null })) });
});

export const updateDefect = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const existing = id && await prisma.defectReport.findUnique({ where: { id } });
  if (!existing) throw notFound('Defect');
  const status = optEnum(req.body.status, DEFECT_STATUSES, 'Status') ?? undefined;
  const resolving = status === 'RESOLVED' && existing.status !== 'RESOLVED';
  const data = compact({
    status,
    severity: optEnum(req.body.severity, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], 'Severity') ?? undefined,
    resolutionNote: optString(req.body.resolutionNote, { max: 2000 }),
    serviceRecordId: req.body.serviceRecordId === undefined ? undefined : idParam(req.body.serviceRecordId),
    resolvedAt: resolving ? new Date() : status && status !== 'RESOLVED' ? null : undefined,
    resolvedById: resolving ? req.user.id : status && status !== 'RESOLVED' ? null : undefined,
  });
  res.json({ defect: await prisma.defectReport.update({ where: { id }, data }) });
});
