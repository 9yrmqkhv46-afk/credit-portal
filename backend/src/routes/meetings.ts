import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { config } from '../config';
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  createOnlineMeeting,
  getUpcomingMeetings,
  isConfigured,
  isConnected,
} from '../services/microsoft';

// ---------------------------------------------------------------------------
// /api/meetings — Teams meeting creation (admin only, authenticated)
// ---------------------------------------------------------------------------
const meetingsRouter = Router();
meetingsRouter.use(authenticate);
meetingsRouter.use(authorize('ADMIN'));

const createSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  startDateTime: z.string().min(1),
  endDateTime: z.string().min(1),
  attendeeEmails: z.array(z.string()).optional().default([]),
});

// GET /api/meetings/status — whether MS365 is configured + connected.
meetingsRouter.get('/status', (_req: AuthRequest, res: Response): void => {
  res.json({ configured: isConfigured(), connected: isConnected() });
});

// POST /api/meetings/create — create a Teams online meeting.
meetingsRouter.post('/create', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = createSchema.parse(req.body);
    // TODO: replace the simulated branch in services/microsoft.ts by setting the
    // GRAPH_* environment variables — the real Microsoft Graph call is already
    // wired and will be used automatically once credentials are present.
    const meeting = await createOnlineMeeting(data);
    res.status(201).json({ meeting });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    res.status(502).json({ error: 'Could not create the Teams meeting.' });
  }
});

// GET /api/meetings/upcoming — upcoming calendar events (empty if not connected).
meetingsRouter.get('/upcoming', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const meetings = await getUpcomingMeetings();
    res.json({ meetings });
  } catch {
    res.json({ meetings: [] });
  }
});

// ---------------------------------------------------------------------------
// /auth — Microsoft OAuth redirect flow (public; browser-driven)
// ---------------------------------------------------------------------------
const microsoftAuthRouter = Router();

// GET /auth/microsoft — begin the OAuth authorization-code flow.
microsoftAuthRouter.get('/microsoft', (_req: Request, res: Response): void => {
  if (!isConfigured()) {
    res.status(503).json({
      error:
        'Microsoft 365 is not configured. Set GRAPH_CLIENT_ID, GRAPH_TENANT_ID, ' +
        'GRAPH_CLIENT_SECRET and GRAPH_REDIRECT_URI on the server.',
    });
    return;
  }
  res.redirect(buildAuthUrl());
});

// GET /auth/callback — exchange the code for tokens, then bounce back to the app.
microsoftAuthRouter.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const frontend = config.frontendUrl;
  if (!code) {
    res.redirect(`${frontend}/admin?ms365=error`);
    return;
  }
  try {
    await exchangeCodeForTokens(code);
    res.redirect(`${frontend}/admin?ms365=connected`);
  } catch {
    res.redirect(`${frontend}/admin?ms365=error`);
  }
});

export { microsoftAuthRouter };
export default meetingsRouter;
