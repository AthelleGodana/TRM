import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Resets the test database to a clean, fully migrated state once per run,
// then (re)creates the application and system database roles.
export default function setup() {
  const { parsed } = dotenv.config({ path: new URL('../.env.test', import.meta.url), override: true });

  // Guard against wiping a real database: only reset databases named *_test.
  for (const key of ['DATABASE_URL', 'DIRECT_DATABASE_URL', 'DATABASE_URL_SYSTEM']) {
    const dbName = new URL(parsed[key]).pathname.slice(1);
    if (!dbName.endsWith('_test')) {
      throw new Error(`Refusing to reset database "${dbName}" (${key}): test databases must end in _test.`);
    }
  }

  const opts = { cwd: new URL('..', import.meta.url), env: { ...process.env, ...parsed }, stdio: 'inherit' };
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', opts);
  execSync('node scripts/setup-db-roles.js', opts);
}
