import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('password123', salt);

  // Create Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@tms.com' },
    update: {},
    create: {
      email: 'admin@tms.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });

  // Create Route
  const route = await prisma.route.upsert({
    where: { name: 'Main Campus - Town' },
    update: {},
    create: {
      name: 'Main Campus - Town',
      description: 'The primary route from Town to Main Campus via Adams and Lavington',
    },
  });

  // Create Pickup Points
  const townStop = await prisma.pickupPoint.create({
    data: {
      name: 'Town Central',
      locationLat: -1.286389,
      locationLng: 36.817223,
      tier: 'TOWN',
      routeId: route.id,
    }
  });

  const adamsStop = await prisma.pickupPoint.create({
    data: {
      name: 'Adams Arcade',
      locationLat: -1.300000,
      locationLng: 36.783333,
      tier: 'ADAMS',
      routeId: route.id,
    }
  });

  // Create Bus
  const bus = await prisma.bus.create({
    data: {
      plateNumber: 'KCB 123A',
      capacity: 40,
      routeId: route.id,
      currentLat: -1.286389,
      currentLng: 36.817223,
    }
  });

  // Create Driver
  const driverUser = await prisma.user.create({
    data: {
      email: 'driver@tms.com',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'DRIVER',
    }
  });

  await prisma.driver.create({
    data: {
      userId: driverUser.id,
      busId: bus.id
    }
  });

  // Create Student
  const studentUser = await prisma.user.create({
    data: {
      email: 'student@tms.com',
      password: hashedPassword,
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'STUDENT',
    }
  });

  const student = await prisma.student.create({
    data: {
      userId: studentUser.id,
      busId: bus.id,
      pickupPointId: adamsStop.id,
      paymentTier: 'ADAMS'
    }
  });

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
