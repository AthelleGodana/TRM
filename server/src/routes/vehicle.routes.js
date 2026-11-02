import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { STAFF_ROLES } from '../config/roles.js';
import {
  setBusStatus,
  addVehicleLog,
  listVehicleLogs,
  getSafetyChecklist,
  toggleSafetyCheck,
} from '../controllers/vehicle.controller.js';

const router = Router();
router.use(requireAuth, requireRole('DRIVER', ...STAFF_ROLES));

router.put('/status', setBusStatus);
router.post('/logs', addVehicleLog);
router.get('/logs/:busId?', listVehicleLogs);
router.get('/safety/:busId?', getSafetyChecklist);
router.post('/safety', toggleSafetyCheck);

export default router;
