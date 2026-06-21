import axios from 'axios';
import prisma from '../config/prisma.js';

export const initiateSTKPush = async (req, res) => {
  try {
    const { amount, phoneNumber, tier } = req.body;
    const studentId = req.user.student.id;

    // This is a simplified mock of M-Pesa STK Push
    // In a real app, you would:
    // 1. Get access token from Safaricom
    // 2. Send request to STK Push endpoint

    console.log(`Initiating STK Push for ${phoneNumber}, amount ${amount}, tier ${tier}`);

    // Simulate successful initiation
    const payment = await prisma.payment.create({
      data: {
        studentId,
        amount: parseFloat(amount),
        status: 'PENDING',
        tierPurchased: tier,
      }
    });

    res.status(200).json({
      message: 'STK Push initiated successfully',
      paymentId: payment.id
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const mpesaCallback = async (req, res) => {
  try {
    // Safaricom sends payment results here
    const { Body } = req.body;

    if (Body.stkCallback.ResultCode === 0) {
      const metadata = Body.stkCallback.CallbackMetadata.Item;
      const receipt = metadata.find(item => item.Name === 'MpesaReceiptNumber').Value;
      const amount = metadata.find(item => item.Name === 'Amount').Value;
      const phoneNumber = metadata.find(item => item.Name === 'PhoneNumber').Value;

      // Update payment record (simplified, usually linked by CheckoutRequestID)
      const payment = await prisma.payment.findFirst({
        where: { status: 'PENDING', amount: parseFloat(amount) },
        orderBy: { createdAt: 'desc' }
      });

      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'COMPLETED', mpesaReceipt: receipt }
        });

        // Update student tier
        await prisma.student.update({
          where: { id: payment.studentId },
          data: { paymentTier: payment.tierPurchased }
        });
      }
    }

    res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (error) {
    console.error('M-Pesa Callback Error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Internal Error' });
  }
};
