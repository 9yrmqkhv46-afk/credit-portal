import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { prisma } from '../lib/prisma';
import { computePropertyGrowth } from '../services/servicing';
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
        messages: {
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
      lastMessageAt: client.messages[0]?.createdAt || null,
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
  status: z.enum(['Prospect', 'Active', 'Inactive', 'Archived']),
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

const MESSAGE_TYPES = ['text', 'stage_update', 'document_request', 'borrowing_summary', 'meeting_request', 'attachment'] as const;

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
  pinned: z.boolean().optional(),
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
        ...(data.pinned !== undefined ? { pinned: data.pinned } : {}),
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

const broadcastSchema = z.object({
  body: z.string().min(1, 'Message body is required'),
  // 'all' | 'active' | explicit list of client user ids
  audience: z.enum(['all', 'active']).optional(),
  clientIds: z.array(z.string()).optional(),
});

// POST /api/admin/messages/broadcast — send the same message to many clients.
router.post('/messages/broadcast', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = broadcastSchema.parse(req.body);

    let targets: { id: string }[];
    if (data.clientIds && data.clientIds.length > 0) {
      targets = await prisma.user.findMany({
        where: { role: 'CLIENT', id: { in: data.clientIds } },
        select: { id: true },
      });
    } else {
      const where: any = { role: 'CLIENT' };
      if (data.audience === 'active') {
        where.clientProfile = { is: { status: 'Active' } };
      }
      targets = await prisma.user.findMany({ where, select: { id: true } });
    }

    if (targets.length === 0) {
      res.status(400).json({ error: 'No matching recipients.' });
      return;
    }

    await prisma.message.createMany({
      data: targets.map((t) => ({
        clientUserId: t.id,
        senderRole: 'ADMIN',
        body: data.body,
        type: 'text',
        status: 'sent',
      })),
    });

    audit('message.broadcast', {
      adminEmail: req.user!.email,
      adminId: req.user!.id,
      recipientCount: targets.length,
    });

    res.status(201).json({ sent: targets.length });
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

export default router;
