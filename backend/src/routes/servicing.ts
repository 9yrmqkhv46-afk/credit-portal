import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { computePropertyGrowth } from '../services/servicing';

/**
 * Routes for the extended Quickli-style servicing modules:
 *   households / applicants / dependants, detailed income entries,
 *   proposed & existing home loans, personal liabilities, living expenses,
 *   notes (with linkage), deal summary, and the bulk servicing-selection
 *   endpoint.
 *
 * All routes are scoped to the authenticated user's own ClientProfile (clients
 * own their data). Admin read access to any client is provided via the
 * /api/admin/clients/:id endpoint.
 */

const router = Router();
router.use(authenticate);

const FREQ = z.enum(['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'ANNUAL']);

/** Get (the caller's) profile or send a 404. Returns null if not found. */
async function getOwnProfile(req: AuthRequest) {
  return prisma.clientProfile.findUnique({ where: { userId: req.user!.id } });
}

function dateOrUndefined(v?: string | null): Date | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ===========================================================================
// Households
// ===========================================================================
const householdSchema = z.object({ name: z.string().min(1, 'Name is required') });

router.get('/households', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found. Create profile first.' }); return; }
  const households = await prisma.household.findMany({
    where: { clientProfileId: profile.id },
    include: { applicants: { include: { dependants: true } } },
  });
  res.json({ households });
});

router.post('/households', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = householdSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found. Create profile first.' }); return; }
    const household = await prisma.household.create({ data: { clientProfileId: profile.id, ...data } });
    res.status(201).json({ household });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/households/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = householdSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.household.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
    if (!existing) { res.status(404).json({ error: 'Household not found.' }); return; }
    const household = await prisma.household.update({ where: { id: req.params.id }, data });
    res.json({ household });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/households/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.household.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
  if (!existing) { res.status(404).json({ error: 'Household not found.' }); return; }
  // Cascade-delete dependants + applicants for this household.
  const applicants = await prisma.applicant.findMany({ where: { householdId: existing.id } });
  for (const a of applicants) {
    await prisma.dependant.deleteMany({ where: { applicantId: a.id } });
    await prisma.incomeEntry.updateMany({ where: { applicantId: a.id }, data: { applicantId: null } });
  }
  await prisma.applicant.deleteMany({ where: { householdId: existing.id } });
  await prisma.household.delete({ where: { id: existing.id } });
  res.json({ message: 'Household deleted.' });
});

// ===========================================================================
// Applicants
// ===========================================================================
const applicantSchema = z.object({
  householdId: z.string().min(1),
  name: z.string().min(1, 'Name is required'),
  relationship: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  dependantsCount: z.number().int().min(0).optional(),
});

async function ownsHousehold(profileId: string, householdId: string): Promise<boolean> {
  const h = await prisma.household.findFirst({ where: { id: householdId, clientProfileId: profileId } });
  return !!h;
}

router.post('/applicants', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = applicantSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    if (!(await ownsHousehold(profile.id, data.householdId))) { res.status(404).json({ error: 'Household not found.' }); return; }
    const applicant = await prisma.applicant.create({ data });
    res.status(201).json({ applicant });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/applicants/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = applicantSchema.partial().parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.applicant.findFirst({ where: { id: req.params.id, household: { clientProfileId: profile.id } } });
    if (!existing) { res.status(404).json({ error: 'Applicant not found.' }); return; }
    const applicant = await prisma.applicant.update({ where: { id: req.params.id }, data });
    res.json({ applicant });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/applicants/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.applicant.findFirst({ where: { id: req.params.id, household: { clientProfileId: profile.id } } });
  if (!existing) { res.status(404).json({ error: 'Applicant not found.' }); return; }
  await prisma.dependant.deleteMany({ where: { applicantId: existing.id } });
  await prisma.incomeEntry.updateMany({ where: { applicantId: existing.id }, data: { applicantId: null } });
  await prisma.applicant.delete({ where: { id: existing.id } });
  res.json({ message: 'Applicant deleted.' });
});

