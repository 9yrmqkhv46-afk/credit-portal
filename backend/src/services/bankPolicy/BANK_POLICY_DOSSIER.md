# 2026 Bank Lending Policy Dossier (Modelling Assumptions)

> **Important:** Everything in this document is a **modelling summary**, not an
> official credit manual. It approximates how Australian borrowing-power
> calculators behave (income, expenses, debts, credit-card limits, deposit,
> LVR, DTI and APRA-style assessment buffers of roughly rate + 3 percentage
> points). Values are configurable parameters a broker can adjust; they are not
> a credit decision and must not be presented as one.

Each bank summary maps policy to the portal's fields: **ClientProfile**
(applicant type, residency, employment, dependants, private schooling),
**IncomeSource** (primary/secondary salary, bonus, overtime, rental, business,
government, other), **ExpenseSummary**, **ExistingDebt** (credit cards, personal,
car, HECS/HELP, business, other — property-secured vs standalone),
**Property** (type, value, loan, repayment, rent, include toggle) and
**LoanScenario** (purpose, target loan/value, deposit, term, rate, P&I/IO).

A universal rule across every bank: **property-secured loans are attached to the
Property and must not be double-counted** in the standalone ExistingDebt list;
the portal de-duplicates by lender + balance + repayment.

---

## Commonwealth Bank of Australia (CBA) — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occupied home loans, residential investment loans, and light commercial property.
**1.2 Risk appetite overview.** A conservative, mainstream baseline. Owner-occ LVR up to ~95% for strong profiles; investment to ~90%; light commercial ~70%. DTI comfortable to about 6x (owner-occ) and mid-6s for strong investors. Modest interest-only appetite (investment/commercial only, ~5 years). Comfortable assessing a focused portfolio of the top 3–4 properties by equity rather than very large holdings.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** Stress-tests at the actual rate plus a standard ~3 percentage-point buffer; in line with the majors. Interest-only requests carry a small extra loading and are assessed on a P&I basis over the residual term.
**2.2 DTI stance.** Owner-occ to ~6x; investors to ~6.5x where surplus and equity are strong; light commercial tighter (~6x). Broadly the conservative reference point against which other lenders are compared.
**2.3 Existing debts.** Credit cards modelled at ~3% of limit per month (limit, not balance). Personal/car loans at actual repayments; HECS/HELP always counted; business loans buffered (+20%). Property-secured loans live on the Property; standalone debts are credit cards and non-property loans.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** Primary PAYG salary ~100%; secondary salary/bonus/overtime ~80% with history; rental ~80% after a ~5% vacancy allowance; business income ~70% with 2 years' financials; government/other shaded conservatively (~60–80%).
**3.2 Living expenses / HEM.** Uses the higher of declared expenses and an HEM-style floor scaled by income band and dependants; private schooling lifts the floor. Relatively conservative on living expenses.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~95%, investment ~90%, light commercial ~70%.
**4.2 Property count.** Focuses on the top 3–4 properties by equity; included properties contribute rent (shaded) and their loan repayments. Hide/unhide should respect this top-N stance — hiding low-equity properties has little effect because CBA already concentrates on the strongest.
**4.3 IO and investor appetite.** IO available for investment/commercial (~5 years); owner-occ is P&I. Moderate investor appetite — fine for one or two investments, less so for large portfolios.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** PAYG first-home buyers at high LVR; PAYG upgraders with modest debt. Secondary for moderate investors; long shot for complex self-employed or large portfolios.
**5.2 Strengths.** High owner-occ LVR; strong for clean PAYG; trusted mainstream pricing; predictable assessment.
**5.3 Watch-outs.** Conservative living-expense floors; moderate rental/business shading; limited portfolio appetite; tighter investment/commercial LVR.

---

