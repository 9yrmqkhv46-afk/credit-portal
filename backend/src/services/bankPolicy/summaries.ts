/**
 * 2026 Bank Lending Policy Engine — Word-style policy summaries (feature A).
 *
 * Generates a human-readable "Word document" policy summary for each bank, plus
 * a cross-bank comparison, derived ENTIRELY from the structured parameters in
 * `policies.ts`. Because the prose is generated from the configs, the words can
 * never drift from the numbers the engine actually uses.
 *
 * The summaries are a *qualitative policy map* for humans (brokers, credit
 * analysts) and a knowledge base for the scenario-matching layer (match.ts).
 * They are NOT the calculation engine — all financial maths stays in engine.ts.
 *
 * Output formats:
 *   - structured PolicyDoc model
 *   - Markdown (renderMarkdown) — paste into Notion / GitHub
 *   - Word-openable HTML (renderWordHtml) — download as .doc and open in Word
 *
 * DISCLAIMER: derived from modelled estimates only — not official lender policy.
 */

import { BankPolicy, ProductPolicy } from './types';
import {
  Stance, rentalStance, businessIncomeStance, variableIncomeStance, bufferStance,
  dtiBand, expenseStrictness, portfolioComfort, portfolioPhrase, hasSelfEmployedUplift,
  bankTags, TAG_LABELS,
} from './classify';

// ---------------------------------------------------------------------------
// Document model
// ---------------------------------------------------------------------------

export interface DocTable {
  headers: string[];
  rows: string[][];
}

export interface DocSection {
  heading: string;
  level: number; // 1..4
  paragraphs?: string[];
  bullets?: string[];
  table?: DocTable;
  children?: DocSection[];
}

export interface PolicyDoc {
  brandCode: string;
  bankName: string;
  policyVersion: string;
  title: string;
  tags: string[];
  sections: DocSection[];
}

// ---------------------------------------------------------------------------
// Small phrasing helpers
// ---------------------------------------------------------------------------

const pct = (v: number) => `${Math.round(v * 100)}%`;
const dec1 = (v: number) => v.toFixed(1);
const bufferPct = (bps: number) => `+${(bps / 100).toFixed(2)}%`;

function stanceWord(s: Stance): string {
  return s === 'generous' ? 'more generous than peers'
    : s === 'conservative' ? 'more conservative than peers'
    : 'broadly in line with peers';
}

function riskAppetiteWord(policy: BankPolicy): string {
  const inv = policy.residentialInvestment;
  const flex = (inv.maxDti >= 7 ? 1 : 0) + (portfolioComfort(inv) === 'large' ? 1 : 0)
    + (rentalStance(inv.incomeShadingRules.rental.acceptPct) === 'generous' ? 1 : 0);
  const tight = (inv.maxDti <= 5.75 ? 1 : 0) + (bufferStance(inv.serviceabilityBufferBps) === 'higher' ? 1 : 0)
    + (rentalStance(inv.incomeShadingRules.rental.acceptPct) === 'conservative' ? 1 : 0);
  if (flex - tight >= 2) return 'flexible';
  if (tight - flex >= 1) return 'conservative';
  return 'moderate (middle-of-the-road)';
}

// ---------------------------------------------------------------------------
// Per-bank document builder
// ---------------------------------------------------------------------------

