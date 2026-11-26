import prisma, { systemPrisma, asTenant } from '../config/db.js';
import { env } from '../config/env.js';
import { getFuelAnalyticsProvider } from './providers/index.js';
import { CONTRACT_VERSION, validateAnalysisResponse } from './providers/FuelAnalyticsProvider.js';

const num = (d) => (d == null ? null : Number(d));

// Builds the analysis request for the current tenant. Every query runs
// through the tenant client, so only this organisation's data can be sent.
async function buildRequest(organizationId, lookbackDays) {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const [buses, records] = await Promise.all([
    prisma.bus.findMany({ include: { fuelProfile: true }, orderBy: { id: 'asc' } }),
    prisma.fuelRecord.findMany({ where: { filledAt: { gte: since } }, orderBy: { filledAt: 'asc' } }),
  ]);
  return {
    contractVersion: CONTRACT_VERSION,
    organizationId,
    generatedAt: new Date().toISOString(),
    vehicles: buses.map((b) => ({
      id: b.id,
      licensePlate: b.licensePlate,
      fuelType: b.fuelProfile?.fuelType ?? null,
      tankCapacityLitres: num(b.fuelProfile?.tankCapacityLitres),
      expectedConsumptionL100km: num(b.fuelProfile?.expectedConsumptionL100km),
    })),
    fuelRecords: records.map((r) => ({
      id: r.id,
      vehicleId: r.busId,
      driverId: r.driverId,
      litres: num(r.litres),
      pricePerLitre: num(r.pricePerLitre),
      totalCost: num(r.totalCost),
      odometer: r.odometer,
      station: r.station,
      filledAt: r.filledAt.toISOString(),
      source: r.source,
    })),
  };
}

// Every run re-analyses the whole look-back window, so most findings were
// already stored by an earlier run. Keeps only new ones:
//  - about a fill-up: new unless the same type was stored for that fill-up
//    before (whatever its review status, so a dismissed finding stays
//    dismissed);
//  - about a vehicle (e.g. efficiency drift): new unless the same type is
//    still OPEN for that vehicle.
async function onlyNew(anomalies) {
  if (!anomalies.length) return anomalies;
  const recordIds = [...new Set(anomalies.map((a) => a.fuelRecordId).filter((id) => id != null))];
  const vehicleIds = [...new Set(anomalies.filter((a) => a.fuelRecordId == null).map((a) => a.busId).filter((id) => id != null))];
  const existing = await prisma.fuelAnomaly.findMany({
    where: {
      OR: [
        ...(recordIds.length ? [{ fuelRecordId: { in: recordIds } }] : []),
        ...(vehicleIds.length ? [{ fuelRecordId: null, busId: { in: vehicleIds }, status: 'OPEN' }] : []),
      ],
    },
    select: { type: true, fuelRecordId: true, busId: true },
  });
  if (!existing.length) return anomalies;
  const key = (a) => (a.fuelRecordId != null ? `r:${a.fuelRecordId}:${a.type}` : `v:${a.busId}:${a.type}`);
  const seen = new Set(existing.map(key));
  return anomalies.filter((a) => !seen.has(key(a)));
}

// "Run fuel analysis per tenant": records a FuelAnalysisRun, sends this
// organisation's data to its provider and stores the returned anomalies.
// With the null provider the run is recorded as SKIPPED.
export async function runFuelAnalysisForTenant(org, { provider = getFuelAnalyticsProvider(org), lookbackDays = env.fuel.lookbackDays } = {}) {
  return asTenant(org.id, async () => {
    const run = await prisma.fuelAnalysisRun.create({ data: { provider: provider.name, status: 'RUNNING' } });
    try {
      const request = await buildRequest(org.id, lookbackDays);
      const response = await provider.analyze(request);

      if (response?.skipped) {
        return prisma.fuelAnalysisRun.update({
          where: { id: run.id },
          data: { status: 'SKIPPED', finishedAt: new Date(), recordsAnalyzed: 0 },
        });
      }

      const anomalies = await onlyNew(validateAnalysisResponse(request, response));
      if (anomalies.length) {
        await prisma.fuelAnomaly.createMany({ data: anomalies.map((a) => ({ ...a, runId: run.id })) });
      }
      return prisma.fuelAnalysisRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCEEDED',
          finishedAt: new Date(),
          recordsAnalyzed: request.fuelRecords.length,
          anomaliesFound: anomalies.length,
        },
      });
    } catch (err) {
      return prisma.fuelAnalysisRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), error: String(err.message).slice(0, 500) },
      });
    }
  });
}

// Runs the analysis for every active organisation with Fuel Hub enabled,
// one tenant at a time.
export async function runFuelAnalysisForAllTenants() {
  const orgs = await systemPrisma.organization.findMany({ where: { status: 'ACTIVE', fuelHubEnabled: true } });
  const results = [];
  for (const org of orgs) {
    results.push(await runFuelAnalysisForTenant(org));
  }
  return results;
}

// Placeholder scheduler hook, disabled unless FUEL_ANALYSIS_JOB_ENABLED=true.
// Returns a function that stops it.
export function startFuelAnalysisScheduler(config = env.fuel) {
  if (!config.jobEnabled) return () => {};
  const intervalMs = Math.max(config.jobIntervalMinutes, 1) * 60 * 1000;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runFuelAnalysisForAllTenants();
    } catch (err) {
      console.error('Fuel analysis job failed:', err.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  console.log(`Fuel analysis job scheduled every ${config.jobIntervalMinutes} min.`);
  return () => clearInterval(timer);
}
