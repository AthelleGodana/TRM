import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Resets the test database to a clean, fully migrated state once per run.
export default function setup() {
  const { parsed } = dotenv.config({ path: new URL('../.env.test', import.meta.url), override: true });

  // Guard against wiping a real database: only reset databases named *_test.
  const dbName = new URL(parsed.DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset database "${dbName}": test databases must end in _test.`);
  }

  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...parsed },
    stdio: 'inherit',
  });
}
