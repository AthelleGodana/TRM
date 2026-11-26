# Transtrack Kenya

Transtrack Kenya is a multi-tenant platform for transport and live vehicle tracking. It serves universities, schools and companies. Every user signs in with their Google account, and each organisation's data is isolated from every other's.

| Part | Stack |
|---|---|
| `client/` | React 18, Vite, Tailwind, installable PWA |
| `server/` | Express REST API and Socket.IO, Prisma 5, PostgreSQL 15 |
| `ai-fuel-service/` | Python 3.12, FastAPI, NumPy and scikit-learn. Fuel anomaly checks, reachable only on the internal Docker network. |

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
- **Menus** are driven by role and feature flags ([client/src/config/navigation.js](client/src/config/navigation.js)), never by profile checks. Each profile's flags come from `PROFILE_FEATURES` in [server/src/config/roles.js](server/src/config/roles.js). COMPANY organisations have `passengers` and `studentBilling` turned off, so they get no Passengers or Billing pages, and the API refuses those routes (`requireFeature`).

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
- **Onboarding:** see [Access flow](#access-flow) below. The first SUPER_ADMIN is seeded from `SUPER_ADMIN_EMAIL`.
- **Legacy users** are matched by verified email on their first Google sign-in. Password login is disabled; `LEGACY_PASSWORD_LOGIN=true` re-enables it temporarily for a migration window.

### Access flow

Nobody can use an organisation's data until one of its administrators lets them in, much like a school's learning platform. There is no self sign-up and no password. Google only proves who someone is.

| How someone gets in | What happens |
|---|---|
| **Invited** (People & Access → Invite, or **Import CSV**) | The invitation becomes a membership on their first Google sign-in with that email. |
| **Requests access** with the organisation code | Each sign-in shows **"waiting for approval"** until an ORG_ADMIN approves the request (choosing the role) or rejects it, which shows **"not approved"**. The requester can ask again or try another organisation. |
| **Registers a new organisation** | It stays `PENDING`, and nobody can sign in to it, until a SUPER_ADMIN approves it in the Platform console. |

- Admins see waiting requests as a badge on **People & Access** and a callout on the overview. The badge comes from `GET /api/org/summary` and is polled every minute while the tab is open. No email or SMS is sent, so it costs nothing.
- A suspended organisation blocks every member's sign-in.

#### Importing people from a CSV

**People & Access → Import CSV** invites up to 500 people at once.

- The browser parses the file and shows a preview with a check for every row. Only the rows are sent, to `POST /api/org/invitations/bulk`.
- The server re-validates each row and reports what it skipped (invalid email, role not allowed for this organisation, already a member, duplicate). Importing someone again replaces their pending invitation.

```csv
email,role,child_first_name,child_last_name
jane.wanjiku@gmail.com,STUDENT,,
peter.otieno@gmail.com,DRIVER,,
mary.njeri@gmail.com,PARENT,Baraka,Njeri
mary.njeri@gmail.com,PARENT,Zawadi,Njeri
```

- `role` takes either the role code or its label (for example `Transport officer`). The page offers a template with the roles your organisation allows.
- **Schools:** a `PARENT` row may name a child. When that parent first signs in, the pupils are created and linked to them. Use one row per child. Importing the same file again does not duplicate pupils.

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

- `web` (http://localhost:8080) serves the built app with nginx: security headers (CSP, frame and MIME protection, Permissions-Policy), year-long caching for hashed assets, gzip, and `/api` and `/socket.io` proxied to the API. Set `CLIENT_URL=http://localhost:8080` in `.env` to use it, and add that origin to the Google OAuth client.
- `postgres` is the database.
- `api` (http://localhost:5000) applies migrations and creates the `transtrack_app` and `transtrack_system` roles on start.
- `ai-fuel-service` is internal only: it has no published ports and no internet access.

For development with hot reload, run the client on the host instead: `cd client && npm install && npm run dev` (http://localhost:5173).

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

**Signing in locally without Google:** set `DEV_LOGIN=true` in `server/.env` and run `npm run db:seed`. The sign-in page then shows a development sign-in form. Type a demo account email, or just the part before the `@`:

| Account | Role |
|---|---|
| `platform` | Platform admin |
| `uni-admin`, `uni-officer`, `uni-driver`, `uni-student` | Demo University admin, transport officer, driver, student |
| `school-admin`, `school-driver`, `parent` | Demo Academy admin, driver, parent (child: Baraka Godana) |
| `co-admin`, `co-manager`, `co-driver` | Acme Logistics (COMPANY) admin, fleet manager, driver. Mixed fleet with overdue services and expiring documents. |

All demo accounts are named Athelle Godana, and the full emails end in `@demo.transtrack.local`. Dev login only accepts those demo emails and is hard-disabled when `NODE_ENV=production`.

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

## Fleet management

Available to every organisation; it is the main screen set for COMPANY organisations. Vehicles are stored in the `Bus` table, and the UI calls them "Vehicles" for companies.

| Area | What it covers | API |
|---|---|---|
| **Vehicles** | Registration, type, make/model/year, VIN, odometer, fuel, ownership and status, including *In maintenance* and *Off the road*. Driver assignment keeps a history (`VehicleAssignment`); a driver drives one vehicle at a time. Retire and restore vehicles. | `/api/admin/buses` |
| **Drivers** | Phone, employee number, licence number, class and expiry, status, documents, and vehicle history | `/api/admin/drivers` |
| **Maintenance** | Recurring schedules by km and/or days, due when the first limit is reached. Service records with costs and vendor. Recording a service resets its schedule and moves the odometer forward. Drivers report defects; critical ones alert staff live. | `/api/admin/maintenance/*` |
| **Documents** | Insurance, registration, inspection, PSV badge, medical, and so on, with expiry dates. Files (PDF/JPG/PNG, max 10 MB) are stored under `UPLOAD_DIR` and only served through an authenticated, tenant-checked endpoint. | `/api/admin/documents` |
| **Overview** | Availability, overdue services, expired or expiring documents and licences, open defects, and a "Needs attention" list | `/api/admin/fleet/overview` |

The **driver app** has five tabs: **Drive**, **Route map**, **My vehicle**, **Fuel** (Fuel Hub organisations only) and **Me**. Location sharing keeps running whichever tab is open.
- **Drive:** live status, vehicle status, delay and emergency buttons, today's runs.
- **Route map:** the road line, numbered stops with their times and passengers, and a *next stop* card with distance, ETA and a **Navigate** button that opens Google Maps.
- **My vehicle:** pre-trip check, report a problem, update the odometer, upcoming services and vehicle documents.
- **Fuel:** log fill-ups.
- **Me:** licence, own documents and vehicle history.

## Passenger rides

- **Standard route.** Every passenger has one standard route, set by the transport office in the passenger's profile. If none is set, a student can choose it once.
- **Runs.** Admins schedule runs per route under **Routes & Runs**. A run has:
  - a direction: *Pickup* (to campus or site) or *Drop-off* (home);
  - a start time, weekdays, seat count and an optional vehicle.
- **Stop times** are worked out from the road route: OSRM leg durations plus `STOP_DWELL_SECONDS` at each stop. Pickup runs visit the stops in order; drop-off runs start at the last stop and go in reverse. Any stop's time can be set by hand.
- **Choosing rides.** Under **My rides**, students choose a stop (limited by their payment tier) and then a run for both pickup and drop-off. The run list shows the time it reaches their stop and the seats left. Parents do the same for each child.
- **Standing bookings.** The choice repeats on every day the run operates (`RideBooking`).
- **One-day changes.** Single days can be skipped or changed (`RideException`) for the next `RIDES_HORIZON_DAYS` (default 14). Changes close `BOOKING_CUTOFF_MINUTES` (default 60) before pickup.
- **Seat limits.** Seats are counted from bookings, with the run row locked, so a run is never overfilled.
- **Drivers** see each run's passengers grouped by stop, and mark them boarded or no-show.

## Live GPS tracking

- **Drivers** share their location whenever the driver app is open. Drivers are expected to use devices supplied by their employer.
  - The phone sends a reading about every 5 seconds, or sooner after moving 50 m. Only the latest reading is sent, so nothing piles up while offline.
  - The screen is kept awake, because browsers pause GPS when the app is in the background or the phone is locked.
  - The driver screen explains blocked or weak GPS, and has **Report delay** and **Emergency** buttons.
- **Server** ([server/src/services/gpsIngest.js](server/src/services/gpsIngest.js)):
  - Rejects invalid readings and readings with accuracy worse than 100 m.
  - Broadcasts at most every 2 s.
  - Stores a point at most every 15 s, or after 50 m of movement.
  - Drivers join their bus's room on connect. `bus:offline` is sent when the driver disconnects.
- **Passengers and parents** see their bus with:
  - its status: Moving, Stopped or Offline (no update for 2 minutes);
  - when it last updated;
  - an estimated arrival at their own stop, along the route at the bus's recent speed, compared with the pickup slot they booked or the route time;
  - an in-app alert when the bus is about 3 minutes or 1 km away.
- **Reconnects:** the client keeps one socket for the whole app. It re-subscribes after every reconnect, and refreshes an expired session before reconnecting ([client/src/services/socket.js](client/src/services/socket.js)).
- **Staff** get a **Live map** with every vehicle, status filters, today's trail for the selected vehicle, and a feed of driver alerts. It uses `GET /api/gps/live`, and `GET /api/gps/history/:busId` returns today's trail for staff and only the latest point for everyone else.

### Testing GPS with a real phone

Browsers only allow GPS on `https` or `localhost`, so a phone on your Wi-Fi can't share its location from `http://192.168.x.x`.

1. Run the API as usual (`cd server && npm run dev`).
2. Run `cd client && npm run dev:phone`. This serves the site over HTTPS on your network with a self-signed certificate and prints a `Network` address such as `https://192.168.1.20:5173`.
3. On the phone, open that address. Accept the certificate warning (Advanced → Proceed), and sign in as `uni-driver` with the development sign-in form. If the page doesn't load, allow Node.js through the Windows firewall for private networks.
4. Allow location access. On a laptop, sign in as `uni-student` or `uni-admin` (Live map) to watch the bus move.

## Deploying on a single VPS (low cost)

The whole stack (PostgreSQL, API, AI stub) runs with Docker Compose on one small Linux VPS. A 2 GB / 1 vCPU machine at about US$5–10 a month comfortably serves a few organisations. Nothing in the app needs a paid service: Google sign-in is free, there is no email or SMS, and map tiles default to OpenStreetMap.

1. **Server:** install Docker, clone the repo, `cp .env.example .env`, and set real secrets, `NODE_ENV=production`, `CLIENT_URL=https://app.your-domain.co.ke` and `GOOGLE_CLIENT_ID`. Keep `DEV_LOGIN=false`; the API refuses to start otherwise.
2. **Start:** `docker compose up -d --build`. Compose publishes the web app, PostgreSQL and the API on `127.0.0.1` only, so none is reachable from the internet directly. Allow only ports 22, 80 and 443 in the firewall (for example `ufw`).
3. **TLS in front:** the `web` container already serves the app and proxies `/api` and `/socket.io` on one origin (so the `SameSite=Strict` refresh cookie works) with security headers. Put a TLS proxy in front of it; Caddy obtains certificates automatically:

   ```
   app.your-domain.co.ke {
     reverse_proxy 127.0.0.1:8080
   }
   ```

   Alternatively, put the domain on Cloudflare's free plan (DNS, TLS, caching) in front of the VPS.
4. **Backups:** add a nightly cron job, and copy the files off the server (for example to another machine or free object-storage credit):

   ```bash
   0 2 * * * docker exec shuttle_postgres pg_dump -U postgres -Fc shuttle_db > /var/backups/transtrack-$(date +\%F).dump && find /var/backups -name 'transtrack-*.dump' -mtime +14 -delete
   ```

5. **Keep it small:** GPS points are the fastest-growing table. `GPS_RETENTION_DAYS` (default 90) deletes older points daily; set it to `0` to keep everything.

**Map tiles:** the live map uses the public OpenStreetMap tile servers. Their [usage policy](https://operations.osmfoundation.org/policies/tiles/) suits light use. If many people track buses at once, switch the `TileLayer` URL in `client/src/components/map/LiveMap.jsx` to a provider's free tier (for example MapTiler or Stadia Maps).

## Design system

The UI follows [design-system/transtrack-kenya/MASTER.md](design-system/transtrack-kenya/MASTER.md), generated with the [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill: Swiss-minimal style, tracking blue with an orange accent, and Plus Jakarta Sans. [DECISIONS.md](design-system/transtrack-kenya/DECISIONS.md) records how it was generated and where the app deliberately differs.

- Colours are semantic CSS variables in `client/src/index.css`, with light as the default and dark as an option. Text meets 4.5:1 contrast in both themes.
- Icons are Lucide only, with no emoji. Touch targets are at least 44px, focus rings are always visible, and reduced motion is respected.
- Every signed-in area uses `AppShell`: a sidebar on desktop, and on mobile a top bar plus at most five bottom tabs.

## AI Fuel Hub

Fuel analysis runs in `ai-fuel-service` on one organisation's data at a time. It needs no paid model, API key or chatbot, and no data leaves the server. Every finding has a severity, a 0–1 score and a plain-English explanation for managers (Fuel Hub → Insights).

- **Rules** ([app/rules.py](ai-fuel-service/app/rules.py)): fill-up larger than the tank, odometer going backwards, refilling again too soon, duplicate entries, consumption well above the vehicle's expected L/100 km, price far from that week's norm, receipt total not matching litres × price.
- **Statistics** ([app/stats.py](ai-fuel-service/app/stats.py)), learnt from the organisation's own history:
  - a robust z-score against each vehicle's usual consumption (works without an expected figure);
  - efficiency drift (a vehicle burning 20%+ more over the last 30 days, usually a maintenance issue);
  - an Isolation Forest across the fleet (from 200 fill-ups, fitted per request with a fixed seed, reported only with a concrete reason such as a night-time fill or an unusually large fill);
  - driver patterns (a driver who consistently burns more than the vehicles they drive normally do).
- Thresholds are in [app/config.py](ai-fuel-service/app/config.py). Rules win over statistics, and each problem is reported once.
- Each run re-checks the whole look-back window; findings already stored are not stored again, and dismissed findings stay dismissed.
- To use it: `FUEL_ANALYTICS_PROVIDER=http` in `.env`, and turn on **AI fuel analytics** for the organisation in the Platform console. The seeded Acme Logistics has 90 days of fill-ups with planted problems.

Plumbing:

- **Data:** `VehicleFuelProfile`, `FuelRecord`, `FuelCard` (last four digits only), `CalibrationRecord`, `FuelAnalysisRun` and `FuelAnomaly`. All are tenant-scoped.
- **API:** `/api/fuel/*`. It returns 404 unless the organisation has `fuelHubEnabled`.
  - CRUD for records, cards, profiles and calibrations.
  - `GET` and `PATCH /anomalies` to review anomalies.
  - `POST /analysis/run` (ORG_ADMIN).
- **Plug-in point:** the `FuelAnalyticsProvider` interface in [server/src/fuel/providers](server/src/fuel/providers).
  - `NullFuelAnalyticsProvider` is the default.
  - `HttpFuelAnalyticsProvider` calls `ai-fuel-service`. It is used only when `FUEL_ANALYTICS_PROVIDER=http` **and** the organisation has `aiFuelAnalyticsEnabled`.
- **Job hook:** `runFuelAnalysisForTenant` sends one tenant's data per call. The scheduler is off unless `FUEL_ANALYSIS_JOB_ENABLED=true`.
- **Contract:** [docs/ai-fuel-contract.md](docs/ai-fuel-contract.md). [app/analyzer.py](ai-fuel-service/app/analyzer.py) combines the rules and statistics.

## Tests

```bash
cd server
npm run test:db     # throwaway Postgres on 127.0.0.1:5433 (docker-compose.test.yml)
npm test            # resets only databases named *_test
cd ../client
npm run lint        # ESLint, including jsx-a11y accessibility rules
npm test            # Vitest + Testing Library + axe
docker build --target test ai-fuel-service   # Python tests
```

CI (`.github/workflows/ci.yml`) runs all three suites, the client build and `npm audit` (high and critical) on every pull request. Dependabot opens weekly update pull requests.

The suites cover:

- **Isolation:** every endpoint, each enforcement layer, and Socket.IO.
- **Auth:** Google token verification, invitations, onboarding, pending organisations, refresh rotation and organisation switching.
- **Access flow:** pending and rejected request status, admin summary counts, CSV bulk invitations (including school parents with children) and GPS retention.
- **Pupils and parents.**
- **Fuel Hub:** CRUD, the null/HTTP provider switch, and re-runs not storing findings twice. The Python suite covers every rule (fires, does not fire, skipped without its input), the statistics, and that clean data raises nothing above LOW.
- **Web app:** formatting, keyboard behaviour of tabs, radio groups and dialogs, the map picker, and axe checks.
- **Security headers** on the API.
- **The data migration,** replayed against legacy-shaped data.
