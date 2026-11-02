import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { busForRoute, presentPassenger } from '../services/passenger.service.js';

// PARENT: see your own children and track the bus on their route.

async function myChild(userId, studentId) {
  const link = await prisma.passengerGuardian.findFirst({
    where: { userId, studentId: Number(studentId) || 0 },
    include: { student: { include: { route: true, arrivePickupPoint: true, departPickupPoint: true } } },
  });
  return link?.student || null;
}

export const listChildren = asyncHandler(async (req, res) => {
  const links = await prisma.passengerGuardian.findMany({
    where: { userId: req.user.id },
    include: { student: { include: { route: true, arrivePickupPoint: true, departPickupPoint: true } } },
    orderBy: { studentId: 'asc' },
  });
  res.json({ children: links.map((l) => presentPassenger(l.student)) });
});

export const getChildBus = asyncHandler(async (req, res) => {
  const child = await myChild(req.user.id, req.params.id);
  if (!child) return res.status(404).json({ error: 'Child not found.' });
  const bus = await busForRoute(child.routeId);
  if (!bus) return res.status(404).json({ error: 'No bus is assigned to this route yet.' });
  res.json({ bus });
});
