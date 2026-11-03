// Development seed. Idempotent: safe to run repeatedly.
//
// Creates two active demo organisations with routes, buses and demo users
// for every role. Demo users have @demo.transtrack.local emails and can be
// signed in with the development-only demo login (DEV_LOGIN=true). Set
// SEED_ADMIN_EMAIL / SEED_DRIVER_EMAIL / SEED_STUDENT_EMAIL to real Google
// accounts to also sign in to Demo University with Google.
// Runs as the owner connection (DIRECT_DATABASE_URL), so RLS does not apply.
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { fillRouteGeometry } from '../scripts/route-geometry.js';

dotenv.config();

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL } },
});

const DEMO = '@demo.transtrack.local';

// Every demo account belongs to the project owner; there is one account
// per role because a person holds a single role in each organisation.
const OWNER = ['Athelle', 'Godana'];

async function upsertUser(email, firstName, lastName, extra = {}) {
  const normalized = email.trim().toLowerCase();
  const names = { firstName, lastName, name: `${firstName} ${lastName}` };
  // Demo accounts are renamed on every run, so older demo names disappear.
  const update = normalized.endsWith(DEMO) ? { ...names, ...extra } : extra;
  return prisma.user.upsert({
    where: { email: normalized },
    update,
    create: { email: normalized, ...names, ...extra },
  });
}

async function member(org, email, role, firstName, lastName) {
  if (!email) return null;
  const user = await upsertUser(email, firstName, lastName);
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: { role },
    create: { userId: user.id, organizationId: org.id, role },
  });
  const key = { organizationId_userId: { organizationId: org.id, userId: user.id } };
  let profile = null;
  if (role === 'DRIVER') profile = await prisma.driver.upsert({ where: key, update: {}, create: { organizationId: org.id, userId: user.id } });
  if (role === 'STUDENT') profile = await prisma.student.upsert({ where: key, update: {}, create: { organizationId: org.id, userId: user.id, paymentTier: 'ADAMS' } });
  return { user, profile };
}

async function organization(slug, data) {
  return prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { slug, status: 'ACTIVE', approvedAt: new Date(), ...data },
  });
}

async function routeWithStops(org, name, stops) {
  const existing = await prisma.route.findFirst({ where: { organizationId: org.id, name }, include: { pickupPoints: true } });
  if (existing) return existing;
  return prisma.route.create({
    data: {
      organizationId: org.id, name, schoolArrival: '07:00', schoolDeparture: '16:00',
      pickupPoints: { create: stops.map((s, i) => ({ organizationId: org.id, order: i, ...s })) },
    },
    include: { pickupPoints: true },
  });
}

async function bus(org, licensePlate, routeId, driverId) {
  return prisma.bus.upsert({
    where: { organizationId_licensePlate: { organizationId: org.id, licensePlate } },
    update: {},
    create: { organizationId: org.id, licensePlate, capacity: 33, routeId, driverId: driverId ?? null },
  });
}

async function main() {
  // ── Platform ──────────────────────────────────────────────────────────
  await upsertUser(`platform${DEMO}`, ...OWNER, { isSuperAdmin: true });

  // ── Demo University ───────────────────────────────────────────────────
  const uni = await organization('demo-university', {
    name: 'Demo University', profile: 'UNIVERSITY', fuelHubEnabled: true,
  });
  await member(uni, `uni-admin${DEMO}`, 'ORG_ADMIN', ...OWNER);
  await member(uni, `uni-officer${DEMO}`, 'FLEET_MANAGER', ...OWNER);
  const uniDriver = await member(uni, `uni-driver${DEMO}`, 'DRIVER', ...OWNER);
  const uniStudent = await member(uni, `uni-student${DEMO}`, 'STUDENT', ...OWNER);
  await member(uni, process.env.SEED_ADMIN_EMAIL, 'ORG_ADMIN', 'Demo', 'Admin');
  await member(uni, process.env.SEED_DRIVER_EMAIL, 'DRIVER', 'Demo', 'Driver');
  await member(uni, process.env.SEED_STUDENT_EMAIL, 'STUDENT', 'Demo', 'Student');

  const uniRoute = await routeWithStops(uni, 'Route A - Westlands', [
    { name: 'Town Stage', tier: 'TOWN', lat: -1.2864, lng: 36.8172 },
    { name: 'Lavington Mall', tier: 'LAVINGTON', lat: -1.2780, lng: 36.7700 },
    { name: 'Adams Arcade', tier: 'ADAMS', lat: -1.3000, lng: 36.7800 },
  ]);
  const uniBus = await bus(uni, 'KDA 123X', uniRoute.id, uniDriver.profile.id);
  await prisma.student.update({
    where: { id: uniStudent.profile.id },
    data: { routeId: uniRoute.id, arrivePickupPointId: uniRoute.pickupPoints[0].id },
  });
  if (!(await prisma.vehicleFuelProfile.findFirst({ where: { busId: uniBus.id } }))) {
    await prisma.vehicleFuelProfile.create({
      data: { organizationId: uni.id, busId: uniBus.id, fuelType: 'DIESEL', tankCapacityLitres: 200, expectedConsumptionL100km: 24 },
    });
  }

  // ── Demo School ───────────────────────────────────────────────────────
  const school = await organization('demo-school', { name: 'Demo Academy', profile: 'SCHOOL' });
  await member(school, `school-admin${DEMO}`, 'ORG_ADMIN', ...OWNER);
  const schoolDriver = await member(school, `school-driver${DEMO}`, 'DRIVER', ...OWNER);
  const parent = await member(school, `parent${DEMO}`, 'PARENT', ...OWNER);

  const schoolRoute = await routeWithStops(school, 'Karen Loop', [
    { name: 'Karen Shopping Centre', tier: 'TOWN', lat: -1.3197, lng: 36.7076 },
    { name: 'Hardy Estate', tier: 'TOWN', lat: -1.3400, lng: 36.7400 },
  ]);
  await bus(school, 'KCB 456Y', schoolRoute.id, schoolDriver.profile.id);

  let pupil = await prisma.student.findFirst({ where: { organizationId: school.id, userId: null, firstName: 'Baraka' } });
  if (!pupil) {
    pupil = await prisma.student.create({
      data: {
        organizationId: school.id, firstName: 'Baraka', lastName: OWNER[1],
        routeId: schoolRoute.id, arrivePickupPointId: schoolRoute.pickupPoints[0].id,
      },
    });
  }
  if (pupil.lastName !== OWNER[1]) {
    pupil = await prisma.student.update({ where: { id: pupil.id }, data: { lastName: OWNER[1] } });
  }
  await prisma.passengerGuardian.upsert({
    where: { organizationId_studentId_userId: { organizationId: school.id, studentId: pupil.id, userId: parent.user.id } },
    update: {},
    create: { organizationId: school.id, studentId: pupil.id, userId: parent.user.id },
  });

  // Road lines for the demo routes (skipped when ROUTING_URL is empty).
  await fillRouteGeometry(prisma).catch((err) => console.log(`Route lines skipped: ${err.message}`));

  console.log('Seed complete: Demo University (code demo-university) and Demo Academy (code demo-school).');
  console.log(`Demo accounts use ${DEMO}; sign in with them when DEV_LOGIN=true.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
