-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BUS', 'MINIBUS', 'VAN', 'CAR', 'PICKUP', 'TRUCK', 'MOTORCYCLE', 'OTHER');

-- CreateEnum
CREATE TYPE "Ownership" AS ENUM ('OWNED', 'LEASED', 'RENTED');

-- CreateEnum
CREATE TYPE "RideDirection" AS ENUM ('PICKUP', 'DROPOFF');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('SERVICE', 'REPAIR', 'TYRES', 'INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DocumentEntity" AS ENUM ('VEHICLE', 'DRIVER');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('INSURANCE', 'REGISTRATION', 'INSPECTION_CERT', 'ROAD_LICENSE', 'DRIVER_LICENSE', 'PSV_BADGE', 'MEDICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "RideExceptionType" AS ENUM ('SKIP', 'CHANGE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusStatus" ADD VALUE 'IN_MAINTENANCE';
ALTER TYPE "BusStatus" ADD VALUE 'OUT_OF_SERVICE';

-- AlterTable
ALTER TABLE "Bus" ADD COLUMN     "acquiredAt" TIMESTAMP(3),
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "color" TEXT,
ADD COLUMN     "fuelType" "FuelType",
ADD COLUMN     "make" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "odometerKm" INTEGER,
ADD COLUMN     "ownership" "Ownership",
ADD COLUMN     "vehicleType" "VehicleType" NOT NULL DEFAULT 'BUS',
ADD COLUMN     "vin" TEXT,
ADD COLUMN     "year" INTEGER,
ALTER COLUMN "capacity" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "emergencyContact" TEXT,
ADD COLUMN     "employeeNo" TEXT,
ADD COLUMN     "hireDate" TIMESTAMP(3),
ADD COLUMN     "licenseClass" TEXT,
ADD COLUMN     "licenseExpiry" TIMESTAMP(3),
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "DriverStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "PickupSlot" ADD COLUMN     "daysOfWeek" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "direction" "RideDirection" NOT NULL DEFAULT 'PICKUP',
ADD COLUMN     "stopTimeOverrides" JSONB;

-- CreateTable
CREATE TABLE "VehicleAssignment" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "busId" INTEGER NOT NULL,
    "driverId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "assignedById" INTEGER,
    "notes" TEXT,

    CONSTRAINT "VehicleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceSchedule" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "busId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "intervalKm" INTEGER,
    "intervalDays" INTEGER,
    "lastDoneAt" TIMESTAMP(3),
    "lastDoneOdometer" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRecord" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "busId" INTEGER NOT NULL,
    "scheduleId" INTEGER,
    "type" "ServiceType" NOT NULL DEFAULT 'SERVICE',
    "description" TEXT NOT NULL,
    "servicedAt" TIMESTAMP(3) NOT NULL,
    "odometerKm" INTEGER,
    "vendor" TEXT,
    "partsCost" DECIMAL(12,2),
    "labourCost" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectReport" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "busId" INTEGER NOT NULL,
    "driverId" INTEGER,
    "description" TEXT NOT NULL,
    "severity" "DefectSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "DefectStatus" NOT NULL DEFAULT 'OPEN',
    "reportedById" INTEGER,
    "resolvedById" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "serviceRecordId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DefectReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "entityType" "DocumentEntity" NOT NULL,
    "busId" INTEGER,
    "driverId" INTEGER,
    "kind" "DocumentKind" NOT NULL,
    "title" TEXT,
    "number" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "storageKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideBooking" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "studentId" INTEGER NOT NULL,
    "direction" "RideDirection" NOT NULL,
    "slotId" INTEGER NOT NULL,
    "pickupPointId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideException" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "studentId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "direction" "RideDirection" NOT NULL,
    "type" "RideExceptionType" NOT NULL,
    "slotId" INTEGER,
    "pickupPointId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleAssignment_organizationId_busId_startedAt_idx" ON "VehicleAssignment"("organizationId", "busId", "startedAt");

-- CreateIndex
CREATE INDEX "VehicleAssignment_organizationId_driverId_startedAt_idx" ON "VehicleAssignment"("organizationId", "driverId", "startedAt");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_organizationId_busId_idx" ON "MaintenanceSchedule"("organizationId", "busId");

-- CreateIndex
CREATE INDEX "ServiceRecord_organizationId_busId_servicedAt_idx" ON "ServiceRecord"("organizationId", "busId", "servicedAt");

-- CreateIndex
CREATE INDEX "ServiceRecord_organizationId_servicedAt_idx" ON "ServiceRecord"("organizationId", "servicedAt");

-- CreateIndex
CREATE INDEX "DefectReport_organizationId_status_createdAt_idx" ON "DefectReport"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DefectReport_organizationId_busId_idx" ON "DefectReport"("organizationId", "busId");

-- CreateIndex
CREATE INDEX "Document_organizationId_expiresAt_idx" ON "Document"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "Document_organizationId_busId_idx" ON "Document"("organizationId", "busId");

-- CreateIndex
CREATE INDEX "Document_organizationId_driverId_idx" ON "Document"("organizationId", "driverId");

-- CreateIndex
CREATE INDEX "RideBooking_organizationId_slotId_idx" ON "RideBooking"("organizationId", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "RideBooking_studentId_direction_key" ON "RideBooking"("studentId", "direction");

-- CreateIndex
CREATE INDEX "RideException_organizationId_date_idx" ON "RideException"("organizationId", "date");

-- CreateIndex
CREATE INDEX "RideException_organizationId_slotId_date_idx" ON "RideException"("organizationId", "slotId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "RideException_studentId_date_direction_key" ON "RideException"("studentId", "date", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_organizationId_vin_key" ON "Bus"("organizationId", "vin");

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAssignment" ADD CONSTRAINT "VehicleAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectReport" ADD CONSTRAINT "DefectReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectReport" ADD CONSTRAINT "DefectReport_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectReport" ADD CONSTRAINT "DefectReport_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectReport" ADD CONSTRAINT "DefectReport_serviceRecordId_fkey" FOREIGN KEY ("serviceRecordId") REFERENCES "ServiceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideBooking" ADD CONSTRAINT "RideBooking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideBooking" ADD CONSTRAINT "RideBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideBooking" ADD CONSTRAINT "RideBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "PickupSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideBooking" ADD CONSTRAINT "RideBooking_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideException" ADD CONSTRAINT "RideException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideException" ADD CONSTRAINT "RideException_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideException" ADD CONSTRAINT "RideException_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "PickupSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideException" ADD CONSTRAINT "RideException_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "PickupPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Backfill (before RLS is enabled on the new tables) ────────────────────
-- One open assignment for every vehicle that currently has a driver.
INSERT INTO "VehicleAssignment" ("organizationId", "busId", "driverId", "startedAt")
SELECT b."organizationId", b."id", b."driverId", b."createdAt"
FROM "Bus" b
WHERE b."driverId" IS NOT NULL;

-- Existing passengers with a morning stop on their route get a standing
-- PICKUP booking on a run of that route: the run they booked most recently
-- if any, otherwise the earliest active one. Drop-off runs did not exist
-- before, so there is nothing to carry over for that direction.
INSERT INTO "RideBooking" ("organizationId", "studentId", "direction", "slotId", "pickupPointId", "updatedAt")
SELECT s."organizationId", s."id", 'PICKUP', sl."id", s."arrivePickupPointId", CURRENT_TIMESTAMP
FROM "Student" s
JOIN "PickupPoint" p ON p."id" = s."arrivePickupPointId" AND p."routeId" = s."routeId"
JOIN LATERAL (
  SELECT ps."id"
  FROM "PickupSlot" ps
  LEFT JOIN LATERAL (
    SELECT max(r."createdAt") AS last_booked
    FROM "TripRoster" r
    WHERE r."slotId" = ps."id" AND r."studentId" = s."id"
  ) mine ON true
  WHERE ps."routeId" = s."routeId" AND ps."isActive" AND ps."direction" = 'PICKUP'
  ORDER BY mine.last_booked DESC NULLS LAST, ps."time" ASC
  LIMIT 1
) sl ON true;

-- ── Tenant isolation (see 20261030130000_enforce_tenant_isolation) ─────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'VehicleAssignment', 'MaintenanceSchedule', 'ServiceRecord', 'DefectReport', 'Document',
    'RideBooking', 'RideException'
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

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "VehicleAssignment"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus', 'driverId', 'Driver');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "MaintenanceSchedule"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "ServiceRecord"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus', 'scheduleId', 'MaintenanceSchedule');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "DefectReport"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus', 'driverId', 'Driver', 'serviceRecordId', 'ServiceRecord');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "Document"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus', 'driverId', 'Driver');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "RideBooking"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('studentId', 'Student', 'slotId', 'PickupSlot', 'pickupPointId', 'PickupPoint');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "RideException"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('studentId', 'Student', 'slotId', 'PickupSlot', 'pickupPointId', 'PickupPoint');

-- A document belongs to exactly the entity its type names.
ALTER TABLE "Document" ADD CONSTRAINT "Document_entity_check" CHECK (
  ("entityType" = 'VEHICLE' AND "busId" IS NOT NULL AND "driverId" IS NULL) OR
  ("entityType" = 'DRIVER' AND "driverId" IS NOT NULL AND "busId" IS NULL)
);

-- At most one open assignment per vehicle. (One vehicle per driver is
-- enforced by the API; older data may still give a driver two vehicles.)
CREATE UNIQUE INDEX "VehicleAssignment_open_bus_key" ON "VehicleAssignment"("busId") WHERE "endedAt" IS NULL;
