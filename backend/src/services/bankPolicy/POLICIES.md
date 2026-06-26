# 2026 Bank Policy Library — Modelling Policies

These are **hard-coded modelling policies** (in `policies.ts`) — configurable
parameters that approximate how each lender's public borrowing calculator
behaves. **They are not official lender policy, are not scraped from any credit
manual, and are not a credit decision.** Brokers edit them in the admin
**"Bank Policies 2026"** screen; the engine reads whatever is active.

All percentages below are shown in human terms; the code stores decimals
(e.g. 80% accept = `0.80`, 3% buffer = `bufferBps 300`).

## Owner-Occupied (residential)

| Bank | Max LVR | Max DTI | Stress buffer | Rental accept (vacancy) | Business inc. | Properties | Selection |
|------|--------:|--------:|--------------:|------------------------:|--------------:|-----------:|-----------|
| CBA | 95% | 6.0 | +3.00% | 80% (5%) | 70% | 4 | Top by equity |
| NAB | 95% | 6.5 | +3.00% | 80% (5%) | 70% | 4 | All included |
| Westpac | 95% | 6.0 | +3.00% | 80% (5%) | 60% | 4 | Top by equity |
| ANZ | 95% | 6.5 | +3.00% | 80% (5%) | 70% | 5 | Top by equity |
| Macquarie | 95% | 7.0 | +3.00% | 80% (5%) | 75% | 6 | All included |
| Suncorp | 95% | 6.0 | +3.00% | 80% (5%) | 70% | 4 | Top by equity |
| ING | 90% | 5.75 | +3.00% | 75% (10%) | 60% | 3 | Top by equity |
| HSBC | 95% | 6.5 | +3.00% | 78% (8%) | 70% | 6 | All included |
| St.George/BankSA | 95% | 6.0 | +3.00% | 80% (5%) | 62% | 4 | Top by equity |
| Bendigo | 90% | 6.0 | +3.50% | 80% (5%) | 75% | 4 | Top by equity |

## Investment (residential)

| Bank | Max LVR | Max DTI | Rental accept (vacancy) | Properties | Selection | IO |
|------|--------:|--------:|------------------------:|-----------:|-----------|----|
| CBA | 90% | 6.5 | 80% (8%) | 5 | Top by equity | yes |
| NAB | 90% | 7.0 | 82% (6%) | 5 | All included | yes |
| Westpac | 90% | 6.5 | 75% (10%) | 4 | Top by equity | yes |
| ANZ | 90% | 6.5 | 80% (8%) | 5 | Top by equity | yes |
| Macquarie | 90% | 7.0 | 85% (6%) | 6 | All included | yes |
| Suncorp | 90% | 6.0 | 78% (8%) | 4 | Top by equity | yes |
| ING | 90% | 5.75 | 75% (10%) | 3 | Top by equity | yes |
| HSBC | 90% | 6.5 | 78% (8%) | 6 | All included | yes |
| St.George/BankSA | 90% | 6.5 | 76% (10%) | 4 | Top by equity | yes |
| Bendigo | 88% | 7.0 | 80% (8%) | 5 | All included | yes |

## Commercial property (light overlay)

Commercial is a simple overlay only (not full corporate credit). Typical:
Max LVR 65–70%, Max DTI 5.0–6.0, higher base rate (~7.0–7.6%), selection
"top by loan balance" (or "all" for Macquarie/HSBC), commercial properties
included.

## Income shading (all banks, by type)

- **Salary (primary):** 100%
- **Salary (secondary) / bonus / overtime:** 65–85% (NAB/ANZ most generous; ING tightest)
- **Rental:** 70–85% accepted, after a 5–12% vacancy deduction
- **Business / self-employed:** 60–75% (Macquarie/Bendigo highest; Westpac/ING lowest)
- **Government benefits:** 80%
- **Other / irregular:** 45–65%

## Expense treatment

Every bank uses an HEM-style **floor**: monthly living expense =
`max(declared, minPerAdult × adults + minPerChild × children)`. Floors range
from ~$1,150/adult (NAB) to ~$1,350/adult (Suncorp), ~$580–$680/child.

## Debt treatment

- **Credit cards:** 3% of limit per month (ING 4%).
- **Personal / car loans:** actual repayment.
- **HECS/HELP:** actual.
- **Other / business:** buffered +20%.

## How to change a policy

Edit the relevant entry in `policies.ts` (or the admin **Bank Policies 2026**
editor → save as a new version → activate). No engine code changes are needed —
every difference is expressed through these parameters.
