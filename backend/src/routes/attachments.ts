import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  MAX_ATTACHMENT_BYTES,
  decodeBase64Size,
  stripDataUrlPrefix,
  canAccessAttachment,
} from '../lib/attachmentUtils';

const router = Router();

router.use(authenticate);

export { MAX_ATTACHMENT_BYTES, decodeBase64Size, stripDataUrlPrefix, canAccessAttachment };

const createSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  dataBase64: z.string().min(1),
  // Both links are nullable columns -> .nullable().optional().
  messageId: z.string().nullable().optional(),
  profileDocumentKey: z.string().nullable().optional(),
});

/**
 * POST /api/attachments — store a base64-encoded file in the database.
 * Owner is always the authenticated user. Enforces the decoded-size cap.
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createSchema.parse(req.body);
    const sizeBytes = decodeBase64Size(data.dataBase64);
    if (sizeBytes <= 0) {
      res.status(400).json({ error: 'Attachment payload is empty or not valid base64.' });
      return;
    }
    if (sizeBytes > MAX_ATTACHMENT_BYTES) {
      res.status(413).json({ error: `Attachment too large. Maximum size is ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.` });
      return;
    }
    const attachment = await prisma.attachment.create({
      data: {
        ownerUserId: req.user!.id,
        messageId: data.messageId ?? null,
        profileDocumentKey: data.profileDocumentKey ?? null,
        filename: data.filename,
        mimeType: data.mimeType,
        sizeBytes,
        dataBase64: stripDataUrlPrefix(data.dataBase64),
        status: 'Uploaded',
      },
    });
    res.status(201).json({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      status: attachment.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/attachments — list attachment METADATA (never the bytes) for
 * rendering. Filterable by messageId or profileDocumentKey. A CLIENT only ever
 * sees their own attachments; an ADMIN may additionally pass ownerUserId.
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { messageId, profileDocumentKey, ownerUserId } = req.query as Record<string, string | undefined>;
    const where: Record<string, unknown> = {};
    if (messageId) where.messageId = messageId;
    if (profileDocumentKey) where.profileDocumentKey = profileDocumentKey;

    if (req.user!.role === 'ADMIN') {
      if (ownerUserId) where.ownerUserId = ownerUserId;
    } else {
      // Clients are scoped strictly to their own attachments.
      where.ownerUserId = req.user!.id;
    }

    const attachments = await prisma.attachment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        ownerUserId: true,
        messageId: true,
        profileDocumentKey: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        createdAt: true,
      },
    });
    res.json({ attachments });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

const patchSchema = z.object({
  status: z.enum(['Uploaded', 'Verified']).optional(),
  // Allow linking an attachment to a message after the message is created.
  messageId: z.string().nullable().optional(),
});

/**
 * PATCH /api/attachments/:id — ADMIN-only. Mark a document Verified / Uploaded,
 * and/or link it to a message thread.
 */
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }
    const data = patchSchema.parse(req.body);
    const existing = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }
    const updated = await prisma.attachment.update({
      where: { id: req.params.id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.messageId !== undefined ? { messageId: data.messageId } : {}),
      },
    });
    res.json({
      id: updated.id,
      filename: updated.filename,
      mimeType: updated.mimeType,
      sizeBytes: updated.sizeBytes,
      status: updated.status,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/attachments/:id — download the actual file bytes.
 * RBAC: the owning client, the client who owns the linked message thread, or an
 * ADMIN. Anyone else receives 404 (do not disclose existence).
 */
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }

    let allowed = canAccessAttachment(req.user!, attachment);
    // Additionally allow the client who owns the message thread the attachment
    // belongs to (e.g. a document the specialist attached to their thread).
    if (!allowed && attachment.messageId) {
      const message = await prisma.message.findUnique({ where: { id: attachment.messageId } });
      if (message && message.clientUserId === req.user!.id) allowed = true;
    }
    if (!allowed) {
      res.status(404).json({ error: 'Attachment not found.' });
      return;
    }

    const buffer = Buffer.from(attachment.dataBase64, 'base64');
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    // Sanitise the filename for the header (strip quotes / control chars).
    const safeName = attachment.filename.replace(/["\\\r\n]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
