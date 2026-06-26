# Calculations — 2026 Bank Policy Engine

How the engine turns a client scenario + a bank policy into a borrowing result.
All formulas are written in plain text (no LaTeX). Amounts are normalised to
**monthly** first: weekly × 52 ÷ 12, fortnightly × 26 ÷ 12, quarterly × 4 ÷ 12,
annual ÷ 12.

## 1. Income (shaded, monthly)

For each income source, apply the bank's acceptance % for its type. Rental is
adjusted for vacancy first, then shaded:

```
shadedRental = grossRental × rentalAcceptPct × (1 − rentalVacancyPct)
```

Rental is **auto-aggregated from included investment/commercial properties** (so
rental is not entered twice). `grossAnnualIncome` (used for DTI) is the
un-shaded total × 12.

## 2. Expenses (monthly)

```
HEM floor   = minPerAdult × adults + minPerChild × children
monthlyExpenses = max(declaredLiving, HEM floor) + rent
```

## 3. Commitments (monthly)

```
commitments = Σ repayments of INCLUDED property-secured loans
            + Σ standalone-debt repayments
```

- Credit card commitment = `creditCardPctOfLimit × limit`.
- Personal/car = actual (or assumed 5-yr amortising).
- Other/business = actual, buffered +20%.
- **Duplicate protection:** a STANDALONE debt that mirrors a property-secured
  loan (same lender + similar balance/repayment) is detected and excluded, so
  the same exposure is never counted twice.

## 4. Net monthly surplus

```
netSurplus = shadedIncome − (monthlyExpenses + commitments)
```

## 5. Serviceability max loan

Stress rate:

```
stressRate = max(actualRate, baseRateAssumption) + serviceabilityBuffer   (+ IO loading if interest-only)
```

Largest principal `P` whose P&I repayment is ≤ `netSurplus`, using the standard
amortisation formula with monthly rate `r = stressRate / 12` and `n = term × 12`
months:

```
P = M × (1 − (1 + r)^(−n)) / r          where M = netSurplus
```

(The inverse — monthly repayment for a principal — is
`M = P × r / (1 − (1 + r)^(−n))`.)

## 6. DTI cap

```
existingDebt   = Σ included property loan balances + Σ standalone balances
maxBorrowDti   = max(0, maxDti × grossAnnualIncome − existingDebt)
dtiRatio       = (existingDebt + targetLoan) / grossAnnualIncome
```

## 7. LVR cap

```
maxBorrowLvr = maxLvr × propertyValue
lvrRatio     = targetLoan / propertyValue
```

## 8. Final maximum borrowing

```
finalMaxBorrow = min(serviceabilityMax, maxBorrowDti, maxBorrowLvr, policyMaxLoan)
```

## 9. Pass / fail

- **PASS** — no hard breach and `finalMaxBorrow ≥ targetLoan`.
- **MARGINAL** — no breach and `finalMaxBorrow ≥ 90% of targetLoan`.
- **FAIL** — short of target, or an LVR/DTI/min/max breach.

Each result carries human-readable `reasons[]` (binding constraint, breaches,
property-count caps, duplicates excluded, etc.).

## 10. Ranking + Top 3 (which bank to approach)

Each active bank is scored 0..1 on weighted dimensions:

| Dimension | Weight | Meaning |
|-----------|-------:|---------|
| Serviceability margin | 0.35 | finalMaxBorrow vs target (0.8x → 0, 1.3x → 1) |
| DTI comfort | 0.20 | headroom below the DTI cap |
| LVR comfort | 0.15 | headroom below the LVR cap |
| Product fit | 0.15 | purpose + repayment type supported (IO allowed?) |
| Property flexibility | 0.10 | max properties + "all included" |
| Income friendliness | 0.05 | rental + business acceptance |

```
score = Σ (weight × dimension)
```

Buckets: **PRIMARY** (PASS & score ≥ 0.75), **SECONDARY** (workable / marginal),
**LONG_SHOT** (short but not a hard breach). Results sort PASS → MARGINAL → FAIL
then by score; the **top 3** are surfaced as the recommended lenders.

## 11. Admin "suggest top 3 banks" (uses the client's stored data)

`GET /api/admin/clients/:id/bank-recommendations` reads the client's saved CRM
data and maps it into a scenario, then runs the ranking:

- **Adults/children** from marital status + dependants; **self-employed** from employment status.
- **Income** from the client's income sources (rental excluded here — taken from properties).
- **Expenses** summed from the declared expense summary (rent kept separate).
- **Properties** (+ their secured loans + rent) from the property portfolio.
- **Standalone debts** from existing debts (home loans excluded — they're property-secured).
- **Loan request** from the latest loan scenario (purpose, rate, term, repayment), with sensible fallbacks (e.g. target ≈ 5× income, value ≈ loan ÷ 0.8).

Returns `{ scenarioUsed, top3, all }`. Example: a strong PAYG couple with one
investment property typically ranks NAB/Macquarie/ANZ first (higher DTI + full
portfolio), while ING falls to a long shot (tight DTI + lower variable-income
acceptance).
