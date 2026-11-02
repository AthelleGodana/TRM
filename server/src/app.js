import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import studentRoutes from './routes/student.routes.js';
import driverRoutes from './routes/driver.routes.js';
import adminRoutes from './routes/admin.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import gpsRoutes from './routes/gps.routes.js';
import slotRoutes from './routes/slot.routes.js';
import vehicleRoutes from './routes/vehicle.routes.js';
import onboardingRoutes from './routes/onboarding.routes.js';
import orgRoutes from './routes/org.routes.js';
import platformRoutes from './routes/platform.routes.js';
import parentRoutes from './routes/parent.routes.js';
import fuelRoutes from './routes/fuel.routes.js';

// Builds the Express app without binding a port, so tests can mount it
// directly with supertest and index.js can attach Socket.io to it.
export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/org', orgRoutes);
  app.use('/api/platform', platformRoutes);
  app.use('/api/parents', parentRoutes);
  app.use('/api/fuel', fuelRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/drivers', driverRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/gps', gpsRoutes);
  app.use('/api/slots', slotRoutes);
  app.use('/api/vehicles', vehicleRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
