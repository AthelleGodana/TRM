import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createSlot,
  listSlotsAdmin,
  listSlotsForStudent,
  bookSlot,
  cancelSlot,
} from '../controllers/slot.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/my-slots', listSlotsForStudent);
router.post('/book', bookSlot);
router.post('/cancel', cancelSlot);

router.post('/', createSlot);
router.get('/', listSlotsAdmin);

export default router;
