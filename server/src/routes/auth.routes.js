import express, { Router } from 'express';
import { register, login } from '../controllers/auth.controller.js';
import {
  googleSignIn, googleRedirect, refresh, logout, switchOrganization, me, publicConfig, requireAppHeader,
} from '../controllers/session.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/config', publicConfig);
router.post('/google', googleSignIn);
router.post('/google/redirect', express.urlencoded({ extended: false }), googleRedirect);
router.post('/refresh', requireAppHeader, refresh);
router.post('/logout', requireAppHeader, logout);
router.post('/switch-org', requireAppHeader, requireAuth, switchOrganization);
router.get('/me', requireAuth, me);

// Legacy password login (being retired in favour of Google sign-in).
router.post('/register', register);
router.post('/login', login);

export default router;
