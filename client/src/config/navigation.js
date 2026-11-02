// Menus are driven by the user's role and the organisation's feature
// flags, never by checking the organisation profile. Profile-specific
// wording (e.g. "Pupils" vs "Students") comes from the session, which the
// server derives from its single role/profile map.
const STAFF = ['ORG_ADMIN', 'FLEET_MANAGER'];

export const ADMIN_MENU = [
  { to: 'routes', label: 'Routes & Stops', icon: '🗺️', gradient: 'from-primary-500 to-accent-cyan', roles: STAFF },
  { to: 'buses', label: 'Fleet Management', icon: '🚌', gradient: 'from-accent-violet to-primary-600', roles: STAFF },
  { to: 'drivers', label: 'Drivers', icon: '🧑‍✈️', gradient: 'from-emerald-500 to-accent-cyan', roles: STAFF },
  {
    to: 'students', label: (s) => s.organization?.passengerLabel || 'Passengers', icon: '🎓',
    gradient: 'from-accent-amber to-rose-500', roles: STAFF,
  },
  { to: 'fuel', label: 'Fuel Hub', icon: '⛽', gradient: 'from-lime-500 to-emerald-600', roles: STAFF, feature: 'fuelHub' },
  { to: 'members', label: 'People & Access', icon: '🪪', gradient: 'from-sky-500 to-primary-600', roles: ['ORG_ADMIN'] },
  { to: 'billing', label: 'Billing & Revenue', icon: '💰', gradient: 'from-rose-500 to-accent-violet', roles: ['ORG_ADMIN'] },
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
