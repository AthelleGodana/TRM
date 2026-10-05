import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { registerGpsSocket } from './socket/gps.socket.js';

import authRoutes from './routes/auth.routes.js';
import studentRoutes from './routes/student.routes.js';
import driverRoutes from './routes/driver.routes.js';
import adminRoutes from './routes/admin.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import gpsRoutes from './routes/gps.routes.js';
import slotRoutes from './routes/slot.routes.js';
import vehicleRoutes from './routes/vehicle.routes.js';

const app = express();

app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/vehicles', vehicleRoutes);

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.clientUrl, credentials: true },
});

registerGpsSocket(io);

server.listen(env.port, () => {
  console.log(`TMS server running on port ${env.port} (${env.nodeEnv})`);
});
