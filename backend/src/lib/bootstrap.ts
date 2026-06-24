import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

/**
 * Auto-provision admin accounts (and a sample client) on server startup.
 *
 * This replaces the need to run `npm run seed` manually after a fresh deploy.
 * It uses the shared `prisma` singleton from `./prisma`, which automatically
 * selects the correct driver:
 *   - SQLite (better-sqlite3 adapter) in local dev
 *   - plain PostgreSQL client in production
 * so the same code path works in both environments.
 *
 * Behaviour:
 *   - Admin accounts SELF-HEAL: on every boot their password/role/name are
 *     re-applied (upsert.update), so a missing or wrong admin password is
 *     always corrected.
 *   - The sample client is created once but its password is NOT overwritten on
 *     subsequent boots (upsert.update is `{}`), so real edits persist.
 *   - Related sample records (income/debt/property/expenses) are only created
 *     when none exist yet, keeping the function idempotent.
 *   - A failure on one entity logs a warning but never crashes startup.
 *   - Passwords and hashes are NEVER logged.
 */
export async function ensureSeedData(): Promise<void> {
  // ---- Admin definitions (env overrides with documented defaults) ----------
  const primaryAdminEmail = process.env.ADMIN_EMAIL || 'support@transformbiz.com.au';
  const primaryAdminPassword = process.env.ADMIN_PASSWORD || 'Pavan2003$%';
  const primaryAdminName = 'TransformBiz Support';

  const legacyAdminEmail = 'admin@lendcalc.com';
  const legacyAdminPassword = 'Admin123!';
  const legacyAdminName = 'Admin User';

  const admins = [
    { email: primaryAdminEmail, password: primaryAdminPassword, name: primaryAdminName },
    { email: legacyAdminEmail, password: legacyAdminPassword, name: legacyAdminName },
  ];

  const ensuredAdmins: string[] = [];

  // ---- Ensure admins (self-healing password on every boot) ------------------
  for (const admin of admins) {
    try {
      const hashed = await bcrypt.hash(admin.password, 10);
      await prisma.user.upsert({
        where: { email: admin.email },
        update: {
          name: admin.name,
          role: 'ADMIN',
          password: hashed,
        },
        create: {
          email: admin.email,
          name: admin.name,
          role: 'ADMIN',
          password: hashed,
        },
      });
      ensuredAdmins.push(admin.email);
    } catch (err) {
      console.warn(`[bootstrap] failed to ensure admin ${admin.email}:`, err);
    }
  }

  // ---- Ensure sample client (+ profile), no password overwrite on update ----
  let sampleClientReady = false;
  try {
    const clientPassword = await bcrypt.hash('Client123!', 10);
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

    // The profile should exist via the nested create above, but defend against
    // a pre-existing client row that has no profile yet.
    let profile = await prisma.clientProfile.findUnique({
      where: { userId: client.id },
    });
    if (!profile) {
      profile = await prisma.clientProfile.create({
        data: {
          userId: client.id,
          phone: '0412345678',
          residencyStatus: 'CITIZEN',
          numberOfAdultDependants: 0,
          numberOfChildDependants: 2,
          maritalStatus: 'MARRIED',
          employmentStatus: 'FULL_TIME',
          status: 'Prospect',
        },
      });
    }

    // ---- Ensure at least one of each related record (idempotent) -----------
    const incomeCount = await prisma.incomeSource.count({
      where: { clientProfileId: profile.id },
    });
    if (incomeCount === 0) {
      await prisma.incomeSource.create({
        data: {
          clientProfileId: profile.id,
          owner: 'SELF',
          type: 'SALARY',
          amount: 9000,
          frequency: 'MONTHLY',
          description: 'Primary salary',
        },
      });
    }

    const debtCount = await prisma.existingDebt.count({
      where: { clientProfileId: profile.id },
    });
    if (debtCount === 0) {
      await prisma.existingDebt.create({
        data: {
          clientProfileId: profile.id,
          type: 'CREDIT_CARD',
          outstandingBalance: 2000,
          creditLimit: 15000,
          description: 'Visa card',
        },
      });
    }

    const propertyCount = await prisma.property.count({
      where: { clientProfileId: profile.id },
    });
    if (propertyCount === 0) {
      // Generic placeholder data only (never real names/addresses).
      await prisma.property.create({
        data: {
          clientProfileId: profile.id,
          type: 'OWNER_OCCUPIED',
          address: '12 Sample St',
          postcode: '2000',
          estimatedValue: 850000,
          purchasePrice: 600000,
          purchaseDate: new Date('2018-06-01'),
          mortgageBalance: 400000,
          transactionType: 'OWNS_WITH_MORTGAGE',
          includeInServicing: true,
          description: 'Family home',
        },
      });
      await prisma.property.create({
        data: {
          clientProfileId: profile.id,
          type: 'INVESTMENT',
          address: '34 Example Ave',
          postcode: '3000',
          estimatedValue: 720000,
          purchasePrice: 500000,
          purchaseDate: new Date('2019-09-01'),
          mortgageBalance: 350000,
          transactionType: 'OWNS_WITH_MORTGAGE',
          rentalIncomeAmount: 620,
          rentalIncomeFrequency: 'WEEKLY',
          eligibleNegativeGearing: true,
          includeInServicing: true,
          description: 'Investment unit',
        },
      });
    }

    const expenseSummary = await prisma.expenseSummary.findUnique({
      where: { clientProfileId: profile.id },
    });
    if (!expenseSummary) {
      await prisma.expenseSummary.create({
        data: {
          clientProfileId: profile.id,
          groceries: 1200,
          groceriesFreq: 'MONTHLY',
          utilities: 400,
          utilitiesFreq: 'MONTHLY',
          transport: 500,
          transportFreq: 'MONTHLY',
          insurance: 300,
          insuranceFreq: 'MONTHLY',
          education: 0,
          educationFreq: 'MONTHLY',
          childcare: 800,
          childcareFreq: 'MONTHLY',
          entertainment: 400,
          entertainmentFreq: 'MONTHLY',
          otherExpenses: 300,
          otherExpensesFreq: 'MONTHLY',
        },
      });
    }

    sampleClientReady = true;
  } catch (err) {
    console.warn('[bootstrap] failed to ensure sample client:', err);
  }

  const adminSummary = ensuredAdmins.length > 0 ? ensuredAdmins.join(', ') : '(none)';
  console.log(
    `[bootstrap] admins ensured: ${adminSummary}; sample client ${sampleClientReady ? 'ready' : 'unavailable'}`
  );
}

export default ensureSeedData;
