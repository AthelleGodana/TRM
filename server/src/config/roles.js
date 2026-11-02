// Single source of truth for which roles each organisation profile allows,
// and how they are labelled. Roles are shared across the platform; the
// profile only narrows the set. Enforced server-side on sign-in, on every
// authenticated request, on invitations and on access-request approval.
// SUPER_ADMIN is platform-level (User.isSuperAdmin) and belongs to no org.
export const PROFILE_ROLES = {
  UNIVERSITY: {
    ORG_ADMIN: 'Organisation admin',
    FLEET_MANAGER: 'Transport officer',
    DRIVER: 'Driver',
    STUDENT: 'Student',
  },
  SCHOOL: {
    ORG_ADMIN: 'Organisation admin',
    FLEET_MANAGER: 'Transport officer',
    DRIVER: 'Driver',
    PARENT: 'Parent',
  },
  COMPANY: {
    ORG_ADMIN: 'Organisation admin',
    FLEET_MANAGER: 'Fleet manager',
    DRIVER: 'Driver',
  },
};

// What passenger records are called in each profile. SCHOOL pupils are
// passenger records linked to parents, not user accounts.
export const PASSENGER_LABELS = {
  UNIVERSITY: 'Students',
  SCHOOL: 'Pupils',
  COMPANY: 'Passengers',
};

export const SUPER_ADMIN = 'SUPER_ADMIN';

// Roles that manage the organisation's fleet and see every vehicle.
export const STAFF_ROLES = ['ORG_ADMIN', 'FLEET_MANAGER'];

export function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

export function isRoleAllowed(profile, role) {
  return Boolean(PROFILE_ROLES[profile]?.[role]);
}

export function rolesForProfile(profile) {
  return Object.entries(PROFILE_ROLES[profile] || {}).map(([role, label]) => ({ role, label }));
}

export function roleLabel(profile, role) {
  if (role === SUPER_ADMIN) return 'Platform admin';
  return PROFILE_ROLES[profile]?.[role] || role;
}