export function buildBankSummary(policy: BankPolicy): PolicyDoc {
  const oo = policy.residentialOwnerOcc;
  const inv = policy.residentialInvestment;
  const com = policy.commercialPropertyLight;
  const tags = bankTags(policy);

  const sections: DocSection[] = [
    // Section 1
    {
      heading: '1. Core Lending Policy Profile',
      level: 2,
      children: [
        {
          heading: '1.1 Product scope',
          level: 3,
          paragraphs: [
            `This summary covers ${policy.bankName}'s modelling stance across owner-occupied home loans, residential investment loans, and light commercial property loans. Policy version: ${policy.policyVersion}.`,
          ],
          bullets: [policy.notes],
        },
        {
          heading: '1.2 Risk appetite overview',
          level: 3,
          paragraphs: [
            `${policy.bankName} models as ${riskAppetiteWord(policy)} overall. Maximum LVR sits at ${pct(oo.maxLvr)} for owner-occupied, ${pct(inv.maxLvr)} for investment, and ${pct(com.maxLvr)} for light commercial.`,
          ],
          bullets: [
            `DTI comfort: ${dtiBand(inv.maxDti)} (owner-occ cap ${dec1(oo.maxDti)}x, investment cap ${dec1(inv.maxDti)}x, commercial cap ${dec1(com.maxDti)}x).`,
            `Interest-only appetite: ${inv.interestOnlyTreatment?.allowed ? `supported on investment up to ${inv.interestOnlyTreatment.maxIoYears} years` : 'limited'}${oo.interestOnlyTreatment?.allowed ? '' : '; owner-occ is P&I-only in this model'}.`,
            `Property portfolio appetite: ${portfolioPhrase(inv)}.`,
          ],
        },
      ],
    },

    // Section 2
    {
      heading: '2. Serviceability, Assessment Rate & Debt Treatment',
      level: 2,
      children: [
        {
          heading: '2.1 Assessment rate and serviceability buffer',
          level: 3,
          paragraphs: [
            `Repayments are stress-tested at the higher of the actual rate or a base assumption (~${pct(inv.baseRateAssumption)} for investment), plus an APRA-style buffer of ${bufferPct(inv.serviceabilityBufferBps)}. This buffer is ${bufferStance(inv.serviceabilityBufferBps)} versus the major-bank baseline of +3.00%.`,
          ],
          bullets: [
            `Interest-only loans carry an additional assessment loading of ${(inv.interestOnlyTreatment?.ioAssessmentRateLoadingBps ?? 0) / 100}% in this model.`,
          ],
        },
        {
          heading: '2.2 Debt-to-Income (DTI) stance',
          level: 3,
          paragraphs: [
            `Modelled DTI comfort is ${dtiBand(inv.maxDti)}. Owner-occupied borrowers are assessed to ${dec1(oo.maxDti)}x gross income, portfolio investors to ${dec1(inv.maxDti)}x, and light commercial to ${dec1(com.maxDti)}x.`,
          ],
          bullets: hasSelfEmployedUplift(inv)
            ? [`Self-employed borrowers with sufficient financials receive a DTI uplift (to ${dec1(inv.specialSegments?.find((s) => s.segment === 'SELF_EMPLOYED')?.dtiUpliftToCap ?? inv.maxDti)}x).`]
            : undefined,
        },
        {
          heading: '2.3 Treatment of existing debts and credit cards',
          level: 3,
          bullets: [
            `Credit cards: assessed at ${pct(oo.debtTreatmentRules.creditCardRepaymentPctOfLimit)} of the total limit per month (regardless of balance).`,
            `Personal and car loans: assessed on ${oo.debtTreatmentRules.personalLoanRepaymentCalc} repayments.`,
            `HECS/HELP: treated as ${oo.debtTreatmentRules.hecsHelpTreatment}.`,
            `Other / business loans: ${oo.debtTreatmentRules.otherLoanRepaymentCalc === 'buffered' ? 'buffered (+20%)' : 'taken at actual'}.`,
            `Property-secured loans are attached to the relevant property and de-duplicated against the standalone debt list, so the same exposure is never counted twice.`,
          ],
        },
      ],
    },

    // Section 3
    {
      heading: '3. Income & Expense Treatment',
      level: 2,
      children: [
        {
          heading: '3.1 Income acceptance and shading',
          level: 3,
          bullets: [
            `Primary PAYG salary: accepted at ${pct(oo.incomeShadingRules.salaryPrimary.acceptPct)} for servicing.`,
            `Secondary salary / bonus / overtime: accepted at ${pct(oo.incomeShadingRules.salarySecondary.acceptPct)} — ${stanceWord(variableIncomeStance(oo.incomeShadingRules.salarySecondary.acceptPct))}.`,
            `Rental income: ${pct(inv.incomeShadingRules.rental.acceptPct)} accepted after a ${pct(inv.incomeShadingRules.rental.vacancyFactorPct)} vacancy deduction — ${stanceWord(rentalStance(inv.incomeShadingRules.rental.acceptPct))}.`,
            `Business / self-employed income: ${pct(inv.incomeShadingRules.businessIncome.acceptPct)} accepted (min ${inv.incomeShadingRules.businessIncome.minYearsFinancials}yrs financials) — ${stanceWord(businessIncomeStance(inv.incomeShadingRules.businessIncome.acceptPct))}.`,
            `Government benefits: ${pct(oo.incomeShadingRules.govBenefits.acceptPct)}. Other / irregular income: ${pct(oo.incomeShadingRules.other.acceptPct)}.`,
          ],
        },
        {
          heading: '3.2 Living expenses and benchmarks',
          level: 3,
          paragraphs: [
            oo.expenseTreatmentRules.useHem
              ? `Living expenses use the higher of declared expenses and an HEM-style floor scaled by household size. This bank's floors are ${expenseStrictness(oo.expenseTreatmentRules.minLivingExpensePerAdult)} relative to peers.`
              : `Living expenses rely on declared figures only.`,
          ],
          bullets: oo.expenseTreatmentRules.useHem
            ? [
                `Minimum living expense floor: $${oo.expenseTreatmentRules.minLivingExpensePerAdult.toLocaleString()}/adult and $${oo.expenseTreatmentRules.minLivingExpensePerChild.toLocaleString()}/child per month.`,
                `Each additional adult and child dependant raises the assessed minimum; declared expenses are treated as a floor, never a discount.`,
              ]
            : undefined,
        },
      ],
    },

    // Section 4
    {
      heading: '4. Property, LVR & Portfolio Policies',
      level: 2,
      children: [
        {
          heading: '4.1 LVR limits by purpose',
          level: 3,
          bullets: [
            `Owner-occupied: up to ${pct(oo.maxLvr)}.`,
            `Residential investment: up to ${pct(inv.maxLvr)}.`,
            `Light commercial: up to ${pct(com.maxLvr)}.`,
          ],
        },
        {
          heading: '4.2 Property count and portfolio treatment',
          level: 3,
          paragraphs: [
            `For servicing, this bank ${portfolioPhrase(inv)}. Rental income from included properties feeds the income side; their secured repayments feed commitments.`,
          ],
          bullets: [
            `Portfolio comfort: ${portfolioComfort(inv)}.`,
            `The portal's per-property include/exclude toggle interacts with this: ${portfolioComfort(inv) === 'large' ? 'this bank will look at all included properties' : `this bank only considers its top ${inv.propertyTreatmentRules.maxPropertiesConsidered}, so hiding marginal properties has little effect`}.`,
          ],
        },
        {
          heading: '4.3 Interest-only and investor appetite',
          level: 3,
          bullets: [
            `Maximum interest-only term (investment): ${inv.interestOnlyTreatment?.maxIoYears ?? 0} years.`,
            `Negative gearing benefit: ${inv.negativeGearingTreatment?.allowNegativeGearingBenefit ? `recognised up to ${pct(inv.negativeGearingTreatment.maxBenefitPctOfRentalLoss)} of the rental loss` : 'not modelled'}.`,
          ],
        },
      ],
    },

    // Section 5
    buildIdealClientSection(policy, tags),
  ];

  return {
    brandCode: policy.brandCode,
    bankName: policy.bankName,
    policyVersion: policy.policyVersion,
    title: `${policy.bankName} — 2026 Lending Policy Summary (Modelling Assumptions)`,
    tags,
    sections,
  };
}

