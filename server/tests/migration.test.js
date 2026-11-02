import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

// Proves the multi-tenancy data migration against a database shaped like the
// pre-tenancy production schema: legacy rows are applied first, then every
// later migration runs on top of them, exactly as `prisma migrate deploy`
// would on an existing installation.
const MIGRATIONS_DIR = path.resolve(__dirname, '../prisma/migrations');
const LEGACY_MIGRATIONS = ['20260801064655_init', '20260805182959_add_slots_vehiclelog_roster'];
const DB_NAME = 'transtrack_migration_test';

const adminUrl = new URL(process.env.DIRECT_DATABASE_URL);
adminUrl.pathname = '/postgres';
const dbUrl = new URL(process.env.DIRECT_DATABASE_URL);
dbUrl.pathname = `/${DB_NAME}`;

let db;

async function applyMigration(name) {
  await db.query(fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
}

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();

  db = new pg.Client({ connectionString: dbUrl.toString() });
  await db.connect();
  for (const name of LEGACY_MIGRATIONS) await applyMigration(name);

  await db.query(`
    INSERT INTO "User" (id, username, password, "firstName", "lastName", role) VALUES
      (1, 'admin',    'h', 'Sys',  'Admin',  'admin'),
      (2, 'driver1',  'h', 'John', 'Mwangi', 'driver'),
      (3, 'student1', 'h', 'Jane', 'Doe',    'student'),
      (4, 'student2', 'h', 'Ann',  'Twin',   'student'),
      (5, 'student3', 'h', 'Bob',  'Twin',   'student');
    INSERT INTO "Driver" (id, "userId") VALUES (1, 2);
    INSERT INTO "Student" (id, "userId", email) VALUES
      (1, 3, ' Jane@Example.com '), (2, 4, 'twins@example.com'), (3, 5, 'twins@example.com');
    INSERT INTO "Route" (id, name) VALUES (1, 'Route A');
    INSERT INTO "PickupPoint" (id, "routeId", name, tier) VALUES (1, 1, 'Town', 'TOWN');
    INSERT INTO "Bus" (id, "licensePlate", "driverId", "routeId") VALUES (1, 'KDA 123X', 1, 1);
    INSERT INTO "PickupSlot" (id, "routeId", "busId", time, label) VALUES (1, 1, 1, '06:30', 'Morning');
    INSERT INTO "TripRoster" (id, "busId", "slotId", "studentId") VALUES (1, 1, 1, 1);
    INSERT INTO "VehicleLog" (id, "busId", type, "fuelLiters", "fuelCost", odometer) VALUES
      (1, 1, 'FUEL', 40, 7200, 1000), (2, 1, 'MAINTENANCE', NULL, NULL, NULL);
    INSERT INTO "GpsLog" (id, "busId", lat, lng) VALUES (1, 1, -1.28, 36.82);
    INSERT INTO "Payment" (id, "studentId", amount) VALUES (1, 1, 1500);
  `);

  const later = fs.readdirSync(MIGRATIONS_DIR)
    .filter((n) => fs.statSync(path.join(MIGRATIONS_DIR, n)).isDirectory())
    .filter((n) => !LEGACY_MIGRATIONS.includes(n))
    .sort();
  for (const name of later) await applyMigration(name);
});

afterAll(async () => {
  await db?.end();
});

const TENANT_TABLES = [
  'Student', 'Driver', 'Route', 'PickupPoint', 'Bus',
  'PickupSlot', 'TripRoster', 'VehicleLog', 'GpsLog', 'Payment',
];

describe('multi-tenancy data migration', () => {
  it('creates an active Default Organisation', async () => {
    const { rows } = await db.query(`SELECT * FROM "Organization"`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: 'default', status: 'ACTIVE', profile: 'UNIVERSITY' });
  });

  it('backfills organizationId on every tenant table', async () => {
    const { rows: [org] } = await db.query(`SELECT id FROM "Organization" WHERE slug = 'default'`);
    for (const table of TENANT_TABLES) {
      const { rows } = await db.query(
        `SELECT count(*)::int AS missing FROM "${table}" WHERE "organizationId" IS DISTINCT FROM $1`,
        [org.id]
      );
      expect(rows[0].missing, table).toBe(0);
    }
  });

  it('makes organizationId NOT NULL on every tenant table', async () => {
    const { rows } = await db.query(`
      SELECT table_name, is_nullable FROM information_schema.columns
      WHERE column_name = 'organizationId' AND table_name = ANY($1)`, [TENANT_TABLES]);
    expect(rows).toHaveLength(TENANT_TABLES.length);
    expect(rows.filter((r) => r.is_nullable === 'YES')).toEqual([]);
  });

  it('enables and forces row-level security on every tenant table', async () => {
    const rlsTables = [
      ...TENANT_TABLES, 'Membership', 'Invitation', 'AccessRequest', 'PassengerGuardian',
      'VehicleFuelProfile', 'FuelCard', 'FuelRecord', 'CalibrationRecord', 'FuelAnalysisRun', 'FuelAnomaly',
    ];
    const { rows } = await db.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY($1)`,
      [rlsTables]
    );
    expect(rows).toHaveLength(rlsTables.length);
    for (const r of rows) expect([r.relname, r.relrowsecurity, r.relforcerowsecurity]).toEqual([r.relname, true, true]);
  });

  it('creates a membership for every user with the mapped role', async () => {
    const { rows } = await db.query(
      `SELECT "userId", role FROM "Membership" ORDER BY "userId"`
    );
    expect(rows.map((r) => [r.userId, r.role])).toEqual([
      [1, 'ORG_ADMIN'], [2, 'DRIVER'], [3, 'STUDENT'], [4, 'STUDENT'], [5, 'STUDENT'],
    ]);
  });

  it('copies VehicleLog FUEL entries into FuelRecord and leaves VehicleLog unchanged', async () => {
    const { rows } = await db.query(`SELECT * FROM "FuelRecord"`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ busId: 1, odometer: 1000, source: 'MANUAL', legacyVehicleLogId: 1 });
    expect(Number(rows[0].litres)).toBe(40);
    expect(Number(rows[0].totalCost)).toBe(7200);
    expect(Number(rows[0].pricePerLitre)).toBe(180);
    const { rows: logs } = await db.query(`SELECT count(*)::int AS n FROM "VehicleLog"`);
    expect(logs[0].n).toBe(2);
  });

  it('copies unique student emails onto users and skips shared ones', async () => {
    const { rows } = await db.query(`SELECT id, email FROM "User" ORDER BY id`);
    expect(rows.find((r) => r.id === 3).email).toBe('jane@example.com');
    expect(rows.find((r) => r.id === 4).email).toBeNull();
    expect(rows.find((r) => r.id === 5).email).toBeNull();
  });
});
