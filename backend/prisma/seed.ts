import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Seed script. Safe to re-run any number of times: every upsert below uses an
 * `update` block (not `{}`) so re-running the seed will reset the password and
 * role of the seeded accounts. This is how we recover from a deployment where
 * the database was empty or had stale credentials.
 *
 * Default credentials (development / first-deploy):
 *   ADMIN  -> support@transformbiz.com.au / Pavan2003$%
 *   ADMIN  -> admin@lendcalc.com          / Admin123!
 *   CLIENT -> client@example.com          / Client123!
 */
async function main() {
  const supportAdminPassword = await bcrypt.hash('Pavan2003$%', 10);
  const legacyAdminPassword = await bcrypt.hash('Admin123!', 10);
  const clientPassword = await bcrypt.hash('Client123!', 10);

  // Primary TransformBiz admin (new).
  const supportAdmin = await prisma.user.upsert({
    where: { email: 'support@transformbiz.com.au' },
    update: {
      password: supportAdminPassword,
      name: 'TransformBiz Support',
      role: 'ADMIN',
    },
    create: {
      email: 'support@transformbiz.com.au',
      name: 'TransformBiz Support',
      password: supportAdminPassword,
      role: 'ADMIN',
    },
  });

  // Legacy admin kept for backwards compatibility with earlier docs/tests.
  const legacyAdmin = await prisma.user.upsert({
    where: { email: 'admin@lendcalc.com' },
    update: {
      password: legacyAdminPassword,
      name: 'Admin User',
      role: 'ADMIN',
    },
    create: {
      email: 'admin@lendcalc.com',
      name: 'Admin User',
      password: legacyAdminPassword,
      role: 'ADMIN',
    },
  });

  // Sample client. We intentionally do NOT reset the client's password on
  // re-run so a real user's chosen password is not overwritten if they happen
  // to share this email.
  const client = await prisma.user.upsert({
    where: { email: 'client@example.com' },
    update: {},
    create: {
      email: 'client@example.com',
      name: 'Sample Client',
      password: clientPassword,
      role: 'CLIENT',
      clientProfile: {
        create: {
          phone: '0412345678',
          residencyStatus: 'CITIZEN',
          numberOfAdultDependants: 0,
          numberOfChildDependants: 2,
          maritalStatus: 'MARRIED',
          employmentStatus: 'FULL_TIME',
          status: 'Prospect',
        },
      },
    },
  });

  console.log('Seeded users:', {
    supportAdmin: supportAdmin.email,
    legacyAdmin: legacyAdmin.email,
    client: client.email,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
