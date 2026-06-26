import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { prisma } from '../lib/prisma';
import { computePropertyGrowth } from '../services/servicing';
import { rankWithPatternMatching } from '../services/bankPolicy/ranking';
import { getActivePolicies } from '../services/bankPolicy/policies';
import { ScenarioInput, Frequency } from '../services/bankPolicy/types';
import { ensureTimeline, activateNextUpcoming, TOTAL_STAGES } from '../lib/timeline';

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticate);
router.use(authorize('ADMIN'));

/**
 * Lightweight audit logger. Writes structured single-line JSON to stdout so
 * hosting providers (e.g. Render) capture and index it for free. We
 * intentionally include only non-sensitive metadata: who acted, what entity
 * was touched, and when. Never log passwords or JWT tokens.
 */
function audit(event: string, fields: Record<string, unknown>): void {
  console.info(
    `[admin-audit] ${event} ${JSON.stringify({ ...fields, at: new Date().toISOString() })}`
  );
}

// GET /api/admin/clients - list all clients with latest scenario metrics, status, tags
router.get('/clients', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clients = await prisma.user.findMany({
      where: { role: 'CLIENT' },
      include: {
        clientProfile: true,
        loanScenarios: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const clientList = clients.map((client: any) => ({
      id: client.id,
      email: client.email,
      name: client.name,
      status: client.clientProfile?.status || 'Prospect',
      createdAt: client.createdAt,
      latestScenario: client.loanScenarios[0] || null,
    }));

    res.json({ clients: clientList });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/admin/clients/:id - full client detail with all profile data, scenarios, notes
router.get('/clients/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const client = await prisma.user.findFirst({
      where: { id: req.params.id, role: 'CLIENT' },
      include: {
        clientProfile: {
          include: {
            incomeSources: true,
            existingDebts: true,
            properties: true,
            expenseSummary: true,
            incomeEntries: true,
            households: { include: { applicants: { include: { dependants: true } } } },
            proposedHomeLoans: true,
            existingHomeLoans: true,
            personalLiabilities: true,
            livingExpenses: true,
            coBorrower: true,
            employments: true,
            bankAccounts: true,
            nonPropertyAssets: true,
            brokerDetails: true,
          },
        },
        loanScenarios: {
          orderBy: { createdAt: 'desc' },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    // Attach backend-computed growth/ROI to each property for the admin view.
    const profile: any = client.clientProfile;
    if (profile && Array.isArray(profile.properties)) {
      profile.properties = profile.properties.map((p: any) => ({ ...p, growth: computePropertyGrowth(p) }));
    }

    res.json({
      client: {
        id: client.id,
        email: client.email,
        name: client.name,
        role: client.role,
        createdAt: client.createdAt,
        profile: client.clientProfile,
        scenarios: client.loanScenarios,
        notes: client.notes,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

const noteSchema = z.object({
  content: z.string().min(1, 'Note content is required'),
  visibility: z.enum(['ADMIN_ONLY', 'CLIENT_VISIBLE']).optional().default('ADMIN_ONLY'),
  linkedEntityType: z.enum(['PROPERTY', 'EXISTING_LOAN', 'PROPOSED_LOAN']).nullable().optional(),
  linkedEntityId: z.string().nullable().optional(),
  // Admin Remarks Log (Mandate 4B): tags is a nullable comma-separated string;
  // pinned is a non-nullable Boolean (DB default) -> optional, never nullable.
  tags: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});

// POST /api/admin/clients/:id/notes - add admin note
router.post('/clients/:id/notes', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = noteSchema.parse(req.body);

    const client = await prisma.user.findFirst({
      where: { id: req.params.id, role: 'CLIENT' },
    });

    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const note = await prisma.note.create({
      data: {
        userId: req.params.id,
        content: data.content,
        visibility: data.visibility,
        authorId: req.user!.id,
        linkedEntityType: data.linkedEntityType ?? null,
        linkedEntityId: data.linkedEntityId ?? null,
        tags: data.tags ?? null,
        pinned: data.pinned ?? false,
      },
    });

    audit('note.create', {
      adminEmail: req.user!.email,
      adminId: req.user!.id,
      clientId: req.params.id,
      noteId: note.id,
      visibility: note.visibility,
    });

    res.status(201).json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

const statusSchema = z.object({
  status: z.enum(['Prospect', 'Active', 'Inactive']),
});

// PATCH /api/admin/clients/:id/status - update client status
router.patch('/clients/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = statusSchema.parse(req.body);

    const client = await prisma.user.findFirst({
      where: { id: req.params.id, role: 'CLIENT' },
    });

    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    // Update client profile status
    const profile = await prisma.clientProfile.findUnique({
      where: { userId: req.params.id },
    });

    if (!profile) {
      res.status(404).json({ error: 'Client profile not found.' });
      return;
    }

    const previousStatus = profile.status;
    const updatedProfile = await prisma.clientProfile.update({
      where: { userId: req.params.id },
      data: { status: data.status },
    });

    audit('client.status.update', {
      adminEmail: req.user!.email,
      adminId: req.user!.id,
      clientId: req.params.id,
      previousStatus,
      newStatus: data.status,
    });

    res.json({ profile: updatedProfile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ===========================================================================
// Admin Remarks Log — edit / pin / delete (Mandate 4B)
// ===========================================================================
const notePatchSchema = z.object({
  content: z.string().min(1).optional(),
  tags: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
});

// PATCH /api/admin/clients/:id/notes/:noteId — edit body, tags, or pin state.
router.patch('/clients/:id/notes/:noteId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = notePatchSchema.parse(req.body);
    const existing = await prisma.note.findFirst({
      where: { id: req.params.noteId, userId: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    const note = await prisma.note.update({
      where: { id: req.params.noteId },
      data: {
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.pinned !== undefined ? { pinned: data.pinned } : {}),
      },
    });
    audit('note.update', { adminId: req.user!.id, clientId: req.params.id, noteId: note.id });
    res.json({ note });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/admin/clients/:id/notes/:noteId
router.delete('/clients/:id/notes/:noteId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existing = await prisma.note.findFirst({
      where: { id: req.params.noteId, userId: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    await prisma.note.delete({ where: { id: req.params.noteId } });
    audit('note.delete', { adminId: req.user!.id, clientId: req.params.id, noteId: req.params.noteId });
    res.json({ message: 'Note deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ===========================================================================
// Application Status Timeline (Mandate 2)
// ===========================================================================
async function requireClient(id: string): Promise<boolean> {
  const client = await prisma.user.findFirst({ where: { id, role: 'CLIENT' } });
  return !!client;
}

// GET /api/admin/clients/:id/timeline — auto-seeds if missing.
router.get('/clients/:id/timeline', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClient(req.params.id))) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const stages = await ensureTimeline(req.params.id);
    res.json({ stages, totalStages: TOTAL_STAGES });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

const timelinePatchSchema = z.object({
  action: z.enum(['complete', 'skip', 'reset']).optional(),
  note: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

// PATCH /api/admin/clients/:id/timeline/:stageId — set status / note / dueDate.
// Completing a stage records completedAt and promotes the next upcoming stage
// to active.
router.patch('/clients/:id/timeline/:stageId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = timelinePatchSchema.parse(req.body);
    if (!(await requireClient(req.params.id))) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    // Ensure the timeline exists before mutating a stage.
    await ensureTimeline(req.params.id);

    const stage = await prisma.applicationStage.findFirst({
      where: { id: req.params.stageId, userId: req.params.id },
    });
    if (!stage) {
      res.status(404).json({ error: 'Stage not found.' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (data.action === 'complete') {
      updateData.status = 'completed';
      updateData.completedAt = new Date();
    } else if (data.action === 'skip') {
      updateData.status = 'skipped';
      updateData.completedAt = null;
    } else if (data.action === 'reset') {
      updateData.status = 'upcoming';
      updateData.completedAt = null;
    }
    if (data.note !== undefined) updateData.note = data.note;
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    await prisma.applicationStage.update({
      where: { id: stage.id },
      data: updateData,
    });

    // When completing, promote the next upcoming stage to active.
    if (data.action === 'complete') {
      await activateNextUpcoming(req.params.id);
    }

    audit('timeline.update', {
      adminId: req.user!.id,
      clientId: req.params.id,
      stageId: stage.id,
      action: data.action ?? 'meta',
    });

    const stages = await prisma.applicationStage.findMany({
      where: { userId: req.params.id },
      orderBy: { orderIndex: 'asc' },
    });
    res.json({ stages, totalStages: TOTAL_STAGES });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ===========================================================================
// Messaging Hub — admin side (Mandate 4C)
// ===========================================================================
function serialiseJson(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return null; }
}

const MESSAGE_TYPES = ['text', 'stage_update', 'document_request', 'borrowing_summary', 'meeting_request', 'document', 'property_report'] as const;

const adminSendSchema = z.object({
  body: z.string().nullable().optional(),
  type: z.enum(MESSAGE_TYPES).optional().default('text'),
  cardData: z.any().optional(),
  senderRole: z.enum(['ADMIN', 'SYSTEM']).optional().default('ADMIN'),
});

// GET /api/admin/clients/:id/messages — full thread for a client.
router.get('/clients/:id/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!(await requireClient(req.params.id))) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const messages = await prisma.message.findMany({
      where: { clientUserId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/admin/clients/:id/messages — admin (or system) sends into the thread.
router.post('/clients/:id/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = adminSendSchema.parse(req.body);
    if (!(await requireClient(req.params.id))) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    if (!data.body && !data.cardData) {
      res.status(400).json({ error: 'A message body or card payload is required.' });
      return;
    }
    const message = await prisma.message.create({
      data: {
        clientUserId: req.params.id,
        senderRole: data.senderRole,
        body: data.body ?? null,
        type: data.type,
        cardData: serialiseJson(data.cardData),
        status: 'sent',
      },
    });
    res.status(201).json({ message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

const adminMessagePatchSchema = z.object({
  status: z.enum(['sent', 'delivered', 'read']).optional(),
  resolved: z.boolean().optional(),
  flagged: z.boolean().optional(),
  reactions: z.any().optional(),
});

// PATCH /api/admin/clients/:id/messages/:messageId — read/resolved/flagged/reaction.
router.patch('/clients/:id/messages/:messageId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = adminMessagePatchSchema.parse(req.body);
    const existing = await prisma.message.findFirst({
      where: { id: req.params.messageId, clientUserId: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    const message = await prisma.message.update({
      where: { id: req.params.messageId },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.resolved !== undefined ? { resolved: data.resolved } : {}),
        ...(data.flagged !== undefined ? { flagged: data.flagged } : {}),
        ...(data.reactions !== undefined ? { reactions: serialiseJson(data.reactions) } : {}),
      },
    });
    res.json({ message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

const brokerDetailsSchema = z.object({
  conveyancerName: z.string().nullable().optional(),
  conveyancerAddress: z.string().nullable().optional(),
  conveyancerPhone: z.string().nullable().optional(),
  conveyancerEmail: z.string().nullable().optional(),
  lenderSelected: z.string().nullable().optional(),
});

// PUT /api/admin/clients/:id/broker-details — upsert broker-completed section.
router.put('/clients/:id/broker-details', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = brokerDetailsSchema.parse(req.body);
    const profile = await prisma.clientProfile.findFirst({ where: { userId: req.params.id } });
    if (!profile) {
      res.status(404).json({ error: 'Client profile not found.' });
      return;
    }
    const brokerDetails = await prisma.brokerCompletedDetails.upsert({
      where: { clientProfileId: profile.id },
      update: data,
      create: { clientProfileId: profile.id, ...data },
    });
    audit('client.broker-details.update', { adminEmail: req.user!.email, clientId: req.params.id });
    res.json({ brokerDetails });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ===========================================================================
// Bank recommendations — read the client's stored CRM data, build a scenario,
// rank all active 2026 bank policies, and suggest the TOP 3 lenders.
// ===========================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

function toMonthly(amount: number, freq?: string): number {
  switch (freq) {
    case 'WEEKLY': return (amount * 52) / 12;
    case 'FORTNIGHTLY': return (amount * 26) / 12;
    case 'QUARTERLY': return (amount * 4) / 12;
    case 'ANNUAL': return amount / 12;
    default: return amount; // MONTHLY
  }
}

/** Map the client's stored profile + scenarios into the engine's ScenarioInput. */
function buildScenarioFromClient(profile: any, scenarios: any[]): ScenarioInput {
  const partnered = profile?.maritalStatus === 'MARRIED' || profile?.maritalStatus === 'DE_FACTO';
  const numberOfAdults = (partnered ? 2 : 1) + (profile?.numberOfAdultDependants || 0);
  const numberOfChildren = profile?.numberOfChildDependants || 0;
  const isSelfEmployed = profile?.employmentStatus === 'SELF_EMPLOYED';

  // Income — skip RENTAL here (the engine aggregates rental from properties).
  const incomeSources: ScenarioInput['incomeSources'] = [];
  const mapType = (t: string) => {
    if (t === 'SALARY') return 'SALARY_PRIMARY';
    if (t === 'BONUS' || t === 'COMMISSION') return 'SALARY_SECONDARY';
    if (t === 'GOVERNMENT') return 'GOV';
    if (t === 'BUSINESS') return 'BUSINESS';
    return 'OTHER';
  };
  for (const s of (profile?.incomeSources || [])) {
    if (s.type === 'RENTAL') continue;
    incomeSources.push({ type: mapType(s.type) as any, amount: toMonthly(s.amount || 0, s.frequency), frequency: 'MONTHLY' as Frequency });
  }
  if (incomeSources.length === 0 && profile?.annualIncome) {
    incomeSources.push({ type: 'SALARY_PRIMARY', amount: (profile.annualIncome as number) / 12, frequency: 'MONTHLY' });
  }

  // Expenses from the declared expense summary (monthly), rent separate.
  const es = profile?.expenseSummary;
  let declaredMonthlyLiving = 0;
  let monthlyRent = 0;
  if (es) {
    const cats: Array<[string, string]> = [
      ['groceries', 'groceriesFreq'], ['utilities', 'utilitiesFreq'], ['transport', 'transportFreq'],
      ['insurance', 'insuranceFreq'], ['education', 'educationFreq'], ['childcare', 'childcareFreq'],
      ['entertainment', 'entertainmentFreq'], ['otherExpenses', 'otherExpensesFreq'],
    ];
    for (const [amt, fr] of cats) declaredMonthlyLiving += toMonthly(es[amt] || 0, es[fr]);
    monthlyRent = toMonthly(es.rental || 0, es.rentalFreq);
  }

  // Properties (owner-occ + investment + commercial), with their secured loans.
  const mapPropType = (t: string) => (t === 'INVESTMENT' || t === 'RENTAL') ? 'INVESTMENT' : t === 'COMMERCIAL' ? 'COMMERCIAL' : 'OWNER_OCC';
  const properties: ScenarioInput['properties'] = (profile?.properties || []).map((p: any) => ({
    id: p.id,
    type: mapPropType(p.type) as any,
    estimatedValue: p.estimatedValue || 0,
    currentLoanBalance: p.mortgageBalance ?? p.remainingLoanAmount ?? p.loanAmount ?? 0,
    currentRepaymentAmount: p.loanMonthlyRepayment ?? 0,
    grossRentalIncomeMonthly: p.rentalIncomeAmount != null
      ? toMonthly(p.rentalIncomeAmount, p.rentalIncomeFrequency)
      : toMonthly(p.rentalIncome || 0, 'MONTHLY'),
    lender: p.currentBank || undefined,
    isIncludedInCalc: p.includeInServicing !== false,
  }));

  // Standalone debts (credit cards + non-property loans).
  const mapDebt = (t: string) => {
    if (t === 'CREDIT_CARD') return 'CREDIT_CARD';
    if (t === 'PERSONAL_LOAN') return 'PERSONAL_LOAN';
    if (t === 'CAR_LOAN') return 'CAR_LOAN';
    if (t === 'HECS') return 'HECS_HELP';
    return 'OTHER';
  };
  const debts: ScenarioInput['debts'] = (profile?.existingDebts || [])
    .filter((d: any) => d.type !== 'HOME_LOAN')
    .map((d: any) => ({
      id: d.id,
      type: mapDebt(d.type) as any,
      source: 'STANDALONE' as const,
      lender: d.description || undefined,
      creditLimit: d.creditLimit ?? undefined,
      currentBalance: d.outstandingBalance ?? undefined,
      monthlyRepayment: d.monthlyRepayment ?? undefined,
    }));

  // Scenario from the latest loan scenario, with sensible fallbacks.
  const sc = scenarios?.[0];
  const annual = incomeSources.reduce((t, s) => t + s.amount * 12, 0);
  const topPropValue = Math.max(0, ...properties.map((p) => p.estimatedValue));
  const purpose = sc?.purpose === 'INVESTMENT' ? 'INVESTMENT' : 'OWNER_OCC';
  let rate = typeof sc?.interestRate === 'number' ? sc.interestRate : 0.06;
  if (rate > 1) rate = rate / 100;
  const targetLoanAmount = sc?.maxBorrowingCapacity || Math.round((annual * 5) / 1000) * 1000 || 600_000;
  const targetPropertyValue = topPropValue > 0 ? topPropValue : Math.round(targetLoanAmount / 0.8);

  return {
    client: { numberOfAdults, numberOfChildren, isSelfEmployed },
    incomeSources,
    expenses: { declaredMonthlyLiving, monthlyRent },
    properties,
    debts,
    scenario: {
      purpose: purpose as any,
      targetLoanAmount,
      targetPropertyValue,
      termYears: sc?.loanTermYears || 30,
      interestRate: rate,
      repaymentType: sc?.repaymentType === 'IO' ? 'IO' : 'PI',
    },
  };
}

// GET /api/admin/clients/:id/bank-recommendations — top-3 (+ all) lenders.
router.get('/clients/:id/bank-recommendations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const client = await prisma.user.findFirst({
      where: { id: req.params.id, role: 'CLIENT' },
      include: {
        clientProfile: { include: { incomeSources: true, existingDebts: true, properties: true, expenseSummary: true } },
        loanScenarios: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!client || !client.clientProfile) {
      res.status(404).json({ error: 'Client profile not found. Complete the profile first.' });
      return;
    }
    const input = buildScenarioFromClient(client.clientProfile, (client as any).loanScenarios || []);
    const result = rankWithPatternMatching(input, getActivePolicies());
    const all = result.recommendations;
    audit('client.bank-recommendations', { adminEmail: req.user!.email, clientId: req.params.id, patterns: result.patterns, top: all.slice(0, 3).map((r) => r.brandCode) });
    res.json({ scenarioUsed: input.scenario, patterns: result.patterns, clusterBrandCodes: result.clusterBrandCodes, top3: all.slice(0, 3), all });
  } catch (error) {
    res.status(500).json({ error: 'Could not compute bank recommendations.' });
  }
});

// POST /api/admin/clients/:id/bank-recommendations/share — post the top 3 into
// the client's message thread as a shareable summary.
router.post('/clients/:id/bank-recommendations/share', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const client = await prisma.user.findFirst({
      where: { id: req.params.id, role: 'CLIENT' },
      include: {
        clientProfile: { include: { incomeSources: true, existingDebts: true, properties: true, expenseSummary: true } },
        loanScenarios: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!client || !client.clientProfile) {
      res.status(404).json({ error: 'Client profile not found.' });
      return;
    }
    const input = buildScenarioFromClient(client.clientProfile, (client as any).loanScenarios || []);
    const top3 = rankWithPatternMatching(input, getActivePolicies()).recommendations.slice(0, 3);
    if (top3.length === 0) {
      res.status(400).json({ error: 'No recommendations to share.' });
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    const lines = top3.map((r, i) => `${medals[i]} ${r.bankName} — up to $${r.calcResult.finalMaxBorrow.toLocaleString()} (${r.calcResult.passFail}). ${r.reasonSummary}`);
    const body = `Based on your details, the lenders most likely to suit you:\n\n${lines.join('\n\n')}\n\nIndicative modelling only — not a credit decision. Your specialist will confirm the best option.`;
    await prisma.message.create({
      data: { clientUserId: req.params.id, senderRole: 'ADMIN', body, type: 'text', status: 'sent' },
    });
    audit('client.bank-recommendations.shared', { adminEmail: req.user!.email, clientId: req.params.id, top: top3.map((r) => r.brandCode) });
    res.status(201).json({ shared: top3.length });
  } catch (error) {
    res.status(500).json({ error: 'Could not share recommendations.' });
  }
});

export default router;
