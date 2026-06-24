import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { computePropertyGrowth } from '../services/servicing';

const router = Router();

// All routes require authentication
router.use(authenticate);

// === Client Profile ===

const profileSchema = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  residencyStatus: z.enum(['CITIZEN', 'PERMANENT_RESIDENT', 'TEMPORARY_VISA']).optional(),
  numberOfAdultDependants: z.number().int().min(0).optional(),
  numberOfChildDependants: z.number().int().min(0).optional(),
  privateSchoolingFlag: z.boolean().optional(),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DE_FACTO', 'DIVORCED', 'WIDOWED']).optional(),
  employmentStatus: z.enum(['FULL_TIME', 'PART_TIME', 'CASUAL', 'SELF_EMPLOYED', 'UNEMPLOYED', 'RETIRED']).optional(),
});

// GET /api/client/profile
router.get('/profile', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        incomeSources: true,
        existingDebts: true,
        properties: true,
        expenseSummary: true,
      },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create one first.' });
      return;
    }

    res.json({ profile });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/client/profile
router.post('/profile', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = profileSchema.parse(req.body);

    const existing = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (existing) {
      res.status(409).json({ error: 'Profile already exists. Use PUT to update.' });
      return;
    }

    const profile = await prisma.clientProfile.create({
      data: {
        userId: req.user!.id,
        ...data,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      },
    });

    res.status(201).json({ profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/client/profile
router.put('/profile', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = profileSchema.parse(req.body);

    const profile = await prisma.clientProfile.update({
      where: { userId: req.user!.id },
      data: {
        ...data,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      },
    });

    res.json({ profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// === Income Sources ===

const incomeSourceSchema = z.object({
  owner: z.enum(['SELF', 'PARTNER']).optional(),
  type: z.enum(['SALARY', 'BONUS', 'COMMISSION', 'RENTAL', 'INVESTMENT', 'GOVERNMENT', 'OTHER']),
  amount: z.number().positive(),
  frequency: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']),
  // Defensive: accept null for the optional free-text description so a blank
  // field coming from the UI does not trigger a 400.
  description: z.string().nullable().optional(),
});

// GET /api/client/income-sources
router.get('/income-sources', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create profile first.' });
      return;
    }

    const incomeSources = await prisma.incomeSource.findMany({
      where: { clientProfileId: profile.id },
    });

    res.json({ incomeSources });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/client/income-sources
router.post('/income-sources', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = incomeSourceSchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create profile first.' });
      return;
    }

    const incomeSource = await prisma.incomeSource.create({
      data: {
        clientProfileId: profile.id,
        ...data,
      },
    });

    res.status(201).json({ incomeSource });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/client/income-sources/:id
router.put('/income-sources/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = incomeSourceSchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const existing = await prisma.incomeSource.findFirst({
      where: { id: req.params.id, clientProfileId: profile.id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Income source not found.' });
      return;
    }

    const incomeSource = await prisma.incomeSource.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ incomeSource });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/client/income-sources/:id
router.delete('/income-sources/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const existing = await prisma.incomeSource.findFirst({
      where: { id: req.params.id, clientProfileId: profile.id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Income source not found.' });
      return;
    }

    await prisma.incomeSource.delete({ where: { id: req.params.id } });
    res.json({ message: 'Income source deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// === Existing Debts ===

const debtSchema = z.object({
  type: z.enum(['HOME_LOAN', 'PERSONAL_LOAN', 'CAR_LOAN', 'CREDIT_CARD', 'HECS', 'OTHER']),
  outstandingBalance: z.number().min(0),
  // Optional numeric fields are nullable: the profile wizard sends `null` for
  // blank inputs, and Prisma stores null in these nullable columns.
  monthlyRepayment: z.number().min(0).nullable().optional(),
  interestRate: z.number().min(0).nullable().optional(),
  creditLimit: z.number().min(0).nullable().optional(),
  description: z.string().nullable().optional(),
});

// GET /api/client/existing-debts
router.get('/existing-debts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create profile first.' });
      return;
    }

    const existingDebts = await prisma.existingDebt.findMany({
      where: { clientProfileId: profile.id },
    });

    res.json({ existingDebts });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/client/existing-debts
router.post('/existing-debts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = debtSchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create profile first.' });
      return;
    }

    const debt = await prisma.existingDebt.create({
      data: {
        clientProfileId: profile.id,
        ...data,
      },
    });

    res.status(201).json({ debt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/client/existing-debts/:id
router.put('/existing-debts/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = debtSchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const existing = await prisma.existingDebt.findFirst({
      where: { id: req.params.id, clientProfileId: profile.id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Debt not found.' });
      return;
    }

    const debt = await prisma.existingDebt.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ debt });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/client/existing-debts/:id
router.delete('/existing-debts/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const existing = await prisma.existingDebt.findFirst({
      where: { id: req.params.id, clientProfileId: profile.id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Debt not found.' });
      return;
    }

    await prisma.existingDebt.delete({ where: { id: req.params.id } });
    res.json({ message: 'Debt deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// === Properties ===

// Optional numeric/string fields are nullable: the profile wizard sends `null`
// for blank inputs, and Prisma stores null in these nullable columns. Required
// columns (type, address, estimatedValue) stay required. Boolean columns have a
// DB default so they are optional (NOT nullable — the column is non-nullable).
const propertySchema = z.object({
  type: z.enum(['OWNER_OCCUPIED', 'INVESTMENT', 'RENTAL']),
  address: z.string().min(1, 'Address is required'),
  estimatedValue: z.number().positive('Estimated value must be greater than 0'),
  mortgageBalance: z.number().min(0).nullable().optional(),
  rentalIncome: z.number().min(0).nullable().optional(),
  description: z.string().nullable().optional(),

  // --- Extended Quickli-style fields ---
  postcode: z.string().nullable().optional(),
  purchasePrice: z.number().min(0).nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  transactionType: z.enum(['OWNS_WITH_MORTGAGE', 'OWNS_OUTRIGHT', 'PURCHASING']).nullable().optional(),
  holidayFlag: z.boolean().optional(),
  eligibleNegativeGearing: z.boolean().optional(),
  rentalIncomeAmount: z.number().min(0).nullable().optional(),
  rentalIncomeFrequency: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).nullable().optional(),
  investmentExpenseAmount: z.number().min(0).nullable().optional(),
  investmentExpenseFrequency: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).nullable().optional(),
  valuationSource: z.string().nullable().optional(),
  valuationDate: z.string().nullable().optional(),
  ownership: z.string().nullable().optional(),
  includeInServicing: z.boolean().optional(),
});

/** Convert the optional date strings in a property payload to Date objects. */
function buildPropertyData(data: z.infer<typeof propertySchema>) {
  const { purchaseDate, valuationDate, ...rest } = data;
  const toDate = (v?: string | null): Date | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  return {
    ...rest,
    ...(purchaseDate !== undefined ? { purchaseDate: toDate(purchaseDate) } : {}),
    ...(valuationDate !== undefined ? { valuationDate: toDate(valuationDate) } : {}),
  };
}

// GET /api/client/properties
router.get('/properties', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create profile first.' });
      return;
    }

    const properties = await prisma.property.findMany({
      where: { clientProfileId: profile.id },
    });

    // Attach backend-computed growth/ROI so the frontend never recomputes.
    const withGrowth = properties.map((p: any) => ({ ...p, growth: computePropertyGrowth(p) }));

    res.json({ properties: withGrowth });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/client/properties
router.post('/properties', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = propertySchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create profile first.' });
      return;
    }

    const property = await prisma.property.create({
      data: {
        clientProfileId: profile.id,
        ...buildPropertyData(data),
      },
    });

    res.status(201).json({ property: { ...property, growth: computePropertyGrowth(property as any) } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/client/properties/:id
router.put('/properties/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = propertySchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const existing = await prisma.property.findFirst({
      where: { id: req.params.id, clientProfileId: profile.id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }

    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: buildPropertyData(data),
    });

    res.json({ property: { ...property, growth: computePropertyGrowth(property as any) } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/client/properties/:id
router.delete('/properties/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const existing = await prisma.property.findFirst({
      where: { id: req.params.id, clientProfileId: profile.id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }

    await prisma.property.delete({ where: { id: req.params.id } });
    res.json({ message: 'Property deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// === Expense Summary ===

// Expense numeric fields map to NON-nullable Float columns (e.g. `groceries
// Float @default(0)`) in both schema.prisma and schema.postgres.prisma, so they
// must NOT be nullable. They are optional only (blank => undefined => DB default).
const expenseSchema = z.object({
  groceries: z.number().min(0).optional(),
  groceriesFreq: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).optional(),
  utilities: z.number().min(0).optional(),
  utilitiesFreq: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).optional(),
  transport: z.number().min(0).optional(),
  transportFreq: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).optional(),
  insurance: z.number().min(0).optional(),
  insuranceFreq: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).optional(),
  education: z.number().min(0).optional(),
  educationFreq: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).optional(),
  childcare: z.number().min(0).optional(),
  childcareFreq: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).optional(),
  entertainment: z.number().min(0).optional(),
  entertainmentFreq: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).optional(),
  otherExpenses: z.number().min(0).optional(),
  otherExpensesFreq: z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']).optional(),
});

// GET /api/client/expense-summary
router.get('/expense-summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create profile first.' });
      return;
    }

    const expenseSummary = await prisma.expenseSummary.findUnique({
      where: { clientProfileId: profile.id },
    });

    if (!expenseSummary) {
      res.status(404).json({ error: 'Expense summary not found.' });
      return;
    }

    res.json({ expenseSummary });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/client/expense-summary
router.post('/expense-summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = expenseSchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found. Create profile first.' });
      return;
    }

    const existing = await prisma.expenseSummary.findUnique({
      where: { clientProfileId: profile.id },
    });

    if (existing) {
      res.status(409).json({ error: 'Expense summary already exists. Use PUT to update.' });
      return;
    }

    const expenseSummary = await prisma.expenseSummary.create({
      data: {
        clientProfileId: profile.id,
        ...data,
      },
    });

    res.status(201).json({ expenseSummary });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PUT /api/client/expense-summary
router.put('/expense-summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = expenseSchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    const expenseSummary = await prisma.expenseSummary.update({
      where: { clientProfileId: profile.id },
      data,
    });

    res.json({ expenseSummary });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
