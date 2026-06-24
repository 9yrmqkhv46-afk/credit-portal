import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Frequency, toMonthly } from '../utils/frequency';
import {
  calculateServicing,
  DetailedIncomeInput,
  ExistingLoanInput,
  PersonalLiabilityInput,
  LivingExpensesInput,
  ServicingPropertyInput,
  ServicingProposedLoanInput,
} from '../services/servicing';

const router = Router();

router.use(authenticate);

const scenarioSchema = z.object({
  purpose: z.enum(['PURCHASE', 'REFINANCE', 'INVESTMENT', 'CONSTRUCTION', 'EQUITY_RELEASE']),
  repaymentType: z.enum(['PI', 'IO']).optional().default('PI'),
  loanTermYears: z.number().int().min(1).max(40).optional().default(30),
  interestRate: z.number().positive().max(1), // as decimal e.g., 0.06
});

const validFrequencies: Frequency[] = ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'];
function parseFrequency(value: string): Frequency {
  if (validFrequencies.includes(value as Frequency)) return value as Frequency;
  throw new Error(`Invalid frequency value: ${value}`);
}

/**
 * Map a legacy IncomeSource.type to a detailed income category so legacy data
 * keeps contributing to serviceability after the income module upgrade.
 */
function legacyIncomeCategory(type: string): string {
  switch (type.toUpperCase()) {
    case 'SALARY': return 'BASE_SALARY_PAYG';
    case 'BONUS': return 'BONUS_RECENT';
    case 'COMMISSION': return 'COMMISSION';
    case 'RENTAL': return 'INVESTMENT';
    case 'INVESTMENT': return 'INVESTMENT';
    case 'GOVERNMENT': return 'GOVERNMENT_PENSION';
    default: return 'OTHER_TAXED';
  }
}