## National Australia Bank (NAB) — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial.
**1.2 Risk appetite overview.** Mainstream major, slightly more flexible than CBA for good-quality investors. Owner-occ LVR ~95%, investment ~90%, commercial ~70%. DTI to ~6.5x owner-occ and ~7x for strong investors. Considers the full set of included properties (not just a top-N), comfortable to 4–5.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** Standard ~3pp buffer; can treat strong, stable PAYG profiles slightly more generously.
**2.2 DTI stance.** Wider comfort band than CBA — owner-occ ~6.5x, investors ~7x where surplus is strong. Often the more flexible of the big-4 for investors.
**2.3 Existing debts.** Credit cards ~3% of limit; personal/car actual; HECS/HELP counted; business buffered. Standard de-duplication of property-secured loans.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** Primary PAYG ~100%; secondary/bonus/overtime a touch more open (~85%); rental ~80–82%; business ~70%. More accepting of variable income than the most conservative majors.
**3.2 Living expenses / HEM.** HEM-style floor, roughly major-bank norm — not the strictest. Dependants and private schooling lift the floor.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~95%, investment ~90%, commercial ~70%.
**4.2 Property count.** Considers all included properties (to ~4–5), so hide/unhide directly changes the assessment — useful for trimming a weak property.
**4.3 IO and investor appetite.** IO to ~5 years on investment; reasonably investor-friendly with strong rental and equity.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** PAYG borrowers with good surplus; investors with solid rental income. Secondary for FHB; long shot for thin-file self-employed.
**5.2 Strengths.** Higher investor DTI; full-portfolio view; balanced variable-income acceptance.
**5.3 Watch-outs.** Still a mainstream living-expense stance; commercial tighter; not the most generous on business income.

---

## Westpac — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial.
**1.2 Risk appetite overview.** Middle-of-the-road major, a little conservative on variable and rental income. Owner-occ LVR ~95%, investment ~90%, commercial ~70%. DTI to ~6x owner-occ, ~6.5x investment. Comfortable with the top 3–4 properties.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** ~3pp buffer; emphasis on stress-testing over stretching capacity.
**2.2 DTI stance.** Similar to CBA; cautious at very high DTI.
**2.3 Existing debts.** Credit cards ~3% of limit; personal/car actual; HECS counted; business buffered. De-dupe property loans.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** PAYG ~100%; bonus/overtime more conservative; business ~60%, other ~50% — tighter than NAB/ANZ. Rental ~75% with a higher (~10%) vacancy allowance.
**3.2 Living expenses / HEM.** Strong attention to living-expense detail; private schooling notably raises the floor.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~95%, investment ~90%, commercial ~70%.
**4.2 Property count.** Top 3–4 by equity.
**4.3 IO and investor appetite.** IO to ~5 years; owner-occupier-priority feel.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** Mainstream PAYG households; moderate investors. Long shot for aggressive leverage or complex self-employed.
**5.2 Strengths.** Reliable owner-occ; disciplined, defensible assessment.
**5.3 Watch-outs.** Lower business/other income acceptance; conservative rental; detailed expense scrutiny.

---

## ANZ — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial.
**1.2 Risk appetite overview.** Balanced major, a bit more open to variable income than Westpac. Owner-occ LVR ~95%, investment ~90%, commercial ~70%. DTI to ~6.5x. Comfortable to ~5 properties.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** Standard ~3pp buffer.
**2.2 DTI stance.** Similar to NAB; accommodating for strong profiles within reason.
**2.3 Existing debts.** Credit cards ~3% of limit; personal/car actual; HECS counted; business buffered.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** PAYG ~100%; bonus/overtime modestly higher acceptance (~80%); business disciplined; rental ~80% (mid-to-upper).
**3.2 Living expenses / HEM.** Declared vs benchmark floor; mainstream — neither strictest nor loosest.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~95%, investment ~90%, commercial ~70%.
**4.2 Property count.** Top ~5 by equity; included properties feed rent and commitments.
**4.3 IO and investor appetite.** IO to ~5 years; balanced investor stance.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** PAYG and professionals with some variable income; balanced investors.
**5.2 Strengths.** Better bonus/overtime acceptance; solid all-rounder.
**5.3 Watch-outs.** Not the cheapest on commercial; portfolio appetite moderate.

---

## Macquarie Bank (MQG) — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial.
**1.2 Risk appetite overview.** Investor- and professional-friendly. Owner-occ LVR ~95%, investment ~90%, commercial ~70%. DTI to ~7x for strong profiles. Comfortable assessing **large portfolios (6+ properties), all included**.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** ~3pp buffer; works well with strong surplus and nuanced cash flows.
**2.2 DTI stance.** Among the most flexible — to ~7x for high-quality investors with equity and rental.
**2.3 Existing debts.** Credit cards ~3% of limit; personal/car actual; HECS counted; business buffered; self-employed DTI uplift where 2 years' financials support it.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** PAYG ~100%; rental generous (~85%); business ~75% — strong for quality self-employed.
**3.2 Living expenses / HEM.** Benchmark floors at mainstream norms, not the harshest.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~95%, investment ~90%, commercial ~70%.
**4.2 Property count.** All included properties (to ~6); hide/unhide is highly material — every included property's rent and loan flows through.
**4.3 IO and investor appetite.** IO to ~5 years; clearly investor-friendly.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** Portfolio investors; professionals with multiple properties; quality self-employed where big-4 feel tight.
**5.2 Strengths.** High DTI tolerance; full-portfolio view; generous rental/business acceptance.
**5.3 Watch-outs.** Documentation expectations; less suited to thin-file or very high-LVR FHB.

