import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getProfile, updateProfile, listRoutes, registerRoute, getMyBus,
} from '../controllers/student.controller.js';
import { studentRides } from '../controllers/rides.controller.js';

const router = Router();
router.use(requireAuth, requireRole('STUDENT'));

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/routes', listRoutes);
router.post('/register-route', registerRoute);
router.get('/my-bus', getMyBus);

// Pickup and drop-off: standing choice per direction, plus one-day changes.
router.get('/rides', studentRides.get);
router.put('/rides/:direction', studentRides.setStanding);
router.delete('/rides/:direction', studentRides.clearStanding);
router.put('/rides/:direction/dates/:date', studentRides.setDay);
router.delete('/rides/:direction/dates/:date', studentRides.clearDay);

export default router;
