import { prisma } from './prisma';
import bcrypt from 'bcryptjs';
import { STAGE_DEFS } from './timeline';

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

  // ---- Demo client for the timeline + messaging hub (Mandate 2 & 4C) --------
  try {
    await ensureDemoClient();
  } catch (err) {
    console.warn('[bootstrap] failed to ensure demo client:', err);
  }
}

/**
 * Idempotently seed a demo client ("James Hartley") with:
 *   - a profile at application stage 6 (unconditional pre-approval),
 *   - an 8–10 message conversation thread (text + structured cards),
 *   - two admin remarks (General + Urgent).
 * Generic placeholder data only — example.com email, no real PII.
 */
async function ensureDemoClient(): Promise<void> {
  const email = 'james.hartley@example.com';
  const password = await bcrypt.hash('Client123!', 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'James Hartley',
      password,
      role: 'CLIENT',
      clientProfile: {
        create: {
          phone: '0455123456',
          mobile: '+61455123456',
          legalFirstName: 'James',
          legalLastName: 'Hartley',
          preferredName: 'James',
          residencyStatus: 'CITIZEN',
          numberOfAdultDependants: 1,
          numberOfChildDependants: 2,
          maritalStatus: 'MARRIED',
          employmentStatus: 'FULL_TIME',
          employerName: 'Acme Engineering Pty Ltd',
          jobTitle: 'Senior Project Manager',
          annualIncome: 165000,
          status: 'Active',
        },
      },
    },
  });

  // ---- Timeline: stages 1-5 completed, stage 6 active, due date on stage 9 --
  const stageCount = await prisma.applicationStage.count({ where: { userId: user.id } });
  if (stageCount === 0) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await prisma.$transaction(
      STAGE_DEFS.map((def, i) => {
        const order = i + 1;
        let status = 'upcoming';
        let completedAt: Date | null = null;
        if (order <= 5) {
          status = 'completed';
          completedAt = new Date(now - (6 - order) * 3 * day);
        } else if (order === 6) {
          status = 'active';
        }
        const dueDate = def.key === 'finance_clause_due' ? new Date(now + 7 * day) : null;
        return prisma.applicationStage.create({
          data: {
            userId: user.id,
            key: def.key,
            label: def.label,
            group: def.group,
            orderIndex: order,
            hasDate: def.hasDate,
            status,
            completedAt,
            dueDate,
          },
        });
      })
    );
  }

  // ---- Conversation thread (idempotent) ------------------------------------
  const msgCount = await prisma.message.count({ where: { clientUserId: user.id } });
  if (msgCount === 0) {
    const base = Date.now() - 6 * 60 * 60 * 1000;
    const min = 60 * 1000;
    const thread: Array<{
      senderRole: string; body?: string | null; type?: string; cardData?: unknown; offset: number; status?: string; resolved?: boolean;
    }> = [
      { senderRole: 'ADMIN', body: 'Hi James, welcome to your TransformBiz lending portal. I\u2019ll keep you posted here at every step.', offset: 0, status: 'read' },
      { senderRole: 'CLIENT', body: 'Thanks! Great to have everything in one place.', offset: 4 * min, status: 'read' },
      {
        senderRole: 'SYSTEM', type: 'stage_update', offset: 30 * min, status: 'read',
        cardData: { stage: 'Conditional Pre-Approval Received', group: 'Pre-Approval', order: 5, total: 18 },
        body: 'Stage update: Conditional Pre-Approval Received',
      },
      {
        senderRole: 'ADMIN', type: 'document_request', offset: 35 * min, status: 'read',
        cardData: { title: 'Documents required', items: ['Last 2 payslips', 'Most recent bank statement', 'Photo ID'] },
        body: 'Could you upload these when you get a chance?',
      },
      { senderRole: 'CLIENT', body: 'Just uploaded my payslips and ID. Bank statement to follow tonight.', offset: 90 * min, status: 'read' },
      {
        senderRole: 'ADMIN', type: 'borrowing_summary', offset: 100 * min, status: 'read',
        cardData: { maxBorrowing: 920000, rate: 6.49, termYears: 30, monthlyRepayment: 5805 },
        body: 'Here\u2019s your indicative borrowing summary.',
      },
      { senderRole: 'CLIENT', body: 'When is the finance clause due? Want to make sure we don\u2019t miss it.', offset: 140 * min, status: 'read' },
      { senderRole: 'ADMIN', body: 'Good question \u2014 it\u2019s due 30 Jun. I\u2019m chasing the valuation now and will confirm well before then.', offset: 150 * min, status: 'read', resolved: true },
      {
        senderRole: 'ADMIN', type: 'meeting_request', offset: 160 * min, status: 'delivered',
        cardData: { title: 'Quick catch-up call', proposed: 'Thu 2:30pm', durationMins: 15 },
        body: 'Shall we lock in a quick call to walk through next steps?',
      },
      { senderRole: 'CLIENT', body: 'Thursday 2:30 works for me 👍', offset: 175 * min, status: 'sent' },
    ];
    for (const m of thread) {
      await prisma.message.create({
        data: {
          clientUserId: user.id,
          senderRole: m.senderRole,
          body: m.body ?? null,
          type: m.type ?? 'text',
          cardData: m.cardData ? JSON.stringify(m.cardData) : null,
          status: m.status ?? 'sent',
          resolved: m.resolved ?? false,
          createdAt: new Date(base + m.offset),
        },
      });
    }
  }

  // ---- Admin remarks (idempotent) ------------------------------------------
  const noteCount = await prisma.note.count({ where: { userId: user.id } });
  if (noteCount === 0) {
    // Author the remarks as the primary admin if present.
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const authorId = admin?.id ?? user.id;
    await prisma.note.create({
      data: {
        userId: user.id,
        authorId,
        visibility: 'ADMIN_ONLY',
        content: 'Called James 24 Jun - confirmed employment start date.',
        tags: 'General',
        pinned: false,
      },
    });
    await prisma.note.create({
      data: {
        userId: user.id,
        authorId,
        visibility: 'ADMIN_ONLY',
        content: 'Finance clause due 30 Jun - follow up on valuation.',
        tags: 'Urgent,Follow Up',
        pinned: true,
      },
    });
  }
}

export default ensureSeedData;