// ===========================================================================
// Dependants
// ===========================================================================
const dependantSchema = z.object({ applicantId: z.string().min(1), age: z.number().int().min(0) });

router.post('/dependants', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = dependantSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const applicant = await prisma.applicant.findFirst({ where: { id: data.applicantId, household: { clientProfileId: profile.id } } });
    if (!applicant) { res.status(404).json({ error: 'Applicant not found.' }); return; }
    const dependant = await prisma.dependant.create({ data });
    res.status(201).json({ dependant });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/dependants/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.dependant.findFirst({ where: { id: req.params.id, applicant: { household: { clientProfileId: profile.id } } } });
  if (!existing) { res.status(404).json({ error: 'Dependant not found.' }); return; }
  await prisma.dependant.delete({ where: { id: existing.id } });
  res.json({ message: 'Dependant deleted.' });
});

// ===========================================================================
// Income entries
// ===========================================================================
const incomeEntrySchema = z.object({
  applicantId: z.string().nullable().optional(),
  category: z.string().min(1),
  amount: z.number().min(0),
  frequency: FREQ.optional(),
  shadingOverride: z.number().min(0).max(1).nullable().optional(),
  jobNumber: z.number().int().nullable().optional(),
  employer: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  payDate: z.string().nullable().optional(),
  payslipEndDate: z.string().nullable().optional(),
  payFrequency: z.string().nullable().optional(),
  baseSalaryPerPeriod: z.number().nullable().optional(),
  grossYtd: z.number().nullable().optional(),
  lessBonus: z.number().nullable().optional(),
  nonBaseToAllocate: z.number().nullable().optional(),
  nonBaseToOmit: z.number().nullable().optional(),
  useDetailedYtd: z.boolean().optional(),
  useSecondPayslip: z.boolean().optional(),
  hecsFlag: z.boolean().optional(),
  hecsAmount: z.number().min(0).nullable().optional(),
});

function buildIncomeData(data: z.infer<typeof incomeEntrySchema>) {
  return {
    ...data,
    startDate: dateOrUndefined(data.startDate),
    payDate: dateOrUndefined(data.payDate),
    payslipEndDate: dateOrUndefined(data.payslipEndDate),
  };
}

router.get('/income-entries', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const incomeEntries = await prisma.incomeEntry.findMany({ where: { clientProfileId: profile.id } });
  res.json({ incomeEntries });
});

router.post('/income-entries', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = incomeEntrySchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const incomeEntry = await prisma.incomeEntry.create({ data: { clientProfileId: profile.id, ...buildIncomeData(data) } });
    res.status(201).json({ incomeEntry });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/income-entries/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = incomeEntrySchema.partial().parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.incomeEntry.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
    if (!existing) { res.status(404).json({ error: 'Income entry not found.' }); return; }
    const incomeEntry = await prisma.incomeEntry.update({
      where: { id: req.params.id },
      data: {
        ...data,
        startDate: dateOrUndefined(data.startDate),
        payDate: dateOrUndefined(data.payDate),
        payslipEndDate: dateOrUndefined(data.payslipEndDate),
      },
    });
    res.json({ incomeEntry });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/income-entries/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.incomeEntry.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
  if (!existing) { res.status(404).json({ error: 'Income entry not found.' }); return; }
  await prisma.incomeEntry.delete({ where: { id: existing.id } });
  res.json({ message: 'Income entry deleted.' });
});

// ===========================================================================
// Proposed home loans
// ===========================================================================
const proposedLoanSchema = z.object({
  productType: z.string().nullable().optional(),
  investmentFlag: z.boolean().optional(),
  loanAmount: z.number().min(0),
  termYears: z.number().int().min(1).max(40).optional(),
  ioTermYears: z.number().int().min(0).max(40).optional(),
  interestRate: z.number().min(0).nullable().optional(),
  lvr: z.number().min(0).nullable().optional(),
  overrideRate: z.boolean().optional(),
  securityLinks: z.number().int().min(0).optional(),
  ownership: z.string().nullable().optional(),
  includeInServicing: z.boolean().optional(),
});

