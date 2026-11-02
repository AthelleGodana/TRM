import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { presentPassenger } from '../services/passenger.service.js';

// Staff manage passenger records that have no account of their own (school
// pupils) and link them to PARENT members. A parent can only be linked if
// they hold the PARENT role in this organisation, which the profile role
// map only allows where parents exist.

const toId = (v) => (v === '' || v == null ? null : Number(v) || 0);

export const createPupil = asyncHandler(async (req, res) => {
  const firstName = String(req.body?.firstName || '').trim();
  const lastName = String(req.body?.lastName || '').trim();
  if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required.' });

  const pupil = await prisma.student.create({
    data: {
      firstName: firstName.slice(0, 80),
      lastName: lastName.slice(0, 80),
      routeId: toId(req.body.routeId),
      arrivePickupPointId: toId(req.body.arrivePickupPointId),
      departPickupPointId: toId(req.body.departPickupPointId),
    },
  });
  res.status(201).json({ pupil: presentPassenger(pupil) });
});

export const linkGuardian = asyncHandler(async (req, res) => {
  const pupil = await prisma.student.findUnique({ where: { id: Number(req.params.id) || 0 } });
  if (!pupil || pupil.userId) return res.status(404).json({ error: 'Pupil not found.' });

  const parent = await prisma.membership.findFirst({ where: { userId: Number(req.body?.userId) || 0, role: 'PARENT' } });
  if (!parent) return res.status(404).json({ error: 'Parent not found in this organisation.' });

  const link = await prisma.passengerGuardian.upsert({
    where: { organizationId_studentId_userId: { organizationId: req.org.id, studentId: pupil.id, userId: parent.userId } },
    update: {},
    create: { studentId: pupil.id, userId: parent.userId },
  });
  res.status(201).json({ guardian: link });
});

export const unlinkGuardian = asyncHandler(async (req, res) => {
  const result = await prisma.passengerGuardian.deleteMany({
    where: { studentId: Number(req.params.id) || 0, userId: Number(req.params.userId) || 0 },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Link not found.' });
  res.json({ message: 'Parent unlinked.' });
});

// PARENT members available for linking.
export const listParents = asyncHandler(async (req, res) => {
  const parents = await prisma.membership.findMany({
    where: { role: 'PARENT' },
    include: { user: { select: { id: true, name: true, firstName: true, lastName: true, email: true } } },
  });
  res.json({ parents: parents.map((m) => m.user) });
});
