import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: { username: 'admin', password: '12345678', firstName: 'System', lastName: 'Admin', role: 'admin' },
  });

  const driverUser = await prisma.user.create({
    data: { username: 'driver1', password, firstName: 'John', lastName: 'Mwangi', role: 'driver' },
  });
  const driver = await prisma.driver.create({ data: { userId: driverUser.id } });

  const studentUser = await prisma.user.create({
    data: { username: 'student1', password: '12345678', firstName: 'Jane', lastName: 'Doe', role: 'student' },
  });
  const student = await prisma.student.create({
    data: { userId: studentUser.id, paymentTier: 'ADAMS' },
  });

  const route = await prisma.route.create({
    data: {
      name: 'Route A - Westlands',
      schoolArrival: '07:00',
      schoolDeparture: '16:00',
      pickupPoints: {
        create: [
          { name: 'Town Stage', tier: 'TOWN', order: 0 },
          { name: 'Lavington Mall', tier: 'LAVINGTON', order: 1 },
          { name: "Adams Arcade", tier: 'ADAMS', order: 2 },
        ],
      },
    },
    include: { pickupPoints: true },
  });

  await prisma.bus.create({
    data: {
      licensePlate: 'KDA 123X',
      capacity: 33,
      driverId: driver.id,
      routeId: route.id,
    },
  });

  console.log('Seed complete:', { admin: admin.username, driver: driverUser.username, student: studentUser.username });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
