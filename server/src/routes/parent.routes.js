import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listChildren, getChildBus } from '../controllers/parent.controller.js';
import { childRides } from '../controllers/rides.controller.js';

const router = Router();
router.use(requireAuth, requireRole('PARENT'));

router.get('/children', listChildren);
router.get('/children/:id/bus', getChildBus);

// A parent manages each child's pickup and drop-off like a student does.
router.get('/children/:id/rides', childRides.get);
router.put('/children/:id/rides/:direction', childRides.setStanding);
router.delete('/children/:id/rides/:direction', childRides.clearStanding);
router.put('/children/:id/rides/:direction/dates/:date', childRides.setDay);
router.delete('/children/:id/rides/:direction/dates/:date', childRides.clearDay);

export default router;
