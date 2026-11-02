import { Router } from 'express';
import { requireOnboardingToken, requestAccess, registerOrganization } from '../controllers/onboarding.controller.js';

const router = Router();
router.use(requireOnboardingToken);

router.post('/access-requests', requestAccess);
router.post('/organizations', registerOrganization);

export default router;
