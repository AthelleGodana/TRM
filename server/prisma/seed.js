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

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (n) => new Date(Date.now() + n * DAY);

// ── Demo Company: a mixed fleet with maintenance and paperwork ──────────
// About 90 days of fill-ups for Acme, with a few planted problems so the
// AI Fuel Hub has something to find (Fuel Hub, Insights, "Run analysis"):
//  - KDK 101A: one fill-up larger than its 300 L tank, one receipt total
//    that does not match litres x price
//  - KDK 202B: an odometer reading lower than the previous one
//  - KDL 303C: the same fill-up entered twice, minutes apart
//  - KDL 404D: one fill-up at a price far above that week's
//  - KDM 505E: fuel use creeping up about 25% over the last month
// Deterministic (fixed pseudo-random seed), and only seeded once.
async function seedCompanyFuel(company, vehicles, drivers) {
  await prisma.organization.update({ where: { id: company.id }, data: { fuelHubEnabled: true, aiFuelAnalyticsEnabled: true } });
  if (await prisma.fuelRecord.findFirst({ where: { organizationId: company.id } })) return;

  let state = 20261116;
  const rand = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const between = (a, b) => a + (b - a) * rand();
  const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

  const [truck, van, pickup, car, fuso] = vehicles;
  const plan = [
    { bus: truck, driver: drivers[0], tank: 300, l100: 30, everyDays: 1.5, km: [400, 500], fuel: 'DIESEL' },
    { bus: van, driver: drivers[1], tank: 70, l100: 10, everyDays: 1.5, km: [380, 480], fuel: 'DIESEL' },
    { bus: pickup, driver: drivers[2], tank: 80, l100: 11, everyDays: 2, km: [350, 450], fuel: 'DIESEL' },
    { bus: car, driver: drivers[3], tank: 50, l100: 7, everyDays: 3, km: [380, 480], fuel: 'PETROL' },
    { bus: fuso, driver: null, tank: 200, l100: 28, everyDays: 1.5, km: [350, 450], fuel: 'DIESEL', driftLast30: 1.25, endDaysAgo: 4 },
  ];
  const PRICE = { DIESEL: 171, PETROL: 188 };

  for (const p of plan) {
    await prisma.vehicleFuelProfile.upsert({
      where: { busId: p.bus.id },
      update: {},
      create: { organizationId: company.id, busId: p.bus.id, fuelType: p.fuel, tankCapacityLitres: p.tank, expectedConsumptionL100km: p.l100 },
    });
    // Walk back from today so the last reading sits just below the
    // vehicle's current odometer.
    const fills = [];
    for (let daysAgo = p.endDaysAgo || 1; daysAgo < 90; daysAgo += p.everyDays) {
      const km = Math.round(between(...p.km));
      const drift = p.driftLast30 && daysAgo <= 30 ? p.driftLast30 : 1;
      const at = new Date(Date.now() - daysAgo * DAY);
      at.setUTCHours(3 + Math.floor(between(0, 13)), Math.floor(between(0, 60)), 0, 0); // 06:00-19:00 in Nairobi
      fills.push({ daysAgo, km, litres: round(km * p.l100 / 100 * between(0.95, 1.05) * drift, 1), filledAt: at });
    }
    let odometer = (p.bus.odometerKm || 100000) - 30;
    for (const f of fills) { f.odometer = odometer; odometer -= f.km; }
    fills.reverse();

    const rows = fills.map((f) => {
      const price = round(PRICE[p.fuel] + between(-2, 2));
      return {
        organizationId: company.id, busId: p.bus.id, driverId: p.driver?.profile.id ?? null, litres: f.litres,
        pricePerLitre: price, totalCost: round(f.litres * price), odometer: f.odometer, station: rand() < 0.6 ? 'Shell Mombasa Rd' : 'Rubis Industrial Area',
        filledAt: f.filledAt, source: 'MANUAL',
      };
    });

    // Planted problems.
    const near = (daysAgo) => rows.reduce((best, r, i) => (Math.abs((Date.now() - r.filledAt) / DAY - daysAgo) < Math.abs((Date.now() - rows[best].filledAt) / DAY - daysAgo) ? i : best), 0);
    if (p.bus === truck) {
      const i = near(10);
      rows[i].litres = 342; rows[i].totalCost = round(342 * rows[i].pricePerLitre);
      const j = near(25);
      rows[j].totalCost = round(rows[j].totalCost + 4500);
    }
    if (p.bus === van) {
      const i = near(20);
      rows[i].odometer = rows[i - 1].odometer - 120;
    }
    if (p.bus === pickup) {
      const i = near(15);
      rows.splice(i + 1, 0, { ...rows[i], filledAt: new Date(rows[i].filledAt.getTime() + 8 * 60 * 1000) });
    }
    if (p.bus === car) {
      const i = near(7);
      rows[i].pricePerLitre = 239; rows[i].totalCost = round(rows[i].litres * 239);
    }
    await prisma.fuelRecord.createMany({ data: rows });
  }
}

