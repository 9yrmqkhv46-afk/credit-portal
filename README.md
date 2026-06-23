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
│   │   │   ├── dashboard/    # Client dashboard + calculator
│   │   │   ├── login/        # Login page
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

### 5. Seed the Database

This creates the admin user and a sample client:

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

### Frontend (`frontend/.env.local`)

| Variable              | Description                        | Default (Dev)                  |
|-----------------------|------------------------------------|--------------------------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL               | `http://localhost:3001/api`    |

## Default Credentials (Development)

After seeding, the following accounts are available:

| Role   | Email                  | Password    |
|--------|------------------------|-------------|
| Admin  | admin@lendcalc.com     | Admin123!   |
| Client | client@example.com     | Client123!  |

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
[`render.yaml`](./render.yaml) blueprint that provisions **everything** (database
+ backend + frontend) in one step.

### Option A - Render one-click Blueprint (recommended)

1. **Push this repository to GitHub** (if it isn't already):
   ```bash
   git add .
   git commit -m "Add deployment configuration"
   git push origin main
   ```
2. Go to **https://render.com** and **sign in** (sign up with GitHub for the fastest path).
3. Click **New +** -> **Blueprint**.
4. **Connect this repository.** Render scans the repo, finds `render.yaml`, and shows the
   three resources it will create:
   - `transformbiz-db` - managed PostgreSQL database
   - `transformbiz-backend` - Express API web service
   - `transformbiz-frontend` - Next.js web service
5. Click **Apply** / **Deploy**. Render then automatically:
   - creates the PostgreSQL database and injects its connection string into
     `DATABASE_URL` on the backend,
   - **auto-generates** a strong `JWT_SECRET`,
   - builds the backend (`npm install && npm run build:prod`) and starts it with
     `npm run start:prod`, which runs `prisma db push` against Postgres then boots the API,
   - builds and starts the frontend.
6. When the services go live, your **permanent URLs** are:
   - Frontend: `https://transformbiz-frontend.onrender.com`
   - Backend:  `https://transformbiz-backend.onrender.com` (health check at `/api/health`)
7. **Verify the cross-service URLs.** `render.yaml` pre-sets, assuming Render's
   default `<name>.onrender.com` domains:
   - backend `FRONTEND_URL` = `https://transformbiz-frontend.onrender.com` (CORS allow-list)
   - frontend `NEXT_PUBLIC_API_URL` = `https://transformbiz-backend.onrender.com/api`

   If Render assigned different names, edit those two values in `render.yaml`
   (search for `# >>> EDIT IF RENAMED`), commit, and push — Render redeploys automatically.
   > Note: because `NEXT_PUBLIC_API_URL` is inlined into the frontend at build time,
   > the frontend must be **rebuilt** after changing it.
8. **(Optional) Seed default users.** In the Render dashboard open the
   `transformbiz-backend` service -> **Shell**, and run:
   ```bash
   npm run seed
   ```
   This creates `admin@lendcalc.com / Admin123!` and `client@example.com / Client123!`.
   **Change these credentials immediately on any public deployment.**

Open the frontend URL — your app is now live on a permanent public URL.

### Option B - Vercel (frontend) + Render (backend + database)

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

### Option C - Docker (any container host)

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
- [Render Postgres](https://render.com) (used by the blueprint)
- [Neon](https://neon.tech) (free tier)
- [Supabase](https://supabase.com) (free tier)
- [Railway](https://railway.app)

## License

Private - All rights reserved.
