import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate);

// type values supported by the messaging hub (Mandate 4C).
const MESSAGE_TYPES = ['text', 'stage_update', 'document_request', 'borrowing_summary', 'meeting_request', 'document', 'property_report'] as const;

// body is a nullable column -> .nullable().optional(); cardData is a nullable
// JSON string -> accept an object/array and serialise, or a raw string.
const sendSchema = z.object({
  body: z.string().nullable().optional(),
  type: z.enum(MESSAGE_TYPES).optional().default('text'),
  cardData: z.any().optional(),
});

function serialiseCardData(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/**
 * GET /api/messages — the authenticated client's own message thread.
 * RBAC: a CLIENT only ever sees their own thread (keyed by their userId).
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const messages = await prisma.message.findMany({
      where: { clientUserId: req.user!.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/messages — client sends a message into their own thread.
 * senderRole is forced to CLIENT (admins use the admin endpoint).
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = sendSchema.parse(req.body);
    if (!data.body && !data.cardData) {
      res.status(400).json({ error: 'A message body or card payload is required.' });
      return;
    }
    const message = await prisma.message.create({
      data: {
        clientUserId: req.user!.id,
        senderRole: 'CLIENT',
        body: data.body ?? null,
        type: data.type,
        cardData: serialiseCardData(data.cardData),
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

// PATCH /api/messages/:id — client may mark messages in their own thread
// read, or add/remove a reaction.
const clientPatchSchema = z.object({
  status: z.enum(['sent', 'delivered', 'read']).optional(),
  reactions: z.any().optional(),
});

router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = clientPatchSchema.parse(req.body);
    const existing = await prisma.message.findFirst({
      where: { id: req.params.id, clientUserId: req.user!.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }
    const message = await prisma.message.update({
      where: { id: req.params.id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.reactions !== undefined ? { reactions: serialiseCardData(data.reactions) } : {}),
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

export default router;
