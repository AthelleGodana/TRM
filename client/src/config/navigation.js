import {
  Bus, CalendarClock, CarFront, CreditCard, FileCheck, Fuel, GraduationCap, House, IdCard, LayoutDashboard, Map,
  MapPin, Navigation, Radar, User, Users, Wallet, Wrench,
} from 'lucide-react';

// Menus are driven by the user's role and the organisation's feature
// flags, never by checking the organisation profile. Profile-specific
// wording (e.g. "Pupils" vs "Students", "Vehicles" vs "Buses") comes from
// the session, which the server derives from its single role/profile map.
const STAFF = ['ORG_ADMIN', 'FLEET_MANAGER'];

// Staff area pages, routed under /admin/<to>. `short` is the bottom-tab label.
export const ADMIN_MENU = [
  { to: 'live', label: 'Live map', short: 'Live', icon: Radar, roles: STAFF, description: 'Where every vehicle is right now' },
  {
    to: 'buses', label: (s) => s.organization?.vehiclesLabel || 'Vehicles', short: 'Fleet', icon: Bus, roles: STAFF,
    description: 'Vehicles, drivers, status and history',
  },
  { to: 'drivers', label: 'Drivers', icon: IdCard, roles: STAFF, description: 'Profiles, licences and assignments' },
  { to: 'maintenance', label: 'Maintenance', short: 'Service', icon: Wrench, roles: STAFF, description: 'Services due, history and defects' },
  { to: 'compliance', label: 'Documents', short: 'Docs', icon: FileCheck, roles: STAFF, description: 'Insurance, licences and expiry dates' },
  { to: 'routes', label: 'Routes & Runs', short: 'Routes', icon: Map, roles: STAFF, description: 'Routes, stops and scheduled runs' },
  {
    to: 'students', label: (s) => s.organization?.passengerLabel || 'Passengers', icon: GraduationCap, roles: STAFF,
    feature: 'passengers', description: 'Passenger records and routes',
  },
  { to: 'fuel', label: 'Fuel Hub', short: 'Fuel', icon: Fuel, roles: STAFF, feature: 'fuelHub', description: 'Fuel records, cards and insights' },
  { to: 'members', label: 'People & Access', short: 'People', icon: Users, roles: ['ORG_ADMIN'], description: 'Members, invitations and requests' },
  {
    to: 'billing', label: 'Billing & Revenue', short: 'Billing', icon: Wallet, roles: ['ORG_ADMIN'], feature: 'studentBilling',
    description: 'Passenger payments and revenue',
  },
];

export const ADMIN_HOME = { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true };

export const STUDENT_MENU = [
  { to: '/student', label: 'Home', icon: House, end: true },
  { to: '/student/rides', label: 'My rides', short: 'Rides', icon: CalendarClock },
  { to: '/student/track', label: 'Track my bus', short: 'Track', icon: MapPin },
  { to: '/student/payments', label: 'Payments', short: 'Pay', icon: CreditCard },
  { to: '/student/profile', label: 'Profile', icon: User },
];

// Driver tabs. Location sharing keeps running whichever tab is open.
export const DRIVER_MENU = [
  { to: '/driver', label: 'Drive', icon: Navigation, end: true },
  { to: '/driver/map', label: 'Route map', short: 'Map', icon: Map },
  { to: '/driver/vehicle', label: 'My vehicle', short: 'Vehicle', icon: CarFront },
  { to: '/driver/fuel', label: 'Fuel', icon: Fuel, feature: 'fuelHub' },
  { to: '/driver/me', label: 'Me', icon: User },
];

export function canSee(item, session) {
  if (!session) return false;
  if (item.roles && !item.roles.includes(session.role)) return false;
  if (item.feature && !session.organization?.features?.[item.feature]) return false;
  return true;
}

export function visibleMenu(items, session) {
  return items
    .filter((item) => canSee(item, session))
    .map((item) => ({ ...item, label: typeof item.label === 'function' ? item.label(session) : item.label }));
}
