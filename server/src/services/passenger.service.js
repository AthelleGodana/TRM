import prisma from '../config/db.js';
import { env } from '../config/env.js';
import { DIRECTIONS, effectiveRide, loadRouteRides, localDateString } from './rides.js';
import { stopTimeMap } from './timetable.js';

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
    route: bus.route ? {
      id: bus.route.id, name: bus.route.name, pickupPoints: bus.route.pickupPoints,
      schoolArrival: bus.route.schoolArrival, schoolDeparture: bus.route.schoolDeparture,
      geometry: bus.route.geometry, legs: bus.route.legs,
      distanceMeters: bus.route.distanceMeters, durationSeconds: bus.route.durationSeconds,
    } : null,
  };
}

// What the tracking screen needs about the passenger: today's pickup and
// drop-off (stop, run and the time the run reaches that stop), taking
// one-day changes into account. morningStopId / eveningStopId / bookedSlot
// are kept for older clients.
export async function passengerTrip(student) {
  const day = localDateString();
  const rides = { PICKUP: null, DROPOFF: null };
  if (student.routeId) {
    const ctx = await loadRouteRides(prisma, student.routeId, day, day);
    if (ctx) {
      for (const direction of DIRECTIONS) {
        const booking = ctx.bookings.find((b) => b.studentId === student.id && b.direction === direction);
        const ex = ctx.exceptions.find((e) => e.studentId === student.id && e.direction === direction);
        const ride = effectiveRide(booking, ex, ctx.slotsById, day);
        if (!ride.slotId) { rides[direction] = { status: ride.source }; continue; }
        const slot = ctx.slotsById.get(ride.slotId);
        rides[direction] = {
          status: ride.source,
          stopId: ride.pickupPointId,
          label: slot.label,
          time: stopTimeMap(ctx.route, slot, { dwellSeconds: env.rides.stopDwellSeconds })[ride.pickupPointId] || slot.time,
        };
      }
    }
  }
  const pickup = rides.PICKUP?.stopId ? rides.PICKUP : null;
  return {
    today: rides,
    morningStopId: pickup?.stopId ?? student.arrivePickupPointId ?? null,
    eveningStopId: rides.DROPOFF?.stopId ?? student.departPickupPointId ?? null,
    bookedSlot: pickup ? { time: pickup.time, label: pickup.label } : null,
  };
}