router.get('/proposed-loans', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const proposedLoans = await prisma.proposedHomeLoan.findMany({ where: { clientProfileId: profile.id } });
  res.json({ proposedLoans });
});

router.post('/proposed-loans', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = proposedLoanSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const proposedLoan = await prisma.proposedHomeLoan.create({ data: { clientProfileId: profile.id, ...data } });
    res.status(201).json({ proposedLoan });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/proposed-loans/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = proposedLoanSchema.partial().parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.proposedHomeLoan.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
    if (!existing) { res.status(404).json({ error: 'Proposed loan not found.' }); return; }
    const proposedLoan = await prisma.proposedHomeLoan.update({ where: { id: req.params.id }, data });
    res.json({ proposedLoan });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/proposed-loans/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.proposedHomeLoan.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
  if (!existing) { res.status(404).json({ error: 'Proposed loan not found.' }); return; }
  await prisma.proposedHomeLoan.delete({ where: { id: existing.id } });
  res.json({ message: 'Proposed loan deleted.' });
});

// ===========================================================================
// Existing home loans
// ===========================================================================
const existingLoanSchema = z.object({
  locFlag: z.boolean().optional(),
  investmentFlag: z.boolean().optional(),
  loanAmount: z.number().min(0),
  interestRate: z.number().min(0),
  termYears: z.number().int().min(1).max(40).optional(),
  ioTermYears: z.number().int().min(0).max(40).optional(),
  monthlyRepayment: z.number().min(0).nullable().optional(),
  lender: z.string().nullable().optional(),
  securityLinks: z.number().int().min(0).optional(),
  ownership: z.string().nullable().optional(),
  includeInServicing: z.boolean().optional(),
});

router.get('/existing-home-loans', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existingHomeLoans = await prisma.existingHomeLoan.findMany({ where: { clientProfileId: profile.id } });
  res.json({ existingHomeLoans });
});

router.post('/existing-home-loans', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = existingLoanSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existingHomeLoan = await prisma.existingHomeLoan.create({ data: { clientProfileId: profile.id, ...data } });
    res.status(201).json({ existingHomeLoan });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/existing-home-loans/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = existingLoanSchema.partial().parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.existingHomeLoan.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
    if (!existing) { res.status(404).json({ error: 'Existing home loan not found.' }); return; }
    const existingHomeLoan = await prisma.existingHomeLoan.update({ where: { id: req.params.id }, data });
    res.json({ existingHomeLoan });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/existing-home-loans/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.existingHomeLoan.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
  if (!existing) { res.status(404).json({ error: 'Existing home loan not found.' }); return; }
  await prisma.existingHomeLoan.delete({ where: { id: existing.id } });
  res.json({ message: 'Existing home loan deleted.' });
});

// ===========================================================================
// Personal liabilities
// ===========================================================================
const liabilitySchema = z.object({
  type: z.enum(['CREDIT_CARD', 'CAR_LOAN', 'PERSONAL_LOAN', 'HECS', 'OTHER']),
  limit: z.number().min(0).nullable().optional(),
  interestRate: z.number().min(0).nullable().optional(),
  remainingTermYears: z.number().min(0).nullable().optional(),
  repaymentAmount: z.number().min(0).nullable().optional(),
  includeInServicing: z.boolean().optional(),
  ownership: z.string().nullable().optional(),
  ownershipPercent: z.number().min(0).max(100).nullable().optional(),
  lender: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

router.get('/personal-liabilities', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const personalLiabilities = await prisma.personalLiability.findMany({ where: { clientProfileId: profile.id } });
  res.json({ personalLiabilities });
});

router.post('/personal-liabilities', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = liabilitySchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const personalLiability = await prisma.personalLiability.create({ data: { clientProfileId: profile.id, ...data } });
    res.status(201).json({ personalLiability });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/personal-liabilities/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = liabilitySchema.partial().parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.personalLiability.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
    if (!existing) { res.status(404).json({ error: 'Personal liability not found.' }); return; }
    const personalLiability = await prisma.personalLiability.update({ where: { id: req.params.id }, data });
    res.json({ personalLiability });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/personal-liabilities/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.personalLiability.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
  if (!existing) { res.status(404).json({ error: 'Personal liability not found.' }); return; }
  await prisma.personalLiability.delete({ where: { id: existing.id } });
  res.json({ message: 'Personal liability deleted.' });
});

