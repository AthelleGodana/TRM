import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { initiatePayment, mpesaCallback, getMyPayments } from '../controllers/payment.controller.js';

const router = Router();

// Daraja calls this server-to-server; it is not authenticated with a JWT.
router.post('/mpesa/callback', mpesaCallback);

router.use(requireAuth, requireRole('student'));
router.post('/initiate', initiatePayment);
router.get('/history', getMyPayments);

export default router;
