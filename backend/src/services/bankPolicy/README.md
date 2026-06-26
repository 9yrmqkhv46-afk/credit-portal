# 2026 Bank Lending Policy Engine

A structured, data-driven engine that models the policy logic behind the major
Australian lenders' public "how much can I borrow?" calculators, runs a client
scenario against each lender, and ranks which bank(s) to approach.

> **Disclaimer:** every value in `policies.ts` is a **modelled estimate** for
> indicative comparison only. It is **not** official lender policy and must not
> be presented as a credit decision.

## Files

| File | Responsibility |
|------|----------------|
| `types.ts` | All policy + scenario + result types (decoupled from Prisma) |
| `policies.ts` | Seed policy library for 10 lenders (CBA, NAB, WBC, ANZ, SUN, ING, HSBC, BSA, MQG, BEN) |
| `engine.ts` | Per-bank calculation: income shading, HEM expenses, commitments, serviceability, DTI, LVR, property selection, duplicate detection |
| `ranking.ts` | Weighted suitability score + PRIMARY/SECONDARY/LONG_SHOT categorisation |
| `index.ts` | Barrel exports |

API: `backend/src/routes/bankPolicy.ts` (admin-only) — `GET /api/bank-policies`,
`GET /api/bank-policies/:brandCode`, `POST /api/bank-policies/rank`,
`POST /api/bank-policies/:brandCode/calc`. Plus
`GET /api/admin/clients/:id/bank-recommendations` (top-3 from a client's data).

## How a calculation works (`runBankCalc`)

1. Pick the `ProductPolicy` for the scenario purpose (owner-occ / investment / commercial-light).
2. Detect duplicate loans (a STANDALONE debt that mirrors a property-secured loan) and exclude them — **no double counting**.
3. Select the properties this bank considers (`selectionStrategy` + `maxPropertiesConsidered`, with per-bank overrides).
4. Normalise income to monthly and apply the bank's income shading (salary, rental w/ vacancy, business, gov, other). Rental is auto-aggregated from included investment/commercial properties.
5. Expenses = `max(declared, HEM)` when `useHem` + `treatClientDeclaredAsFloor`.
6. Commitments = included property repayments + standalone debts (e.g. credit card = % of limit).
7. `netMonthlySurplus = income − (expenses + commitments)`.
8. Serviceability max = largest P&I loan whose repayment ≤ surplus at the **stress rate** (`base + bufferBps`, plus IO loading).
9. DTI max = `maxDti × grossAnnualIncome − existingDebt`.
10. LVR max = `maxLvr × propertyValue`.
11. `finalMaxBorrow = min(serviceability, DTI, LVR, maxLoanAmount)`.
12. Pass/fail vs the requested loan + human-readable `reasons[]`.

## Ranking (`rankBanksForScenario`)

Weighted score over: serviceability margin (0.35), DTI comfort (0.20), LVR
comfort (0.15), product fit (0.15), property flexibility (0.10), income
friendliness (0.05). Then: **PRIMARY** (PASS & score ≥ 0.75), **SECONDARY**
(workable/marginal), **LONG_SHOT** (clearly short but not a hard breach).
Results are sorted PASS → MARGINAL → FAIL, then by score.

## Add a new bank

In `policies.ts`, add a `bank(...)` entry with three `ProductParams`
(owner-occ, investment, commercial-light):

```ts
bank('New Lender', 'NEW', 'NEW_2026.01', 'notes',
  { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300 },          // owner-occ
  { maxLvr: 0.90, maxDti: 6.0, bufferBps: 300, rentalAccept: 0.80 }, // investment
  { maxLvr: 0.65, maxDti: 5.0, bufferBps: 350, base: 0.072 }),       // commercial-light
```

## Tweak buffers / caps

Edit the relevant `ProductParams` (`bufferBps`, `maxDti`, `maxLvr`,
`rentalAccept`, `maxProps`, `selection`, `ccPct`, …). Everything flows through
the engine and ranking automatically — no calculation code changes needed.

## Property loans vs the loans panel (no double counting)

- Property-secured loans live on the `EngineProperty` (`currentRepaymentAmount`, `currentLoanBalance`, `lender`).
- Non-property liabilities live in `EngineDebt` with `source: 'STANDALONE'`.
- `detectDuplicateLoans` flags a standalone debt that matches a property loan (same lender + similar repayment/balance); the engine excludes it from commitments and DTI.

## Tests

```bash
cd backend && npx jest bankPolicy
```

Covers: single-bank serviceability/DTI/LVR (CBA-like), DTI-cap breach,
multi-bank ranking + ordering, HSBC full-portfolio selection, and duplicate
loan detection. Example outcome for a stretched loan: NAB/ANZ (higher DTI)
rank above Bendigo (tighter cap + higher buffer).

## Docs

- **POLICIES.md** — the full per-bank 2026 modelling policy tables (LVR, DTI, buffers, income shading, property treatment).
- **CALCULATIONS.md** — every formula the engine uses (income shading, HEM floor, serviceability, DTI, LVR, ranking, and the admin top-3 algorithm), written in plain text (no LaTeX).

## Admin "suggest top 3 banks"

`GET /api/admin/clients/:id/bank-recommendations` reads the client's stored CRM
data (profile, income, expenses, properties, debts, latest scenario), maps it
into a scenario, runs the ranking, and returns `{ scenarioUsed, top3, all }`.
Surfaced on the admin client detail page as **"Recommended Lenders (Top 3)"**.

## Status

Done: hard-coded 2026 policy library (10 banks), engine, ranking, DB-backed
versioning + audit, admin policy editor + scenario runner + property inclusion
matrix, and the client-data-driven top-3 recommendation.
