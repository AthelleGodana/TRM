import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

import authRoutes from './routes/authRoutes.js';
import featureRoutes from './routes/featureRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Transport Management System API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api', featureRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  });
});

export default app;