// ===========================================================================
// Living expenses (extended)
// ===========================================================================
const livingExpensesSchema = z.object({
  basicExpenseAmount: z.number().min(0).optional(),
  basicExpenseFrequency: FREQ.optional(),
  propertyTax: z.number().min(0).nullable().optional(),
  strataBodyCorp: z.number().min(0).nullable().optional(),
  privateSchoolFees: z.number().min(0).nullable().optional(),
  childSupportMaintenance: z.number().min(0).nullable().optional(),
  privateHealthInsurance: z.number().min(0).nullable().optional(),
  lifeInsurance: z.number().min(0).nullable().optional(),
  secondaryResidenceCosts: z.number().min(0).nullable().optional(),
  otherNonHem: z.number().min(0).nullable().optional(),
  useNotionalRent: z.boolean().optional(),
  rentBoardAmount: z.number().min(0).nullable().optional(),
});

router.get('/living-expenses', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const livingExpenses = await prisma.livingExpenses.findUnique({ where: { clientProfileId: profile.id } });
  res.json({ livingExpenses });
});

router.put('/living-expenses', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = livingExpensesSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    // Upsert: create on first save, update thereafter.
    const livingExpenses = await prisma.livingExpenses.upsert({
      where: { clientProfileId: profile.id },
      update: data,
      create: { clientProfileId: profile.id, ...data },
    });
    res.json({ livingExpenses });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ===========================================================================
// Notes (with linkage) + deal summary
// ===========================================================================
const noteSchema = z.object({
  content: z.string().min(1, 'Note content is required'),
  visibility: z.enum(['ADMIN_ONLY', 'CLIENT_VISIBLE']).optional().default('CLIENT_VISIBLE'),
  linkedEntityType: z.enum(['PROPERTY', 'EXISTING_LOAN', 'PROPOSED_LOAN']).nullable().optional(),
  linkedEntityId: z.string().nullable().optional(),
});

router.get('/notes', async (req: AuthRequest, res: Response): Promise<void> => {
  const notes = await prisma.note.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } });
  res.json({ notes });
});

router.post('/notes', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = noteSchema.parse(req.body);
    const note = await prisma.note.create({
      data: {
        userId: req.user!.id,
        authorId: req.user!.id,
        content: data.content,
        visibility: data.visibility,
        linkedEntityType: data.linkedEntityType ?? null,
        linkedEntityId: data.linkedEntityId ?? null,
      },
    });
    res.status(201).json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/notes/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!existing) { res.status(404).json({ error: 'Note not found.' }); return; }
  await prisma.note.delete({ where: { id: existing.id } });
  res.json({ message: 'Note deleted.' });
});

// Deal summary lives on a LoanScenario. PUT updates the dealSummary text.
const dealSummarySchema = z.object({ dealSummary: z.string().nullable().optional() });

router.put('/scenarios/:id/deal-summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = dealSummarySchema.parse(req.body);
    const scenario = await prisma.loanScenario.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!scenario) { res.status(404).json({ error: 'Scenario not found.' }); return; }
    const updated = await prisma.loanScenario.update({
      where: { id: req.params.id },
      data: { dealSummary: data.dealSummary ?? null },
    });
    res.json({ scenario: updated });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ===========================================================================
