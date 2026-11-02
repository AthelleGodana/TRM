# Transtrack Kenya

Transtrack Kenya is a multi-tenant platform for transport and live vehicle tracking. It serves universities, schools and companies. Every user signs in with their Google account, and each organisation's data is isolated from every other's.

| Part | Stack |
|---|---|
| `client/` | React 18, Vite, Tailwind, installable PWA |
| `server/` | Express REST API and Socket.IO, Prisma 5, PostgreSQL 15 |
| `ai-fuel-service/` | Python 3.12 and FastAPI. A stub that is reachable only on the internal Docker network. |

## Organisations, roles and access

- **Organisations** have a profile (`UNIVERSITY`, `SCHOOL` or `COMPANY`) and a status (`PENDING`, `ACTIVE` or `SUSPENDED`). They also hold branding and the Fuel Hub feature flags (`fuelHubEnabled`, `aiFuelAnalyticsEnabled`).
- **Roles** are shared across the platform, but each profile only allows some of them. The single source of truth is [server/src/config/roles.js](server/src/config/roles.js):

  | Profile | Allowed roles |
  |---|---|
  | UNIVERSITY | ORG_ADMIN, FLEET_MANAGER ("Transport officer"), DRIVER, STUDENT |
  | SCHOOL | ORG_ADMIN, FLEET_MANAGER ("Transport officer"), DRIVER, PARENT |
  | COMPANY | ORG_ADMIN, FLEET_MANAGER, DRIVER |

  SCHOOL pupils are passenger records linked to parents, not user accounts. `SUPER_ADMIN` is platform-level and belongs to no organisation.
- **Memberships:** a user can belong to several organisations and switch between them from the navbar.
- **Menus** are driven by role and feature flags ([client/src/config/navigation.js](client/src/config/navigation.js)), never by profile checks.

### Tenant isolation

Isolation is enforced in layers:

1. **Prisma extension** ([server/src/config/db.js](server/src/config/db.js)).
   - It injects `organizationId` into every query on a tenant table. The value comes from the request context, which is set only from the verified access token, never from the request body or query string.
   - It refuses to run without a context.
   - It blocks direct access to users, organisations and sessions.
2. **PostgreSQL row-level security** on every tenant table, using `set_config('app.current_org', …, true)` per transaction. The policies are forced, and the API connects as a role that cannot bypass them.
3. **Same-tenant triggers** reject a row that references another tenant's row, for example another organisation's driver on your bus.
4. **Socket.IO:** connections require an access token, and rooms are namespaced per organisation, so live positions never cross tenants.
5. **404s:** another tenant's record returns **404**, never 403.

## Sign in with Google

- The browser uses Google Identity Services. Popup mode is the default. Installed iOS PWAs fall back to redirect mode (`POST /api/auth/google/redirect`).
- `POST /api/auth/google` verifies the ID token with `google-auth-library` (audience = `GOOGLE_CLIENT_ID`) and requires `email_verified`.
- Users are identified by Google `sub`. Only `sub`, email, name and picture are stored, never Google access or refresh tokens.
- On success the API issues:
  - a 15-minute access token (`userId`, `organizationId`, `role`), held in memory by the client;
  - a **rotating** refresh token in an `httpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/api/auth`. Reusing a rotated token revokes the whole session family.
- Endpoints: `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/switch-org` and `/api/auth/me`.
- **Onboarding:**
  - An ORG_ADMIN invites people by email and role (People & Access page). A matching invitation creates the membership on the person's first Google sign-in.
  - A Google user without an invitation can request access with an organisation code, or register a new organisation. New organisations stay `PENDING`, and their members cannot sign in, until a SUPER_ADMIN approves them (Platform console).
  - The first SUPER_ADMIN is seeded from `SUPER_ADMIN_EMAIL`.
- **Legacy users** are matched by verified email on their first Google sign-in. Password login is disabled; `LEGACY_PASSWORD_LOGIN=true` re-enables it temporarily for a migration window.

### Creating the Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Go to **APIs & Services → OAuth consent screen**. Choose **External**, and fill in the app name, support email and authorised domain. While testing, add your Google accounts as test users. Publish the app before launch.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**, and choose application type **Web application**.
4. Under **Authorised JavaScript origins**, add every origin the app is served from. Origins have no path and no trailing slash:
   - `http://localhost:5173` (Vite dev server)
   - `http://localhost:4173` (`vite preview`, if you use it)
   - `https://app.your-domain.co.ke` (production)
5. Under **Authorised redirect URIs**, add the redirect-mode endpoint for each origin. The installed iOS PWA uses it:
   - `http://localhost:5173/api/auth/google/redirect`
   - `https://app.your-domain.co.ke/api/auth/google/redirect`
6. Copy the **Client ID** into `GOOGLE_CLIENT_ID`. The client ID is public; no client secret is needed, because the app only verifies ID tokens.
7. In production, serve the web app and `/api` from the **same origin** (as the Vite proxy does in development), so the `SameSite=Strict` refresh cookie is sent.

