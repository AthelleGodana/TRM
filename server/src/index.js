import http from 'http';
import { Server } from 'socket.io';

import { env } from './config/env.js';
import { checkDatabaseRoles } from './config/db.js';
import { createApp } from './app.js';
import { registerGpsSocket } from './socket/gps.socket.js';
import { runBootstrap } from './services/bootstrap.js';
import { startFuelAnalysisScheduler } from './fuel/analysisJob.js';
import { startGpsRetentionJob } from './jobs/gpsRetention.js';
import { startExpiryScanJob } from './jobs/expiryScan.js';
import { setSocketServer } from './socket/emitter.js';

await checkDatabaseRoles({ production: env.nodeEnv === 'production' });
await runBootstrap();

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.clientUrl, credentials: true },
});

registerGpsSocket(io);
setSocketServer(io);
startFuelAnalysisScheduler();
startGpsRetentionJob();
startExpiryScanJob();

server.listen(env.port, () => {
  console.log(`TMS server running on port ${env.port} (${env.nodeEnv})`);
});
