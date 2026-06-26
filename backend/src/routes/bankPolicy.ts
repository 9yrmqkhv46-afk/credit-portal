import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { rankBanksForScenario } from '../services/bankPolicy/ranking';
import { runBankCalc } from '../services/bankPolicy/engine';
import { ScenarioInput, BankPolicy } from '../services/bankPolicy/types';
import {
  ensureSeed, listVersions, getActivePolicies, getActiveByBrand, getVersionById,
  listVersionsForBrand, createVersion, activateVersion, cloneVersion, listAudit,
} from '../services/bankPolicy/store';

/**
 * 2026 Bank Policy Library API (admin). DB-backed with version history + audit.
 * The library self-seeds from the in-code policy set on first use.
 */
const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN'));

// GET /api/bank-policies — all policy versions (list view).
router.get('/', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({ versions: await listVersions() });
  } catch {
    res.status(500).json({ error: 'Could not load policies.' });
  }
});

// GET /api/bank-policies/audit — audit log.
router.get('/audit', async (req: AuthRequest, res: Response): Promise<void> => {
  const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
  res.json({ audit: await listAudit(brand) });
});

// POST /api/bank-policies/rank — rank all active banks for a scenario.
router.post('/rank', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const input = req.body as ScenarioInput;
    if (!input?.scenario || !Array.isArray(input?.incomeSources)) {
      res.status(400).json({ error: 'A scenario, incomeSources, expenses, properties and debts are required.' });
      return;
    }
    const policies = await getActivePolicies();
    res.json({ recommendations: rankBanksForScenario(input, policies) });
  } catch {
    res.status(500).json({ error: 'Could not rank banks for this scenario.' });
  }
});

// POST /api/bank-policies/version/:id/activate
router.post('/version/:id/activate', async (req: AuthRequest, res: Response): Promise<void> => {
  const updated = await activateVersion(req.params.id, req.user!.email);
  if (!updated) { res.status(404).json({ error: 'Version not found.' }); return; }
  res.json({ policy: updated });
});

// POST /api/bank-policies/version/:id/clone  { policyVersion }
router.post('/version/:id/clone', async (req: AuthRequest, res: Response): Promise<void> => {
  const label = String(req.body?.policyVersion || '').trim();
  if (!label) { res.status(400).json({ error: 'A new policyVersion label is required.' }); return; }
  const cloned = await cloneVersion(req.params.id, label, req.user!.email);
  if (!cloned) { res.status(404).json({ error: 'Version not found.' }); return; }
  res.status(201).json({ policy: cloned });
});

// GET /api/bank-policies/version/:id — full policy JSON for one version.
router.get('/version/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const policy = await getVersionById(req.params.id);
  if (!policy) { res.status(404).json({ error: 'Version not found.' }); return; }
  res.json({ policy });
});

// GET /api/bank-policies/:brandCode — active policy for a bank (full JSON).
router.get('/:brandCode', async (req: AuthRequest, res: Response): Promise<void> => {
  await ensureSeed();
  const policy = await getActiveByBrand(req.params.brandCode);
  if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
  res.json({ policy });
});

// GET /api/bank-policies/:brandCode/versions — version history for a bank.
router.get('/:brandCode/versions', async (req: AuthRequest, res: Response): Promise<void> => {
  const rows = await listVersionsForBrand(req.params.brandCode);
  res.json({ versions: rows });
});

// POST /api/bank-policies/:brandCode/version — save an edited policy as a new version.
router.post('/:brandCode/version', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policy = req.body?.policy as BankPolicy;
    const activate = !!req.body?.activate;
    if (!policy || policy.brandCode !== req.params.brandCode) {
      res.status(400).json({ error: 'A policy with matching brandCode is required.' });
      return;
    }
    const saved = await createVersion(policy, { activate, actorEmail: req.user!.email });
    res.status(201).json({ policy: saved });
  } catch {
    res.status(500).json({ error: 'Could not save the policy version.' });
  }
});

// POST /api/bank-policies/:brandCode/calc — run one bank's active policy.
router.post('/:brandCode/calc', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policy = await getActiveByBrand(req.params.brandCode);
    if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
    res.json({ result: runBankCalc(req.body as ScenarioInput, policy) });
  } catch {
    res.status(500).json({ error: 'Could not run this bank policy.' });
  }
});

export default router;
