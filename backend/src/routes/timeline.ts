import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ensureTimeline, TOTAL_STAGES } from '../lib/timeline';

const router = Router();

router.use(authenticate);

/**
 * GET /api/timeline — the authenticated client's own 18-stage application
 * timeline. Auto-seeds (idempotent) on first request with stage 1 active.
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stages = await ensureTimeline(req.user!.id);
    res.json({ stages, totalStages: TOTAL_STAGES });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
