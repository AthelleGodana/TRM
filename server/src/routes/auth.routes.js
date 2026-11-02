import express, { Router } from 'express';
import { register, login } from '../controllers/auth.controller.js';
import {
  googleSignIn, googleRedirect, refresh, logout, switchOrganization, me, publicConfig, requireAppHeader,
  requireDevLogin, listDevAccounts, devLogin,
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

// Development only (DEV_LOGIN=true, never in production).
router.get('/dev-accounts', requireDevLogin, listDevAccounts);
router.post('/dev-login', requireDevLogin, devLogin);

// Legacy password login (being retired in favour of Google sign-in).
router.post('/register', register);
router.post('/login', login);

export default router;
