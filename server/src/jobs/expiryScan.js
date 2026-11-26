import { systemPrisma } from '../config/db.js';
import { EXPIRING_DAYS } from '../services/fleet.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Counts, per organisation, documents and driving licences that have
// expired or expire within EXPIRING_DAYS, and logs a summary. The dashboard
// computes the same thing live; this job is the hook where email or push
// reminders will be sent once notifications exist.
export async function scanExpiries(now = new Date()) {
  const soon = new Date(now.getTime() + EXPIRING_DAYS * DAY_MS);
  const [documents, licences] = await Promise.all([
    systemPrisma.document.groupBy({ by: ['organizationId'], where: { expiresAt: { lte: soon } }, _count: true }),
    systemPrisma.driver.groupBy({ by: ['organizationId'], where: { licenseExpiry: { lte: soon } }, _count: true }),
  ]);
  const byOrg = new Map();
  for (const d of documents) byOrg.set(d.organizationId, { documents: d._count, licences: 0 });
  for (const l of licences) byOrg.set(l.organizationId, { documents: 0, ...byOrg.get(l.organizationId), licences: l._count });
  return byOrg;
}

export function startExpiryScanJob() {
  const tick = async () => {
    try {
      const byOrg = await scanExpiries();
      for (const [orgId, c] of byOrg) {
        console.log(`Expiry scan: organisation ${orgId} has ${c.documents} document(s) and ${c.licences} licence(s) expired or expiring within ${EXPIRING_DAYS} days.`);
      }
    } catch (err) {
      console.error('Expiry scan failed:', err.message);
    }
  };
  const timer = setInterval(tick, DAY_MS);
  timer.unref?.();
  setTimeout(tick, 60_000).unref?.();
  return () => clearInterval(timer);
}