// Bulk servicing selection (include/exclude properties, loans, liabilities)
// ===========================================================================
const bulkSelectionSchema = z.object({
  include: z.boolean(),
  propertyIds: z.array(z.string()).optional().default([]),
  proposedLoanIds: z.array(z.string()).optional().default([]),
  existingHomeLoanIds: z.array(z.string()).optional().default([]),
  personalLiabilityIds: z.array(z.string()).optional().default([]),
});

router.post('/servicing-selection', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = bulkSelectionSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const include = data.include;

    const [props, proposed, existingLoans, liabilities] = await Promise.all([
      data.propertyIds.length
        ? prisma.property.updateMany({ where: { id: { in: data.propertyIds }, clientProfileId: profile.id }, data: { includeInServicing: include } })
        : Promise.resolve({ count: 0 }),
      data.proposedLoanIds.length
        ? prisma.proposedHomeLoan.updateMany({ where: { id: { in: data.proposedLoanIds }, clientProfileId: profile.id }, data: { includeInServicing: include } })
        : Promise.resolve({ count: 0 }),
      data.existingHomeLoanIds.length
        ? prisma.existingHomeLoan.updateMany({ where: { id: { in: data.existingHomeLoanIds }, clientProfileId: profile.id }, data: { includeInServicing: include } })
        : Promise.resolve({ count: 0 }),
      data.personalLiabilityIds.length
        ? prisma.personalLiability.updateMany({ where: { id: { in: data.personalLiabilityIds }, clientProfileId: profile.id }, data: { includeInServicing: include } })
        : Promise.resolve({ count: 0 }),
    ]);

    // Normalise updateMany's return: the standard (library) engine returns
    // `{ count }`, while the queryCompiler preview returns the count as a raw
    // number. Support both so the response is correct in dev and production.
    const countOf = (r: unknown): number =>
      typeof r === 'number' ? r : ((r as { count?: number } | null)?.count ?? 0);

    res.json({
      updated: {
        properties: countOf(props),
        proposedLoans: countOf(proposed),
        existingHomeLoans: countOf(existingLoans),
        personalLiabilities: countOf(liabilities),
      },
      include,
    });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ===========================================================================
// Property portfolio growth overview (computed on the backend)
// ===========================================================================
router.get('/properties/growth', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const properties = await prisma.property.findMany({ where: { clientProfileId: profile.id } });

  const enriched = properties.map((p: any) => ({ ...p, growth: computePropertyGrowth(p) }));

  let totalValue = 0;
  let totalDebt = 0;
  let totalPurchase = 0;
  let annualRentSum = 0;
  for (const p of enriched) {
    totalValue += p.estimatedValue || 0;
    totalDebt += p.mortgageBalance || 0;
    if (p.growth.purchasePrice) totalPurchase += p.growth.purchasePrice;
    if (p.growth.weeklyRent) annualRentSum += p.growth.weeklyRent * 52;
  }
  const totalEquity = totalValue - totalDebt;
  const totalCapitalGrowthDollars = totalPurchase > 0 ? totalValue - totalPurchase : null;
  const totalCapitalGrowthPercent =
    totalPurchase > 0 ? ((totalValue - totalPurchase) / totalPurchase) * 100 : null;
  const blendedGrossYieldPercent = totalValue > 0 ? (annualRentSum / totalValue) * 100 : null;

  res.json({
    properties: enriched,
    portfolio: {
      totalValue,
      totalDebt,
      totalEquity,
      totalPurchase,
      totalCapitalGrowthDollars,
      totalCapitalGrowthPercent,
      blendedGrossYieldPercent,
      propertyCount: enriched.length,
      disclaimer: 'Indicative estimate only - not a credit decision.',
    },
  });
});

export default router;
