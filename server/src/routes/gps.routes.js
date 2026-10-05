import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Fallback REST endpoint for GPS history (the live path is via Socket.io).
router.get(
  '/history/:busId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const logs = await prisma.gpsLog.findMany({
      where: { busId: Number(req.params.busId) },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });
    res.json({ logs });
  })
);

export default router;
