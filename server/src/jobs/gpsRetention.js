import { systemPrisma } from '../config/db.js';
import { env } from '../config/env.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Deletes GPS points older than the retention window, for every
// organisation. Keeps the database and its backups small on a single VPS.
export async function pruneGpsLogs(retentionDays = env.gpsRetentionDays, now = new Date()) {
  if (!(retentionDays > 0)) return 0;
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const { count } = await systemPrisma.gpsLog.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  return count;
}

// Runs the prune once at start-up and then daily. GPS_RETENTION_DAYS=0
// turns it off.
export function startGpsRetentionJob(retentionDays = env.gpsRetentionDays) {
  if (!(retentionDays > 0)) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const count = await pruneGpsLogs(retentionDays);
      if (count) console.log(`GPS retention: removed ${count} points older than ${retentionDays} days.`);
    } catch (err) {
      console.error('GPS retention job failed:', err.message);
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, DAY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
