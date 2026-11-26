import StatusBadge from '../common/StatusBadge';
import { DEFECT_STATUS, DRIVER_STATUS, DUE, EXPIRY, SEVERITY, VEHICLE_STATUS, formatDate } from '../../config/fleet';

const pick = (map, key) => map[key] || { label: key, variant: 'neutral' };

export function VehicleStatusBadge({ status }) {
  const s = pick(VEHICLE_STATUS, status);
  return <StatusBadge variant={s.variant} dot>{s.label}</StatusBadge>;
}

export function DriverStatusBadge({ status }) {
  const s = pick(DRIVER_STATUS, status);
  return <StatusBadge variant={s.variant}>{s.label}</StatusBadge>;
}

// Expiry state, with the date for context.
export function ExpiryBadge({ status, date }) {
  const s = pick(EXPIRY, status);
  return <StatusBadge variant={s.variant}>{s.label}{date && status !== 'NONE' ? ` · ${formatDate(date)}` : ''}</StatusBadge>;
}

export function DueBadge({ status }) {
  const s = pick(DUE, status);
  return <StatusBadge variant={s.variant}>{s.label}</StatusBadge>;
}

export function SeverityBadge({ severity }) {
  const s = pick(SEVERITY, severity);
  return <StatusBadge variant={s.variant}>{s.label}</StatusBadge>;
}

export function DefectStatusBadge({ status }) {
  const s = pick(DEFECT_STATUS, status);
  return <StatusBadge variant={s.variant}>{s.label}</StatusBadge>;
}

// Small counters for things needing attention on a vehicle or driver.
export function AttentionChips({ attention }) {
  if (!attention) return null;
  const chips = [];
  if (attention.maintenanceOverdue) chips.push(['danger', `${attention.maintenanceOverdue} service overdue`]);
  if (attention.maintenanceDueSoon) chips.push(['warning', `${attention.maintenanceDueSoon} service due`]);
  if (attention.documentsExpired) chips.push(['danger', `${attention.documentsExpired} doc expired`]);
  if (attention.documentsExpiring) chips.push(['warning', `${attention.documentsExpiring} doc expiring`]);
  if (attention.openDefects) chips.push(['danger', `${attention.openDefects} defect${attention.openDefects > 1 ? 's' : ''}`]);
  if (!chips.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map(([variant, text]) => <StatusBadge key={text} variant={variant}>{text}</StatusBadge>)}
    </span>
  );
}