function buildIdealClientSection(policy: BankPolicy, tags: string[]): DocSection {
  const oo = policy.residentialOwnerOcc;
  const inv = policy.residentialInvestment;
  const com = policy.commercialPropertyLight;

  const strengths: string[] = [];
  const watchOuts: string[] = [];

  if (oo.maxLvr >= 0.95) strengths.push('Supports high-LVR owner-occupied / first-home buyers (up to 95%).');
  if (inv.maxDti >= 7) strengths.push(`Generous DTI tolerance for strong profiles (up to ${dec1(inv.maxDti)}x).`);
  if (portfolioComfort(inv) === 'large') strengths.push('Assesses the full included property portfolio — strong for larger investors.');
  if (rentalStance(inv.incomeShadingRules.rental.acceptPct) === 'generous') strengths.push('Generous rental income acceptance.');
  if (businessIncomeStance(inv.incomeShadingRules.businessIncome.acceptPct) === 'generous' || hasSelfEmployedUplift(inv)) strengths.push('Stronger for self-employed / business income.');
  if (variableIncomeStance(oo.incomeShadingRules.salarySecondary.acceptPct) === 'generous') strengths.push('More generous on bonus / overtime income.');
  if (com.maxLvr >= 0.7) strengths.push('Workable light-commercial overlay (LVR up to 70%).');

  if (inv.maxDti <= 5.75) watchOuts.push(`Tighter DTI tolerance (cap ${dec1(inv.maxDti)}x) — leveraged investors may fall short.`);
  if (bufferStance(inv.serviceabilityBufferBps) === 'higher') watchOuts.push(`Higher serviceability buffer (${bufferPct(inv.serviceabilityBufferBps)}) reduces borrowing capacity.`);
  if (rentalStance(inv.incomeShadingRules.rental.acceptPct) === 'conservative') watchOuts.push('Conservative on rental income.');
  if (businessIncomeStance(inv.incomeShadingRules.businessIncome.acceptPct) === 'conservative') watchOuts.push('Conservative on business / self-employed income.');
  if (expenseStrictness(oo.expenseTreatmentRules.minLivingExpensePerAdult) === 'conservative') watchOuts.push('Higher minimum living-expense floors for families.');
  if (portfolioComfort(inv) === 'small') watchOuts.push(`Only considers its top ${inv.propertyTreatmentRules.maxPropertiesConsidered} properties — limited for larger portfolios.`);
  if (com.maxLvr < 0.7) watchOuts.push(`Conservative light-commercial LVR (${pct(com.maxLvr)}).`);

  // Ideal client profiles (derived from tags).
  const ideal: string[] = [];
  if (tags.includes('FHB_FRIENDLY')) ideal.push('PAYG couple or first-home buyer with a solid deposit and modest debts — likely a primary choice.');
  if (tags.includes('PORTFOLIO_INVESTOR_FRIENDLY')) ideal.push('Portfolio investor with multiple properties and strong rental income — likely a primary choice.');
  if (tags.includes('SELF_EMPLOYED_FRIENDLY')) ideal.push('Self-employed professional with 2+ years of financials — a strong secondary/primary option.');
  if (tags.includes('LOW_DTI_TOLERANCE')) ideal.push('Lower-leverage borrower with high surplus — a fit; highly geared applicants are a long shot.');
  if (ideal.length === 0) ideal.push('Mainstream PAYG borrowers with standard profiles.');

  return {
    heading: '5. Ideal Client Profiles, Strengths & Watch-outs',
    level: 2,
    children: [
      { heading: '5.1 Ideal client profiles', level: 3, bullets: ideal },
      { heading: '5.2 Key strengths', level: 3, bullets: strengths.length ? strengths : ['Mainstream, well-rounded major-bank policy.'] },
      { heading: '5.3 Key weaknesses / watch-outs', level: 3, bullets: watchOuts.length ? watchOuts : ['No notable policy watch-outs in this model.'] },
      { heading: '5.4 Capability tags', level: 3, bullets: tags.map((t) => TAG_LABELS[t as keyof typeof TAG_LABELS] ?? t) },
    ],
  };
}

