/**
 * 2026 Bank Policy Engine — backtest / regression harness.
 *
 * Runs the full matrix of canonical client scenarios across every bank policy
 * and (a) produces a report, (b) checks engine invariants that must always hold,
 * and (c) can diff results against a saved baseline to catch regressions.
 *
 * This is how we "backtest" the engine: deterministic outputs over a fixed
 * scenario set, with hard invariants asserted.
 */

import { BankPolicy } from './types';
import { runBankCalc } from './engine';
import { rankBanksForScenario } from './ranking';
import { CANONICAL_SCENARIOS } from './policyImpact';
import { rateShockStress, borrowingConfidenceBand } from './loanMath';

export interface BacktestCell {
  scenarioId: string;
  brandCode: string;
  finalMaxBorrow: number;
  passFail: string;
  dti: number;
  lvr: number;
  survivesRateShock: boolean;
}

export interface InvariantViolation { scenarioId: string; brandCode: string; rule: string; detail: string }

export interface BacktestReport {
  generatedAt: string;
  scenarioCount: number;
  bankCount: number;
  cells: BacktestCell[];
  topPickByScenario: Record<string, string>;
  confidenceByScenario: Record<string, { low: number; expected: number; high: number }>;
  invariantViolations: InvariantViolation[];
  summary: { totalRuns: number; passes: number; fails: number; rateShockSurvivors: number; invariantsOk: boolean };
}

/** Invariants that must hold for every (scenario, bank) result. */
function checkInvariants(scenarioId: string, p: BankPolicy, cell: BacktestCell, raw: ReturnType<typeof runBankCalc>): InvariantViolation[] {
  const v: InvariantViolation[] = [];
  const add = (rule: string, detail: string) => v.push({ scenarioId, brandCode: p.brandCode, rule, detail });

  if (cell.finalMaxBorrow < 0) add('non_negative_borrow', `finalMaxBorrow=${cell.finalMaxBorrow}`);
  if (raw.finalMaxBorrow > raw.maxBorrowServiceability && raw.finalMaxBorrow > raw.maxBorrowDti && raw.finalMaxBorrow > raw.maxBorrowLvr) {
    add('final_is_min_of_caps', `final ${raw.finalMaxBorrow} exceeds all three caps`);
  }
  if (cell.lvr < 0) add('non_negative_lvr', `lvr=${cell.lvr}`);
  if (!['PASS', 'MARGINAL', 'FAIL'].includes(cell.passFail)) add('valid_passfail', cell.passFail);
  if (cell.passFail === 'PASS' && cell.finalMaxBorrow < CANONICAL_SCENARIOS.find((s) => s.id === scenarioId)!.input.scenario.targetLoanAmount) {
    add('pass_covers_target', `PASS but max ${cell.finalMaxBorrow} < target`);
  }
  return v;
}

/** Run the full backtest across canonical scenarios × banks. */
export function runBacktest(policies: BankPolicy[]): BacktestReport {
  const cells: BacktestCell[] = [];
  const violations: InvariantViolation[] = [];
  const topPickByScenario: Record<string, string> = {};
  const confidenceByScenario: Record<string, { low: number; expected: number; high: number }> = {};

  for (const { id, input } of CANONICAL_SCENARIOS) {
    for (const policy of policies) {
      const raw = runBankCalc(input, policy);
      const shock = rateShockStress(input, policy, 300);
      const cell: BacktestCell = {
        scenarioId: id, brandCode: policy.brandCode,
        finalMaxBorrow: raw.finalMaxBorrow, passFail: raw.passFail,
        dti: raw.dtiRatio, lvr: raw.lvrRatio, survivesRateShock: shock.survives,
      };
      cells.push(cell);
      violations.push(...checkInvariants(id, policy, cell, raw));
    }
    const ranked = rankBanksForScenario(input, policies);
    topPickByScenario[id] = ranked[0]?.brandCode ?? '';
    // Confidence band from the top pick's policy.
    const top = policies.find((p) => p.brandCode === ranked[0]?.brandCode);
    if (top) { const b = borrowingConfidenceBand(input, top); confidenceByScenario[id] = { low: b.low, expected: b.expected, high: b.high }; }
  }

  const passes = cells.filter((c) => c.passFail === 'PASS').length;
  const fails = cells.filter((c) => c.passFail === 'FAIL').length;
  const rateShockSurvivors = cells.filter((c) => c.survivesRateShock).length;

  return {
    generatedAt: new Date().toISOString(),
    scenarioCount: CANONICAL_SCENARIOS.length,
    bankCount: policies.length,
    cells,
    topPickByScenario,
    confidenceByScenario,
    invariantViolations: violations,
    summary: { totalRuns: cells.length, passes, fails, rateShockSurvivors, invariantsOk: violations.length === 0 },
  };
}

/** Compare a fresh run to a baseline; returns cells whose key numbers moved. */
export function diffBacktest(baseline: BacktestCell[], current: BacktestCell[]): Array<{ scenarioId: string; brandCode: string; field: string; before: number | string; after: number | string }> {
  const key = (c: BacktestCell) => `${c.scenarioId}:${c.brandCode}`;
  const baseMap = new Map(baseline.map((c) => [key(c), c]));
  const out: Array<{ scenarioId: string; brandCode: string; field: string; before: number | string; after: number | string }> = [];
  for (const c of current) {
    const b = baseMap.get(key(c));
    if (!b) continue;
    if (b.finalMaxBorrow !== c.finalMaxBorrow) out.push({ scenarioId: c.scenarioId, brandCode: c.brandCode, field: 'finalMaxBorrow', before: b.finalMaxBorrow, after: c.finalMaxBorrow });
    if (b.passFail !== c.passFail) out.push({ scenarioId: c.scenarioId, brandCode: c.brandCode, field: 'passFail', before: b.passFail, after: c.passFail });
  }
  return out;
}
