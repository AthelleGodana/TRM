import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  compact, daysUntil, expiryStatus, idParam, optDate, optEnum, optString, userName,
} from '../services/fleet.js';

// Driver profiles for staff: employment and licence details, the vehicle
// they drive now and have driven before, their documents and defects.

const DRIVER_STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'INACTIVE'];
const userSelect = { select: { id: true, firstName: true, lastName: true, email: true, picture: true } };

function presentDriver(driver, now = new Date()) {
  const { buses, documents, ...rest } = driver;
  const bus = buses?.[0] || null;
  const docs = (documents || []).map((d) => expiryStatus(d.expiresAt, now));
  return {
    ...rest,
    name: userName(driver.user),
    licenseStatus: expiryStatus(driver.licenseExpiry, now),
    licenseDaysLeft: daysUntil(driver.licenseExpiry, now),
    vehicle: bus && { id: bus.id, licensePlate: bus.licensePlate, make: bus.make, model: bus.model, status: bus.status },
    attention: {
      documentsExpired: docs.filter((s) => s === 'EXPIRED').length,
      documentsExpiring: docs.filter((s) => s === 'EXPIRING').length,
    },
  };
}

// GET /admin/drivers — replaces the old bare list; keeps `user` for callers.
export const listDriverProfiles = asyncHandler(async (req, res) => {
  const drivers = await prisma.driver.findMany({
    include: {
      user: userSelect,
      buses: { select: { id: true, licensePlate: true, make: true, model: true, status: true } },
      documents: { select: { expiresAt: true } },
    },
    orderBy: { id: 'asc' },
  });
  const now = new Date();
  res.json({ drivers: drivers.map((d) => presentDriver(d, now)) });
});

// GET /admin/drivers/:id
export const getDriverProfile = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const driver = id && await prisma.driver.findUnique({
    where: { id },
    include: {
      user: userSelect,
      buses: { select: { id: true, licensePlate: true, make: true, model: true, status: true } },
      documents: { orderBy: { expiresAt: 'asc' } },
      assignments: {
        include: { bus: { select: { id: true, licensePlate: true, make: true, model: true } } },
        orderBy: { startedAt: 'desc' },
        take: 50,
      },
      defects: {
        include: { bus: { select: { id: true, licensePlate: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });
  if (!driver) return res.status(404).json({ error: 'Driver not found.' });

  const now = new Date();
  res.json({
    driver: {
      ...presentDriver(driver, now),
      documents: driver.documents.map((d) => ({ ...d, expiry: expiryStatus(d.expiresAt, now) })),
      assignments: driver.assignments,
      defects: driver.defects,
    },
  });
});

// PUT /admin/drivers/:id — profile fields only (the user's name and email
// belong to their account and are managed under People & Access).
export const updateDriverProfile = asyncHandler(async (req, res) => {
  const id = idParam(req.params.id);
  const b = req.body;
  const data = compact({
    phone: optString(b.phone, { max: 30 }),
    employeeNo: optString(b.employeeNo, { max: 30 }),
    licenseNumber: optString(b.licenseNumber, { max: 40 }),
    licenseClass: optString(b.licenseClass, { max: 30 }),
    licenseExpiry: optDate(b.licenseExpiry, 'Licence expiry'),
    hireDate: optDate(b.hireDate, 'Hire date'),
    status: optEnum(b.status, DRIVER_STATUSES, 'Status') ?? undefined,
    emergencyContact: optString(b.emergencyContact, { max: 120 }),
    notes: optString(b.notes, { max: 2000 }),
  });
  const existing = id && await prisma.driver.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Driver not found.' });
  const driver = await prisma.driver.update({ where: { id }, data, include: { user: userSelect } });
  res.json({ driver: { ...driver, name: userName(driver.user) } });
});
