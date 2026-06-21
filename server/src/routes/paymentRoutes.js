import express from 'express';
import { initiateSTKPush, mpesaCallback } from '../controllers/paymentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/stk-push', protect, authorize('STUDENT'), initiateSTKPush);
router.post('/callback', mpesaCallback);

export default router;
