// Maps each role to the area of the app it lands in. Menus inside each
// area are driven by role + organisation feature flags (see navigation.js
// once added), never by organisation-profile checks.
export const ROLE_HOME = {
  SUPER_ADMIN: '/platform',
  ORG_ADMIN: '/admin',
  FLEET_MANAGER: '/admin',
  DRIVER: '/driver',
  STUDENT: '/student',
  PARENT: '/parent',
};

export function homeForRole(role) {
  return ROLE_HOME[role] || '/login';
}
