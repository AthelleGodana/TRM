import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listChildren, getChildBus } from '../controllers/parent.controller.js';

const router = Router();
router.use(requireAuth, requireRole('PARENT'));

router.get('/children', listChildren);
router.get('/children/:id/bus', getChildBus);

export default router;
