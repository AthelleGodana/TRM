import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getMyRoute = asyncHandler(async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { userId: req.user.id } });
  if (!driver) return res.status(404).json({ error: 'Driver profile not found.' });

  const bus = await prisma.bus.findFirst({
    where: { driverId: driver.id },
    include: {
      route: {
        include: {
          pickupPoints: { orderBy: { order: 'asc' } },
          students: { include: { user: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });

  if (!bus) return res.status(404).json({ error: 'No bus assigned to you yet.' });

  res.json({
    bus: {
      id: bus.id,
      licensePlate: bus.licensePlate,
      capacity: bus.capacity,
      route: bus.route,
      passengerCount: bus.route?.students?.length || 0,
    },
  });
});

// Toggles whether the bus is currently marked available for a trip.
// Kept in-memory-simple via a boolean column would need a migration;
// for now this is reported back from the client's own session state,
// so this endpoint exists as the integration point once persisted.
export const setAvailability = asyncHandler(async (req, res) => {
  const { available } = req.body;
  res.json({ available: Boolean(available) });
});
