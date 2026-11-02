import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { STAFF_ROLES } from '../config/roles.js';
import {
  createSlot,
  listSlotsAdmin,
  listSlotsForStudent,
  bookSlot,
  cancelSlot,
} from '../controllers/slot.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/my-slots', requireRole('STUDENT'), listSlotsForStudent);
router.post('/book', requireRole('STUDENT'), bookSlot);
router.post('/cancel', requireRole('STUDENT'), cancelSlot);

router.post('/', requireRole(...STAFF_ROLES), createSlot);
router.get('/', requireRole(...STAFF_ROLES), listSlotsAdmin);

export default router;
