export * from './types';
export { toMonthly, principalFromPayment, monthlyRepayment, runBankCalc, detectDuplicateLoans, selectPropertiesForBank } from './engine';
export { rankBanksForScenario } from './ranking';
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
export { importPolicyDocx, extractDocxLines, parseParamLines } from './docxImport';
export { serializePolicyParams, applyParamsToPolicy, PRODUCT_KEYS } from './docxFormat';
export type { ParamLine, ApplyResult } from './docxFormat';
export type { DocxImportResult } from './docxImport';

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
