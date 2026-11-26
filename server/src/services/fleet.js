// Shared helpers for the fleet-management controllers: request parsing,
// maintenance due status and document expiry status. Pure functions only,
// so they are easy to unit-test.

const DAY_MS = 24 * 60 * 60 * 1000;

// "Due soon" windows used by the dashboard and the maintenance due list.
export const DUE_SOON_KM = 500;
export const DUE_SOON_DAYS = 14;
// Documents and licences this close to expiry are flagged.
export const EXPIRING_DAYS = 30;

export class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// ── Request parsing ────────────────────────────────────────────────────────
// Each helper returns undefined when the field is absent (leave unchanged),
// null when it is explicitly cleared ('' or null), or the parsed value.

export function optInt(value, field, { min = 0 } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new BadRequest(`${field} must be a whole number of at least ${min}.`);
  return n;
}

export function optNumber(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new BadRequest(`${field} must be a positive number.`);
  return n;
}

export function optDate(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequest(`${field} must be a valid date.`);
  return d;
}

export function optString(value, { max = 500 } = {}) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

export function optEnum(value, allowed, field) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!allowed.includes(value)) throw new BadRequest(`${field} must be one of: ${allowed.join(', ')}.`);
  return value;
}

// Drops undefined keys so Prisma leaves those columns unchanged.
export function compact(data) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

export function idParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ── Maintenance due status ─────────────────────────────────────────────────

// Where a schedule stands for a vehicle at `odometerKm` on `now`:
// { status: OVERDUE | DUE_SOON | OK, nextDueKm, nextDueAt, kmLeft, daysLeft }.
// A schedule is due by distance, by time, or both — whichever comes first.
export function scheduleStatus(schedule, odometerKm, now = new Date(), {
  soonKm = DUE_SOON_KM, soonDays = DUE_SOON_DAYS,
} = {}) {
  const nextDueKm = schedule.intervalKm && schedule.lastDoneOdometer != null
    ? schedule.lastDoneOdometer + schedule.intervalKm
    : null;
  const nextDueAt = schedule.intervalDays && schedule.lastDoneAt
    ? new Date(new Date(schedule.lastDoneAt).getTime() + schedule.intervalDays * DAY_MS)
    : null;

  const kmLeft = nextDueKm != null && odometerKm != null ? nextDueKm - odometerKm : null;
  const daysLeft = nextDueAt ? Math.floor((nextDueAt.getTime() - now.getTime()) / DAY_MS) : null;

  let status = 'OK';
  if ((kmLeft != null && kmLeft <= 0) || (nextDueAt && nextDueAt <= now)) status = 'OVERDUE';
  else if ((kmLeft != null && kmLeft <= soonKm) || (daysLeft != null && daysLeft <= soonDays)) status = 'DUE_SOON';

  return { status, nextDueKm, nextDueAt, kmLeft, daysLeft };
}

// ── Document / licence expiry ──────────────────────────────────────────────

// EXPIRED, EXPIRING (within `days`), VALID, or NONE when there is no date.
export function expiryStatus(expiresAt, now = new Date(), days = EXPIRING_DAYS) {
  if (!expiresAt) return 'NONE';
  const t = new Date(expiresAt).getTime();
  if (t < now.getTime()) return 'EXPIRED';
  if (t - now.getTime() <= days * DAY_MS) return 'EXPIRING';
  return 'VALID';
}

export function daysUntil(date, now = new Date()) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - now.getTime()) / DAY_MS);
}

export const userName = (user) => (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '' : '');
