import prisma from '../config/db.js';

// Passengers either have their own account (university students) or are
// records without one (school pupils, named on the Student row). This
// gives both the same `user` shape so screens can render either.
export function presentPassenger(student) {
  if (!student) return student;
  const user = student.user || { firstName: student.firstName || '', lastName: student.lastName || '', email: null };
  return { ...student, user, hasAccount: Boolean(student.userId) };
}

export function passengerName(student) {
  const { user } = presentPassenger(student);
  return `${user.firstName} ${user.lastName}`.trim();
}

// The live bus serving a route, in the shape the tracking screen expects.
export async function busForRoute(routeId) {
  if (!routeId) return null;
  const bus = await prisma.bus.findFirst({
    where: { routeId },
    include: {
      driver: { include: { user: { select: { firstName: true, lastName: true } } } },
      gpsLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
      route: { include: { pickupPoints: { orderBy: { order: 'asc' } } } },
    },
  });
  if (!bus) return null;
  return {
    id: bus.id,
    licensePlate: bus.licensePlate,
    driver: bus.driver ? `${bus.driver.user.firstName} ${bus.driver.user.lastName}` : null,
    lastLocation: bus.gpsLogs[0] || null,
    route: bus.route ? { id: bus.route.id, name: bus.route.name, pickupPoints: bus.route.pickupPoints } : null,
  };
}
