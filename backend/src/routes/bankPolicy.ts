import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/rbac';
import { rankBanksForScenario } from '../services/bankPolicy/ranking';
import { runBankCalc } from '../services/bankPolicy/engine';
import { ScenarioInput, BankPolicy } from '../services/bankPolicy/types';
import {
  ensureSeed, listVersions, getActivePolicies, getActiveByBrand, getVersionById,
  listVersionsForBrand, createVersion, activateVersion, cloneVersion, listAudit,
  getPolicyTimeline, diffVersions, verifyVersionIntegrity, verifyActiveIntegrity,
  rollbackToVersion, exportLibrary, restoreLibrary,
} from '../services/bankPolicy/store';
import {
  buildBankSummary, buildAllSummaries, renderMarkdown,
} from '../services/bankPolicy/summaries';
import { explainRecommendations } from '../services/bankPolicy/explain';
import { matchBanksForScenario } from '../services/bankPolicy/match';
import { buildPolicyDocx, buildLibraryDocx } from '../services/bankPolicy/docxExport';
import { importPolicyDocx } from '../services/bankPolicy/docxImport';
import { validatePolicy, previewImpact, sensitivity, SensitivityVariable } from '../services/bankPolicy/policyImpact';
import { decodeBase64Upload, sanitizeScenarioInput, createRateLimiter } from '../services/bankPolicy/security';
import { maxPurchasePrice, estimateUpfrontCosts, estimateLmi, AuState } from '../services/bankPolicy/affordability';
import { buildAmortizationSchedule, comparisonRate, rateShockStress, borrowingConfidenceBand } from '../services/bankPolicy/loanMath';
import { suggestPathToApproval, buildComparisonReport } from '../services/bankPolicy/advisory';
import { runBacktest } from '../services/bankPolicy/backtest';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Rate limiter for mutating policy endpoints (per admin, fixed window). */
const policyMutationLimiter = createRateLimiter(40, 60_000);

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

// GET /api/bank-policies/audit.csv — compliance export of the audit log.
router.get('/audit.csv', async (req: AuthRequest, res: Response): Promise<void> => {
  const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
  const rows = await listAudit(brand, 5000);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'createdAt,brandCode,action,actorEmail,detail';
  const body = rows.map((r) => [r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt, r.brandCode, r.action, r.actorEmail, r.detail].map(esc).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="bank-policy-audit.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`${header}\n${body}`);
});

// GET /api/bank-policies/export — full library JSON snapshot (backup / DR).
router.get('/export', async (_req: AuthRequest, res: Response): Promise<void> => {
  const snapshot = await exportLibrary();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="bank-policy-library-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(snapshot, null, 2));
});

// POST /api/bank-policies/import — restore policies from a JSON snapshot.
router.post('/import', policyMutationLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const snapshot = req.body?.snapshot ?? req.body;
    if (!snapshot || !Array.isArray(snapshot.policies)) { res.status(400).json({ error: 'A snapshot with a policies array is required.' }); return; }
    const result = await restoreLibrary(snapshot, req.user!.email);
    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: 'Could not restore the library snapshot.' });
  }
});

// GET /api/bank-policies/integrity — tamper-evidence sweep over active policies.
router.get('/integrity', async (_req: AuthRequest, res: Response): Promise<void> => {
  const results = await verifyActiveIntegrity();
  res.json({ allValid: results.every((r) => r.ok), results });
});

// GET /api/bank-policies/diff?from=<id>&to=<id> — parameter diff between versions.
router.get('/diff', async (req: AuthRequest, res: Response): Promise<void> => {
  const from = String(req.query.from || ''), to = String(req.query.to || '');
  if (!from || !to) { res.status(400).json({ error: 'from and to version ids are required.' }); return; }
  const result = await diffVersions(from, to);
  if (!result) { res.status(404).json({ error: 'One or both versions were not found.' }); return; }
  res.json({ changes: result.changes, fromVersion: result.from.policyVersion, toVersion: result.to.policyVersion });
});

// GET /api/bank-policies/backtest — run the canonical scenario matrix across all banks.
router.get('/backtest', async (_req: AuthRequest, res: Response): Promise<void> => {
  const policies = await getActivePolicies();
  res.json(runBacktest(policies));
});

// POST /api/bank-policies/compare — one scenario across every bank, side by side.
router.post('/compare', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const input = sanitizeScenarioInput(req.body as ScenarioInput);
    const policies = await getActivePolicies();
    res.json(buildComparisonReport(input, policies));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not build comparison.' });
  }
});

