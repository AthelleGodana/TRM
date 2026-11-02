import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { SUPER_ADMIN } from '../config/roles.js';
import {
  listOrganizations, approveOrganization, suspendOrganization, reactivateOrganization, updateFeatures,
} from '../controllers/platform.controller.js';

const router = Router();
router.use(requireAuth, requireRole(SUPER_ADMIN));

router.get('/organizations', listOrganizations);
router.post('/organizations/:id/approve', approveOrganization);
router.post('/organizations/:id/suspend', suspendOrganization);
router.post('/organizations/:id/reactivate', reactivateOrganization);
router.patch('/organizations/:id/features', updateFeatures);

export default router;
