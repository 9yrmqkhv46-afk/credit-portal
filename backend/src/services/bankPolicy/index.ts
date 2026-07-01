export * from './types';
export { toMonthly, principalFromPayment, monthlyRepayment, runBankCalc, detectDuplicateLoans, selectPropertiesForBank } from './engine';
export { rankBanksForScenario, rankWithPatternMatching } from './ranking';
export { classifyScenario, selectCluster, desiredTags } from './patterns';
export { BANK_POLICIES_2026, getActivePolicies } from './policies';

// Qualitative classifiers + capability tags (shared by summaries & matching).
export {
  bankTags, TAG_LABELS, rentalStance, businessIncomeStance, variableIncomeStance,
  bufferStance, dtiBand, expenseStrictness, portfolioComfort, portfolioPhrase,
} from './classify';
export type { BankTag, Stance, PortfolioComfort } from './classify';

// Feature A — Word-style policy summaries.
export {
  buildBankSummary, buildCrossBankComparison, buildAllSummaries,
  renderMarkdown, renderFullMarkdown, renderWordHtml,
} from './summaries';
export type { PolicyDoc, DocSection, DocTable } from './summaries';

// Editable Word document (.docx) as the source of truth: export + import.
export { buildPolicyDocx, buildLibraryDocx } from './docxExport';
export { buildPolicyPdf } from './pdfExport';
export { importPolicyDocx, extractDocxLines, parseParamLines } from './docxImport';
export { serializePolicyParams, applyParamsToPolicy, PRODUCT_KEYS } from './docxFormat';
export type { ParamLine, ApplyResult } from './docxFormat';
export type { DocxImportResult } from './docxImport';

// Senior-grade governance features: diffs, integrity, validation, impact, security.
// NOTE: DB-backed helpers (timeline/verify/rollback/export) live in ./store and
// are imported directly by routes — they are intentionally NOT re-exported here
// so this barrel stays free of Prisma for pure-unit testing.
export { diffPolicies, summariseChanges } from './policyDiff';
export type { PolicyChange } from './policyDiff';
export { computePolicyHash, verifyIntegrity } from './integrity';
export type { IntegrityResult } from './integrity';
export {
  validatePolicy, previewImpact, sensitivity, CANONICAL_SCENARIOS,
} from './policyImpact';
export type { PolicyIssue, ImpactPreview, ScenarioImpact, SensitivityVariable, SensitivityPoint, CanonicalScenario } from './policyImpact';
export {
  validateDocxUpload, decodeBase64Upload, sanitizeScenarioInput, createRateLimiter, MAX_DOCX_BYTES,
} from './security';

// Buyer-side calculators & analytics (pure, Prisma-free).
export {
  estimateStampDuty, estimateLmi, estimateUpfrontCosts, maxPurchasePrice,
} from './affordability';
export type { AuState, UpfrontCosts, MaxPurchaseResult } from './affordability';
export {
  buildAmortizationSchedule, comparisonRate, rateShockStress, borrowingConfidenceBand,
} from './loanMath';
export type { AmortizationResult, AmortRow, RateShockResult, ConfidenceBand } from './loanMath';
export { suggestPathToApproval, buildComparisonReport } from './advisory';
export type { ApprovalSuggestion, ComparisonReport, ComparisonRow } from './advisory';
export { runBacktest, diffBacktest } from './backtest';
export type { BacktestReport, BacktestCell, InvariantViolation } from './backtest';

// Feature B — broker-facing explanations.
export { explainRecommendation, explainRecommendations } from './explain';
export type { RecommendationExplanation } from './explain';

// Feature D — experimental scenario matching (pattern + semantic) layer.
export { matchBanksForScenario, buildQueryText, buildPolicyIndex } from './match';
export type { ScenarioMatchResult, BankMatch } from './match';
export { SCENARIO_PATTERNS, classifyScenario, preferredTagWeights } from './scenarioPatterns';
export type { ScenarioPattern, PatternId, PatternMatch } from './scenarioPatterns';
export { buildIndex, search, tokenize } from './semantic';
export type { SemanticIndex, SemanticHit } from './semantic';
