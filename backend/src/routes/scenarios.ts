import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { calculateBorrowingCapacity, CalculatorInput } from '../services/calculator';
import { Frequency } from '../utils/frequency';

const router = Router();

router.use(authenticate);

const scenarioSchema = z.object({
  purpose: z.enum(['PURCHASE', 'REFINANCE', 'INVESTMENT', 'CONSTRUCTION', 'EQUITY_RELEASE']),
  repaymentType: z.enum(['PI', 'IO']).optional().default('PI'),
  loanTermYears: z.number().int().min(1).max(40).optional().default(30),
  interestRate: z.number().positive().max(1), // as decimal e.g., 0.06
});

// POST /api/loan-scenarios - create scenario, trigger calculation, save results
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = scenarioSchema.parse(req.body);

    // Get client profile with all financial data
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        incomeSources: true,
        existingDebts: true,
        expenseSummary: true,
      },
    });

    if (!profile) {
      res.status(404).json({ error: 'Client profile not found. Create your profile first.' });
      return;
    }

    // Build calculator input from profile data
    const expenses: CalculatorInput['expenses'] = [];
    const validFrequencies: Frequency[] = ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL'];

    function parseFrequency(value: string): Frequency {
      if (validFrequencies.includes(value as Frequency)) {
        return value as Frequency;
      }
      throw new Error(`Invalid frequency value: ${value}`);
    }

    if (profile.expenseSummary) {
      const es = profile.expenseSummary;
      if (es.groceries > 0) expenses.push({ amount: es.groceries, frequency: parseFrequency(es.groceriesFreq) });
      if (es.utilities > 0) expenses.push({ amount: es.utilities, frequency: parseFrequency(es.utilitiesFreq) });
      if (es.transport > 0) expenses.push({ amount: es.transport, frequency: parseFrequency(es.transportFreq) });
      if (es.insurance > 0) expenses.push({ amount: es.insurance, frequency: parseFrequency(es.insuranceFreq) });
      if (es.education > 0) expenses.push({ amount: es.education, frequency: parseFrequency(es.educationFreq) });
      if (es.childcare > 0) expenses.push({ amount: es.childcare, frequency: parseFrequency(es.childcareFreq) });
      if (es.entertainment > 0) expenses.push({ amount: es.entertainment, frequency: parseFrequency(es.entertainmentFreq) });
      if (es.otherExpenses > 0) expenses.push({ amount: es.otherExpenses, frequency: parseFrequency(es.otherExpensesFreq) });
    }

    const calculatorInput: CalculatorInput = {
      incomeSources: profile.incomeSources.map((inc: any) => ({
        type: inc.type,
        amount: inc.amount,
        frequency: parseFrequency(inc.frequency),
        owner: inc.owner,
      })),
      existingDebts: profile.existingDebts.map((debt: any) => ({
        type: debt.type,
        outstandingBalance: debt.outstandingBalance,
        monthlyRepayment: debt.monthlyRepayment,
        interestRate: debt.interestRate,
        creditLimit: debt.creditLimit,
      })),
      expenses,
      numberOfAdultDependants: profile.numberOfAdultDependants,
      numberOfChildDependants: profile.numberOfChildDependants,
      loanTermYears: data.loanTermYears,
      interestRate: data.interestRate,
      repaymentType: data.repaymentType,
    };

    const result = calculateBorrowingCapacity(calculatorInput);

    // Save scenario with results
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
