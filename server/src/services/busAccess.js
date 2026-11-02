import prisma from '../config/db.js';
import { isStaff } from '../config/roles.js';

// Returns the bus if the caller may see its live position and history,
// otherwise null. Lookups go through the tenant client, so a bus from
// another organisation is never found. Staff see every bus in their
// organisation; drivers see their own bus; students see the bus on their
// route; parents see the bus on any of their children's routes.
export async function findViewableBus(user, busId) {
  const id = Number(busId);
  if (!Number.isInteger(id)) return null;

  const bus = await prisma.bus.findUnique({ where: { id } });
  if (!bus) return null;
  if (isStaff(user.role)) return bus;

  if (user.role === 'DRIVER') {
    const driver = await prisma.driver.findFirst({ where: { userId: user.id } });
    return driver && bus.driverId === driver.id ? bus : null;
  }
  if (user.role === 'STUDENT') {
    const student = await prisma.student.findFirst({ where: { userId: user.id } });
    return student?.routeId && student.routeId === bus.routeId ? bus : null;
  }
  if (user.role === 'PARENT') {
    const child = await prisma.passengerGuardian.findFirst({
      where: { userId: user.id, student: { routeId: bus.routeId ?? -1 } },
    });
    return child ? bus : null;
  }
  return null;
}

// The bus assigned to the calling driver, or null.
export async function findDriverBus(userId) {
  const driver = await prisma.driver.findFirst({ where: { userId } });
  if (!driver) return null;
  return prisma.bus.findFirst({ where: { driverId: driver.id } });
}