// Some services are overdue and some documents are expiring, so the
// dashboard's "needs attention" list has something in it.
async function seedCompany() {
  const company = await organization('demo-company', { name: 'Acme Logistics', profile: 'COMPANY', fuelHubEnabled: true });
  await member(company, `co-admin${DEMO}`, 'ORG_ADMIN', ...OWNER);
  await member(company, `co-manager${DEMO}`, 'FLEET_MANAGER', ...OWNER);
  const coDriver = await member(company, `co-driver${DEMO}`, 'DRIVER', ...OWNER);
  // Other drivers of the fleet (no sign-in needed for the demo).
  const others = [];
  for (const [first, last] of [['Otieno', 'Kamau'], ['Akinyi', 'Wanjiru'], ['Mutua', 'Njoroge']]) {
    others.push(await member(company, `co-${first.toLowerCase()}${DEMO}`, 'DRIVER', first, last));
  }
  const drivers = [coDriver, ...others];
  const licences = [
    { licenseNumber: 'DL-4471209', licenseClass: 'BCE', licenseExpiry: daysFromNow(400), phone: '0712 000 001', employeeNo: 'ACM-001', hireDate: daysFromNow(-900) },
    { licenseNumber: 'DL-3392011', licenseClass: 'CE', licenseExpiry: daysFromNow(20), phone: '0712 000 002', employeeNo: 'ACM-002', hireDate: daysFromNow(-600) },
    { licenseNumber: 'DL-5520347', licenseClass: 'B', licenseExpiry: daysFromNow(-5), phone: '0712 000 003', employeeNo: 'ACM-003', hireDate: daysFromNow(-300) },
    { licenseNumber: 'DL-6610998', licenseClass: 'BC', licenseExpiry: daysFromNow(700), phone: '0712 000 004', employeeNo: 'ACM-004', hireDate: daysFromNow(-120), status: 'ON_LEAVE' },
  ];
  for (const [i, d] of drivers.entries()) await prisma.driver.update({ where: { id: d.profile.id }, data: licences[i] });

  const route = await routeWithStops(company, 'Industrial Area Shuttle', [
    { name: 'Depot - Mombasa Road', tier: 'TOWN', lat: -1.3190, lng: 36.8520 },
    { name: 'Enterprise Road Warehouse', tier: 'TOWN', lat: -1.3050, lng: 36.8500 },
    { name: 'Lunga Lunga Yard', tier: 'TOWN', lat: -1.3010, lng: 36.8650 },
  ]);

  const fleet = [
    { licensePlate: 'KDK 101A', vehicleType: 'TRUCK', make: 'Isuzu', model: 'FVZ', year: 2020, odometerKm: 184500, fuelType: 'DIESEL', ownership: 'OWNED', capacity: 3, driver: 0, routeId: route.id },
    { licensePlate: 'KDK 202B', vehicleType: 'VAN', make: 'Toyota', model: 'HiAce', year: 2022, odometerKm: 61200, fuelType: 'DIESEL', ownership: 'LEASED', capacity: 14, driver: 1 },
    { licensePlate: 'KDL 303C', vehicleType: 'PICKUP', make: 'Toyota', model: 'Hilux', year: 2019, odometerKm: 142300, fuelType: 'DIESEL', ownership: 'OWNED', capacity: 5, driver: 2 },
    { licensePlate: 'KDL 404D', vehicleType: 'CAR', make: 'Toyota', model: 'Corolla', year: 2021, odometerKm: 38900, fuelType: 'PETROL', ownership: 'OWNED', capacity: 5 },
    { licensePlate: 'KDM 505E', vehicleType: 'TRUCK', make: 'Mitsubishi', model: 'Fuso Fighter', year: 2018, odometerKm: 251700, fuelType: 'DIESEL', ownership: 'OWNED', capacity: 3, status: 'IN_MAINTENANCE' },
    { licensePlate: 'KDM 606F', vehicleType: 'MOTORCYCLE', make: 'TVS', model: 'HLX 150', year: 2023, odometerKm: 9100, fuelType: 'PETROL', ownership: 'OWNED', capacity: 2 },
  ];
  const vehicles = [];
  for (const { driver, ...v } of fleet) {
    const driverId = driver != null ? drivers[driver].profile.id : null;
    const bus = await prisma.bus.upsert({
      where: { organizationId_licensePlate: { organizationId: company.id, licensePlate: v.licensePlate } },
      update: {},
      create: { organizationId: company.id, ...v, driverId, acquiredAt: daysFromNow(-365 * (2024 - v.year + 1)) },
    });
    vehicles.push(bus);
    if (driverId && !(await prisma.vehicleAssignment.findFirst({ where: { busId: bus.id, endedAt: null } }))) {
      await prisma.vehicleAssignment.create({ data: { organizationId: company.id, busId: bus.id, driverId, startedAt: daysFromNow(-90) } });
    }
  }
  const [truck, van, pickup, car, fuso] = vehicles;

  if (!(await prisma.maintenanceSchedule.findFirst({ where: { organizationId: company.id } }))) {
    const schedule = (bus, name, intervalKm, intervalDays, lastKm, lastDaysAgo) => prisma.maintenanceSchedule.create({
      data: { organizationId: company.id, busId: bus.id, name, intervalKm, intervalDays, lastDoneOdometer: lastKm, lastDoneAt: daysFromNow(-lastDaysAgo) },
    });
    await schedule(truck, 'Oil & filter change', 10000, 180, 175200, 60); // due soon by km
    await schedule(truck, 'Annual inspection', null, 365, null, 350); // due soon by date
    await schedule(van, 'Full service', 20000, 365, 40000, 200); // overdue by km
    await schedule(pickup, 'Oil & filter change', 5000, 180, 139000, 40);
    await schedule(car, 'Full service', 15000, 365, 30000, 100);
    const brake = await schedule(fuso, 'Brake inspection', 15000, 180, 236000, 200); // overdue
    await prisma.serviceRecord.create({
      data: {
        organizationId: company.id, busId: fuso.id, scheduleId: brake.id, type: 'REPAIR', description: 'Replaced rear brake pads',
        servicedAt: daysFromNow(-200), odometerKm: 236000, vendor: 'Mombasa Road Motors', partsCost: 18500, labourCost: 4500, totalCost: 23000,
      },
    });
    await prisma.serviceRecord.create({
      data: {
        organizationId: company.id, busId: truck.id, type: 'TYRES', description: 'Two new front tyres', servicedAt: daysFromNow(-30),
        odometerKm: 182000, vendor: 'Tyre World', partsCost: 64000, labourCost: 2000, totalCost: 66000,
      },
    });
  }

  if (!(await prisma.document.findFirst({ where: { organizationId: company.id } }))) {
    const doc = (data) => prisma.document.create({ data: { organizationId: company.id, ...data } });
    for (const [i, bus] of vehicles.entries()) {
      await doc({ entityType: 'VEHICLE', busId: bus.id, kind: 'INSURANCE', number: `POL-${7700 + i}`, issuedAt: daysFromNow(-300), expiresAt: daysFromNow(i === 1 ? 12 : i === 4 ? -3 : 65 + i * 30) });
    }
    await doc({ entityType: 'VEHICLE', busId: truck.id, kind: 'INSPECTION_CERT', number: 'NTSA-55120', expiresAt: daysFromNow(25) });
    await doc({ entityType: 'VEHICLE', busId: truck.id, kind: 'REGISTRATION', number: 'LOGBOOK-KDK101A' });
    await doc({ entityType: 'DRIVER', driverId: drivers[0].profile.id, kind: 'PSV_BADGE', number: 'PSV-20931', expiresAt: daysFromNow(9) });
    await doc({ entityType: 'DRIVER', driverId: drivers[1].profile.id, kind: 'MEDICAL', expiresAt: daysFromNow(180) });
  }

  if (!(await prisma.defectReport.findFirst({ where: { organizationId: company.id } }))) {
    await prisma.defectReport.create({
      data: {
        organizationId: company.id, busId: van.id, driverId: drivers[1].profile.id, reportedById: drivers[1].user.id,
        description: 'Front left tyre loses pressure overnight', severity: 'HIGH',
      },
    });
    await prisma.defectReport.create({
      data: { organizationId: company.id, busId: truck.id, driverId: drivers[0].profile.id, description: 'Reverse beeper not working', severity: 'LOW' },
    });
  }

  await seedCompanyFuel(company, vehicles, drivers);

  // A daily shuttle run for the demo driver's truck.
  if (!(await prisma.pickupSlot.findFirst({ where: { organizationId: company.id } }))) {
    await prisma.pickupSlot.create({
      data: { organizationId: company.id, routeId: route.id, busId: truck.id, direction: 'PICKUP', time: '07:00', label: 'Morning loop', capacity: 3, daysOfWeek: [1, 2, 3, 4, 5, 6] },
    });
  }
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

  // ── Runs and a standing booking for the university route ─────────────
  const run = async (org, routeId, busId, direction, time, label) => (
    await prisma.pickupSlot.findFirst({ where: { organizationId: org.id, routeId, direction, time } })
  ) || prisma.pickupSlot.create({
    data: { organizationId: org.id, routeId, busId, direction, time, label, capacity: 33, daysOfWeek: [1, 2, 3, 4, 5] },
  });
  const morning = await run(uni, uniRoute.id, uniBus.id, 'PICKUP', '06:30', 'Morning');
  await run(uni, uniRoute.id, uniBus.id, 'PICKUP', '07:30', 'Late morning');
  const evening = await run(uni, uniRoute.id, uniBus.id, 'DROPOFF', '17:00', 'Evening');
  for (const [direction, slot] of [['PICKUP', morning], ['DROPOFF', evening]]) {
    await prisma.rideBooking.upsert({
      where: { studentId_direction: { studentId: uniStudent.profile.id, direction } },
      update: {},
      create: { organizationId: uni.id, studentId: uniStudent.profile.id, direction, slotId: slot.id, pickupPointId: uniRoute.pickupPoints[0].id },
    });
  }

  await seedCompany();

  // Road lines for the demo routes (skipped when ROUTING_URL is empty).
  await fillRouteGeometry(prisma).catch((err) => console.log(`Route lines skipped: ${err.message}`));

  console.log('Seed complete: Demo University (demo-university), Demo Academy (demo-school) and Acme Logistics (demo-company).');
  console.log(`Demo accounts use ${DEMO}; sign in with them when DEV_LOGIN=true.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
