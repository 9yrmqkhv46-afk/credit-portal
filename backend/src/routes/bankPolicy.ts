import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { BANK_POLICIES_2026, getActivePolicies } from '../services/bankPolicy/policies';
import { rankBanksForScenario } from '../services/bankPolicy/ranking';
import { runBankCalc } from '../services/bankPolicy/engine';
import { ScenarioInput } from '../services/bankPolicy/types';

/**
 * 2026 Bank Policy Library API (admin). Read-only policy snapshots + a
 * scenario ranking endpoint. Policy editing/versioning persistence is a
 * planned follow-up; the seed library is served from code for now.
 */
const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN'));

// GET /api/bank-policies — list policy snapshots (light summary).
router.get('/', (_req: AuthRequest, res: Response): void => {
  res.json({
    policies: BANK_POLICIES_2026.map((p) => ({
      id: p.id,
      bankName: p.bankName,
      brandCode: p.brandCode,
      policyVersion: p.policyVersion,
      effectiveFrom: p.effectiveFrom,
      isActive: p.isActive,
      notes: p.notes,
      ownerOcc: { maxLvr: p.residentialOwnerOcc.maxLvr, maxDti: p.residentialOwnerOcc.maxDti, bufferBps: p.residentialOwnerOcc.serviceabilityBufferBps },
      investment: { maxLvr: p.residentialInvestment.maxLvr, maxDti: p.residentialInvestment.maxDti, rentalAccept: p.residentialInvestment.incomeShadingRules.rental.acceptPct },
    })),
  });
});

// GET /api/bank-policies/:brandCode — full policy JSON for one bank.
router.get('/:brandCode', (req: AuthRequest, res: Response): void => {
  const policy = BANK_POLICIES_2026.find((p) => p.brandCode.toLowerCase() === req.params.brandCode.toLowerCase());
  if (!policy) {
    res.status(404).json({ error: 'Policy not found.' });
    return;
  }
  res.json({ policy });
});

// POST /api/bank-policies/rank — rank all active banks for a scenario.
router.post('/rank', (req: AuthRequest, res: Response): void => {
  try {
    const input = req.body as ScenarioInput;
    if (!input?.scenario || !Array.isArray(input?.incomeSources)) {
      res.status(400).json({ error: 'A scenario, incomeSources, expenses, properties and debts are required.' });
      return;
    }
    const recommendations = rankBanksForScenario(input, getActivePolicies());
    res.json({ recommendations });
  } catch {
    res.status(500).json({ error: 'Could not rank banks for this scenario.' });
  }
});

// POST /api/bank-policies/:brandCode/calc — run one bank's policy for a scenario.
router.post('/:brandCode/calc', (req: AuthRequest, res: Response): void => {
  try {
    const policy = BANK_POLICIES_2026.find((p) => p.brandCode.toLowerCase() === req.params.brandCode.toLowerCase());
    if (!policy) {
      res.status(404).json({ error: 'Policy not found.' });
      return;
    }
    const result = runBankCalc(req.body as ScenarioInput, policy);
    res.json({ result });
  } catch {
    res.status(500).json({ error: 'Could not run this bank policy.' });
  }
});

export default router;
