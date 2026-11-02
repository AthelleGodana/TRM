import {
  Bus, CreditCard, Fuel, GraduationCap, House, IdCard, LayoutDashboard, Map, MapPin, Radar, Route, User, Users, Wallet,
} from 'lucide-react';

// Menus are driven by the user's role and the organisation's feature
// flags, never by checking the organisation profile. Profile-specific
// wording (e.g. "Pupils" vs "Students") comes from the session, which the
// server derives from its single role/profile map.
const STAFF = ['ORG_ADMIN', 'FLEET_MANAGER'];

// Staff area pages, routed under /admin/<to>. `short` is the bottom-tab label.
export const ADMIN_MENU = [
  { to: 'live', label: 'Live map', short: 'Live', icon: Radar, roles: STAFF, description: 'Where every vehicle is right now' },
  { to: 'routes', label: 'Routes & Stops', short: 'Routes', icon: Map, roles: STAFF, description: 'Routes, stops and timings' },
  { to: 'buses', label: 'Fleet', icon: Bus, roles: STAFF, description: 'Vehicles, capacity and status' },
  { to: 'drivers', label: 'Drivers', icon: IdCard, roles: STAFF, description: 'Drivers and assignments' },
  {
    to: 'students', label: (s) => s.organization?.passengerLabel || 'Passengers', icon: GraduationCap, roles: STAFF,
    description: 'Passenger records and routes',
  },
  { to: 'fuel', label: 'Fuel Hub', short: 'Fuel', icon: Fuel, roles: STAFF, feature: 'fuelHub', description: 'Fuel records, cards and insights' },
  { to: 'members', label: 'People & Access', short: 'People', icon: Users, roles: ['ORG_ADMIN'], description: 'Members, invitations and requests' },
  { to: 'billing', label: 'Billing & Revenue', short: 'Billing', icon: Wallet, roles: ['ORG_ADMIN'], description: 'Payments and revenue' },
];

export const ADMIN_HOME = { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true };

export const STUDENT_MENU = [
  { to: '/student', label: 'Home', icon: House, end: true },
  { to: '/student/track', label: 'Track my bus', short: 'Track', icon: MapPin },
  { to: '/student/register-route', label: 'My route', short: 'Route', icon: Route },
  { to: '/student/payments', label: 'Payments', short: 'Pay', icon: CreditCard },
  { to: '/student/profile', label: 'Profile', icon: User },
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