---

## Suncorp Bank (SUN) — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial.
**1.2 Risk appetite overview.** Regional/major hybrid, slightly conservative baseline. Owner-occ LVR ~95%, investment ~90%, commercial ~70%. DTI ~6x. Comfortable with 3–4 properties.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** Standard ~3pp buffer; caution over stretch.
**2.2 DTI stance.** A little tighter than the most flexible lenders; near CBA/Westpac.
**2.3 Existing debts.** Credit cards ~3% of limit; personal/car actual; HECS counted; business buffered.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** PAYG ~100%; business conservative; rental ~78%.
**3.2 Living expenses / HEM.** **Higher minimum living-expense floors** (family/regional cost of living).

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~95%, investment ~90%, commercial ~70%.
**4.2 Property count.** Top 3–4 by equity; not large portfolios.
**4.3 IO and investor appetite.** IO to ~5 years; modest investor appetite.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** PAYG households; moderate investors with simple portfolios.
**5.2 Strengths.** Steady, predictable; good for clean profiles.
**5.3 Watch-outs.** Higher expense floors reduce capacity; limited portfolio appetite.

---

## ING Australia (ING) — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial.
**1.2 Risk appetite overview.** Stricter on DTI and income shading. Owner-occ and investment LVR ~90%, commercial ~65%. DTI capped tighter at ~5.75x. Comfortable with only ~3 properties.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** ~3pp buffer; cautious on stretching capacity.
**2.2 DTI stance.** **Lowest comfort band (~5.75x)** — especially for leveraged investors.
**2.3 Existing debts.** Credit cards modelled higher (~4% of limit); personal/car actual; HECS counted; business buffered. Foregrounds commitments and spending.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** PAYG ~100%; secondary/bonus lower (~65%); business ~60%; other ~45%; rental ~75% with ~10% vacancy.
**3.2 Living expenses / HEM.** Disciplined treatment of declared spending and commitments.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ/investment ~90%; commercial ~65% (conservative).
**4.2 Property count.** ~3 properties; limited comfort with large portfolios.
**4.3 IO and investor appetite.** IO available but cautious; owner-occupier lean.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** Straightforward PAYG with modest debt and high surplus. Long shot for heavy-leverage investors or thin-file self-employed.
**5.2 Strengths.** Sharp for clean, low-debt PAYG; disciplined.
**5.3 Watch-outs.** Tight DTI; lower variable/business/rental acceptance; higher credit-card load; conservative commercial LVR.

---

## HSBC Australia (HSBC) — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial.
**1.2 Risk appetite overview.** Balanced, slightly investor-friendly international bank. Owner-occ LVR ~95%, investment ~90%, commercial ~70%. DTI to ~6.5x with room for higher on strong high-income profiles. Handles **large portfolios — all included (to ~6)**.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** Standard ~3pp buffer; global best-practice stress testing.
**2.2 DTI stance.** Mid-to-upper; comfortable higher for genuinely high-income borrowers.
**2.3 Existing debts.** Credit cards ~3% of limit; personal/car actual; HECS counted; business buffered.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** PAYG ~100%; supportive of diversified income (salary + rental + some business); rental ~78%.
**3.2 Living expenses / HEM.** Benchmark floors + declared; careful but not harsh.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~95%, investment ~90%, commercial ~70%.
**4.2 Property count.** All included (to ~6); good for cross-border / multi-property clients; hide/unhide is material.
**4.3 IO and investor appetite.** IO to ~5 years; investor-capable.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** Higher-income professionals; multi-property investors; globally mobile borrowers.
**5.2 Strengths.** Full-portfolio view; diversified-income friendly; higher DTI for strong profiles.
**5.3 Watch-outs.** Best fit skews higher-income; smaller branch footprint.

---

