-- CreateEnum
CREATE TYPE "OrgProfile" AS ENUM ('UNIVERSITY', 'SCHOOL', 'COMPANY');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('ORG_ADMIN', 'FLEET_MANAGER', 'DRIVER', 'STUDENT', 'PARENT');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Bus" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "GpsLog" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "PickupPoint" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "PickupSlot" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "Route" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "TripRoster" ADD COLUMN     "organizationId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT,
ADD COLUMN     "googleSub" TEXT,
ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "picture" TEXT,
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "password" DROP NOT NULL,
ALTER COLUMN "role" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VehicleLog" ADD COLUMN     "organizationId" INTEGER;

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "profile" "OrgProfile" NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'PENDING',
    "branding" JSONB NOT NULL DEFAULT '{}',
    "fuelHubEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiFuelAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "role" "MemberRole" NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" INTEGER,
    "acceptedById" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" SERIAL NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "organizationId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_organizationId_role_idx" ON "Membership"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_status_idx" ON "Invitation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Invitation_email_status_idx" ON "Invitation"("email", "status");

-- CreateIndex
CREATE INDEX "AccessRequest_organizationId_status_idx" ON "AccessRequest"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_organizationId_userId_key" ON "AccessRequest"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupPoint" ADD CONSTRAINT "PickupPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRoster" ADD CONSTRAINT "TripRoster_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleLog" ADD CONSTRAINT "VehicleLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GpsLog" ADD CONSTRAINT "GpsLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Data migration: move existing single-tenant data into a default org ──
-- Only runs when there is existing data, so fresh installs start empty.
-- The default organisation uses the UNIVERSITY profile because existing
-- students hold their own accounts (SCHOOL pupils do not).
INSERT INTO "Organization" ("name", "slug", "profile", "status", "approvedAt", "updatedAt")
SELECT 'Default Organisation', 'default', 'UNIVERSITY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "User")
   OR EXISTS (SELECT 1 FROM "Bus")
   OR EXISTS (SELECT 1 FROM "Route");

UPDATE "Student"     SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "Driver"      SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "Route"       SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "PickupPoint" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "Bus"         SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "PickupSlot"  SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "TripRoster"  SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "VehicleLog"  SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "GpsLog"      SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;
UPDATE "Payment"     SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "slug" = 'default') WHERE "organizationId" IS NULL;

-- Every existing user becomes a member of the default organisation.
INSERT INTO "Membership" ("userId", "organizationId", "role")
SELECT u."id",
       o."id",
       (CASE u."role"
          WHEN 'admin'   THEN 'ORG_ADMIN'
          WHEN 'driver'  THEN 'DRIVER'
          ELSE 'STUDENT'
        END)::"MemberRole"
FROM "User" u
CROSS JOIN "Organization" o
WHERE o."slug" = 'default';

-- Copy student contact emails onto the user so their first Google sign-in
-- can be matched to the existing account. Emails shared by more than one
-- student are skipped (they cannot identify a single account).
UPDATE "User" u
SET "email" = lower(trim(s."email"))
FROM "Student" s
WHERE s."userId" = u."id"
  AND s."email" IS NOT NULL
  AND trim(s."email") <> ''
  AND u."email" IS NULL
  AND (SELECT count(*) FROM "Student" s2 WHERE lower(trim(s2."email")) = lower(trim(s."email"))) = 1;
