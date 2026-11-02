import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { findViewableBus } from '../services/busAccess.js';

const router = Router();

// Fallback REST endpoint for GPS history (the live path is via Socket.io).
router.get(
  '/history/:busId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bus = await findViewableBus(req.user, req.params.busId);
    if (!bus) return res.status(404).json({ error: 'Bus not found.' });

    const logs = await prisma.gpsLog.findMany({
      where: { busId: bus.id },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });
    res.json({ logs });
  })
);

export default router;