## St.George / BankSA (SGB) — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial. Treated as one Westpac-group policy family.
**1.2 Risk appetite overview.** Broadly aligned with Westpac, with regional nuance. Owner-occ LVR ~95%, investment ~90%, commercial ~70%. DTI to ~6x owner-occ, ~6.5x investment. Comfortable with 3–4 properties.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** Westpac-like ~3pp buffer.
**2.2 DTI stance.** Mid-range; cautious at very high DTI.
**2.3 Existing debts.** Credit cards ~3% of limit; personal/car actual; HECS counted; business buffered.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** PAYG ~100%; conservative on heavy variable/business; rental ~76%.
**3.2 Living expenses / HEM.** Slightly higher floors in some family/regional contexts.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~95%, investment ~90%, commercial ~70%.
**4.2 Property count.** Top 3–4 by equity.
**4.3 IO and investor appetite.** IO to ~5 years; owner-occ priority with regional flavour.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** PAYG households and moderate investors in NSW/SA. Similar fit to Westpac.
**5.2 Strengths.** Familiar group policy; FHB-capable; predictable.
**5.3 Watch-outs.** Conservative variable income; higher family expense floors.

---

## Bendigo Bank (BEN) — 2026 Lending Policy Summary (Modelling Assumptions)

### Section 1 – Core Lending Policy Profile
**1.1 Product scope.** Owner-occ, residential investment, light commercial. Alt-lender slot (interchangeable with AMP).
**1.2 Risk appetite overview.** Flexible for niche scenarios within regulated norms. Owner-occ LVR ~90%, investment ~88%, commercial ~65%. DTI to ~7x for certain investor/self-employed profiles, but with a **higher assessment buffer**. Property comfort moderate-to-good.

### Section 2 – Serviceability, Assessment Rate and Debt Treatment
**2.1 Assessment rate and buffer.** Slightly higher buffer (~3.5pp) — trades a tougher stress rate for wider profile acceptance.
**2.2 DTI stance.** Wider investor DTI (~7x) for well-documented borrowers.
**2.3 Existing debts.** Credit cards ~3% of limit; personal/car actual; HECS counted; business buffered.

### Section 3 – Income and Expense Policies
**3.1 Income shading.** PAYG ~100%; **more open to business and other income (~75%/65%)**; rental ~80%.
**3.2 Living expenses / HEM.** Benchmark floors with room to consider nuanced spending for some client types.

### Section 4 – Property, LVR and Portfolio Policies
**4.1 LVR by purpose.** Owner-occ ~90%, investment ~88%, commercial ~65% (lowest commercial LVR here).
**4.2 Property count.** Considers all included for investors (to ~5).
**4.3 IO and investor appetite.** IO to ~5 years; alt-lender flexibility for non-standard profiles.

### Section 5 – Ideal Client Profiles, Strengths and Watch-outs
**5.1 Ideal clients.** Self-employed or investors who find majors too tight but want a recognised brand. Commercial buyers needing flexibility.
**5.2 Strengths.** Generous business/other income; wider investor DTI; commercial-friendly.
**5.3 Watch-outs.** Higher buffer reduces raw capacity; lower commercial LVR; lower owner-occ LVR than the majors.

---

# 2026 Major Bank Lending Policy – Cross-Bank Comparison (Modelling View)

The **big-4 (CBA, NAB, Westpac, ANZ)** form a conservative-to-balanced
mainstream cluster: ~95% owner-occ LVR, DTI roughly 6–7x, standard 3pp buffers,
HEM-style expense floors, and a focus on the top few properties (NAB/ANZ a touch
more open to investors and variable income than CBA/Westpac).
**Macquarie and HSBC** sit in an **investor/professional-friendly** cluster:
higher DTI tolerance, full-portfolio assessment (6+ properties), and more
generous rental/business acceptance. **Suncorp, ING, St.George/BankSA and
Bendigo/AMP** are regionals/alt-lenders with varying flexibility — ING the
strictest (tight DTI, conservative income), Bendigo the most accommodating on
business income and investor DTI (at the cost of a higher buffer).

| Bank | OO max LVR | Inv max LVR | Typical DTI band | Rental accept | Business accept | Portfolio comfort | IO friendliness |
|------|-----------:|------------:|------------------|---------------|-----------------|-------------------|-----------------|
| CBA | ~95% | ~90% | 6.0–6.5 | Normal | Normal | Few (3–4) | Moderate |
| NAB | ~95% | ~90% | 6.5–7.0 | Normal+ | Normal | Many (all, 4–5) | Good |
| Westpac | ~95% | ~90% | 6.0–6.5 | Conservative | Conservative | Few (3–4) | Moderate |
| ANZ | ~95% | ~90% | 6.5 | Normal+ | Normal | Many (5) | Good |
| Macquarie | ~95% | ~90% | up to 7.0 | Generous | Generous | Large (all, 6+) | Good |
| Suncorp | ~95% | ~90% | 6.0 | Normal | Conservative | Few (3–4) | Moderate |
| ING | ~90% | ~90% | ~5.75 (tight) | Conservative | Low | Few (3) | Cautious |
| HSBC | ~95% | ~90% | 6.5+ | Normal+ | Normal+ | Large (all, 6) | Good |
| St.George/BankSA | ~95% | ~90% | 6.0–6.5 | Conservative | Conservative | Few (3–4) | Moderate |
| Bendigo/AMP | ~90% | ~88% | up to 7.0 (investors) | Generous | Generous | Moderate (all, 5) | Good |

