import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getMyRoute, getTodayRuns, getRoster, setRosterStatus, getMe, getMyVehicle, reportDefect, reportOdometer,
} from '../controllers/driver.controller.js';
import { downloadDocument } from '../controllers/document.controller.js';

const router = Router();
router.use(requireAuth, requireRole('DRIVER'));

router.get('/my-route', getMyRoute);
router.get('/runs/today', getTodayRuns);
router.get('/roster', getRoster);
router.post('/roster/status', setRosterStatus);

router.get('/me', getMe);
router.get('/my-vehicle', getMyVehicle);
router.post('/defects', reportDefect);
router.post('/odometer', reportOdometer);
router.get('/documents/:id/file', downloadDocument);

export default router;
