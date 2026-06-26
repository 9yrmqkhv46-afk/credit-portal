import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * Bluehive assessment sub-entities owned by the authenticated client:
 *   - co-borrower (Borrower 2)        — 1:1 upsert
 *   - employments (history, 3-year)   — CRUD list
 *   - bank-accounts                   — CRUD list
 *   - non-property-assets             — CRUD list
 * Mounted at /api/client (alongside client.ts and servicing.ts).
 */
const router = Router();
router.use(authenticate);

async function getOwnProfile(req: AuthRequest) {
  return prisma.clientProfile.findUnique({ where: { userId: req.user!.id } });
}

function dateOrNull(v?: string | null): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// ===========================================================================
// Co-Borrower (Borrower 2) — 1:1 upsert
// ===========================================================================
const coBorrowerSchema = z.object({
  relationshipToBorrower1: z.string().nullable().optional(),
  borrowerType: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  middleName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  numberOfChildrenUnder18: z.number().int().min(0).optional(),
  agesOfChildrenUnder18: z.string().nullable().optional(),
  currentAddress: z.string().nullable().optional(),
  currentAddressDateMovedIn: z.string().nullable().optional(),
  currentAddressLivingArrangement: z.string().nullable().optional(),
  homePhone: z.string().nullable().optional(),
  mobilePhone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  driverLicenceNumber: z.string().nullable().optional(),
  driverLicenceExpiry: z.string().nullable().optional(),
  passportNumber: z.string().nullable().optional(),
  passportExpiry: z.string().nullable().optional(),
  countryOfCitizenship: z.string().nullable().optional(),
  residencyStatus: z.string().nullable().optional(),
  visaSubclass: z.string().nullable().optional(),
  previousAddress1: z.string().nullable().optional(),
  previousAddress1DateMovedIn: z.string().nullable().optional(),
  previousAddress1LivingArrangement: z.string().nullable().optional(),
  previousAddress2: z.string().nullable().optional(),
  previousAddress2DateMovedIn: z.string().nullable().optional(),
  previousAddress2LivingArrangement: z.string().nullable().optional(),
  hasDefaultsOrJudgements: z.boolean().optional(),
  creditHistoryDetails: z.string().nullable().optional(),
  mothersMaidenName: z.string().nullable().optional(),
  nearestRelativeName: z.string().nullable().optional(),
  nearestRelativeAddress: z.string().nullable().optional(),
  nearestRelativePhone: z.string().nullable().optional(),
  nearestRelativeRelationship: z.string().nullable().optional(),
});

function buildCoBorrowerData(data: z.infer<typeof coBorrowerSchema>) {
  const { dateOfBirth, driverLicenceExpiry, passportExpiry, currentAddressDateMovedIn,
    previousAddress1DateMovedIn, previousAddress2DateMovedIn, ...rest } = data;
  const df = (k: string, v?: string | null) => (v !== undefined ? { [k]: dateOrNull(v) } : {});
  return {
    ...rest,
    ...df('dateOfBirth', dateOfBirth),
    ...df('driverLicenceExpiry', driverLicenceExpiry),
    ...df('passportExpiry', passportExpiry),
    ...df('currentAddressDateMovedIn', currentAddressDateMovedIn),
    ...df('previousAddress1DateMovedIn', previousAddress1DateMovedIn),
    ...df('previousAddress2DateMovedIn', previousAddress2DateMovedIn),
  };
}

router.get('/co-borrower', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found. Create profile first.' }); return; }
  const coBorrower = await prisma.coBorrowerProfile.findUnique({ where: { clientProfileId: profile.id } });
  res.json({ coBorrower });
});

router.put('/co-borrower', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = buildCoBorrowerData(coBorrowerSchema.parse(req.body));
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found. Create profile first.' }); return; }
    const coBorrower = await prisma.coBorrowerProfile.upsert({
      where: { clientProfileId: profile.id },
      update: data,
      create: { clientProfileId: profile.id, ...data },
    });
    res.json({ coBorrower });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/co-borrower', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  await prisma.coBorrowerProfile.deleteMany({ where: { clientProfileId: profile.id } });
  res.json({ message: 'Co-borrower removed.' });
});

// ===========================================================================
// Employment history — CRUD list
// ===========================================================================
const employmentSchema = z.object({
  owner: z.enum(['SELF', 'PARTNER']).optional(),
  sequence: z.number().int().min(1).optional(),
  isSelfEmployed: z.boolean().optional(),
  abn: z.string().nullable().optional(),
  employerName: z.string().nullable().optional(),
  employerAddress: z.string().nullable().optional(),
  employerPhone: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  dateStarted: z.string().nullable().optional(),
  dateFinished: z.string().nullable().optional(),
  annualSalaryExSuper: z.number().min(0).nullable().optional(),
  includesBonus: z.boolean().optional(),
  includesCommission: z.boolean().optional(),
  includesOvertime: z.boolean().optional(),
  includesAllowances: z.boolean().optional(),
});

