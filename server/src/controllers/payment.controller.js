import prisma from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getMpesaAccessToken, initiateStkPush } from '../utils/mpesa.js';

const ROUTE_PRICE = {
  TOWN: 1500,
  LAVINGTON: 2500,
  ADAMS: 4000,
};

export const initiatePayment = asyncHandler(async (req, res) => {
  const { tier, phoneNumber } = req.body;

  if (!ROUTE_PRICE[tier]) {
    return res.status(400).json({ error: 'Invalid tier selected.' });
  }
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required for M-Pesa payment.' });
  }

  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const amount = ROUTE_PRICE[tier];

  // ==========================================
  // 🛠️ DEVELOPER SANDBOX: THE MAGIC NUMBER
  // ==========================================
  if (phoneNumber === '0700000000') {
    console.log('🚧 Developer Bypass Triggered: Simulating successful M-Pesa payment.');
    
    // 1. Instantly upgrade the student's tier
    const updatedStudent = await prisma.student.update({
      where: { id: student.id },
      data: {
        paymentTier: tier
      }
    });

    // 2. Log the simulated transaction in the database
    const payment = await prisma.payment.create({
      data: {
        studentId: student.id,
        amount,
        method: 'MPESA',
        status: 'PAID', // Instantly mark as paid
        checkoutRequestId: `TEST-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        mpesaReceipt: `REC${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      }
    });

    return res.status(201).json({
      message: 'Developer bypass successful. Tier upgraded instantly.',
      payment,
      testMode: true,
      student: updatedStudent
    });
  }
  // ==========================================
  // END BYPASS
  // ==========================================

  // Normal M-Pesa STK Push Logic
  const stkResult = await initiateStkPush({ phoneNumber, amount });

  const payment = await prisma.payment.create({
    data: {
      studentId: student.id,
      amount,
      method: 'MPESA',
      status: 'PENDING',
      checkoutRequestId: stkResult.CheckoutRequestID,
    },
  });

  res.status(201).json({
    message: 'Payment request sent. Enter your M-Pesa PIN on your phone to complete payment.',
    payment,
  });
});

export const mpesaCallback = asyncHandler(async (req, res) => {
  const callback = req.body?.Body?.stkCallback;
  if (!callback) return res.status(400).json({ error: 'Invalid callback payload.' });

  const { CheckoutRequestID, ResultCode, CallbackMetadata } = callback;

  const payment = await prisma.payment.findFirst({ where: { checkoutRequestId: CheckoutRequestID } });
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });

  if (ResultCode === 0) {
    const items = CallbackMetadata?.Item || [];
    const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value;

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID', mpesaReceipt: receipt || null },
    });

    // Bump the student's payment tier to match what they paid for.
    const student = await prisma.student.findUnique({ where: { id: payment.studentId } });
    const amountToTier = { 1500: 'TOWN', 2500: 'LAVINGTON', 4000: 'ADAMS' };
    const paidTier = amountToTier[Number(payment.amount)];
    
    if (student && paidTier) {
      await prisma.student.update({ where: { id: student.id }, data: { paymentTier: paidTier } });
    }
  } else {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
  }

  res.json({ ResultCode: 0, ResultDesc: 'Callback processed.' });
});

export const getMyPayments = asyncHandler(async (req, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  if (!student) return res.status(404).json({ error: 'Student profile not found.' });

  const payments = await prisma.payment.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ payments, currentTier: student.paymentTier });
});