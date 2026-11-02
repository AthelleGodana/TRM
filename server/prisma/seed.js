// Development seed: one active demo organisation with a route, stops and a
// bus. People sign in with Google, so the seed creates memberships keyed by
// email; set SEED_ADMIN_EMAIL (and optionally SEED_DRIVER_EMAIL /
// SEED_STUDENT_EMAIL) to Google accounts you control, then sign in.
// Runs as the owner connection (DIRECT_DATABASE_URL), so RLS does not apply.
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL } },
});

async function member(org, email, role, firstName, lastName) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized, firstName, lastName },
  });
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: { role },
    create: { userId: user.id, organizationId: org.id, role },
  });
  const key = { organizationId_userId: { organizationId: org.id, userId: user.id } };
  if (role === 'DRIVER') return prisma.driver.upsert({ where: key, update: {}, create: { organizationId: org.id, userId: user.id } });
  if (role === 'STUDENT') return prisma.student.upsert({ where: key, update: {}, create: { organizationId: org.id, userId: user.id, paymentTier: 'ADAMS' } });
  return null;
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-university' },
    update: {},
    create: {
      name: 'Demo University', slug: 'demo-university', profile: 'UNIVERSITY', status: 'ACTIVE',
      approvedAt: new Date(), fuelHubEnabled: true,
    },
  });

  await member(org, process.env.SEED_ADMIN_EMAIL, 'ORG_ADMIN', 'Demo', 'Admin');
  const driver = await member(org, process.env.SEED_DRIVER_EMAIL, 'DRIVER', 'John', 'Mwangi');
  await member(org, process.env.SEED_STUDENT_EMAIL, 'STUDENT', 'Jane', 'Doe');

  let route = await prisma.route.findFirst({ where: { organizationId: org.id, name: 'Route A - Westlands' } });
  if (!route) {
    route = await prisma.route.create({
      data: {
        organizationId: org.id,
        name: 'Route A - Westlands',
        schoolArrival: '07:00',
        schoolDeparture: '16:00',
        pickupPoints: {
          create: [
            { organizationId: org.id, name: 'Town Stage', tier: 'TOWN', order: 0 },
            { organizationId: org.id, name: 'Lavington Mall', tier: 'LAVINGTON', order: 1 },
            { organizationId: org.id, name: 'Adams Arcade', tier: 'ADAMS', order: 2 },
          ],
        },
      },
    });
  }

  await prisma.bus.upsert({
    where: { organizationId_licensePlate: { organizationId: org.id, licensePlate: 'KDA 123X' } },
    update: {},
    create: { organizationId: org.id, licensePlate: 'KDA 123X', capacity: 33, routeId: route.id, driverId: driver?.id ?? null },
  });

  console.log(`Seed complete: organisation "${org.name}" (code ${org.slug}).`);
  if (!process.env.SEED_ADMIN_EMAIL) console.log('Set SEED_ADMIN_EMAIL to a Google account to sign in as its admin.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
