import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getProfile, updateProfile, listRoutes, registerRoute, getMyBus,
} from '../controllers/student.controller.js';

const router = Router();
router.use(requireAuth, requireRole('student'));

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.get('/routes', listRoutes);
router.post('/register-route', registerRoute);
router.get('/my-bus', getMyBus);

export default router;
