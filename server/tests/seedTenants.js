import { createMember, createOrg, db } from './helpers.js';

// Seeds one organisation with a full set of data. Every name, plate and
// label contains `marker`, so tests can assert that a marker never appears
// in another tenant's responses.
export async function seedTenant(marker, orgOverrides = {}) {
  const org = await createOrg({ name: `Org ${marker}`, ...orgOverrides });
  const admin = await createMember(org, 'ORG_ADMIN', { firstName: `Admin${marker}` });
  const officer = await createMember(org, 'FLEET_MANAGER', { firstName: `Officer${marker}` });
  const driver = await createMember(org, 'DRIVER', { firstName: `Driver${marker}` });
  const student = await createMember(org, 'STUDENT', { firstName: `Student${marker}` });

  const route = await db.route.create({
    data: {
      organizationId: org.id,
      name: `Route ${marker}`,
      pickupPoints: { create: [{ organizationId: org.id, name: `Stop ${marker}`, tier: 'TOWN' }] },
    },
    include: { pickupPoints: true },
  });
  const point = route.pickupPoints[0];
  const bus = await db.bus.create({
    data: {
      organizationId: org.id, licensePlate: `KDA ${marker}`,
      driverId: driver.profile.id, routeId: route.id,
    },
  });
  await db.student.update({
    where: { id: student.profile.id },
    data: { routeId: route.id, arrivePickupPointId: point.id, address: `Addr ${marker}` },
  });
  const slot = await db.pickupSlot.create({
    data: {
      organizationId: org.id, routeId: route.id, busId: bus.id, time: '06:30', label: `Slot ${marker}`,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    },
  });
  // The student's standing pickup on that run.
  await db.rideBooking.create({
    data: { organizationId: org.id, studentId: student.profile.id, direction: 'PICKUP', slotId: slot.id, pickupPointId: point.id },
  });
  await db.tripRoster.create({
    data: { organizationId: org.id, busId: bus.id, slotId: slot.id, studentId: student.profile.id },
  });
  await db.vehicleLog.create({
    data: { organizationId: org.id, busId: bus.id, type: 'FUEL', fuelLiters: 40, fuelCost: 7200, odometer: 1000, notes: `Log ${marker}` },
  });
  await db.gpsLog.create({ data: { organizationId: org.id, busId: bus.id, lat: -1.28, lng: 36.82 } });
  await db.payment.create({
    data: { organizationId: org.id, studentId: student.profile.id, amount: 1500, status: 'PAID', mpesaReceipt: `REC${marker}` },
  });

  const invitation = await db.invitation.create({
    data: { organizationId: org.id, email: `invite-${marker.toLowerCase()}@test.example`, role: 'DRIVER', expiresAt: new Date(Date.now() + 864e5) },
  });
  const requester = await db.user.create({ data: { firstName: `Requester${marker}`, lastName: 'X', email: `req-${marker.toLowerCase()}@test.example` } });
  const accessRequest = await db.accessRequest.create({
    data: { organizationId: org.id, userId: requester.id, message: `Please ${marker}` },
  });

  // Fleet management records.
  await db.vehicleAssignment.create({ data: { organizationId: org.id, busId: bus.id, driverId: driver.profile.id } });
  const schedule = await db.maintenanceSchedule.create({
    data: { organizationId: org.id, busId: bus.id, name: `Service ${marker}`, intervalKm: 5000, lastDoneOdometer: 0 },
  });
  const service = await db.serviceRecord.create({
    data: { organizationId: org.id, busId: bus.id, scheduleId: schedule.id, description: `Work ${marker}`, servicedAt: new Date() },
  });
  const defect = await db.defectReport.create({
    data: { organizationId: org.id, busId: bus.id, driverId: driver.profile.id, description: `Defect ${marker}` },
  });
  const document = await db.document.create({
    data: { organizationId: org.id, entityType: 'VEHICLE', busId: bus.id, kind: 'INSURANCE', number: `DOC ${marker}` },
  });

  return {
    org, admin, officer, driver, student, route, point, bus, slot, invitation, accessRequest,
    schedule, service, defect, document,
  };
}

// Snapshot of every tenant-owned row for an organisation, used to prove
// that nothing was modified by another tenant's requests.
export async function snapshotTenant(organizationId) {
  const where = { where: { organizationId }, orderBy: { id: 'asc' } };
  const [students, drivers, routes, points, buses, slots, rosters, logs, gps, payments, memberships, invitations, accessRequests] = await Promise.all([
    db.student.findMany(where), db.driver.findMany(where), db.route.findMany(where),
    db.pickupPoint.findMany(where), db.bus.findMany(where), db.pickupSlot.findMany(where),
    db.tripRoster.findMany(where), db.vehicleLog.findMany(where), db.gpsLog.findMany(where),
    db.payment.findMany(where), db.membership.findMany(where),
    db.invitation.findMany(where), db.accessRequest.findMany(where),
  ]);
  const [assignments, schedules, services, defects, documents, rideBookings, rideExceptions] = await Promise.all([
    db.vehicleAssignment.findMany(where), db.maintenanceSchedule.findMany(where), db.serviceRecord.findMany(where),
    db.defectReport.findMany(where), db.document.findMany(where), db.rideBooking.findMany(where),
    db.rideException.findMany(where),
  ]);
  return JSON.parse(JSON.stringify({
    students, drivers, routes, points, buses, slots, rosters, logs, gps, payments, memberships,
    invitations, accessRequests,
    assignments, schedules, services, defects, documents, rideBookings, rideExceptions,
  }));
}
