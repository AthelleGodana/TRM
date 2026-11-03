// Generates road route lines for routes that have two or more pinned stops
// but no stored geometry yet (or every such route with --all).
//
//   npm run routes:geometry          only routes without a road line
//   npm run routes:geometry -- --all regenerate every route
//
// Runs as the owner connection (DIRECT_DATABASE_URL), across organisations.
import { fileURLToPath } from 'url';
import { Prisma, PrismaClient } from '@prisma/client';
import { routeThrough, routingEnabled } from '../src/services/routing.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fillRouteGeometry(prisma, { all = false, log = console.log } = {}) {
  if (!routingEnabled()) {
    log('Road routing is turned off (ROUTING_URL is empty); skipping route lines.');
    return { updated: 0, failed: 0 };
  }
  const routes = await prisma.route.findMany({
    where: all ? {} : { geometry: { equals: Prisma.DbNull } },
    include: { pickupPoints: { orderBy: { order: 'asc' } } },
  });
  let updated = 0;
  let failed = 0;
  for (const route of routes) {
    const points = route.pickupPoints.filter((p) => p.lat != null && p.lng != null);
    if (points.length < 2) continue;
    try {
      const data = await routeThrough(points);
      await prisma.route.update({ where: { id: route.id }, data: { ...data, geometryUpdatedAt: new Date() } });
      updated += 1;
      log(`Road line for "${route.name}": ${(data.distanceMeters / 1000).toFixed(1)} km, ${Math.round(data.durationSeconds / 60)} min`);
    } catch (err) {
      failed += 1;
      log(`Could not route "${route.name}": ${err.message}`);
    }
    await pause(1100); // the public OSRM server allows about one request a second
  }
  return { updated, failed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL } } });
  fillRouteGeometry(prisma, { all: process.argv.includes('--all') })
    .then(({ updated, failed }) => console.log(`Done: ${updated} updated, ${failed} failed.`))
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
