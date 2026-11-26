import { formatKm, plural } from '../utils/format';
// Labels and badge colours for fleet-management values, in one place.

export const VEHICLE_STATUS = {
  OPERATIONAL: { label: 'Available', variant: 'success' },
  IN_SERVICE: { label: 'On a trip', variant: 'info' },
  OUT_OF_FUEL: { label: 'Out of fuel', variant: 'warning' },
  IN_MAINTENANCE: { label: 'In maintenance', variant: 'warning' },
  OUT_OF_SERVICE: { label: 'Off the road', variant: 'danger' },
};

export const VEHICLE_TYPES = {
  BUS: 'Bus', MINIBUS: 'Minibus', VAN: 'Van', CAR: 'Car', PICKUP: 'Pickup', TRUCK: 'Truck', MOTORCYCLE: 'Motorcycle', OTHER: 'Other',
};

export const FUEL_TYPES = { DIESEL: 'Diesel', PETROL: 'Petrol', ELECTRIC: 'Electric', HYBRID: 'Hybrid', CNG: 'CNG', LPG: 'LPG' };
export const OWNERSHIP = { OWNED: 'Owned', LEASED: 'Leased', RENTED: 'Rented' };

export const DRIVER_STATUS = {
  ACTIVE: { label: 'Active', variant: 'success' },
  ON_LEAVE: { label: 'On leave', variant: 'info' },
  SUSPENDED: { label: 'Suspended', variant: 'danger' },
  INACTIVE: { label: 'Inactive', variant: 'neutral' },
};

export const DOCUMENT_KINDS = {
  INSURANCE: 'Insurance',
  REGISTRATION: 'Registration (logbook)',
  INSPECTION_CERT: 'Inspection certificate',
  ROAD_LICENSE: 'Road licence',
  DRIVER_LICENSE: 'Driving licence',
  PSV_BADGE: 'PSV badge',
  MEDICAL: 'Medical certificate',
  OTHER: 'Other',
};
export const VEHICLE_DOCUMENT_KINDS = ['INSURANCE', 'REGISTRATION', 'INSPECTION_CERT', 'ROAD_LICENSE', 'OTHER'];
export const DRIVER_DOCUMENT_KINDS = ['DRIVER_LICENSE', 'PSV_BADGE', 'MEDICAL', 'OTHER'];

export const EXPIRY = {
  EXPIRED: { label: 'Expired', variant: 'danger' },
  EXPIRING: { label: 'Expiring soon', variant: 'warning' },
  VALID: { label: 'Valid', variant: 'success' },
  NONE: { label: 'No expiry', variant: 'neutral' },
};

export const DUE = {
  OVERDUE: { label: 'Overdue', variant: 'danger' },
  DUE_SOON: { label: 'Due soon', variant: 'warning' },
  OK: { label: 'OK', variant: 'success' },
};

export const SERVICE_TYPES = { SERVICE: 'Service', REPAIR: 'Repair', TYRES: 'Tyres', INSPECTION: 'Inspection', OTHER: 'Other' };

export const SEVERITY = {
  LOW: { label: 'Low', variant: 'neutral' },
  MEDIUM: { label: 'Medium', variant: 'info' },
  HIGH: { label: 'High', variant: 'warning' },
  CRITICAL: { label: 'Critical', variant: 'danger' },
};

export const DEFECT_STATUS = {
  OPEN: { label: 'Open', variant: 'danger' },
  IN_PROGRESS: { label: 'In progress', variant: 'warning' },
  RESOLVED: { label: 'Resolved', variant: 'success' },
};

export const WEEKDAYS = [
  { value: 1, short: 'Mon' }, { value: 2, short: 'Tue' }, { value: 3, short: 'Wed' }, { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' }, { value: 6, short: 'Sat' }, { value: 7, short: 'Sun' },
];

export const options = (map) => Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));

// Formatting lives in utils/format.js; re-exported for existing imports.
export { formatDate, formatKm, formatMoney, formatNumber, plural } from '../utils/format';
export const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const apiError = (err, fallback) => err?.response?.data?.error || fallback;

// "Due in 3 days / 420 km", "Overdue by 2 days", for a schedule's due state.
export function describeDue(due) {
  if (!due) return '';
  const parts = [];
  if (due.kmLeft != null) parts.push(due.kmLeft <= 0 ? `${formatKm(Math.abs(due.kmLeft))} over` : `${formatKm(due.kmLeft)} left`);
  if (due.daysLeft != null) parts.push(due.daysLeft < 0 ? `${plural(Math.abs(due.daysLeft), 'day')} late` : `${plural(due.daysLeft, 'day')} left`);
  return parts.join(' · ');
}
