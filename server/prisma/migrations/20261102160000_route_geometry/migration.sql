-- Road route geometry from the routing service.
ALTER TABLE "Route" ADD COLUMN     "distanceMeters" DOUBLE PRECISION,
ADD COLUMN     "durationSeconds" DOUBLE PRECISION,
ADD COLUMN     "geometry" JSONB,
ADD COLUMN     "geometryUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "legs" JSONB;
