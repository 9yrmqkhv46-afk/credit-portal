# TransformBiz Credit Lenders Portal

A full-stack borrowing power calculator and credit lending portal designed for Australian commercial lending brokers. The application allows clients to self-serve their borrowing capacity calculations while giving administrators a comprehensive dashboard to manage client relationships.

## Architecture

```
+------------------+        +------------------+        +------------------+
|                  |        |                  |        |                  |
|   Next.js        | <----> |   Express API    | <----> |   Database       |
|   Frontend       |  HTTP  |   (TypeScript)   | Prisma |   (SQLite/PG)    |
|   Port 3000      |        |   Port 3001      |        |                  |
|                  |        |                  |        |                  |
+------------------+        +------------------+        +------------------+
     React 19                    JWT Auth                 SQLite (dev)
     Tailwind CSS                Zod Validation           PostgreSQL (prod)
     Axios                       Helmet + CORS
```

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | Next.js 16, React 19, TypeScript, Tailwind CSS  |
| Backend    | Express 4, TypeScript, Node.js                  |
| ORM        | Prisma 5 (SQLite for dev, PostgreSQL for prod)  |
| Auth       | JWT (jsonwebtoken), bcryptjs                    |
| Validation | Zod                                             |
| Testing    | Jest, ts-jest                                   |

## Monorepo Structure

```
/
├── backend/                  # Express + TypeScript API
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema
│   │   └── seed.ts           # Seed script (admin + sample client)
│   ├── src/
│   │   ├── __tests__/        # Jest unit tests
│   │   ├── config/           # Environment configuration
│   │   ├── middleware/       # Auth & RBAC middleware
│   │   ├── routes/           # API route handlers
│   │   ├── services/         # Business logic (calculator)
│   │   ├── utils/            # Utility functions
│   │   └── index.ts          # App entry point
│   ├── .env                  # Local environment variables
│   ├── .env.example          # Environment template
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # Next.js + React app
│   ├── src/
│   │   ├── app/              # App Router pages
│   │   │   ├── admin/        # Admin dashboard pages
│   │   │   ├── admin-login/  # Dedicated administrator sign-in portal
│   │   │   ├── dashboard/    # Client dashboard + calculator
│   │   │   ├── login/        # Login page (unified clients + admins)
│   │   │   └── register/     # Registration page
│   │   ├── components/ui/    # Reusable UI components
│   │   ├── context/          # React context (Auth)
│   │   ├── lib/              # API client utilities
│   │   ├── types/            # TypeScript type definitions
│   │   └── middleware.ts     # Next.js route middleware
│   ├── .env.example          # Environment template
│   ├── .env.local            # Local environment variables
│   ├── package.json
│   └── tsconfig.json
├── package.json              # Workspace root
└── package-lock.json
```

## Prerequisites

- **Node.js** >= 18 (tested with v22)
- **npm** >= 9

No external database server is required for local development - SQLite is used by default.

## Setup Instructions

### 1. Install Dependencies

From the project root:

```bash
npm install
```

This installs dependencies for both the backend and frontend workspaces.

### 2. Configure Environment Variables

**Backend:**

```bash
cp backend/.env.example backend/.env
```

