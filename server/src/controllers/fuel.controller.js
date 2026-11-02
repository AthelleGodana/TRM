import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { findDriverBus } from '../services/busAccess.js';
import { runFuelAnalysisForTenant } from '../fuel/analysisJob.js';

// Fuel Hub API. Every query uses the tenant client, so records, buses,
// drivers and cards from other organisations are never visible, and the
// same-tenant triggers reject references to them.

const FUEL_TYPES = ['DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID', 'CNG', 'LPG'];
const CARD_STATUSES = ['ACTIVE', 'BLOCKED', 'EXPIRED'];
const ANOMALY_STATUSES = ['OPEN', 'CONFIRMED', 'DISMISSED'];

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Field parsers: return undefined when absent, null when cleared, or throw.
const present = (v) => v !== undefined;
function positive(v, field, { optional = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return v === undefined ? undefined : null;
    throw new ValidationError(`${field} is required.`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`${field} must be a positive number.`);
  return n;
}
function integer(v, field) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new ValidationError(`${field} must be a whole number.`);
  return n;
}
function date(v, field, { optional = true } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return undefined;
    throw new ValidationError(`${field} is required.`);
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} must be a date.`);
  return d;
}
function text(v, max = 200) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  return String(v).slice(0, max);
}
function oneOf(v, allowed, field) {
  if (v === undefined) return undefined;
  if (!allowed.includes(v)) throw new ValidationError(`${field} must be one of ${allowed.join(', ')}.`);
  return v;
}
function httpsUrl(v, field) {
  const value = text(v, 2000);
  if (value && !/^https:\/\//.test(value)) throw new ValidationError(`${field} must be an https URL.`);
  return value;
}
const idParam = (req) => Number(req.params.id) || 0;
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// ── Fuel records ──────────────────────────────────────────────────────
// Price per litre and total cost: supply either and the other is derived.
function costFields(body, existing = {}) {
  const litres = positive(body.litres, 'litres', { optional: !!existing.litres });
  let pricePerLitre = positive(body.pricePerLitre, 'pricePerLitre');
  let totalCost = positive(body.totalCost, 'totalCost');
  const l = litres ?? Number(existing.litres);
  if (pricePerLitre && totalCost === undefined) totalCost = Math.round(pricePerLitre * l * 100) / 100;
  if (totalCost && pricePerLitre === undefined) pricePerLitre = Math.round((totalCost / l) * 100) / 100;
  return { litres, pricePerLitre, totalCost };
}

function recordFields(body) {
  return {
    odometer: integer(body.odometer, 'odometer'),
    station: text(body.station, 120),
    receiptImageUrl: httpsUrl(body.receiptImageUrl, 'receiptImageUrl'),
    notes: text(body.notes, 1000),
    fuelCardId: integer(body.fuelCardId, 'fuelCardId'),
  };
}

// Drivers only ever see fuel records logged against their own driver profile.
async function driverScope(req) {
  if (req.user.role !== 'DRIVER') return {};
  const driver = await prisma.driver.findFirst({ where: { userId: req.user.id } });
  return { driverId: driver?.id ?? -1 };
}

export const listFuelRecords = asyncHandler(async (req, res) => {
  const where = await driverScope(req);
  if (req.query.busId) where.busId = Number(req.query.busId) || -1;
  const from = date(req.query.from, 'from');
  const to = date(req.query.to, 'to');
  if (from || to) where.filledAt = clean({ gte: from, lte: to });

  const take = Math.min(Number(req.query.take) || 50, 200);
  const skip = Math.max(Number(req.query.skip) || 0, 0);
  const [records, total] = await Promise.all([
    prisma.fuelRecord.findMany({
      where,
      include: { bus: { select: { licensePlate: true } }, fuelCard: { select: { label: true, last4: true } } },
      orderBy: { filledAt: 'desc' },
      take,
      skip,
    }),
    prisma.fuelRecord.count({ where }),
  ]);
  res.json({ records, total });
});

export const getFuelRecord = asyncHandler(async (req, res) => {
  const record = await prisma.fuelRecord.findFirst({ where: { id: idParam(req), ...(await driverScope(req)) } });
  if (!record) {
    return res.status(404).json({ error: 'Fuel record not found.' });
  }
  res.json({ record });
});

// Drivers log fuel for their own bus; staff for any bus in the organisation.
export const createFuelRecord = asyncHandler(async (req, res) => {
  const body = req.body || {};
  let busId;
  let driverId = integer(body.driverId, 'driverId') ?? null;
  if (req.user.role === 'DRIVER') {
    const bus = await findDriverBus(req.user.id);
    if (!bus) return res.status(404).json({ error: 'No bus assigned to you.' });
    busId = bus.id;
    driverId = bus.driverId;
  } else {
    busId = integer(body.busId, 'busId');
    if (!busId) throw new ValidationError('busId is required.');
  }

  const fuelCardId = integer(body.fuelCardId, 'fuelCardId') ?? null;
  const record = await prisma.fuelRecord.create({
    data: clean({
      busId,
      driverId,
      ...costFields(body),
      ...recordFields(body),
      fuelCardId,
      source: fuelCardId ? 'FUEL_CARD' : 'MANUAL',
      filledAt: date(body.filledAt, 'filledAt') || new Date(),
      createdById: req.user.id,
    }),
  });
  res.status(201).json({ record });
});

export const updateFuelRecord = asyncHandler(async (req, res) => {
  const existing = await prisma.fuelRecord.findUnique({ where: { id: idParam(req) } });
  if (!existing) return res.status(404).json({ error: 'Fuel record not found.' });
  const body = req.body || {};
  const data = clean({
    busId: integer(body.busId, 'busId') || undefined,
    driverId: integer(body.driverId, 'driverId'),
    ...costFields(body, existing),
    ...recordFields(body),
    filledAt: date(body.filledAt, 'filledAt'),
  });
  if (present(data.fuelCardId)) data.source = data.fuelCardId ? 'FUEL_CARD' : 'MANUAL';
  const record = await prisma.fuelRecord.update({ where: { id: existing.id }, data });
  res.json({ record });
});

export const deleteFuelRecord = asyncHandler(async (req, res) => {
  await prisma.fuelRecord.delete({ where: { id: idParam(req) } });
  res.json({ message: 'Fuel record deleted.' });
});

// ── Fuel cards ────────────────────────────────────────────────────────
function cardFields(body, { creating }) {
  if (present(body.cardNumber)) throw new ValidationError('Do not send full card numbers; send last4 only.');
  if (creating && !body.label) throw new ValidationError('label is required.');
  if ((creating || present(body.last4)) && !/^\d{4}$/.test(String(body.last4 ?? ''))) {
    throw new ValidationError('last4 must be the last four digits of the card.');
  }
  return clean({
    label: text(body.label, 80) ?? undefined,
    provider: text(body.provider, 80),
    last4: present(body.last4) ? String(body.last4) : undefined,
    busId: integer(body.busId, 'busId'),
    driverId: integer(body.driverId, 'driverId'),
    status: oneOf(body.status, CARD_STATUSES, 'status'),
    monthlyLimit: positive(body.monthlyLimit, 'monthlyLimit'),
    expiresAt: date(body.expiresAt, 'expiresAt'),
  });
}

export const listFuelCards = asyncHandler(async (req, res) => {
  const cards = await prisma.fuelCard.findMany({
    include: { bus: { select: { licensePlate: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ cards });
});

export const createFuelCard = asyncHandler(async (req, res) => {
  const card = await prisma.fuelCard.create({ data: cardFields(req.body || {}, { creating: true }) });
  res.status(201).json({ card });
});

export const updateFuelCard = asyncHandler(async (req, res) => {
  const card = await prisma.fuelCard.update({ where: { id: idParam(req) }, data: cardFields(req.body || {}, { creating: false }) });
  res.json({ card });
});

export const deleteFuelCard = asyncHandler(async (req, res) => {
  await prisma.fuelCard.delete({ where: { id: idParam(req) } });
  res.json({ message: 'Fuel card deleted.' });
});

// ── Vehicle fuel profiles (one per bus) ───────────────────────────────
export const listFuelProfiles = asyncHandler(async (req, res) => {
  const profiles = await prisma.vehicleFuelProfile.findMany({
    include: { bus: { select: { licensePlate: true } } },
    orderBy: { busId: 'asc' },
  });
  res.json({ profiles });
});

export const upsertFuelProfile = asyncHandler(async (req, res) => {
  const busId = Number(req.params.busId) || 0;
  const bus = await prisma.bus.findUnique({ where: { id: busId } });
  if (!bus) return res.status(404).json({ error: 'Bus not found.' });
  const body = req.body || {};
  const fields = clean({
    fuelType: oneOf(body.fuelType, FUEL_TYPES, 'fuelType'),
    tankCapacityLitres: positive(body.tankCapacityLitres, 'tankCapacityLitres'),
    expectedConsumptionL100km: positive(body.expectedConsumptionL100km, 'expectedConsumptionL100km'),
    calibrationNotes: text(body.calibrationNotes, 2000),
  });
  const existing = await prisma.vehicleFuelProfile.findFirst({ where: { busId } });
  if (!existing) {
    for (const f of ['fuelType', 'tankCapacityLitres', 'expectedConsumptionL100km']) {
      if (fields[f] == null) throw new ValidationError(`${f} is required.`);
    }
  }
  const profile = existing
    ? await prisma.vehicleFuelProfile.update({ where: { id: existing.id }, data: fields })
    : await prisma.vehicleFuelProfile.create({ data: { busId, ...fields } });
  res.status(existing ? 200 : 201).json({ profile });
});

export const deleteFuelProfile = asyncHandler(async (req, res) => {
  const result = await prisma.vehicleFuelProfile.deleteMany({ where: { busId: Number(req.params.busId) || 0 } });
  if (result.count === 0) return res.status(404).json({ error: 'Fuel profile not found.' });
  res.json({ message: 'Fuel profile deleted.' });
});

// ── Calibration records ───────────────────────────────────────────────
function calibrationFields(body, { creating }) {
  const fields = clean({
    busId: integer(body.busId, 'busId') || undefined,
    calibratedAt: date(body.calibratedAt, 'calibratedAt', { optional: !creating }),
    odometer: integer(body.odometer, 'odometer'),
    tankLevelLitres: positive(body.tankLevelLitres, 'tankLevelLitres'),
    measuredConsumptionL100km: positive(body.measuredConsumptionL100km, 'measuredConsumptionL100km'),
    method: text(body.method, 120),
    notes: text(body.notes, 2000),
  });
  if (creating && !fields.busId) throw new ValidationError('busId is required.');
  return fields;
}

export const listCalibrations = asyncHandler(async (req, res) => {
  const where = req.query.busId ? { busId: Number(req.query.busId) || -1 } : {};
  const calibrations = await prisma.calibrationRecord.findMany({
    where,
    include: { bus: { select: { licensePlate: true } } },
    orderBy: { calibratedAt: 'desc' },
  });
  res.json({ calibrations });
});

export const createCalibration = asyncHandler(async (req, res) => {
  const calibration = await prisma.calibrationRecord.create({
    data: { ...calibrationFields(req.body || {}, { creating: true }), performedById: req.user.id },
  });
  res.status(201).json({ calibration });
});

export const updateCalibration = asyncHandler(async (req, res) => {
  const calibration = await prisma.calibrationRecord.update({
    where: { id: idParam(req) },
    data: calibrationFields(req.body || {}, { creating: false }),
  });
  res.json({ calibration });
});

export const deleteCalibration = asyncHandler(async (req, res) => {
  await prisma.calibrationRecord.delete({ where: { id: idParam(req) } });
  res.json({ message: 'Calibration record deleted.' });
});

// ── Anomalies (filled by the analysis job; empty until a model exists) ─
export const listAnomalies = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = oneOf(req.query.status, ANOMALY_STATUSES, 'status');
  if (req.query.busId) where.busId = Number(req.query.busId) || -1;
  const anomalies = await prisma.fuelAnomaly.findMany({
    where,
    include: {
      bus: { select: { licensePlate: true } },
      reviewedBy: { select: { name: true, firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
    take: Math.min(Number(req.query.take) || 100, 500),
  });
  res.json({ anomalies });
});

export const reviewAnomaly = asyncHandler(async (req, res) => {
  const status = oneOf(req.body?.status, ANOMALY_STATUSES, 'status');
  if (!status) throw new ValidationError('status is required.');
  const anomaly = await prisma.fuelAnomaly.update({
    where: { id: idParam(req) },
    data: {
      status,
      reviewNote: text(req.body?.reviewNote, 1000),
      reviewedById: status === 'OPEN' ? null : req.user.id,
      reviewedAt: status === 'OPEN' ? null : new Date(),
    },
  });
  res.json({ anomaly });
});

// ── Analysis runs ─────────────────────────────────────────────────────
export const listAnalysisRuns = asyncHandler(async (req, res) => {
  const runs = await prisma.fuelAnalysisRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 });
  res.json({ runs });
});

// Lets an ORG_ADMIN trigger the per-tenant analysis on demand.
export const triggerAnalysis = asyncHandler(async (req, res) => {
  const run = await runFuelAnalysisForTenant(req.org);
  res.status(202).json({ run });
});

