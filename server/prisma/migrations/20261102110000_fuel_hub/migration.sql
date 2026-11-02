-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID', 'CNG', 'LPG');

-- CreateEnum
CREATE TYPE "FuelSource" AS ENUM ('MANUAL', 'FUEL_CARD');

-- CreateEnum
CREATE TYPE "FuelCardStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FuelAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AnomalyStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Bus" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Driver" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "GpsLog" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "PassengerGuardian" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "PickupPoint" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "PickupSlot" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Route" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Student" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "TripRoster" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "VehicleLog" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- CreateTable
CREATE TABLE "VehicleFuelProfile" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "busId" INTEGER NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "tankCapacityLitres" DECIMAL(8,2) NOT NULL,
    "expectedConsumptionL100km" DECIMAL(6,2) NOT NULL,
    "calibrationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleFuelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelCard" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "label" TEXT NOT NULL,
    "provider" TEXT,
    "last4" VARCHAR(4) NOT NULL,
    "busId" INTEGER,
    "driverId" INTEGER,
    "status" "FuelCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "monthlyLimit" DECIMAL(12,2),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelRecord" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "busId" INTEGER NOT NULL,
    "driverId" INTEGER,
    "fuelCardId" INTEGER,
    "litres" DECIMAL(10,2) NOT NULL,
    "pricePerLitre" DECIMAL(10,2),
    "totalCost" DECIMAL(12,2),
    "odometer" INTEGER,
    "station" TEXT,
    "filledAt" TIMESTAMP(3) NOT NULL,
    "source" "FuelSource" NOT NULL DEFAULT 'MANUAL',
    "receiptImageUrl" TEXT,
    "notes" TEXT,
    "createdById" INTEGER,
    "legacyVehicleLogId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationRecord" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "busId" INTEGER NOT NULL,
    "calibratedAt" TIMESTAMP(3) NOT NULL,
    "odometer" INTEGER,
    "tankLevelLitres" DECIMAL(8,2),
    "measuredConsumptionL100km" DECIMAL(6,2),
    "method" TEXT,
    "notes" TEXT,
    "performedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelAnalysisRun" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "status" "FuelAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "anomaliesFound" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "FuelAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelAnomaly" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "runId" INTEGER,
    "busId" INTEGER,
    "fuelRecordId" INTEGER,
    "type" TEXT NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "explanation" JSONB NOT NULL,
    "status" "AnomalyStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleFuelProfile_busId_key" ON "VehicleFuelProfile"("busId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleFuelProfile_organizationId_busId_key" ON "VehicleFuelProfile"("organizationId", "busId");

-- CreateIndex
CREATE INDEX "FuelCard_organizationId_status_idx" ON "FuelCard"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FuelRecord_legacyVehicleLogId_key" ON "FuelRecord"("legacyVehicleLogId");

-- CreateIndex
CREATE INDEX "FuelRecord_organizationId_busId_filledAt_idx" ON "FuelRecord"("organizationId", "busId", "filledAt");

-- CreateIndex
CREATE INDEX "FuelRecord_organizationId_filledAt_idx" ON "FuelRecord"("organizationId", "filledAt");

-- CreateIndex
CREATE INDEX "FuelRecord_organizationId_driverId_idx" ON "FuelRecord"("organizationId", "driverId");

-- CreateIndex
CREATE INDEX "CalibrationRecord_organizationId_busId_calibratedAt_idx" ON "CalibrationRecord"("organizationId", "busId", "calibratedAt");

-- CreateIndex
CREATE INDEX "FuelAnalysisRun_organizationId_startedAt_idx" ON "FuelAnalysisRun"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "FuelAnomaly_organizationId_status_createdAt_idx" ON "FuelAnomaly"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FuelAnomaly_organizationId_busId_idx" ON "FuelAnomaly"("organizationId", "busId");

-- AddForeignKey
ALTER TABLE "VehicleFuelProfile" ADD CONSTRAINT "VehicleFuelProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleFuelProfile" ADD CONSTRAINT "VehicleFuelProfile_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelCard" ADD CONSTRAINT "FuelCard_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_fuelCardId_fkey" FOREIGN KEY ("fuelCardId") REFERENCES "FuelCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRecord" ADD CONSTRAINT "FuelRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationRecord" ADD CONSTRAINT "CalibrationRecord_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnalysisRun" ADD CONSTRAINT "FuelAnalysisRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FuelAnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_fuelRecordId_fkey" FOREIGN KEY ("fuelRecordId") REFERENCES "FuelRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelAnomaly" ADD CONSTRAINT "FuelAnomaly_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Tenant isolation (see 20261030130000_enforce_tenant_isolation) ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'VehicleFuelProfile', 'FuelCard', 'FuelRecord', 'CalibrationRecord', 'FuelAnalysisRun', 'FuelAnomaly'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organizationId" = NULLIF(current_setting(''app.current_org'', true), '''')::integer)
         WITH CHECK ("organizationId" = NULLIF(current_setting(''app.current_org'', true), '''')::integer)',
      t);
  END LOOP;
END $$;

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "VehicleFuelProfile"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "FuelCard"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus', 'driverId', 'Driver');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "FuelRecord"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus', 'driverId', 'Driver', 'fuelCardId', 'FuelCard');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "CalibrationRecord"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "FuelAnomaly"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('runId', 'FuelAnalysisRun', 'busId', 'Bus', 'fuelRecordId', 'FuelRecord');

-- ── Copy existing VehicleLog FUEL entries into FuelRecord ─────────────────
-- VehicleLog is left unchanged. Entries without litres cannot become fuel
-- records and are skipped. legacyVehicleLogId keeps the copy idempotent.
INSERT INTO "FuelRecord" (
  "organizationId", "busId", "litres", "pricePerLitre", "totalCost", "odometer",
  "notes", "filledAt", "source", "legacyVehicleLogId", "createdAt", "updatedAt"
)
SELECT v."organizationId",
       v."busId",
       round(v."fuelLiters"::numeric, 2),
       CASE WHEN v."fuelCost" IS NOT NULL THEN round(v."fuelCost" / v."fuelLiters"::numeric, 2) END,
       v."fuelCost",
       v."odometer",
       v."notes",
       v."createdAt",
       'MANUAL',
       v."id",
       v."createdAt",
       CURRENT_TIMESTAMP
FROM "VehicleLog" v
WHERE v."type" = 'FUEL' AND v."fuelLiters" IS NOT NULL AND v."fuelLiters" > 0
ON CONFLICT ("legacyVehicleLogId") DO NOTHING;
