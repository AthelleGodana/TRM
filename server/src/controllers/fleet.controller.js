import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { expiryStatus, scheduleStatus, userName } from '../services/fleet.js';

// The admin dashboard's numbers: fleet availability and health, what needs
// attention (overdue services, expiring documents and licences, open
// defects), fuel and cost efficiency and, for passenger organisations,
// seat utilisation.
export const getFleetOverview = asyncHandler(async (req, res) => {
  const [buses, routes, students, slots, logs, drivers, documents, defects] = await Promise.all([
    prisma.bus.findMany({
      where: { archivedAt: null },
      include: {
        driver: { include: { user: { select: { firstName: true, lastName: true } } } },
        gpsLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
        maintenanceSchedules: { where: { active: true } },
      },
    }),
    prisma.route.findMany({ include: { buses: { where: { archivedAt: null } }, students: { select: { id: true } } } }),
    prisma.student.findMany({ select: { id: true, routeId: true } }),
    prisma.pickupSlot.findMany({ where: { isActive: true }, include: { _count: { select: { rideBookings: true } } } }),
    prisma.vehicleLog.findMany({ where: { type: 'FUEL' } }),
    prisma.driver.findMany({ include: { user: { select: { firstName: true, lastName: true } } } }),
    prisma.document.findMany({
      where: { expiresAt: { not: null } },
      include: {
        bus: { select: { id: true, licensePlate: true } },
        driver: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    }),
    prisma.defectReport.findMany({
      where: { status: { not: 'RESOLVED' } },
      include: { bus: { select: { id: true, licensePlate: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const now = new Date();

  // ── Fleet status ─────────────────────────────────────────────────────
  const byStatus = {};
  const byType = {};
  for (const b of buses) {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    byType[b.vehicleType] = (byType[b.vehicleType] || 0) + 1;
  }
  const available = buses.filter((b) => ['OPERATIONAL', 'IN_SERVICE'].includes(b.status)).length;
  const availabilityPct = buses.length ? Math.round((available / buses.length) * 100) : 0;
  const activeBuses = buses.filter((b) => {
    const last = b.gpsLogs[0]?.recordedAt;
    return last && now - new Date(last).getTime() < 30 * 60 * 1000;
  }).length;

  // ── Needs attention ──────────────────────────────────────────────────
  const attention = [];
  let maintenanceOverdue = 0;
  let maintenanceDueSoon = 0;
  for (const b of buses) {
    for (const s of b.maintenanceSchedules) {
      const due = scheduleStatus(s, b.odometerKm, now);
      if (due.status === 'OVERDUE') maintenanceOverdue += 1;
      if (due.status === 'DUE_SOON') maintenanceDueSoon += 1;
      if (due.status !== 'OK') {
        attention.push({
          kind: 'MAINTENANCE', level: due.status === 'OVERDUE' ? 'danger' : 'warning',
          title: `${s.name} ${due.status === 'OVERDUE' ? 'overdue' : 'due soon'}`,
          subject: b.licensePlate, busId: b.id, due,
        });
      }
    }
  }
  const docStatus = documents.map((d) => ({ d, status: expiryStatus(d.expiresAt, now) }));
  for (const { d, status } of docStatus) {
    if (status === 'EXPIRED' || status === 'EXPIRING') {
      attention.push({
        kind: 'DOCUMENT', level: status === 'EXPIRED' ? 'danger' : 'warning',
        title: `${d.title || d.kind.replace(/_/g, ' ').toLowerCase()} ${status === 'EXPIRED' ? 'expired' : 'expiring'}`,
        subject: d.bus?.licensePlate || (d.driver ? userName(d.driver.user) : ''),
        busId: d.busId, driverId: d.driverId, documentId: d.id, expiresAt: d.expiresAt,
      });
    }
  }
  const licence = drivers.map((d) => ({ d, status: expiryStatus(d.licenseExpiry, now) }));
  for (const { d, status } of licence) {
    if (status === 'EXPIRED' || status === 'EXPIRING') {
      attention.push({
        kind: 'LICENCE', level: status === 'EXPIRED' ? 'danger' : 'warning',
        title: `Driving licence ${status === 'EXPIRED' ? 'expired' : 'expiring'}`,
        subject: userName(d.user), driverId: d.id, expiresAt: d.licenseExpiry,
      });
    }
  }
  for (const d of defects) {
    attention.push({
      kind: 'DEFECT', level: ['HIGH', 'CRITICAL'].includes(d.severity) ? 'danger' : 'warning',
      title: `${d.severity.toLowerCase()} defect: ${d.description.slice(0, 80)}`,
      subject: d.bus.licensePlate, busId: d.busId, defectId: d.id, createdAt: d.createdAt,
    });
  }
  attention.sort((a, b) => (a.level === b.level ? 0 : a.level === 'danger' ? -1 : 1));

  // ── Passenger seat utilisation ───────────────────────────────────────
  const utilizationByRoute = routes.map((r) => {
    const capacity = r.buses.reduce((sum, b) => sum + (b.capacity || 30), 0);
    const occupied = r.students.length;
    return {
      routeId: r.id, routeName: r.name, capacity, occupied,
      utilization: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
    };
  });
  const totalCapacity = utilizationByRoute.reduce((s, r) => s + r.capacity, 0);
  const totalOccupied = utilizationByRoute.reduce((s, r) => s + r.occupied, 0);
  const fleetUtilization = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
  const slotCapacity = slots.reduce((s, slot) => s + slot.capacity, 0);
  const slotOccupancy = slotCapacity ? Math.round((slots.reduce((s, slot) => s + slot._count.rideBookings, 0) / slotCapacity) * 100) : 0;

  // ── Fuel & cost efficiency ───────────────────────────────────────────
  // Distance is the odometer spread of each vehicle's own fuel logs, added
  // up across vehicles (readings from different vehicles never mix).
  const totalFuelLiters = logs.reduce((s, l) => s + (l.fuelLiters || 0), 0);
  const totalFuelCost = logs.reduce((s, l) => s + Number(l.fuelCost || 0), 0);
  const readings = new Map();
  for (const l of logs) {
    if (l.odometer == null) continue;
    const list = readings.get(l.busId) || [];
    list.push(l.odometer);
    readings.set(l.busId, list);
  }
  let totalDistanceKm = 0;
  for (const list of readings.values()) {
    if (list.length >= 2) totalDistanceKm += Math.max(...list) - Math.min(...list);
  }
  const avgFuelConsumption = totalDistanceKm > 0 ? (totalFuelLiters / totalDistanceKm) * 100 : 0;
  const costPerStudent = totalOccupied > 0 ? totalFuelCost / totalOccupied : 0;

  const operational = byStatus.OPERATIONAL || 0;
  res.json({
    totalBuses: buses.length,
    totalStudents: students.length,
    totalDrivers: drivers.length,
    fleet: { byStatus, byType, available, availabilityPct, activeNow: activeBuses },
    maintenance: { overdue: maintenanceOverdue, dueSoon: maintenanceDueSoon },
    documents: {
      expired: docStatus.filter((x) => x.status === 'EXPIRED').length,
      expiring: docStatus.filter((x) => x.status === 'EXPIRING').length,
    },
    drivers: {
      total: drivers.length,
      active: drivers.filter((d) => d.status === 'ACTIVE').length,
      unassigned: drivers.filter((d) => d.status === 'ACTIVE' && !buses.some((b) => b.driverId === d.id)).length,
      licenseExpired: licence.filter((x) => x.status === 'EXPIRED').length,
      licenseExpiring: licence.filter((x) => x.status === 'EXPIRING').length,
    },
    defects: { open: defects.length, critical: defects.filter((d) => d.severity === 'CRITICAL').length },
    attention: attention.slice(0, 50),
    fleetUtilization,
    utilizationByRoute,
    onTimePerformance: buses.length ? Math.round((activeBuses / buses.length) * 100) : 0,
    fuel: { totalFuelLiters, totalFuelCost, avgFuelConsumption, costPerStudent, totalDistanceKm },
    fleetHealth: {
      operational,
      inService: byStatus.IN_SERVICE || 0,
      outOfFuel: byStatus.OUT_OF_FUEL || 0,
      inMaintenance: byStatus.IN_MAINTENANCE || 0,
      outOfService: byStatus.OUT_OF_SERVICE || 0,
      healthyRatio: availabilityPct,
      total: buses.length,
    },
    slotOccupancy,
  });
});
