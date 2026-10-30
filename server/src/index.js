import http from 'http';
import { Server } from 'socket.io';

import { env } from './config/env.js';
import { createApp } from './app.js';
import { registerGpsSocket } from './socket/gps.socket.js';

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.clientUrl, credentials: true },
});

registerGpsSocket(io);

server.listen(env.port, () => {
  console.log(`TMS server running on port ${env.port} (${env.nodeEnv})`);
});
