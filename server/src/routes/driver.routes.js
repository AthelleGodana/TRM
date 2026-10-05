import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getMyRoute } from '../controllers/driver.controller.js';
import { getRoster, setRosterStatus } from '../controllers/vehicle.controller.js';

const router = Router();
router.use(requireAuth, requireRole('driver'));

router.get('/my-route', getMyRoute);
router.get('/roster', getRoster);
router.post('/roster/status', setRosterStatus);

export default router;