// POST /api/loan-scenarios - create scenario, trigger calculation, save results
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = scenarioSchema.parse(req.body);

    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        incomeSources: true,
        existingDebts: true,
        expenseSummary: true,
        incomeEntries: true,
        livingExpenses: true,
        existingHomeLoans: true,
        proposedHomeLoans: true,
        personalLiabilities: true,
        properties: true,
      },
    });

    if (!profile) {
      res.status(404).json({ error: 'Client profile not found. Create your profile first.' });
      return;
    }

    // --- Income: legacy income sources mapped to categories + new entries ---
    const incomeEntries: DetailedIncomeInput[] = [
      ...profile.incomeSources.map((inc: any) => ({
        category: legacyIncomeCategory(inc.type),
        amount: inc.amount,
        frequency: parseFrequency(inc.frequency),
      })),
      ...profile.incomeEntries.map((e: any) => ({
        category: e.category,
        amount: e.amount,
        frequency: parseFrequency(e.frequency),
        shadingOverride: e.shadingOverride,
        hecsFlag: e.hecsFlag,
        hecsAmount: e.hecsAmount,
      })),
    ];

    // --- Living expenses: prefer the new model, else derive from legacy ---
    let livingExpenses: LivingExpensesInput | null = null;
    if (profile.livingExpenses) {
      livingExpenses = profile.livingExpenses as any;
    } else if (profile.expenseSummary) {
      const es: any = profile.expenseSummary;
      let basicMonthly = 0;
      const add = (amt: number, freq: string) => { if (amt > 0) basicMonthly += toMonthly(amt, parseFrequency(freq)); };
      add(es.groceries, es.groceriesFreq); add(es.utilities, es.utilitiesFreq);
      add(es.transport, es.transportFreq); add(es.insurance, es.insuranceFreq);
      add(es.education, es.educationFreq); add(es.childcare, es.childcareFreq);
      add(es.entertainment, es.entertainmentFreq); add(es.otherExpenses, es.otherExpensesFreq);
      livingExpenses = { basicExpenseAmount: basicMonthly, basicExpenseFrequency: 'MONTHLY' };
    }

    // --- Expanded living-expense categories (A2) ---
    // These optional ExpenseSummary categories are ALWAYS included (regardless
    // of which basic-expense source is used above) so a provided value is never
    // dropped. rental + schoolFees are genuine living expenses and are folded
    // into the declared monthly figure. The three *Repayment categories are
    // USER-ENTERED expense commitments: we surface them as additive monthly
    // commitments (injected as synthetic OTHER liabilities below) so they are
    // never absorbed by the HEM floor. They are intentionally NOT reconciled
    // against the PersonalLiability module (no double-counting; liabilities
    // logic is unchanged).
    let expandedCommitmentsMonthly = 0;
    if (profile.expenseSummary) {
      const es: any = profile.expenseSummary;
      const m = (amt: number | null | undefined, freq: string | null | undefined) =>
        amt && amt > 0 ? toMonthly(amt, parseFrequency(freq || 'MONTHLY')) : 0;
      const rentalMonthly = m(es.rental, es.rentalFreq);
      const schoolFeesMonthly = m(es.schoolFees, es.schoolFeesFreq);
      expandedCommitmentsMonthly =
        m(es.homeLoanRepayment, es.homeLoanRepaymentFreq) +
        m(es.creditCardRepayment, es.creditCardRepaymentFreq) +
        m(es.otherLoanRepayment, es.otherLoanRepaymentFreq);

      const extraLivingMonthly = rentalMonthly + schoolFeesMonthly;
      if (extraLivingMonthly > 0) {
        const base = livingExpenses || { basicExpenseAmount: 0, basicExpenseFrequency: 'MONTHLY' as Frequency };
        const baseMonthly = toMonthly(
          base.basicExpenseAmount || 0,
          (base.basicExpenseFrequency as Frequency) || 'MONTHLY'
        );
        livingExpenses = {
          ...base,
          basicExpenseAmount: baseMonthly + extraLivingMonthly,
          basicExpenseFrequency: 'MONTHLY',
        };
      }
    }

    // --- Existing home loans (new model) + legacy HOME_LOAN debts ---
    const existingLoans: ExistingLoanInput[] = [
      ...profile.existingHomeLoans.map((l: any) => ({
        loanAmount: l.loanAmount,
        interestRate: l.interestRate,
        termYears: l.termYears,
        monthlyRepayment: l.monthlyRepayment,
        includeInServicing: l.includeInServicing,
      })),
      ...profile.existingDebts
        .filter((d: any) => d.type === 'HOME_LOAN')
        .map((d: any) => ({
          loanAmount: d.outstandingBalance,
          interestRate: d.interestRate || data.interestRate,
          termYears: 30,
          monthlyRepayment: d.monthlyRepayment,
          includeInServicing: true,
        })),
    ];

    // --- Personal liabilities (new model) + legacy non-home debts ---
    const personalLiabilities: PersonalLiabilityInput[] = [
      ...profile.personalLiabilities.map((l: any) => ({
        type: l.type,
        limit: l.limit,
        repaymentAmount: l.repaymentAmount,
        includeInServicing: l.includeInServicing,
      })),
      ...profile.existingDebts
        .filter((d: any) => d.type !== 'HOME_LOAN')
        .map((d: any) => ({
          type: d.type,
          limit: d.creditLimit,
          repaymentAmount: d.monthlyRepayment,
          includeInServicing: true,
        })),
    ];

    // Inject the expanded ExpenseSummary repayment categories (A2) as additive
    // monthly commitments via synthetic OTHER liabilities. This keeps them out
    // of the HEM-floored living-expense total and additive to commitments,
    // without modifying the liabilities engine logic.
    if (expandedCommitmentsMonthly > 0) {
      personalLiabilities.push({
        type: 'OTHER',
        repaymentAmount: expandedCommitmentsMonthly,
        includeInServicing: true,
      });
    }

    // --- Proposed home loans (selectable as the loan being assessed) ---
    const proposedLoans: ServicingProposedLoanInput[] = profile.proposedHomeLoans.map((l: any) => ({
      loanAmount: l.loanAmount,
      termYears: l.termYears,
      ioTermYears: l.ioTermYears,
      interestRate: l.interestRate,
      investmentFlag: l.investmentFlag,
      includeInServicing: l.includeInServicing,
    }));

    // --- Properties: pass the raw list; calculateServicing filters by
    //     includeInServicing and derives shaded rental income itself. ---
    const properties: ServicingPropertyInput[] = (profile.properties as any[]).map((p) => ({
      id: p.id,
      type: p.type,
      estimatedValue: p.estimatedValue,
      mortgageBalance: p.mortgageBalance,
      purchasePrice: p.purchasePrice,
      purchaseDate: p.purchaseDate,
      rentalIncome: p.rentalIncome,
      rentalIncomeAmount: p.rentalIncomeAmount,
      rentalIncomeFrequency: p.rentalIncomeFrequency,
      includeInServicing: p.includeInServicing,
    }));

    const result = calculateServicing({
      clientProfile: {
        numberOfAdultDependants: profile.numberOfAdultDependants,
        numberOfChildDependants: profile.numberOfChildDependants,
      },
      incomes: incomeEntries,
      properties,
      liabilities: personalLiabilities,
      existingLoans,
      proposedLoans,
      livingExpenses,
      loanScenario: {
        interestRate: data.interestRate,
        loanTermYears: data.loanTermYears,
        repaymentType: data.repaymentType,
      },
    });

    const scenario = await prisma.loanScenario.create({
      data: {
        userId: req.user!.id,
        purpose: data.purpose,
        repaymentType: data.repaymentType,
        loanTermYears: data.loanTermYears,
        interestRate: data.interestRate,
        maxBorrowingCapacity: result.maxBorrowingCapacity,
        serviceabilityMax: result.serviceabilityMax,
        dtiMax: result.dtiMax,
        monthlyRepayment: result.monthlyRepayment,
        totalMonthlyIncome: result.totalMonthlyIncome,
        totalMonthlyExpenses: result.totalMonthlyExpenses,
        netMonthlySurplus: result.netMonthlySurplus,
        dtiRatio: result.dtiRatio,
        passesServiceability: result.passesServiceability,
        passesDti: result.passesDti,
        messages: JSON.stringify(result.messages),
      },
    });

    res.status(201).json({ scenario, calculationResult: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/loan-scenarios - list user's scenarios
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenarios = await prisma.loanScenario.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ scenarios });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/loan-scenarios/:id - get single scenario with results
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scenario = await prisma.loanScenario.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });

    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found.' });
      return;
    }

    res.json({ scenario });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
