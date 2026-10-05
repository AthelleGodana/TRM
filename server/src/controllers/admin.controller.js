import bcrypt from 'bcryptjs';
import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Routes & pickup points ──────────────────────────────────────────────
export const createRoute = asyncHandler(async (req, res) => {
  const { name, schoolArrival, schoolDeparture, pickupPoints } = req.body;
  if (!name) return res.status(400).json({ error: 'Route name is required.' });

  const route = await prisma.route.create({
    data: {
      name,
      schoolArrival,
      schoolDeparture,
      pickupPoints: {
        create: (pickupPoints || []).map((p, i) => ({
          name: p.name,
          tier: p.tier,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          order: i,
        })),
      },
    },
    include: { pickupPoints: true },
  });

  res.status(201).json({ route });
});

export const listRoutesAdmin = asyncHandler(async (req, res) => {
  const routes = await prisma.route.findMany({
    include: { pickupPoints: true, buses: true },
    orderBy: { id: 'desc' },
  });
  res.json({ routes });
});

// ── Buses ────────────────────────────────────────────────────────────────
export const createBus = asyncHandler(async (req, res) => {
  const { licensePlate, capacity, driverId, routeId } = req.body;
  if (!licensePlate) return res.status(400).json({ error: 'License plate is required.' });

  const bus = await prisma.bus.create({
    data: {
      licensePlate,
      capacity: capacity ? Number(capacity) : undefined,
      driverId: driverId ? Number(driverId) : null,
      routeId: routeId ? Number(routeId) : null,
    },
  });
  res.status(201).json({ bus });
});

// Used by the Fleet Management assignment modal to reassign a bus's
// driver and/or route without recreating the bus record.
export const updateBusAssignment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { driverId, routeId, capacity } = req.body;

  const bus = await prisma.bus.update({
    where: { id: Number(id) },
    data: {
      driverId: driverId === '' || driverId == null ? null : Number(driverId),
      routeId: routeId === '' || routeId == null ? null : Number(routeId),
      ...(capacity ? { capacity: Number(capacity) } : {}),
    },
    include: {
      driver: { include: { user: { select: { firstName: true, lastName: true } } } },
      route: true,
    },
  });

  res.json({ bus });
});

export const listBuses = asyncHandler(async (req, res) => {
  const buses = await prisma.bus.findMany({
    include: {
      driver: { include: { user: { select: { firstName: true, lastName: true } } } },
      route: true,
    },
    orderBy: { id: 'desc' },
  });
  res.json({ buses });
});

// ── Drivers & students ──────────────────────────────────────────────────
export const listDrivers = asyncHandler(async (req, res) => {
  const drivers = await prisma.driver.findMany({
    include: { user: { select: { firstName: true, lastName: true, username: true } } },
  });
  res.json({ drivers });
});

export const listStudents = asyncHandler(async (req, res) => {
  const students = await prisma.student.findMany({
    include: {
      user: { select: { firstName: true, lastName: true, username: true } },
      route: true,
    },
  });
  res.json({ students });
});

export const removeStudents = asyncHandler(async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: 'studentIds must be a non-empty array.' });
  }

  const students = await prisma.student.findMany({
    where: { id: { in: studentIds.map(Number) } },
    select: { userId: true },
  });

  await prisma.user.deleteMany({ where: { id: { in: students.map((s) => s.userId) } } });

  res.json({ message: 'Selected students removed.' });
});

export const removeDrivers = asyncHandler(async (req, res) => {
  const { driverIds } = req.body;
  if (!Array.isArray(driverIds) || driverIds.length === 0) {
    return res.status(400).json({ error: 'driverIds must be a non-empty array.' });
  }

  const drivers = await prisma.driver.findMany({
    where: { id: { in: driverIds.map(Number) } },
    select: { userId: true },
  });

  await prisma.user.deleteMany({ where: { id: { in: drivers.map((d) => d.userId) } } });

  res.json({ message: 'Selected drivers removed.' });
});

// ── Payments oversight ───────────────────────────────────────────────────
export const listAllPayments = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const payments = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    include: {
      student: {
        include: { user: { select: { firstName: true, lastName: true, username: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ payments });
});