// POST /api/bank-policies/costs — modelled stamp duty + LMI + upfront costs.
// Body: { state, price, loanAmount?, isInvestment? }
router.post('/costs', async (req: AuthRequest, res: Response): Promise<void> => {
  const state = String(req.body?.state || 'NSW').toUpperCase() as AuState;
  const price = Number(req.body?.price) || 0;
  const loanAmount = Number(req.body?.loanAmount) || 0;
  const isInvestment = !!req.body?.isInvestment;
  const upfront = estimateUpfrontCosts(state, price, { isInvestment });
  const lmi = estimateLmi(loanAmount, price);
  res.json({ state, price, upfront, lmiPremium: lmi, totalAcquisitionCost: upfront.total + lmi });
});

// POST /api/bank-policies/amortization — repayment schedule + comparison rate.
// Body: { principal, annualRate, termYears, ioYears?, fees? }
router.post('/amortization', async (req: AuthRequest, res: Response): Promise<void> => {
  const principal = Number(req.body?.principal) || 0;
  const annualRate = Number(req.body?.annualRate) || 0;
  const termYears = Math.min(40, Math.max(1, Number(req.body?.termYears) || 30));
  const ioYears = Math.max(0, Number(req.body?.ioYears) || 0);
  const fees = req.body?.fees || {};
  const schedule = buildAmortizationSchedule(principal, annualRate, termYears, { ioYears, sampleEvery: 12 });
  res.json({ ...schedule, comparisonRate: comparisonRate(principal, annualRate, termYears, fees) });
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
    const safe = sanitizeScenarioInput(input);
    const recommendations = rankBanksForScenario(safe, policies);
    // Feature B: attach a broker-facing explanation to each recommendation.
    const explanations = explainRecommendations(recommendations, safe.scenario, policies);
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
    res.json(matchBanksForScenario(sanitizeScenarioInput(input), policies));
  } catch {
    res.status(500).json({ error: 'Could not match banks for this scenario.' });
  }
});

// POST /api/bank-policies/version/:id/activate
router.post('/version/:id/activate', policyMutationLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const updated = await activateVersion(req.params.id, req.user!.email);
  if (!updated) { res.status(404).json({ error: 'Version not found.' }); return; }
  res.json({ policy: updated });
});

// POST /api/bank-policies/version/:id/clone  { policyVersion }
router.post('/version/:id/clone', policyMutationLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const label = String(req.body?.policyVersion || '').trim();
  if (!label) { res.status(400).json({ error: 'A new policyVersion label is required.' }); return; }
  const cloned = await cloneVersion(req.params.id, label, req.user!.email);
  if (!cloned) { res.status(404).json({ error: 'Version not found.' }); return; }
  res.status(201).json({ policy: cloned });
});

// GET /api/bank-policies/version/:id/verify — tamper-evidence check for one version.
router.get('/version/:id/verify', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await verifyVersionIntegrity(req.params.id);
  if (!result) { res.status(404).json({ error: 'Version not found.' }); return; }
  res.json(result);
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

// POST /api/bank-policies/:brandCode/docx — import an EDITED .docx.
// Body: { dataBase64, preview?, activate?=true, force? }.
//  - preview:true  => dry-run: parse + validate + impact preview, save nothing.
//  - otherwise     => commit: blocked (422) if guardrail ERRORS unless force:true.
router.post('/:brandCode/docx', policyMutationLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const dataBase64 = String(req.body?.dataBase64 || '');
    const preview = req.body?.preview === true;
    const force = req.body?.force === true;
    const activate = req.body?.activate !== false; // default: activate
    if (!dataBase64) { res.status(400).json({ error: 'A base64-encoded .docx (dataBase64) is required.' }); return; }

    const base = await getActiveByBrand(req.params.brandCode);
    if (!base) { res.status(404).json({ error: 'Policy not found.' }); return; }

    // Security: validate size + ZIP/OOXML signature before parsing.
    const buffer = decodeBase64Upload(dataBase64);
    const { policy, applied, warnings, brandCode } = await importPolicyDocx(buffer, base);
    if (brandCode !== req.params.brandCode) { res.status(400).json({ error: 'Document brand does not match this bank.' }); return; }
    if (applied === 0) { res.status(400).json({ error: 'No editable parameters were found in the document.' }); return; }

    // Guardrails + real-world impact (always computed so the UI can show them).
    const validation = validatePolicy(policy);
    const impact = previewImpact(base, policy);

    if (preview) {
      res.json({ preview: true, applied, warnings, validation, impact, candidatePolicyVersion: policy.policyVersion });
      return;
    }

    // Commit path: refuse to activate a policy with hard errors unless forced.
    if (!validation.valid && !force) {
      res.status(422).json({ error: 'Policy failed validation. Fix the errors or resubmit with force:true.', validation, impact });
      return;
    }

    if (policy.policyVersion === base.policyVersion) {
      policy.policyVersion = `${base.policyVersion}+word-${new Date().toISOString().slice(0, 10)}`;
    }
    const saved = await createVersion(policy, { activate, actorEmail: req.user!.email });
    res.status(201).json({ policy: saved, applied, warnings, validation, impact, activated: activate });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not import the Word document.' });
  }
});