**Policy clusters and who they suit**
- **Mainstream majors (CBA, Westpac, Suncorp, SGB):** clean PAYG, FHB at high LVR, moderate investors who want predictability.
- **Investor/professional-friendly (Macquarie, HSBC; NAB/ANZ at the edge):** portfolio investors, high-income professionals, quality self-employed.
- **Tight / conservative income shading (ING):** low-debt, high-surplus PAYG; avoid for leveraged investors.
- **Flexible alt-lender (Bendigo/AMP):** self-employed and investors squeezed by majors, and light commercial.

---

# Search Algorithm A – Policy-Weighted Top-3 Bank Recommendations

This is the **quantitative engine**. The policy summaries above are the
human-readable map; Algorithm A turns them into numbers. (Implemented in
`engine.ts` + `ranking.ts`; see `CALCULATIONS.md` for the exact formulas.)

**Step 1 — Read the client's structured inputs.** ClientProfile, IncomeSource,
ExpenseSummary, Properties, ExistingDebt and LoanScenario are loaded. In the
portal this is automated: the admin "Recommended Lenders (Top 3)" panel and the
"Which Bank?" client dropdown both call
`GET /api/admin/clients/:id/bank-recommendations`, which extracts the saved data
(no re-entry).

**Step 2 — Identify matching/mismatching patterns against each bank's policy.**
- High-PAYG, low-debt, high-deposit → favour banks with strong owner-occ LVR and relaxed DTI.
- Many investment properties + rental → favour banks that accept more rental and assess more properties (Macquarie, HSBC, NAB).
- Self-employed → favour banks with better business-income acceptance (Macquarie, Bendigo).

**Step 3 — Score each bank (0–1) across weighted dimensions.**
- Serviceability comfort (0.35) — buffer between modelled capacity and the target loan.
- DTI comfort (0.20) — headroom below the bank's DTI band.
- LVR comfort (0.15) — headroom below the bank's LVR cap.
- Product/income-type fit (0.15) — purpose + P&I/IO supported; PAYG vs rental vs business alignment.
- Property-portfolio friendliness (0.10) — property count + selection strategy.
- Income friendliness (0.05) — rental + business acceptance.

**Step 4 — Rank and return the top-3.** Sorted PASS → MARGINAL → FAIL, then by
score: a **Primary** recommendation (highest, strong fit), a **Secondary**
option, and a **third "stretch"** option (fits with some watch-outs).

**Agent-in-the-DB note.** An embedding/semantic search over these policy
documents can retrieve the relevant sections (e.g. "rental acceptance",
"property count", "DTI band") for the client's situation and feed those
parameters into the scoring function — but all financial modelling lives in the
algorithm, not in the prose.

---

# Search Algorithm B – Scenario Pattern Matching

Algorithm B is the **qualitative pre-filter** — tags and policy fit, not deep
numbers. (Implemented in `patterns.ts`; it runs before Algorithm A.)

**Canonical client patterns.** FHB PAYG couple, upgrader family with children,
portfolio investor (multiple investment properties), self-employed professional,
and commercial-property buyer.

**Bank policy tags.** Each bank document is tagged, e.g. *FHB-friendly*,
*portfolio-investor-friendly*, *self-employed-friendly*, *commercial-friendly*,
*conservative-baseline*, *tight-DTI*.

**How it works.**
- Classify the client's profile into one or more patterns from their data.
- Map those patterns to desired tags (e.g. portfolio investor → portfolio-investor-friendly + investor-friendly).
- Select the banks whose tags overlap — the candidate cluster. If too few match, fall back to all banks so Algorithm A still has room.

**B then A.** The portal first runs **B** to narrow to a sensible cluster (e.g.
a five-property investor → Macquarie/HSBC/NAB/ANZ/Bendigo), then runs **A** to
score precisely inside that cluster and produce the final ordered top-3. This
keeps recommendations both *relevant* (right kind of lender) and *accurate*
(numerically serviceable).
