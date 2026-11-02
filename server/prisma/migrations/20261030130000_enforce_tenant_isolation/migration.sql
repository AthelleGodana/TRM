-- DropIndex
DROP INDEX "Bus_licensePlate_key";

-- DropIndex
DROP INDEX "Driver_userId_key";

-- DropIndex
DROP INDEX "GpsLog_busId_recordedAt_idx";

-- DropIndex
DROP INDEX "Student_userId_key";

-- AlterTable
ALTER TABLE "Bus" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Driver" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "GpsLog" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "PickupPoint" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "PickupSlot" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Route" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "Student" ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "TripRoster" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- AlterTable
ALTER TABLE "VehicleLog" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "organizationId" SET DEFAULT (NULLIF(current_setting('app.current_org', true), ''))::integer;

-- CreateIndex
CREATE INDEX "Bus_organizationId_routeId_idx" ON "Bus"("organizationId", "routeId");

-- CreateIndex
CREATE INDEX "Bus_organizationId_driverId_idx" ON "Bus"("organizationId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Bus_organizationId_licensePlate_key" ON "Bus"("organizationId", "licensePlate");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_organizationId_userId_key" ON "Driver"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "GpsLog_organizationId_busId_recordedAt_idx" ON "GpsLog"("organizationId", "busId", "recordedAt");

-- CreateIndex
CREATE INDEX "Payment_organizationId_status_idx" ON "Payment"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Payment_organizationId_studentId_idx" ON "Payment"("organizationId", "studentId");

-- CreateIndex
CREATE INDEX "Payment_checkoutRequestId_idx" ON "Payment"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "PickupPoint_organizationId_routeId_idx" ON "PickupPoint"("organizationId", "routeId");

-- CreateIndex
CREATE INDEX "PickupSlot_organizationId_routeId_idx" ON "PickupSlot"("organizationId", "routeId");

-- CreateIndex
CREATE INDEX "Route_organizationId_isActive_idx" ON "Route"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Student_organizationId_routeId_idx" ON "Student"("organizationId", "routeId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_organizationId_userId_key" ON "Student"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "TripRoster_organizationId_busId_tripDate_idx" ON "TripRoster"("organizationId", "busId", "tripDate");

-- CreateIndex
CREATE INDEX "TripRoster_organizationId_studentId_tripDate_idx" ON "TripRoster"("organizationId", "studentId", "tripDate");

-- CreateIndex
CREATE INDEX "VehicleLog_organizationId_busId_createdAt_idx" ON "VehicleLog"("organizationId", "busId", "createdAt");


-- ── Row-level security (defence in depth) ─────────────────────────────────
-- The API sets app.current_org per transaction (SET LOCAL semantics via
-- set_config(..., true)). With no setting, NULLIF(...) yields NULL and no
-- rows match, so a missing context fails closed. FORCE makes the policies
-- apply to the table owner too; superusers and BYPASSRLS roles still bypass
-- them, which is why the API connects as a dedicated application role.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Student', 'Driver', 'Route', 'PickupPoint', 'Bus', 'PickupSlot',
    'TripRoster', 'VehicleLog', 'GpsLog', 'Payment',
    'Membership', 'Invitation', 'AccessRequest'
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

-- ── Same-tenant references ────────────────────────────────────────────────
-- Foreign keys and RLS do not stop a row in org A from pointing at a row in
-- org B (e.g. assigning another tenant's driver to a bus). This trigger
-- checks every listed reference column against the referenced table's
-- organizationId. Arguments come in (column, referenced table) pairs.
CREATE OR REPLACE FUNCTION enforce_same_tenant() RETURNS trigger AS $$
DECLARE
  i integer := 0;
  ref_id integer;
  ok boolean;
BEGIN
  WHILE i < TG_NARGS LOOP
    EXECUTE format('SELECT ($1).%I', TG_ARGV[i]) INTO ref_id USING NEW;
    IF ref_id IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE "id" = $1 AND "organizationId" = $2)', TG_ARGV[i + 1])
        INTO ok USING ref_id, NEW."organizationId";
      IF NOT ok THEN
        RAISE EXCEPTION 'cross-tenant reference: %.% -> %', TG_TABLE_NAME, TG_ARGV[i], TG_ARGV[i + 1]
          USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "Student"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant(
    'routeId', 'Route', 'arrivePickupPointId', 'PickupPoint', 'departPickupPointId', 'PickupPoint');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "PickupPoint"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('routeId', 'Route');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "Bus"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('driverId', 'Driver', 'routeId', 'Route');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "PickupSlot"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('routeId', 'Route', 'busId', 'Bus');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "TripRoster"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus', 'slotId', 'PickupSlot', 'studentId', 'Student');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "VehicleLog"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "GpsLog"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('busId', 'Bus');
CREATE TRIGGER same_tenant BEFORE INSERT OR UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION enforce_same_tenant('studentId', 'Student', 'routeId', 'Route');