function buildEmploymentData(data: z.infer<typeof employmentSchema>) {
  const { dateStarted, dateFinished, ...rest } = data;
  return {
    ...rest,
    ...(dateStarted !== undefined ? { dateStarted: dateOrNull(dateStarted) } : {}),
    ...(dateFinished !== undefined ? { dateFinished: dateOrNull(dateFinished) } : {}),
  };
}

router.get('/employments', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const employments = await prisma.employment.findMany({ where: { clientProfileId: profile.id }, orderBy: { sequence: 'asc' } });
  res.json({ employments });
});

router.post('/employments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = buildEmploymentData(employmentSchema.parse(req.body));
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const employment = await prisma.employment.create({ data: { clientProfileId: profile.id, ...data } });
    res.status(201).json({ employment });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/employments/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = buildEmploymentData(employmentSchema.partial().parse(req.body));
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.employment.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
    if (!existing) { res.status(404).json({ error: 'Employment not found.' }); return; }
    const employment = await prisma.employment.update({ where: { id: req.params.id }, data });
    res.json({ employment });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/employments/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.employment.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
  if (!existing) { res.status(404).json({ error: 'Employment not found.' }); return; }
  await prisma.employment.delete({ where: { id: existing.id } });
  res.json({ message: 'Employment deleted.' });
});

// ===========================================================================
// Bank accounts — CRUD list
// ===========================================================================
const bankAccountSchema = z.object({
  institution: z.string().nullable().optional(),
  accountNumber: z.string().nullable().optional(),
  balance: z.number().nullable().optional(),
  accountHolders: z.string().nullable().optional(),
  accountType: z.string().nullable().optional(),
});

router.get('/bank-accounts', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const bankAccounts = await prisma.bankAccount.findMany({ where: { clientProfileId: profile.id } });
  res.json({ bankAccounts });
});

router.post('/bank-accounts', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = bankAccountSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const bankAccount = await prisma.bankAccount.create({ data: { clientProfileId: profile.id, ...data } });
    res.status(201).json({ bankAccount });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/bank-accounts/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = bankAccountSchema.partial().parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.bankAccount.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
    if (!existing) { res.status(404).json({ error: 'Bank account not found.' }); return; }
    const bankAccount = await prisma.bankAccount.update({ where: { id: req.params.id }, data });
    res.json({ bankAccount });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/bank-accounts/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.bankAccount.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
  if (!existing) { res.status(404).json({ error: 'Bank account not found.' }); return; }
  await prisma.bankAccount.delete({ where: { id: existing.id } });
  res.json({ message: 'Bank account deleted.' });
});

// ===========================================================================
// Non-property assets — CRUD list
// ===========================================================================
const nonPropertyAssetSchema = z.object({
  assetType: z.string().min(1),
  description: z.string().nullable().optional(),
  value: z.number().nullable().optional(),
  owner: z.string().nullable().optional(),
});

router.get('/non-property-assets', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const nonPropertyAssets = await prisma.nonPropertyAsset.findMany({ where: { clientProfileId: profile.id } });
  res.json({ nonPropertyAssets });
});

router.post('/non-property-assets', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = nonPropertyAssetSchema.parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const nonPropertyAsset = await prisma.nonPropertyAsset.create({ data: { clientProfileId: profile.id, ...data } });
    res.status(201).json({ nonPropertyAsset });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.put('/non-property-assets/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = nonPropertyAssetSchema.partial().parse(req.body);
    const profile = await getOwnProfile(req);
    if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
    const existing = await prisma.nonPropertyAsset.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
    if (!existing) { res.status(404).json({ error: 'Asset not found.' }); return; }
    const nonPropertyAsset = await prisma.nonPropertyAsset.update({ where: { id: req.params.id }, data });
    res.json({ nonPropertyAsset });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.errors }); return; }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/non-property-assets/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await getOwnProfile(req);
  if (!profile) { res.status(404).json({ error: 'Profile not found.' }); return; }
  const existing = await prisma.nonPropertyAsset.findFirst({ where: { id: req.params.id, clientProfileId: profile.id } });
  if (!existing) { res.status(404).json({ error: 'Asset not found.' }); return; }
  await prisma.nonPropertyAsset.delete({ where: { id: existing.id } });
  res.json({ message: 'Asset deleted.' });
});

export default router;
