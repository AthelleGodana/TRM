import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { canAccessPickupPoint } from '../utils/tier.js';

async function getStudentByUserId(userId) {
  return prisma.student.findUnique({ where: { userId } });
}

export const getProfile = asyncHandler(async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    include: {
      arrivePickupPoint: true,
      departPickupPoint: true,
      route: true,
      user: { select: { firstName: true, lastName: true, username: true } },
    },
  });
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });
  res.json({ student });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { address, phone, email } = req.body;
  const student = await getStudentByUserId(req.user.id);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const updated = await prisma.student.update({
    where: { id: student.id },
    data: { address, phone, email },
  });
  res.json({ student: updated, message: 'Information updated successfully.' });
});

export const listRoutes = asyncHandler(async (req, res) => {
  const routes = await prisma.route.findMany({
    where: { isActive: true },
    include: { pickupPoints: true },
    orderBy: { name: 'asc' },
  });
  res.json({ routes });
});

// Registers a student onto a route with a chosen arrival/departure pickup point.
// Enforces the tiered pickup point rule: a student may only select a pickup
// point whose tier is at or below their paid tier (ADAMS > LAVINGTON > TOWN).
export const registerRoute = asyncHandler(async (req, res) => {
  const { routeId, arrivePickupPointId, departPickupPointId } = req.body;

  const student = await getStudentByUserId(req.user.id);
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  // Explicitly map string IDs to integers to prevent Prisma input type errors
  const pointIds = [arrivePickupPointId, departPickupPointId]
    .filter(Boolean)
    .map((id) => Number(id));

  if (pointIds.length === 0) {
    return res.status(400).json({ error: 'Select at least one pickup point.' });
  }

  const points = await prisma.pickupPoint.findMany({
    where: { id: { in: pointIds }, routeId: Number(routeId) },
  });

  if (points.length !== pointIds.length) {
    return res.status(400).json({ error: 'One or more pickup points are invalid for this route.' });
  }

  for (const point of points) {
    if (!canAccessPickupPoint(student.paymentTier, point.tier)) {
      return res.status(403).json({
        error: `Your payment tier (${student.paymentTier}) does not permit access to the "${point.name}" pickup point (${point.tier}). Upgrade your payment tier to access this stop.`,
      });
    }
  }

  const updated = await prisma.student.update({
    where: { id: student.id },
    data: {
      routeId: Number(routeId),
      arrivePickupPointId: arrivePickupPointId ? Number(arrivePickupPointId) : null,
      departPickupPointId: departPickupPointId ? Number(departPickupPointId) : null,
    },
    include: { arrivePickupPoint: true, departPickupPoint: true, route: true },
  });

  res.json({ student: updated, message: 'Route registration successful.' });
});

// Returns the live bus assigned to the student's route, including its most
// recent GPS position, so the client can render it on the map.
export const getMyBus = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user.id);
  if (!student || !student.routeId) {
    return res.status(404).json({ error: 'You are not registered on a route yet.' });
  }

  const bus = await prisma.bus.findFirst({
    where: { routeId: student.routeId },
    include: {
      driver: { include: { user: { select: { firstName: true, lastName: true } } } },
      gpsLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
      route: { include: { pickupPoints: { orderBy: { order: 'asc' } } } },
    },
  });

  if (!bus) return res.status(404).json({ error: 'No bus assigned to your route yet.' });

  res.json({
    bus: {
      id: bus.id,
      licensePlate: bus.licensePlate,
      driver: bus.driver
        ? `${bus.driver.user.firstName} ${bus.driver.user.lastName}`
        : null,
      lastLocation: bus.gpsLogs[0] || null,
      route: bus.route ? { id: bus.route.id, name: bus.route.name, pickupPoints: bus.route.pickupPoints } : null,
    },
  });
});