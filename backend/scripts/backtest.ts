/**
 * Runnable backtest: executes the canonical scenario matrix across every bank
 * policy, prints a human-readable report, and exits non-zero if any engine
 * invariant is violated. Run with: `npx ts-node scripts/backtest.ts`.
 */

import { BANK_POLICIES_2026, runBacktest } from '../src/services/bankPolicy';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function main(): void {
  const report = runBacktest(BANK_POLICIES_2026);

  console.log('\n=== 2026 Bank Policy Engine — Backtest ===');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Scenarios: ${report.scenarioCount}  Banks: ${report.bankCount}  Runs: ${report.summary.totalRuns}`);
  console.log(`PASS: ${report.summary.passes}  FAIL: ${report.summary.fails}  Survives +3% shock: ${report.summary.rateShockSurvivors}/${report.summary.totalRuns}`);

  console.log('\n--- Top pick & capacity band per scenario ---');
  for (const [scenarioId, brand] of Object.entries(report.topPickByScenario)) {
    const band = report.confidenceByScenario[scenarioId];
    const range = band ? `${money(band.low)} – ${money(band.expected)} – ${money(band.high)}` : 'n/a';
    console.log(`  ${scenarioId.padEnd(20)} top: ${String(brand).padEnd(5)}  capacity band: ${range}`);
  }

  console.log('\n--- Sample results (first 12 cells) ---');
  for (const c of report.cells.slice(0, 12)) {
    console.log(`  ${c.scenarioId.padEnd(20)} ${c.brandCode.padEnd(5)} max ${money(c.finalMaxBorrow).padStart(12)}  ${c.passFail.padEnd(9)} DTI ${c.dti}  shock ${c.survivesRateShock ? 'OK' : 'X'}`);
  }

  console.log(`\nInvariants OK: ${report.summary.invariantsOk}`);
  if (!report.summary.invariantsOk) {
    console.error('INVARIANT VIOLATIONS:');
    for (const v of report.invariantViolations) console.error(`  [${v.brandCode}/${v.scenarioId}] ${v.rule}: ${v.detail}`);
    process.exit(1);
  }
  console.log('Backtest passed.\n');
}

main();
