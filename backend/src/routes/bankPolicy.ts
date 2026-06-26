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
import {
  buildBankSummary, buildAllSummaries, renderMarkdown,
} from '../services/bankPolicy/summaries';
import { explainRecommendations } from '../services/bankPolicy/explain';
import { matchBanksForScenario } from '../services/bankPolicy/match';
import { buildPolicyDocx, buildLibraryDocx } from '../services/bankPolicy/docxExport';
import { importPolicyDocx } from '../services/bankPolicy/docxImport';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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
    const recommendations = rankBanksForScenario(input, policies);
    // Feature B: attach a broker-facing explanation to each recommendation.
    const explanations = explainRecommendations(recommendations, input.scenario, policies);
    res.json({ recommendations, explanations });
  } catch {
    res.status(500).json({ error: 'Could not rank banks for this scenario.' });
  }
});

// ===========================================================================
// Feature A — Word-style policy summaries (generated from the active configs).
// ===========================================================================

// GET /api/bank-policies/summaries — structured docs for every bank + comparison.
router.get('/summaries', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policies = await getActivePolicies();
    res.json(buildAllSummaries(policies));
  } catch {
    res.status(500).json({ error: 'Could not build policy summaries.' });
  }
});

// GET /api/bank-policies/summaries/word — download the full library as an
// editable Microsoft Word (.docx) document (prose + machine-readable params).
router.get('/summaries/word', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policies = await getActivePolicies();
    const buffer = await buildLibraryDocx(policies);
    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="2026-bank-lending-policy-library.docx"');
    res.send(buffer);
  } catch {
    res.status(500).json({ error: 'Could not generate the Word document.' });
  }
});

// GET /api/bank-policies/docx — alias: full editable library as .docx.
router.get('/docx', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policies = await getActivePolicies();
    const buffer = await buildLibraryDocx(policies);
    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="2026-bank-lending-policy-library.docx"');
    res.send(buffer);
  } catch {
    res.status(500).json({ error: 'Could not generate the Word document.' });
  }
});

// ===========================================================================
// Feature D — experimental scenario matching (pattern + semantic → engine).
// ===========================================================================

// POST /api/bank-policies/match — Algorithm B shortlist feeding Algorithm A.
router.post('/match', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const input = req.body as ScenarioInput;
    if (!input?.scenario || !Array.isArray(input?.incomeSources)) {
      res.status(400).json({ error: 'A scenario, incomeSources, expenses, properties and debts are required.' });
      return;
    }
    const policies = await getActivePolicies();
    res.json(matchBanksForScenario(input, policies));
  } catch {
    res.status(500).json({ error: 'Could not match banks for this scenario.' });
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

// GET /api/bank-policies/:brandCode/docx — download this bank's policy as an
// editable .docx (the Word document is the source of truth — edit & re-upload).
router.get('/:brandCode/docx', async (req: AuthRequest, res: Response): Promise<void> => {
  const policy = await getActiveByBrand(req.params.brandCode);
  if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
  const buffer = await buildPolicyDocx(policy);
  res.setHeader('Content-Type', DOCX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${policy.brandCode}-2026-lending-policy.docx"`);
  res.send(buffer);
});

// POST /api/bank-policies/:brandCode/docx — import an EDITED .docx and save it
// as a new active policy version. Body: { dataBase64, activate?=true }.
// This makes the Word document drive the engine in place of editing config.
router.post('/:brandCode/docx', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dataBase64 = String(req.body?.dataBase64 || '');
    const activate = req.body?.activate !== false; // default: activate
    if (!dataBase64) { res.status(400).json({ error: 'A base64-encoded .docx (dataBase64) is required.' }); return; }

    const base = await getActiveByBrand(req.params.brandCode);
    if (!base) { res.status(404).json({ error: 'Policy not found.' }); return; }

    const buffer = Buffer.from(dataBase64.replace(/^data:[^,]*,/, ''), 'base64');
    const { policy, applied, warnings, brandCode } = await importPolicyDocx(buffer, base);
    if (brandCode !== req.params.brandCode) { res.status(400).json({ error: 'Document brand does not match this bank.' }); return; }
    if (applied === 0) { res.status(400).json({ error: 'No editable parameters were found in the document.' }); return; }

    // Stamp a distinct version label so the import is a new, traceable version.
    if (policy.policyVersion === base.policyVersion) {
      policy.policyVersion = `${base.policyVersion}+word-${new Date().toISOString().slice(0, 10)}`;
    }
    const saved = await createVersion(policy, { activate, actorEmail: req.user!.email });
    res.status(201).json({ policy: saved, applied, warnings, activated: activate });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not import the Word document.' });
  }
});

// GET /api/bank-policies/:brandCode/summary — Word-style summary for one bank.
router.get('/:brandCode/summary', async (req: AuthRequest, res: Response): Promise<void> => {
  const policy = await getActiveByBrand(req.params.brandCode);
  if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
  const doc = buildBankSummary(policy);
  res.json({ doc, markdown: renderMarkdown(doc) });
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
