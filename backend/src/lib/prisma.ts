import { PrismaClient } from '@prisma/client';
import path from 'path';

// Shared PrismaClient singleton to avoid connection pool waste.
// In development, Next.js/nodemon hot-reloading can create multiple instances;
// using a global reference prevents that.
//
// Database selection is driven entirely by DATABASE_URL:
//   - postgres:// or postgresql://  -> production PostgreSQL (plain PrismaClient)
//   - anything else (file:./dev.db) -> local SQLite via the better-sqlite3 driver adapter
//
// This lets local development keep using SQLite (no DB server required) while
// production uses PostgreSQL, without changing any application code.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//i.test(url);
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';

  // Production / PostgreSQL: use the standard PrismaClient (DATABASE_URL is read
  // from the environment by the generated client).
  if (isPostgresUrl(databaseUrl)) {
    return new PrismaClient();
  }

  // Local development / SQLite: use the better-sqlite3 driver adapter.
  // Loaded lazily so production images that don't need SQLite never touch the
  // native module. The adapter (and better-sqlite3) live in optionalDependencies
  // because they are dev-only: production runs on PostgreSQL and never reaches
  // this branch. If the optional native module failed to install we surface a
  // clear, actionable error instead of an opaque "Cannot find module".
  let PrismaBetterSQLite3: new (config: { url: string }) => unknown;
  try {
    ({ PrismaBetterSQLite3 } = require('@prisma/adapter-better-sqlite3'));
  } catch {
    throw new Error(
      "SQLite dev mode requires the optional '@prisma/adapter-better-sqlite3' and " +
        "'better-sqlite3' packages, which are not installed. Either run " +
        "`npm install` so the optional dependencies build, or set DATABASE_URL to a " +
        'postgres:// connection string to use PostgreSQL.'
    );
  }
  const dbPath = path.resolve(__dirname, '../../prisma/dev.db');
  const adapter = new PrismaBetterSQLite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter } as any);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
