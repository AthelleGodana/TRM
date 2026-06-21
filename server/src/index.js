import app from './app.js';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

import prisma from './config/prisma.js';

// GPS Tracking and Real-time communication
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Join a specific bus room for location updates
  socket.on('joinBus', (busId) => {
    socket.join(`bus_${busId}`);
    console.log(`User ${socket.id} joined room bus_${busId}`);
  });

  // Driver broadcasting location
  socket.on('updateLocation', async (data) => {
    const { busId, lat, lng } = data;

    // Broadcast to all students in the room
    io.to(`bus_${busId}`).emit('locationUpdate', { lat, lng });

    // Update DB periodically or on important changes (throttling should be on client)
    try {
      await prisma.bus.update({
        where: { id: busId },
        data: { currentLat: lat, currentLng: lng }
      });
    } catch (error) {
      console.error('Error updating bus location:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { io };
