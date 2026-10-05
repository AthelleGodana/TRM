import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Aggregates fleet-wide operational metrics for the admin dashboard:
// fleet utilization, on-time performance, fuel & cost efficiency, and
// the active-operational fleet health ratio.
export const getFleetOverview = asyncHandler(async (req, res) => {
  const [buses, routes, students, slots, logs] = await Promise.all([
    prisma.bus.findMany({
      include: {
        route: { include: { students: true, slots: true } },
        gpsLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
    }),
    prisma.route.findMany({ include: { buses: true, students: true } }),
    prisma.student.findMany({ select: { id: true, routeId: true } }),
    prisma.pickupSlot.findMany(),
    prisma.vehicleLog.findMany(),
  ]);

  // ── Fleet utilization (seat occupancy per route) ────────────────────
  const utilizationByRoute = routes.map((r) => {
    const capacity = r.buses.reduce((sum, b) => sum + (b.capacity || 30), 0);
    const occupied = r.students.length;
    return {
      routeId: r.id,
      routeName: r.name,
      capacity,
      occupied,
      utilization: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
    };
  });

  const totalCapacity = utilizationByRoute.reduce((s, r) => s + r.capacity, 0);
  const totalOccupied = utilizationByRoute.reduce((s, r) => s + r.occupied, 0);
  const fleetUtilization = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  // ── On-time performance (proxy: GPS activity vs. expected trip window) ─
  // We estimate OTP from the ratio of buses that have recent GPS pings
  // (i.e. actively running on schedule) to total buses.
  const now = Date.now();
  const activeBuses = buses.filter((b) => {
    const last = b.gpsLogs[0]?.recordedAt;
    return last && now - new Date(last).getTime() < 30 * 60 * 1000; // last 30 min
  }).length;
  const onTimePerformance = buses.length > 0 ? Math.round((activeBuses / buses.length) * 100) : 0;

  // ── Fuel & cost efficiency ───────────────────────────────────────────
  const fuelLogs = logs.filter((l) => l.type === 'FUEL');
  const totalFuelLiters = fuelLogs.reduce((s, l) => s + (l.fuelLiters || 0), 0);
  const totalFuelCost = fuelLogs.reduce((s, l) => s + Number(l.fuelCost || 0), 0);
  // Track total distance from odometer deltas when available.
  let totalDistanceKm = 0;
  const odometers = fuelLogs
    .filter((l) => l.odometer != null)
    .map((l) => l.odometer)
    .sort((a, b) => a - b);
  if (odometers.length >= 2) {
    totalDistanceKm = odometers[odometers.length - 1] - odometers[0];
  }
  const avgFuelConsumption =
    totalDistanceKm > 0 ? (totalFuelLiters / totalDistanceKm) * 100 : 0; // L/100km
  const costPerStudent = totalCapacity > 0 ? totalFuelCost / totalOccupied : 0;

  // ── Fleet health ratio ───────────────────────────────────────────────
  const operational = buses.filter((b) => b.status === 'OPERATIONAL').length;
  const inService = buses.filter((b) => b.status === 'IN_SERVICE').length;
  const outOfFuel = buses.filter((b) => b.status === 'OUT_OF_FUEL').length;
  const healthyRatio = buses.length > 0 ? Math.round((operational / buses.length) * 100) : 0;

  // ── Slot capacity utilisation ────────────────────────────────────────
  const slotOccupancy =
    slots.length > 0
      ? Math.round(
          (slots.reduce((s, slot) => s + slot.bookedCount, 0) /
            slots.reduce((s, slot) => s + slot.capacity, 0)) *
            100
        )
      : 0;

  res.json({
    fleetUtilization,
    utilizationByRoute,
    onTimePerformance,
    fuel: {
      totalFuelLiters,
      totalFuelCost,
      avgFuelConsumption,
      costPerStudent,
      totalDistanceKm,
    },
    fleetHealth: { operational, inService, outOfFuel, healthyRatio, total: buses.length },
    slotOccupancy,
    totalStudents: students.length,
    totalBuses: buses.length,
  });
});
