-- AlterTable
ALTER TABLE "Bus" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Driver" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "GpsLog" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "PickupPoint" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "PickupSlot" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Route" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "TripRoster" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "VehicleLog" ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- CreateTable
CREATE TABLE "PassengerGuardian" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer,
    "studentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassengerGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PassengerGuardian_organizationId_userId_idx" ON "PassengerGuardian"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerGuardian_organizationId_studentId_userId_key" ON "PassengerGuardian"("organizationId", "studentId", "userId");

-- AddForeignKey
ALTER TABLE "PassengerGuardian" ADD CONSTRAINT "PassengerGuardian_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassengerGuardian" ADD CONSTRAINT "PassengerGuardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassengerGuardian" ADD CONSTRAINT "PassengerGuardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Tenant isolation for guardian links (see 20261030130000_enforce_tenant_isolation).
ALTER TABLE "PassengerGuardian" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PassengerGuardian" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PassengerGuardian"
  USING ("organizationId" = NULLIF(current_setting('app.current_org', true), '')::integer)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.current_org', true), '')::integer);
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "PassengerGuardian"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('studentId', 'Student');
