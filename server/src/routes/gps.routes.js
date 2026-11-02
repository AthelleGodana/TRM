import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import prisma from '../config/db.js';
import { isStaff } from '../config/roles.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { startOfToday } from '../utils/time.js';
import { findViewableBus } from '../services/busAccess.js';
import { isDriverOnline, lastPosition } from '../services/gpsIngest.js';

const router = Router();
const MAX_TRAIL_POINTS = 2000;

// GET /gps/live (staff) — every bus in the organisation with its latest
// position, for the live fleet map. Later updates arrive over Socket.IO.
router.get(
  '/live',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isStaff(req.user.role)) return res.status(403).json({ error: 'Staff only.' });
    const buses = await prisma.bus.findMany({
      include: {
        driver: { include: { user: { select: { firstName: true, lastName: true } } } },
        route: { select: { id: true, name: true } },
      },
      orderBy: { licensePlate: 'asc' },
    });
    const orgId = req.user.organizationId;
    res.json({
      buses: await Promise.all(buses.map(async (b) => ({
        id: b.id,
        licensePlate: b.licensePlate,
        capacity: b.capacity,
        status: b.status,
        driver: b.driver ? `${b.driver.user.firstName} ${b.driver.user.lastName}`.trim() : null,
        route: b.route,
        online: isDriverOnline(orgId, b.id),
        last: await lastPosition(orgId, b.id),
      }))),
    });
  })
);

// GET /gps/history/:busId — staff get today's trail (oldest first);
// passengers and drivers only ever get the latest point.
router.get(
  '/history/:busId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bus = await findViewableBus(req.user, req.params.busId);
    if (!bus) return res.status(404).json({ error: 'Bus not found.' });

    if (!isStaff(req.user.role)) {
      const last = await prisma.gpsLog.findFirst({ where: { busId: bus.id }, orderBy: { recordedAt: 'desc' } });
      return res.json({ logs: last ? [last] : [] });
    }
    const logs = await prisma.gpsLog.findMany({
      where: { busId: bus.id, recordedAt: { gte: startOfToday() } },
      orderBy: { recordedAt: 'desc' },
      take: MAX_TRAIL_POINTS,
    });
    res.json({ logs: logs.reverse() });
  })
);

export default router;
