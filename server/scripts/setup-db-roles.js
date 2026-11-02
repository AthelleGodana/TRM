// Creates (or updates) the two database roles the API connects as, and
// grants them access to the application tables. Idempotent; run it after
// every `prisma migrate deploy`:
//
//   DATABASE_URL         -> application role: no superuser, no BYPASSRLS,
//                           so row-level security applies to it.
//   DATABASE_URL_SYSTEM  -> system role with BYPASSRLS, used only for auth,
//                           the M-Pesa callback, platform admin and jobs.
//   DIRECT_DATABASE_URL  -> owner/superuser used for migrations and this script.
//
// Role names and passwords are taken from those URLs, so no credentials
// live in code.
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function roleFromUrl(name) {
  const value = process.env[name];
  if (!value) return null;
  const url = new URL(value);
  const user = decodeURIComponent(url.username);
  if (!IDENTIFIER.test(user)) throw new Error(`${name}: role name "${user}" must match ${IDENTIFIER}`);
  return { user, password: decodeURIComponent(url.password) };
}

const literal = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  if (!process.env.DIRECT_DATABASE_URL) throw new Error('DIRECT_DATABASE_URL must be set.');
  const owner = roleFromUrl('DIRECT_DATABASE_URL');
  const roles = [
    { ...roleFromUrl('DATABASE_URL'), attrs: 'NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE' },
    { ...roleFromUrl('DATABASE_URL_SYSTEM'), attrs: 'NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE' },
  ].filter((r) => r.user);

  const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_DATABASE_URL } } });
  try {
    const [{ current_database: dbName }] = await db.$queryRaw`SELECT current_database()`;

    for (const role of roles) {
      if (role.user === owner.user) {
        console.warn(`Skipping "${role.user}": it is the migration owner. Use a separate role so RLS applies.`);
        continue;
      }
      const [exists] = await db.$queryRaw`SELECT 1 FROM pg_roles WHERE rolname = ${role.user}`;
      const verb = exists ? 'ALTER' : 'CREATE';
      await db.$executeRawUnsafe(`${verb} ROLE "${role.user}" LOGIN ${role.attrs} PASSWORD ${literal(role.password)}`);
      await db.$executeRawUnsafe(`GRANT CONNECT ON DATABASE "${dbName}" TO "${role.user}"`);
      await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO "${role.user}"`);
      await db.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role.user}"`);
      await db.$executeRawUnsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role.user}"`);
      await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${role.user}"`);
      await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${role.user}"`);
      await db.$executeRawUnsafe(`REVOKE ALL ON TABLE "_prisma_migrations" FROM "${role.user}"`);
      console.log(`${verb === 'CREATE' ? 'Created' : 'Updated'} role "${role.user}".`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