// ---------------------------------------------------------------------------
// Cross-bank comparison
// ---------------------------------------------------------------------------

export function buildCrossBankComparison(policies: BankPolicy[]): DocSection {
  const relativeStance = (s: Stance) => (s === 'generous' ? 'High' : s === 'conservative' ? 'Low' : 'Normal');

  const rows = policies.map((p) => {
    const inv = p.residentialInvestment;
    return [
      p.bankName,
      pct(p.residentialOwnerOcc.maxLvr),
      pct(inv.maxLvr),
      `${dec1(inv.maxDti)}x`,
      relativeStance(rentalStance(inv.incomeShadingRules.rental.acceptPct)),
      relativeStance(businessIncomeStance(inv.incomeShadingRules.businessIncome.acceptPct)),
      portfolioComfort(inv),
      inv.interestOnlyTreatment?.allowed ? `${inv.interestOnlyTreatment.maxIoYears}yr` : 'no',
    ];
  });

  return {
    heading: '2026 Major Bank Lending Policy — Cross-Bank Comparison (Modelling View)',
    level: 1,
    paragraphs: [
      'The big-4 (CBA, NAB, Westpac, ANZ) form a conservative-to-moderate benchmark cluster. Macquarie and HSBC sit in a more investor/professional-friendly cluster (higher DTI tolerance and full-portfolio assessment). Suncorp, ING, St.George/BankSA and Bendigo span the regional/alt-lender range — ING the tightest on DTI and variable income, Bendigo the most flexible on investor DTI but with a higher buffer.',
      'Three broad clusters emerge: (1) mainstream majors — conservative baseline; (2) portfolio-friendly — Macquarie/HSBC (and NAB for investors); (3) tight-DTI / conservative shading — ING (and Suncorp on expenses). The matching layer uses these clusters to shortlist before precise numeric ranking.',
    ],
    table: {
      headers: ['Bank', 'OO LVR', 'Inv LVR', 'Inv DTI', 'Rental', 'Business', 'Portfolio', 'IO'],
      rows,
    },
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderSectionMarkdown(s: DocSection, out: string[]): void {
  out.push(`${'#'.repeat(Math.min(6, s.level + 1))} ${s.heading}`);
  for (const p of s.paragraphs ?? []) out.push('', p);
  if (s.bullets?.length) {
    out.push('');
    for (const b of s.bullets) if (b) out.push(`- ${b}`);
  }
  if (s.table) {
    out.push('', `| ${s.table.headers.join(' | ')} |`, `| ${s.table.headers.map(() => '---').join(' | ')} |`);
    for (const r of s.table.rows) out.push(`| ${r.join(' | ')} |`);
  }
  out.push('');
  for (const c of s.children ?? []) renderSectionMarkdown(c, out);
}

export function renderMarkdown(doc: PolicyDoc): string {
  const out: string[] = [`# ${doc.title}`, '', `*Modelling assumptions only — not official lender policy or a credit decision.*`, ''];
  for (const s of doc.sections) renderSectionMarkdown(s, out);
  return out.join('\n');
}

/** Render the whole library (all banks + comparison) as one Markdown document. */
export function renderFullMarkdown(policies: BankPolicy[]): string {
  const parts: string[] = [
    '# 2026 Bank Lending Policy Summaries (Modelling Assumptions)',
    '',
    '*Generated from the active policy library. These are modelled estimates for indicative comparison only — not official lender policy and not a credit decision.*',
    '',
  ];
  for (const p of policies) {
    parts.push(renderMarkdown(buildBankSummary(p)), '\n---\n');
  }
  const cmp: string[] = [];
  renderSectionMarkdown(buildCrossBankComparison(policies), cmp);
  parts.push(cmp.join('\n'));
  return parts.join('\n');
}

// --- Word-openable HTML --------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderSectionHtml(s: DocSection, out: string[]): void {
  const tag = `h${Math.min(6, s.level + 1)}`;
  out.push(`<${tag}>${esc(s.heading)}</${tag}>`);
  for (const p of s.paragraphs ?? []) out.push(`<p>${esc(p)}</p>`);
  if (s.bullets?.length) {
    out.push('<ul>');
    for (const b of s.bullets) if (b) out.push(`<li>${esc(b)}</li>`);
    out.push('</ul>');
  }
  if (s.table) {
    out.push('<table border="1" cellspacing="0" cellpadding="4"><thead><tr>');
    for (const h of s.table.headers) out.push(`<th>${esc(h)}</th>`);
    out.push('</tr></thead><tbody>');
    for (const r of s.table.rows) out.push(`<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`);
    out.push('</tbody></table>');
  }
  for (const c of s.children ?? []) renderSectionHtml(c, out);
}

/**
 * Render the full library as a single Word-openable HTML document. Serve with
 * `Content-Type: application/msword` + a `.doc` filename and Word will open it
 * as a formatted document.
 */
export function renderWordHtml(policies: BankPolicy[]): string {
  const body: string[] = [
    '<h1>2026 Bank Lending Policy Summaries (Modelling Assumptions)</h1>',
    '<p><em>Generated from the active policy library. Modelled estimates for indicative comparison only — not official lender policy and not a credit decision.</em></p>',
  ];
  for (const p of policies) {
    const doc = buildBankSummary(p);
    body.push(`<h1>${esc(doc.title)}</h1>`);
    for (const s of doc.sections) renderSectionHtml(s, body);
    body.push('<hr/>');
  }
  renderSectionHtml(buildCrossBankComparison(policies), body);

  return [
    '<!DOCTYPE html>',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">',
    '<head><meta charset="utf-8"><title>2026 Bank Lending Policy Summaries</title>',
    '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#222;} h1{font-size:18pt;} h2{font-size:14pt;} h3{font-size:12pt;} table{border-collapse:collapse;font-size:10pt;} th{background:#f0f0f0;text-align:left;}</style>',
    '</head><body>',
    body.join('\n'),
    '</body></html>',
  ].join('\n');
}

/** Build the structured docs for every bank plus the comparison (for JSON APIs). */
export function buildAllSummaries(policies: BankPolicy[]): { docs: PolicyDoc[]; comparison: DocSection } {
  return { docs: policies.map(buildBankSummary), comparison: buildCrossBankComparison(policies) };
}
