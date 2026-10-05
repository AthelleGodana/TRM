import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// ── Admin: create a pickup time slot with a capacity cap ──────────────
export const createSlot = asyncHandler(async (req, res) => {
  const { routeId, busId, time, label, capacity } = req.body;
  if (!routeId || !time) {
    return res.status(400).json({ error: 'routeId and time are required.' });
  }
  const slot = await prisma.pickupSlot.create({
    data: {
      routeId: Number(routeId),
      busId: busId ? Number(busId) : null,
      time,
      label: label || `Pickup ${time}`,
      capacity: capacity ? Number(capacity) : 30,
      bookedCount: 0,
    },
  });
  res.status(201).json({ slot });
});

// ── Admin: list all slots (optionally filtered by route) ──────────────
export const listSlotsAdmin = asyncHandler(async (req, res) => {
  const { routeId } = req.query;
  const slots = await prisma.pickupSlot.findMany({
    where: routeId ? { routeId: Number(routeId) } : undefined,
    include: { route: { select: { name: true } } },
    orderBy: [{ time: 'asc' }],
  });
  res.json({ slots });
});

// ── Student-facing: list active slots for the student's route ─────────
export const listSlotsForStudent = asyncHandler(async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  if (!student || !student.routeId) {
    return res.status(404).json({ error: 'Register for a route first to book a pickup slot.' });
  }

  const slots = await prisma.pickupSlot.findMany({
    where: { routeId: student.routeId, isActive: true },
    include: { bus: { select: { licensePlate: true } } },
    orderBy: [{ time: 'asc' }],
  });

  // Determine the student's current booking.
  const myRoster = await prisma.tripRoster.findFirst({
    where: { studentId: student.id, tripDate: { gte: startOfToday() } },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    slots: slots.map((s) => ({
      id: s.id,
      time: s.time,
      label: s.label,
      capacity: s.capacity,
      bookedCount: s.bookedCount,
      available: Math.max(0, s.capacity - s.bookedCount),
      busLicensePlate: s.bus?.licensePlate || null,
    })),
    mySlotId: myRoster?.slotId || null,
  });
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Student: book (or swap) a pickup slot. Optimistic on the client. ──
export const bookSlot = asyncHandler(async (req, res) => {
  const { slotId } = req.body;
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const slot = await prisma.pickupSlot.findUnique({ where: { id: Number(slotId) } });
  if (!slot || !slot.isActive) return res.status(404).json({ error: 'Slot not found.' });

  if (slot.routeId !== student.routeId) {
    return res.status(400).json({ error: 'This slot is not on your route.' });
  }
  if (slot.bookedCount >= slot.capacity) {
    return res.status(409).json({ error: 'This slot is full. Please choose another.' });
  }

  // Release any prior booking for today.
  const existing = await prisma.tripRoster.findFirst({
    where: { studentId: student.id, slotId: { not: null }, tripDate: { gte: startOfToday() } },
  });
  if (existing) {
    await prisma.pickupSlot.update({
      where: { id: existing.slotId },
      data: { bookedCount: { decrement: 1 } },
    });
    await prisma.tripRoster.delete({ where: { id: existing.id } });
  }

  const roster = await prisma.tripRoster.create({
    data: {
      busId: slot.busId,
      slotId: slot.id,
      studentId: student.id,
      status: 'PENDING',
    },
  });

  await prisma.pickupSlot.update({
    where: { id: slot.id },
    data: { bookedCount: { increment: 1 } },
  });

  res.status(201).json({ roster, slotId: slot.id, message: 'Slot booked successfully.' });
});

// ── Student: cancel current slot booking ──────────────────────────────
export const cancelSlot = asyncHandler(async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const existing = await prisma.tripRoster.findFirst({
    where: { studentId: student.id, slotId: { not: null }, tripDate: { gte: startOfToday() } },
  });
  if (!existing) return res.status(400).json({ error: 'No active booking to cancel.' });

  await prisma.pickupSlot.update({
    where: { id: existing.slotId },
    data: { bookedCount: { decrement: 1 } },
  });
  await prisma.tripRoster.delete({ where: { id: existing.id } });

  res.json({ message: 'Slot booking cancelled.' });
});
