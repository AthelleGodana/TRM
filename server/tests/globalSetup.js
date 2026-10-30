import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Resets the test database to a clean, fully migrated state once per run.
export default function setup() {
  const { parsed } = dotenv.config({ path: new URL('../.env.test', import.meta.url), override: true });
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...parsed },
    stdio: 'inherit',
  });
}
