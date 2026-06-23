import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { prisma } from '../lib/prisma';

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

export default router;