// GET /api/bank-policies/:brandCode/timeline — parameter-level change history.
router.get('/:brandCode/timeline', async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ timeline: await getPolicyTimeline(req.params.brandCode) });
});

// POST /api/bank-policies/:brandCode/sensitivity — sweep one scenario input.
// Body: { scenario: ScenarioInput, variable: 'interestRate'|'deposit'|'targetLoanAmount', steps? }.
router.post('/:brandCode/sensitivity', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policy = await getActiveByBrand(req.params.brandCode);
    if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
    const variable = (req.body?.variable || 'interestRate') as SensitivityVariable;
    if (!['interestRate', 'deposit', 'targetLoanAmount'].includes(variable)) { res.status(400).json({ error: 'Invalid variable.' }); return; }
    const input = sanitizeScenarioInput(req.body?.scenario as ScenarioInput);
    const steps = Math.min(15, Math.max(3, Number(req.body?.steps) || 7));
    res.json(sensitivity(input, policy, variable, steps));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not run sensitivity analysis.' });
  }
});

// POST /api/bank-policies/:brandCode/rollback/:versionId — revert to a prior version.
router.post('/:brandCode/rollback/:versionId', policyMutationLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const target = await getVersionById(req.params.versionId);
  if (!target || target.brandCode !== req.params.brandCode) { res.status(404).json({ error: 'Version not found for this bank.' }); return; }
  const updated = await rollbackToVersion(req.params.versionId, req.user!.email);
  res.json({ policy: updated });
});

// POST /api/bank-policies/:brandCode/affordability — max purchase price for a buyer.
// Body: { scenario: ScenarioInput, savings, state, purpose? }
router.post('/:brandCode/affordability', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policy = await getActiveByBrand(req.params.brandCode);
    if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
    const input = sanitizeScenarioInput(req.body?.scenario as ScenarioInput);
    const savings = Math.max(0, Number(req.body?.savings) || 0);
    const state = String(req.body?.state || 'NSW').toUpperCase() as AuState;
    res.json(maxPurchasePrice(input, policy, { savings, state }));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not compute affordability.' });
  }
});

// POST /api/bank-policies/:brandCode/stress — APRA-style rate-shock test.
router.post('/:brandCode/stress', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policy = await getActiveByBrand(req.params.brandCode);
    if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
    const input = sanitizeScenarioInput(req.body?.scenario as ScenarioInput);
    const shockBps = Math.min(1000, Math.max(0, Number(req.body?.shockBps) || 300));
    res.json(rateShockStress(input, policy, shockBps));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not run the stress test.' });
  }
});

// POST /api/bank-policies/:brandCode/confidence — borrowing-power confidence band.
router.post('/:brandCode/confidence', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policy = await getActiveByBrand(req.params.brandCode);
    if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
    const input = sanitizeScenarioInput(req.body?.scenario as ScenarioInput);
    const swing = Math.min(0.4, Math.max(0.01, Number(req.body?.swing) || 0.1));
    res.json(borrowingConfidenceBand(input, policy, swing));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not compute the confidence band.' });
  }
});

// POST /api/bank-policies/:brandCode/optimize — actionable path to approval.
router.post('/:brandCode/optimize', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const policy = await getActiveByBrand(req.params.brandCode);
    if (!policy) { res.status(404).json({ error: 'Policy not found.' }); return; }
    const input = sanitizeScenarioInput(req.body?.scenario as ScenarioInput);
    res.json(suggestPathToApproval(input, policy));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Could not compute suggestions.' });
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
router.post('/:brandCode/version', policyMutationLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
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
