import prisma, { tenantTransaction } from '../config/db.js';
import { presentPassenger } from '../services/passenger.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Routes & pickup points ──────────────────────────────────────────────
export const listRoutesAdmin = asyncHandler(async (req, res) => {
  const routes = await prisma.route.findMany({
    include: { pickupPoints: { orderBy: { order: 'asc' } }, buses: true },
    orderBy: { id: 'desc' },
  });
  res.json({ routes });
});

// ── Passengers ───────────────────────────────────────────────────────────
export const listStudents = asyncHandler(async (req, res) => {
  const students = await prisma.student.findMany({
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      route: true,
      guardians: { include: { user: { select: { id: true, name: true, firstName: true, lastName: true, email: true } } } },
      rideBookings: {
        include: { slot: { select: { label: true, time: true } }, pickupPoint: { select: { name: true } } },
      },
    },
    orderBy: { id: 'asc' },
  });
  res.json({ students: students.map(presentPassenger) });
});

// PUT /admin/students/:id/route { routeId | null } — sets the passenger's
// standard route. Their ride bookings belong to the old route, so changing
// it clears them (and their stops); the passenger then picks again.
export const assignStudentRoute = asyncHandler(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const routeId = req.body.routeId ? Number(req.body.routeId) : null;
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) return res.status(404).json({ error: 'Passenger not found.' });
  if (routeId && !(await prisma.route.findUnique({ where: { id: routeId } }))) {
    return res.status(404).json({ error: 'Route not found.' });
  }
  if (routeId === student.routeId) return res.json({ student });

  const updated = await tenantTransaction(async (tx) => {
    await tx.rideBooking.deleteMany({ where: { studentId: id } });
    await tx.rideException.deleteMany({ where: { studentId: id } });
    return tx.student.update({
      where: { id },
      data: { routeId, arrivePickupPointId: null, departPickupPointId: null },
      include: { route: true },
    });
  });
  res.json({ student: updated });
});

export const removeStudents = asyncHandler(async (req, res) => {
  const { studentIds } = req.body;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({ error: 'studentIds must be a non-empty array.' });
  }

  // Removes the people from this organisation only. Their Google identity
  // and any memberships in other organisations are left untouched.
  await tenantTransaction(async (tx) => {
    const students = await tx.student.findMany({
      where: { id: { in: studentIds.map(Number) } },
      select: { id: true, userId: true },
    });
    const userIds = students.map((s) => s.userId).filter(Boolean);
    await tx.student.deleteMany({ where: { id: { in: students.map((s) => s.id) } } });
    await tx.membership.deleteMany({ where: { userId: { in: userIds }, role: 'STUDENT' } });
  });

  res.json({ message: 'Selected students removed.' });
});

export const removeDrivers = asyncHandler(async (req, res) => {
  const { driverIds } = req.body;
  if (!Array.isArray(driverIds) || driverIds.length === 0) {
    return res.status(400).json({ error: 'driverIds must be a non-empty array.' });
  }

  await tenantTransaction(async (tx) => {
    const drivers = await tx.driver.findMany({
      where: { id: { in: driverIds.map(Number) } },
      select: { id: true, userId: true },
    });
    await tx.driver.deleteMany({ where: { id: { in: drivers.map((d) => d.id) } } });
    await tx.membership.deleteMany({ where: { userId: { in: drivers.map((d) => d.userId) }, role: 'DRIVER' } });
  });

  res.json({ message: 'Selected drivers removed.' });
});

// ── Payments oversight ───────────────────────────────────────────────────
export const listAllPayments = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const payments = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    include: {
      student: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ payments: payments.map((p) => ({ ...p, student: presentPassenger(p.student) })) });
});