## Running it

### Docker Compose

```bash
cp .env.example .env        # then fill in the secrets and GOOGLE_CLIENT_ID
docker compose up -d --build
```

- `postgres` is the database.
- `api` (http://localhost:5000) applies migrations and creates the `transtrack_app` and `transtrack_system` roles on start.
- `ai-fuel-service` is internal only: it has no published ports and no internet access.

Run the client on the host with `cd client && npm install && npm run dev`.

### Host development

```bash
cp .env.example server/.env          # set the three DATABASE URLs to localhost
docker compose up -d postgres
cd server && npm install
npm run db:deploy                    # prisma migrate deploy + create DB roles
npm run db:seed                      # demo organisations and demo users for every role
npm run dev
# optional, to call the AI stub from the host:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d ai-fuel-service
```

**Signing in locally without Google:** set `DEV_LOGIN=true` in `server/.env` and run `npm run db:seed`. The sign-in page then lists the demo users (`@demo.transtrack.local`): platform admin; Demo University admin, transport officer, driver and student; Demo Academy admin, driver and parent. Dev login only accepts those demo emails and is hard-disabled when `NODE_ENV=production`.

If `DATABASE_URL` connects as a superuser or a `BYPASSRLS` role, the server warns in development and **refuses to start in production**, because row-level security would not apply.

### Upgrading an existing installation (migration steps)

The migrations move existing single-tenant data into a **Default Organisation**: ACTIVE, UNIVERSITY profile, because existing students hold their own accounts.

1. **Back up first:** `docker exec shuttle_postgres pg_dump -U postgres shuttle_db > backup.sql`
2. Create `.env` (Compose) and `server/.env` (host) from `.env.example`.
   - Set `POSTGRES_PASSWORD` to the database's **current** password, because the existing volume keeps it.
   - Choose new passwords for `DB_APP_PASSWORD` and `DB_SYSTEM_PASSWORD`.
3. Apply the migrations and create the roles: `cd server && npm run db:deploy`. This:
   - creates the organisation, membership, invitation and session tables;
   - creates the Default Organisation, backfills `organizationId` on every row, and makes it `NOT NULL`;
   - adds the composite indexes, per-organisation unique constraints (for example licence plates), row-level security policies and same-tenant triggers;
   - creates a membership for each existing user (admin → ORG_ADMIN, driver → DRIVER, student → STUDENT) and copies unique student emails onto their accounts;
   - creates the Fuel Hub tables and copies existing `VehicleLog` FUEL entries into `FuelRecord`. `VehicleLog` itself is unchanged.
4. Set `SUPER_ADMIN_EMAIL` and, for the old `admin` account, `DEFAULT_ORG_ADMIN_EMAIL`, then start the API.
5. Each person signs in with Google. Accounts with a matching email are linked automatically. For other migrated members (drivers had no email), an ORG_ADMIN enters their Google email on the **People & Access** page.
6. From the Platform console, turn on Fuel Hub for organisations that should have it.

## AI Fuel Hub (scaffold)

- **Data:** `VehicleFuelProfile`, `FuelRecord`, `FuelCard` (last four digits only), `CalibrationRecord`, `FuelAnalysisRun` and `FuelAnomaly`. All are tenant-scoped.
- **API:** `/api/fuel/*`. It returns 404 unless the organisation has `fuelHubEnabled`.
  - CRUD for records, cards, profiles and calibrations.
  - `GET` and `PATCH /anomalies` to review anomalies.
  - `POST /analysis/run` (ORG_ADMIN).
- **Plug-in point:** the `FuelAnalyticsProvider` interface in [server/src/fuel/providers](server/src/fuel/providers).
  - `NullFuelAnalyticsProvider` is the default.
  - `HttpFuelAnalyticsProvider` calls `ai-fuel-service`. It is used only when `FUEL_ANALYTICS_PROVIDER=http` **and** the organisation has `aiFuelAnalyticsEnabled`.
- **Job hook:** `runFuelAnalysisForTenant` sends one tenant's data per call. The scheduler is off unless `FUEL_ANALYSIS_JOB_ENABLED=true`.
- **Contract:** [docs/ai-fuel-contract.md](docs/ai-fuel-contract.md). The model goes in `ai-fuel-service/app/analyzer.py`.

## Tests

```bash
cd server
npm run test:db     # throwaway Postgres on 127.0.0.1:5433 (docker-compose.test.yml)
npm test            # resets only databases named *_test
docker build --target test ai-fuel-service   # Python tests
```

The suites cover:

- **Isolation:** every endpoint, each enforcement layer, and Socket.IO.
- **Auth:** Google token verification, invitations, onboarding, pending organisations, refresh rotation and organisation switching.
- **Pupils and parents.**
- **Fuel Hub:** CRUD and the null/HTTP provider switch.
- **The data migration,** replayed against legacy-shaped data.