The defaults work out of the box for local development. See the [Environment Variables](#environment-variables) section for details.

**Frontend:**

```bash
cp frontend/.env.example frontend/.env.local
```

### 3. Generate Prisma Client

```bash
cd backend
npx prisma generate
```

### 4. Create Database & Run Migrations

For local development with SQLite:

```bash
cd backend
npx prisma db push
```

For production with PostgreSQL, see the [Deploy to a permanent public URL](#deploy-to-a-permanent-public-url)
section — schema sync is handled automatically by `npm run start:prod`.

### 5. Seed the Database (optional)

The admin and sample client are created **automatically when the backend
starts** (see `backend/src/lib/bootstrap.ts`), so this step is optional. To
seed manually anyway:

```bash
cd backend
npm run seed
```

### 6. Start Development Servers

**Backend** (runs on port 3001):

```bash
cd backend
npm run dev
```

**Frontend** (runs on port 3000):

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

### Backend (`backend/.env`)

| Variable       | Description                          | Default (Dev)                       |
|----------------|--------------------------------------|-------------------------------------|
| `DATABASE_URL` | Prisma database connection string. SQLite (`file:...`) for dev, PostgreSQL (`postgresql://...`) for prod | `file:./dev.db` |
| `JWT_SECRET`   | Secret key for signing JWT tokens (**required** in production) | `dev-secret-change-in-production` |
| `PORT`         | Port the API server listens on       | `3001`                              |
| `NODE_ENV`     | Environment mode                     | `development`                       |
| `FRONTEND_URL` | Frontend origin used for the CORS allow-list | `http://localhost:3000`      |
| `VALUATION_PROVIDER` | Valuation provider: `manual` \| `realestate_link` \| `domain_avm` \| `apify` \| `external` | `manual` |
| `DOMAIN_API_KEY` | Domain Group developer key (enables `domain_avm`). Never commit a real key | _(unset)_ |
| `DOMAIN_API_BASE` | Domain API base URL | `https://api.domain.com.au` |
| `DOMAIN_API_KEY_HEADER` | Header used to send the Domain key (`X-Api-Key` or `Authorization`) | `X-Api-Key` |
| `APIFY_TOKEN` | Apify API token (enables `apify`). Never commit a real token | _(unset)_ |
| `APIFY_ACTOR_ID` / `APIFY_TASK_ID` | Apify actor (or saved task) to run for estimates | _(unset)_ |
| `VALUATION_API_KEY` | Legacy key for the `external` placeholder provider | _(unset)_ |

### Frontend (`frontend/.env.local`)

| Variable              | Description                        | Default (Dev)                  |
|-----------------------|------------------------------------|--------------------------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL               | `http://localhost:3001/api`    |

## Default Credentials (Development)

The admin account is created **automatically on first startup** — no manual
seeding required. Default admin: `support@transformbiz.com.au` / `Pavan2003$%`
(override via `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars on the backend service).

There are **two ways to sign in**: the unified `/login` (for both clients and
admins) and a dedicated administrator portal at `/admin-login`.

The following accounts are available out of the box:

| Role   | Email                          | Password     |
|--------|--------------------------------|--------------|
| Admin (primary) | support@transformbiz.com.au    | Pavan2003$%  |
| Admin (legacy)  | admin@lendcalc.com             | Admin123!    |
| Client | client@example.com             | Client123!   |

The bootstrap is **idempotent and self-healing** — on every boot the admin
passwords and roles are re-applied to the values above (or your `ADMIN_EMAIL` /
`ADMIN_PASSWORD` overrides), so a missing or wrong admin password is always
corrected. The sample client's password is left alone after first creation (no
overwrite) so a real user with the same email is not disrupted. Running
`npm run seed` manually still works as a fallback (e.g. on Postgres).

> **Warning:** Change these credentials before deploying to any shared or production environment.

## User Roles

| Role     | Capabilities                                                                 |
|----------|------------------------------------------------------------------------------|
| `CLIENT` | Register, manage profile, add financial data, run borrowing calculations     |
| `ADMIN`  | View all clients, access client details, add notes, update client status     |

## API Endpoints

### Health Check

| Method | Path           | Description        |
|--------|----------------|--------------------|
| GET    | `/api/health`  | Health check       |

### Authentication (`/api/auth`)

| Method | Path              | Auth | Description               |
|--------|-------------------|------|---------------------------|
| POST   | `/api/auth/register` | No   | Register a new client     |
| POST   | `/api/auth/login`    | No   | Login, receive JWT token  |
| GET    | `/api/auth/me`       | Yes  | Get current user info     |
| POST   | `/api/auth/logout`   | Yes  | Logout acknowledgment     |

### Client Profile (`/api/client`)

All endpoints require authentication.

| Method | Path                          | Description                    |
|--------|-------------------------------|--------------------------------|
| GET    | `/api/client/profile`         | Get own profile                |
| POST   | `/api/client/profile`         | Create profile                 |
| PUT    | `/api/client/profile`         | Update profile                 |
| GET    | `/api/client/income-sources`  | List income sources            |
| POST   | `/api/client/income-sources`  | Add income source              |
| PUT    | `/api/client/income-sources/:id` | Update income source        |
| DELETE | `/api/client/income-sources/:id` | Delete income source        |
| GET    | `/api/client/existing-debts`  | List existing debts            |
| POST   | `/api/client/existing-debts`  | Add debt                       |
| PUT    | `/api/client/existing-debts/:id` | Update debt                 |
| DELETE | `/api/client/existing-debts/:id` | Delete debt                 |
| GET    | `/api/client/properties`      | List properties                |
| POST   | `/api/client/properties`      | Add property                   |
| PUT    | `/api/client/properties/:id`  | Update property                |
| DELETE | `/api/client/properties/:id`  | Delete property                |
| GET    | `/api/client/expense-summary` | Get expense summary            |
| POST   | `/api/client/expense-summary` | Create expense summary         |
| PUT    | `/api/client/expense-summary` | Update expense summary         |

### Loan Scenarios (`/api/loan-scenarios`)

All endpoints require authentication.

| Method | Path                      | Description                              |
|--------|---------------------------|------------------------------------------|
| POST   | `/api/loan-scenarios`     | Create scenario and run calculation      |
| GET    | `/api/loan-scenarios`     | List user's scenarios                    |
| GET    | `/api/loan-scenarios/:id` | Get single scenario with results         |

### Admin (`/api/admin`)

All endpoints require ADMIN role.

| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| GET    | `/api/admin/clients`              | List all clients           |
| GET    | `/api/admin/clients/:id`          | Get full client detail     |
| POST   | `/api/admin/clients/:id/notes`    | Add note to client         |
| PATCH  | `/api/admin/clients/:id/status`   | Update client status       |

### Property valuation (`/api/valuation`)

| Method | Path                                            | Auth | Description                                            |
|--------|-------------------------------------------------|------|--------------------------------------------------------|
| GET    | `/api/valuation/link?address=..&postcode=..`    | No   | Returns a realestate.com.au search/estimate URL (JSON) |
| GET    | `/api/valuation/link?...&redirect=1`            | No   | 302-redirects to that realestate.com.au URL            |
| GET    | `/api/valuation/estimate?address=..&postcode=..&suburb=..&state=..&propertyType=..&bedrooms=..&bathrooms=..&carspaces=..` | Yes | Runs the configured automated provider and returns a normalized estimate |

#### Automated rental/value estimates

The `/api/valuation/estimate` endpoint runs whichever provider is selected by
the `VALUATION_PROVIDER` env var and returns a **normalized JSON** shape:

```jsonc
{
  "provider": "domain_avm",
  "configured": true,
  "source": "domain",
  "rentalEstimateWeekly": 650,   // Domain returns a WEEKLY RENT estimate
  "rentalRangeLow": 600,
  "rentalRangeHigh": 700,
  "confidence": "HIGH",
  "estimatedValue": null         // populated by value-capable providers (Apify)
}
```

When the provider is `manual` / `realestate_link` (or a key is missing) it
returns `{ "provider", "configured": false, "message" }` so the UI **falls back
to the realestate.com.au link button + manual entry**. Errors (non-200,
timeout) return `{ "configured": true, "error" }` and never crash the server.
The API key is never logged or returned.

**Enable Domain Rental AVM (`domain_avm`):**

1. Create a developer account and key at
   [developer.domain.com.au](https://developer.domain.com.au) and subscribe to
   the Rental AVM package
   ([`Properties_GetRentalEstimate`](https://developer.domain.com.au/docs/latest/apis/pkg_rental_avm/references/properties_getrentalestimate)).
2. On Render, set `VALUATION_PROVIDER=domain_avm` and `DOMAIN_API_KEY=<your key>`
   on the backend service. Optionally set `DOMAIN_API_KEY_HEADER=Authorization`
   to send the key as a Bearer token, or `DOMAIN_API_BASE` /
   `DOMAIN_RENTAL_ESTIMATE_PATH` to override the endpoint.
3. Domain's package is a **rental** AVM — it pre-fills the property's *Rent p.w*
   suggestion, not the sale value. The broker reviews and accepts it via the
   **"Use this"** button; manual entry stays the source of truth for the engine.

**Enable Apify (`apify`):**

1. Get an Apify token and choose an actor (or saved task) that accepts an
   address/postcode input and outputs a value and/or rent field.
2. On Render, set `VALUATION_PROVIDER=apify`, `APIFY_TOKEN=<token>` and either
   `APIFY_ACTOR_ID=username~actor-name` or `APIFY_TASK_ID=<task>`. This is a
   generic connector that calls Apify's run-sync-get-dataset-items endpoint and
   normalizes the first dataset item.

> **Note on the build sandbox:** external calls to `api.domain.com.au` /
> `api.apify.com` require an API key and outbound network egress, which exist on
> the Render deployment but **not** in the build sandbox. The providers were
> verified with mocked HTTP in unit tests (`src/__tests__/valuation.test.ts`);
> live calls run only on Render.

## Calculator Logic

The borrowing power calculator uses a dual-constraint approach:

1. **Serviceability Test** - Can the borrower afford the repayments under stressed conditions?
   - Applies a stress buffer (default: +3%) to the interest rate
   - Shades variable income at 80% (salary at 100%)
   - Calculates net surplus after expenses and existing debt repayments
   - Determines maximum loan from available surplus using PMT formula

2. **Debt-to-Income (DTI) Ratio** - Is the total debt within acceptable limits?
   - Maximum DTI ratio cap (default: 6x gross annual income)
   - The DTI-based maximum is the lower bound on how much the borrower can take

The final borrowing capacity is the **minimum** of these two constraints.

### Configurable Parameters

Located in `backend/src/services/calculator.config.ts`:

| Parameter                    | Default | Description                                |
|------------------------------|---------|--------------------------------------------|
| `dtiCap`                     | 6       | Maximum debt-to-income ratio               |
| `stressBuffer`               | 0.03    | Added to assessment rate (3%)              |
| `salaryShading`              | 1.0     | Multiplier for salary income (100%)        |
| `variableIncomeShading`      | 0.8     | Multiplier for variable income (80%)       |
| `minExpensePerAdult`         | 1200    | Minimum monthly living expense per adult   |
| `minExpensePerChild`         | 600     | Minimum monthly living expense per child   |
| `creditCardRepaymentPercent` | 0.03    | Monthly repayment as % of credit limit     |

## Scripts

### Backend

| Command                  | Description                                    |
|--------------------------|------------------------------------------------|
| `npm run dev`            | Start dev server with hot reload (nodemon)     |
| `npm run build`          | Compile TypeScript to `dist/` (SQLite/dev)     |
| `npm run build:prod`     | Generate Prisma client (Postgres) + compile    |
| `npm start`             | Run compiled production build                  |
| `npm run start:prod`     | `prisma db push` (Postgres) then start server  |
| `npm test`              | Run Jest test suite                            |
| `npm run seed`          | Seed the database with default data            |
| `npm run prisma:generate` | Regenerate Prisma client (SQLite/dev)        |
| `npm run prisma:generate:prod` | Regenerate Prisma client (PostgreSQL)   |
| `npm run prisma:migrate`  | Run Prisma migrations (dev)                  |
| `npm run db:deploy`       | Push schema to PostgreSQL (`prisma db push`) |
| `npm run migrate:deploy`  | Apply committed migrations to PostgreSQL     |

### Frontend

| Command          | Description                    |
|------------------|--------------------------------|
| `npm run dev`    | Start Next.js dev server       |
| `npm run build`  | Build for production           |
| `npm start`     | Start production server        |
| `npm run lint`   | Run ESLint                     |

## Testing

Run the backend test suite:

```bash
cd backend
npm test
```

Tests are located in `backend/src/__tests__/` and focus on the calculator service logic.

## Database: SQLite (dev) and PostgreSQL (prod)

Prisma does **not** allow the datasource `provider` to be set from an environment
variable, so this project ships **two schema files** instead of mutating one:

| File                              | Provider     | Used for                          |
|-----------------------------------|--------------|-----------------------------------|
| `backend/prisma/schema.prisma`          | `sqlite`     | Local development (default)        |
| `backend/prisma/schema.postgres.prisma` | `postgresql` | Production deployments             |

The application code picks the right driver automatically at runtime based on
`DATABASE_URL` (see `backend/src/lib/prisma.ts`):

- `DATABASE_URL` starting with `postgres://` / `postgresql://` -> plain PostgreSQL client
- anything else (e.g. `file:./dev.db`) -> SQLite via the better-sqlite3 driver adapter

This keeps **local dev working with zero setup** (SQLite, no DB server) while
production runs on PostgreSQL. Keep both schema files in sync when you change a model.

Production database scripts (in `backend/package.json`):

| Script                         | Command                                                            |
|--------------------------------|--------------------------------------------------------------------|
| `npm run prisma:generate:prod` | `prisma generate --schema=prisma/schema.postgres.prisma`           |
| `npm run build:prod`           | generate (postgres) + `tsc`                                        |
| `npm run db:deploy`            | `prisma db push --schema=prisma/schema.postgres.prisma`            |
| `npm run start:prod`           | `db:deploy` then start the compiled server                         |
| `npm run migrate:deploy`       | `prisma migrate deploy --schema=prisma/schema.postgres.prisma`     |

> We use `prisma db push` for production schema sync. It is generated from the
> schema by Prisma's engine at deploy time, so it is always correct and requires
> no pre-committed migration files. If your team prefers **versioned migrations**,
> run `npx prisma migrate dev --schema=prisma/schema.postgres.prisma` against a
> Postgres database once to generate `prisma/migrations/`, commit them, and switch
> the start command to `npm run migrate:deploy`.

---

## Deploy to a permanent public URL

You will get a permanent `https://*.onrender.com` URL. The repo includes a
[`render.yaml`](./render.yaml) blueprint that provisions the backend and
frontend web services. On the free Render tier, managed PostgreSQL is **not**
provisioned via Blueprint, so the database is hosted externally on
[Neon](https://neon.tech)'s permanent free tier.

### Free-tier deploy (recommended for free Render accounts)

1. **Create a free PostgreSQL database on Neon**
   - Sign up at https://neon.tech (GitHub sign-in is fastest)
   - Create a new project (any region near you)
   - In the dashboard, copy the "Connection string" labeled "Pooled connection" — it looks like:
     `postgresql://USER:PASSWORD@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`
   - Keep this tab open; you'll paste it into Render in step 4.

2. **Push this repo to GitHub** (already done if you're reading this on Render).

3. On **https://render.com** sign in with GitHub and click **"New +"** -> **"Blueprint"**.
   - Select the `credit-portal` repository.
   - Render will read `render.yaml` and show two web services: `transformbiz-backend` and `transformbiz-frontend`.

4. **Render will prompt for the `DATABASE_URL` value on the backend service.**
   - Paste the Neon connection string from step 1.
   - `JWT_SECRET` is auto-generated. `FRONTEND_URL` defaults to `https://transformbiz-frontend.onrender.com`.

5. Click **"Apply"**. Render builds and deploys both services. First build takes 3-5 minutes.

6. **Permanent URLs:**
   - Frontend: `https://transformbiz-frontend.onrender.com`
   - Backend:  `https://transformbiz-backend.onrender.com` (health: `/api/health`)

7. **If Render assigned different service names due to a collision**, edit the two
   lines marked `# >>> EDIT IF RENAMED` in `render.yaml` (`FRONTEND_URL` on backend,
   `NEXT_PUBLIC_API_URL` on frontend), commit, and push. Render auto-redeploys.

8. **Admin login works immediately — no manual seeding required.**
   The admin account is created automatically on first startup. Default admin:
   `support@transformbiz.com.au` / `Pavan2003$%` (override via `ADMIN_EMAIL` /
   `ADMIN_PASSWORD` env vars on the backend service). A sample client is also
   provisioned so the admin dashboard isn't empty. Just visit your frontend URL
   and sign in (see [Default Credentials](#default-credentials-development)).

### Login on Render after first deploy

The admin account is created automatically on first startup — **no manual
seeding required**. Default admin: `support@transformbiz.com.au` / `Pavan2003$%`
(override via `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars on the backend service).

There are two ways to sign in: the unified `/login` (clients and admins) and a
dedicated administrator portal at `/admin-login`.

Simply visit your frontend URL and log in with the credentials in
[Default Credentials](#default-credentials-development).

   **Change these credentials immediately on any public deployment.**

### Vercel (frontend) + Render (backend + database) — *If you have a paid Render account or prefer Vercel*

Use this if you prefer Vercel's CDN/edge for the Next.js frontend.

**1. Backend + database on Render**

- Create the database and backend only (you can delete the `transformbiz-frontend`
  service from the blueprint, or create them manually):
  - **New +** -> **PostgreSQL** -> create `transformbiz-db`, copy its
    **Internal/External Connection String**.
  - **New +** -> **Web Service** -> connect repo -> set **Root Directory** = `backend`.
    - Build command: `npm install && npm run build:prod`
    - Start command: `npm run start:prod`
    - Health check path: `/api/health`
    - Environment variables:
      | Key            | Value                                                |
      |----------------|------------------------------------------------------|
      | `DATABASE_URL` | the Postgres connection string from above            |
      | `JWT_SECRET`   | `openssl rand -base64 32` output (a strong secret)   |
      | `NODE_ENV`     | `production`                                         |
      | `FRONTEND_URL` | your Vercel URL, e.g. `https://your-app.vercel.app`  |

**2. Frontend on Vercel**

- Go to **https://vercel.com**, **New Project**, import this repository.
- Set **Root Directory** = `frontend` ([`vercel.json`](./frontend/vercel.json) configures the Next.js build).
- Add environment variable:
  | Key                   | Value                                              |
  |-----------------------|----------------------------------------------------|
  | `NEXT_PUBLIC_API_URL` | `https://<your-render-backend>.onrender.com/api`   |
- Deploy. Copy the resulting Vercel URL and make sure it matches the backend's
  `FRONTEND_URL` (update on Render and redeploy the backend if needed, so CORS allows it).

### Docker (any container host) — *If you have a paid Render account or prefer container hosting*

Dockerfiles are provided for both services.

```bash
# Backend (point DATABASE_URL at any PostgreSQL instance)
docker build -t transformbiz-backend ./backend
docker run -p 3001:3001 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
  -e JWT_SECRET="$(openssl rand -base64 32)" \
  -e FRONTEND_URL="https://your-frontend-domain" \
  -e NODE_ENV=production \
  transformbiz-backend

# Frontend (NEXT_PUBLIC_API_URL is baked in at build time)
docker build --build-arg NEXT_PUBLIC_API_URL=https://your-backend-domain/api \
  -t transformbiz-frontend ./frontend
docker run -p 3000:3000 transformbiz-frontend
```

### Managed PostgreSQL alternatives

Any standard PostgreSQL works — just set `DATABASE_URL`:
- [Neon](https://neon.tech) (permanent free tier — used by the blueprint above)
- [Supabase](https://supabase.com) (free tier)
- [Railway](https://railway.app)
- [Render Postgres](https://render.com) (paid only; not available on free Render accounts)

## License

Private - All rights reserved.

## Security

This project favours pragmatic, defence-in-depth defaults over a single
"silver-bullet" control. Implemented protections:

- **Two sign-in entry points + backend RBAC.** Clients and admins can both sign
  in at the unified `/login`; there is also a dedicated administrator portal at
  `/admin-login` for convenience. Either way, after authentication the JWT's
  `role` claim is checked by the Express `authorize()` middleware on every admin
  route, so URL-knowledge alone never grants admin access. The `/admin-login`
  page only redirects to `/admin` when the authenticated user's role is `ADMIN`;
  otherwise it clears the session and shows an authorization error.
- **Password policy on registration.** New accounts must pick a password
  >= 10 characters with upper, lower, digit, and special character. Existing
  users are exempt so legacy passwords still log in.
- **Per-account brute-force lockout.** Five failed attempts on the same email
  within 15 minutes returns `429 Account temporarily locked...`. A successful
  login resets the counter.
- **IP rate limiting** on `/api/auth/login` and `/api/auth/register` — 20
  attempts per 15 minutes per IP. Complementary to the per-account lockout
  (one stops password spraying across accounts, the other stops hammering one
  account from many IPs).
- **Generic auth errors.** `/api/auth/login` returns the same
  `Invalid credentials.` response whether the email is unknown or the password
  is wrong, preventing account enumeration.
- **No public admin self-signup.** `/api/auth/register` hardcodes
  `role: 'CLIENT'`. Admin accounts are provisioned **only** on server startup
  (`backend/src/lib/bootstrap.ts`) or via the manual `npm run seed` fallback.
- **HTTP hardening headers** (via Helmet): strict Content-Security-Policy with
  `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, HSTS for 180 days
  with `includeSubDomains`, plus all helmet defaults. `X-Powered-By` is also
  explicitly disabled.
- **CORS allow-list.** The API only accepts cross-origin requests from
  `FRONTEND_URL` and only with `credentials: true`.
- **Short-lived JWTs.** Tokens expire after 24h.
- **Strong production JWT secret enforced.** On `NODE_ENV=production` the
  server refuses to boot if `JWT_SECRET` is missing, matches a known dev
  placeholder, or is shorter than 32 characters.
- **Secure cookies on HTTPS.** The frontend sets `token` / `role` cookies
  (used by the Next.js middleware for route gating) with `SameSite=Lax`, and
  adds `Secure` automatically when the page is served over HTTPS. Local
  http://localhost dev is unaffected.
- **Bcrypt password storage.** Passwords are hashed with bcrypt (cost 10);
  the plaintext is never stored or logged.
- **Lightweight admin audit log.** Note creation and client status changes
  emit single-line `[admin-audit]` JSON entries to stdout (Render captures
  them automatically) including the actor's admin email and the target
  client id.

### Trade-off — Tokens in localStorage + cookies

Today the JWT is stored in `localStorage` and mirrored into a non-HttpOnly
cookie so the Next.js middleware can gate `/dashboard` and `/admin` routes
before the page renders. Converting the cookie to `HttpOnly` is a future
hardening option — it would protect the token from XSS-based exfiltration,
but requires the backend to set `Set-Cookie` directly and rearchitecting the
fetch layer to rely on the cookie rather than an `Authorization` header.
Until then, the primary defence against XSS remains the strict CSP and React's
auto-escaping of dynamic content.



## Servicing engine & Quickli-style modules (v2 upgrade)

This release adds a configurable servicing engine and an expanded data model
(applicants/households, detailed income, proposed/existing home loans, personal
liabilities, extended living expenses, property ROI/growth, notes with linkage
and a deal summary). All calculator outputs are labelled
**"Indicative estimate only - not a credit decision."**

### Central configuration (no hard-coding)

All tunables live in [`backend/src/services/servicing.config.ts`](backend/src/services/servicing.config.ts):

- **Income shading per category** — `INCOME_SHADING` maps each MAIN income
  category (base salary, casual, commission, overtime, bonus, investment, etc.)
  to the fraction counted toward serviceability (e.g. base salary 100%, variable
  income ~80%). A per-entry `shadingOverride` always wins over the category
  default.
- **DTI cap, stress buffer, credit-card repayment %, HEM living-expense floors**
  (per adult / per child) and **rental-income shading**.
- **Bank-policy property presets** — `BANK_POLICY_LIMITS`: `ALL`, `TOP_3`,
  `TOP_4`, `CUSTOM`. `TOP_N` selects the N highest properties by current value
  (or equity).
- **Frequencies** — WEEKLY/FORTNIGHTLY/MONTHLY/ANNUAL with 52/26/12 conversions
  (`backend/src/utils/frequency.ts`).

Any of the numeric tunables can be overridden at runtime via environment
variables (see [`backend/.env.example`](backend/.env.example), e.g.
`SERVICING_DTI_CAP`, `SERVICING_STRESS_BUFFER`, `SERVICING_MIN_EXPENSE_ADULT`).

### Configuring income types & shading

Edit `INCOME_SHADING` in `servicing.config.ts` to change how each category is
shaded. The same category list is mirrored on the frontend dropdown in
[`frontend/src/lib/income.ts`](frontend/src/lib/income.ts). To add a category,
add it to `INCOME_CATEGORIES` + `INCOME_SHADING` (backend) and to the options
list (frontend).

### Hide / unhide from servicing

Every Property, ProposedHomeLoan, ExistingHomeLoan and PersonalLiability has an
`includeInServicing` boolean. The engine **filters out excluded items before**
computing commitments, surplus and rental income. Toggle items in bulk via:

```
POST /api/client/servicing-selection
{ "include": false, "propertyIds": ["..."], "personalLiabilityIds": ["..."] }
```

In the UI an excluded row is dimmed with an "Excluded from this calculation"
badge, and headers show "X of Y included". The **Bank Policy** preset dropdown
(All / Top 3 / Top 4 / Custom) drives the selection for properties.

### Property ROI / growth (computed on the backend)

`GET /api/client/properties` returns each property with a `growth` block, and
`GET /api/client/properties/growth` returns a portfolio overview. Growth is
computed in [`backend/src/services/servicing.ts`](backend/src/services/servicing.ts)
from `purchasePrice` and `purchaseDate` (never recomputed on the client):

- `capitalGrowth$ = currentValue - purchasePrice`
- `capitalGrowth% = capitalGrowth$ / purchasePrice * 100`
- `yearsHeld` from `purchaseDate` to now
- `CAGR% = (currentValue / purchasePrice)^(1/yearsHeld) - 1`
- `totalGrossRent = weeklyRent * 52 * yearsHeld`
- `grossYield% = (weeklyRent * 52 / currentValue) * 100`

All divide-by-zero / missing-`purchaseDate` cases return `null` for the affected
metric (never `NaN`/`Infinity`). The dedicated **Property Growth & Progress**
page lives at `/dashboard/properties/growth` and shows total portfolio value,
equity, capital growth $/%, blended gross yield and per-property cards with a
green/amber/red growth bar, CAGR, years held and yield. Admins can view the same
data per client via `GET /api/admin/clients/:id` (each property carries `growth`).

### Animated login & accessibility

`/login` and `/admin-login` share an animated, deep-navy auth scene
([`AuthScene`](frontend/src/components/ui/AuthScene.tsx) +
[`AuthForm`](frontend/src/components/ui/AuthForm.tsx)): ~20 slowly drifting
finance glyphs, a faint blueprint grid and three soft pulsing teal/gold radial
blobs, with a frosted-glass card that fades/slides/scales in. The form has
Client/Admin role tabs with a sliding pill, floating-label fields, show/hide
password, a shimmer + spinner on submit, a success lift-and-fade before routing,
and a horizontal wiggle + inline red error on failure.

All motion is **pure CSS keyframes** (no animation libraries, no
`next/font/google` — a system font stack is used so the build never performs a
network font fetch). Every animation is disabled automatically under
`@media (prefers-reduced-motion: reduce)`, and the form is fully
keyboard-accessible (semantic tabs/labels, focus rings).

### Database schemas (kept in lock-step)

`backend/prisma/schema.prisma` (SQLite, dev) and
`backend/prisma/schema.postgres.prisma` (PostgreSQL, prod) are kept
**structurally identical** — every model/field change is applied to both. Only
the generator/datasource headers differ (the dev schema additionally enables the
`queryCompiler` preview so the SQLite driver-adapter client runs without a native
query-engine binary; production uses the standard engine, which Render downloads
during build). New optional columns are nullable (`?`) and their Zod schemas use
`.nullable().optional()`; required columns stay required — keeping `tsc` happy on
Render.


### `calculateServicing` — the single servicing entry point

The engine exposes one canonical function in
[`backend/src/services/servicing.ts`](backend/src/services/servicing.ts):

```ts
calculateServicing(input: {
  clientProfile, incomes, properties, liabilities,
  existingLoans, proposedLoans, livingExpenses, loanScenario, params?
}): ServicingResult
```

It **filters `properties`, `liabilities`, `existingLoans` and `proposedLoans` to
only those with `includeInServicing === true` BEFORE** computing commitments,
net monthly surplus, max loan (at the stress rate + term), DTI and pass/fail
flags. Legacy rows missing the flag default to **included**. Income is
normalised to monthly with per-category shading (variable/investment ~80%),
pre/post-tax deductions reduce assessable income, and HECS/HELP is added as a
monthly commitment when flagged. The proposed loan being assessed is the first
included `proposedLoan` (its rate/term/IO drive the stress calc), otherwise the
`loanScenario` parameters are used. The result always includes the
**"Indicative estimate only - not a credit decision."** disclaimer.

`POST /api/loan-scenarios` assembles these lists from the profile + selected
scenario and calls `calculateServicing(...)`, so excluding a property or
liability and recalculating visibly changes the borrowing number.

### Client data-entry modules (Servicing & Financials)

`/dashboard/financials` (linked from the dashboard nav and the profile page)
hosts the Quickli-style data-entry forms; admins see read-only versions on
`/api/admin/clients/:id`:

- **Income** — a grouped MAIN-category dropdown (PAYG, variable, investment,
  government/family, deductions) per applicant, each with amount + frequency, a
  HECS/HELP flag + amount, and an optional shaded-monthly hint. Backed by
  `/api/client/income-entries`.
- **Property Portfolio table** — columns: Sr No., Property Type, Address, Loan
  amount, Remaining amount, Rem Term, Est. valuation, Current bank, Interest
  rate, Monthly repayment, Rent p.w, Year of purchase, Include in servicing. Loan
  columns prefer a linked `ExistingHomeLoan` (`existingHomeLoanId`) and fall back
  to optional inline fields on the property. Each row expands to a **View
  property performance** panel (capital growth $/%, years held as "X years Y
  months", CAGR, total gross rent, gross yield) with a green/amber/red growth
  bar — all from the backend `growth` block (never recomputed on the client).
- **Other Liabilities table** — Sr No., Liability Type, Ownership, Ownership %,
  Lender, Credit limit, Interest rate, Monthly repayment, Include in servicing.
  Credit cards use the configured limit-based assumed repayment when no repayment
  is set.
- **Existing & Proposed Home Loan tables** and a **Living Expenses form** (basic
  amount + additional categories with a live total + notional rent toggle).

**Include/exclude UX (Option A):** toggling a row immediately PATCHes its
`includeInServicing` flag (via `POST /api/client/servicing-selection` with a
single id); borrowing capacity is only recomputed when the user clicks
**Recalculate borrowing capacity**, which calls the scenario API and shows the
updated numbers with the indicative disclaimer. A mini summary above each table
shows "X total, Y included in servicing".

### Property valuation provider (realestate.com.au)

> **Why a link, not a scraper:** realestate.com.au has **no free public
> valuation API**, and scraping it violates their Terms of Service and is
> unreliable — so this app **never scrapes**. Instead it builds a deep link to
> the official realestate.com.au search/estimate page so the broker can open the
> lender-grade estimate themselves. The manually entered **Est. valuation**
> (`estimatedValue`) remains the source of truth used by the ROI/servicing
> engine.

A pluggable provider abstraction lives in
[`backend/src/services/valuation.ts`](backend/src/services/valuation.ts),
selected via `VALUATION_PROVIDER` (`manual` | `realestate_link` | `external`,
default `manual`). `GET /api/valuation/link?address=..&postcode=..` returns (or,
with `redirect=1`, 302-redirects to) a URL-encoded realestate.com.au search URL.
The property form has an **address + postcode** field and a **"Find valuation on
realestate.com.au"** button that opens that link in a new tab
(`target="_blank"`, `rel="noopener"`). A paid API (PropTrack/CoreLogic/Domain)
can be plugged into the same `ValuationProvider` interface later behind
`VALUATION_API_KEY` — no route or engine changes required. Address autocomplete
is a pluggable interface that defaults to a plain text input (no paid key, no
network dependency that could break the build).
