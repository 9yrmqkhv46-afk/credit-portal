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
  // native module.
  const { PrismaBetterSQLite3 } = require('@prisma/adapter-better-sqlite3');
  const dbPath = path.resolve(__dirname, '../../prisma/dev.db');
  const adapter = new PrismaBetterSQLite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter } as any);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
