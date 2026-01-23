/**
 * Backtest Runner
 *
 * Run with: npx tsx src/lib/backtest/__tests__/run-backtest.ts
 *
 * Runs a full backtest on historical data and generates a performance report.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { ReplayEngine } from "../replay-engine";
import { OutcomeCalculator } from "../outcome-calculator";
import { PerformanceAnalyzer } from "../performance-analyzer";
import type { BacktestConfig, ScoringWeights } from "../types";

// =============================================================================
// Configuration
// =============================================================================

// Default to last 30 days
const today = new Date();
const endDate = today.toISOString().split("T")[0];
const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

const config: BacktestConfig = {
  start_date: process.argv[2] || startDate,
  end_date: process.argv[3] || endDate,
  initial_equity: 100000,
  max_positions: 8,
  max_sector_concentration: 0.3,
  max_portfolio_heat: 2.0,
  max_position_size: 0.15,
  weights: {
    grade: { A: 30, B: 20, C: 10 },
    distance: { perfect: 25, good: 15, acceptable: 5 },
    mode: { MODE1: 10, MODE2: 15 },
    contraction: 10,
    close_range_max: 10,
    rs: { high: 10, medium: 7, low: 4 },
  },
  slippage_bps: 5,
  commission_per_trade: 0,
  use_newsletter_data: true,
  use_discord_data: true,
};

// =============================================================================
// Main
// =============================================================================

async function runBacktest() {
  console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
  console.log("║                        TRADING AGENT BACKTEST                              ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`Period: ${config.start_date} to ${config.end_date}`);
  console.log(`Initial Equity: $${config.initial_equity.toLocaleString()}`);
  console.log();

  // Step 1: Initialize replay engine
  console.log("─".repeat(70));
  console.log("Step 1: Initializing Replay Engine");
  console.log("─".repeat(70));

  const replayEngine = new ReplayEngine(
    config.start_date,
    config.end_date,
    {
      weights: config.weights,
      equity: config.initial_equity,
      maxPositions: config.max_positions,
      newsletterBoost: true,
    }
  );

  await replayEngine.initialize();
  console.log("✓ Data loader initialized\n");

  // Step 2: Replay all dates
  console.log("─".repeat(70));
  console.log("Step 2: Replaying Trading Days");
  console.log("─".repeat(70));

  const dailyResults = await replayEngine.replayAll((completed, total, date) => {
    const pct = ((completed / total) * 100).toFixed(1);
    process.stdout.write(`\r  Processing: ${completed}/${total} (${pct}%) - ${date}`);
  });

  console.log("\n✓ Replay complete\n");

  // Step 3: Calculate outcomes
  console.log("─".repeat(70));
  console.log("Step 3: Calculating Trade Outcomes");
  console.log("─".repeat(70));

  const outcomeCalculator = new OutcomeCalculator({
    maxHoldingDays: 60,
    useClosingStops: true,
    slippageBps: config.slippage_bps,
  });

  const loader = replayEngine.getLoader();
  const resultsWithOutcomes = await outcomeCalculator.processAllResults(
    dailyResults,
    loader,
    (completed, total) => {
      const pct = ((completed / total) * 100).toFixed(1);
      process.stdout.write(`\r  Calculating: ${completed}/${total} (${pct}%)`);
    }
  );

  console.log("\n✓ Outcomes calculated\n");

  // Step 4: Analyze performance
  console.log("─".repeat(70));
  console.log("Step 4: Analyzing Performance");
  console.log("─".repeat(70));

  const analyzer = new PerformanceAnalyzer();
  const backtestResult = analyzer.analyze(resultsWithOutcomes, config);

  console.log("✓ Analysis complete\n");

  // Step 5: Generate report
  console.log("─".repeat(70));
  console.log("Step 5: Performance Report");
  console.log("─".repeat(70));
  console.log();

  const report = analyzer.generateReport(backtestResult);
  console.log(report);

  // Summary stats
  const totalRecs = backtestResult.overall_performance.total_recommendations;
  const executed = backtestResult.overall_performance.executed_count;
  const winRate = backtestResult.overall_performance.win_rate * 100;
  const profitFactor = backtestResult.overall_performance.profit_factor;

  console.log("╔═══════════════════════════════════════════════════════════════════════════╗");
  console.log("║                              SUMMARY                                       ║");
  console.log("╠═══════════════════════════════════════════════════════════════════════════╣");
  console.log(`║  Days Analyzed:     ${dailyResults.length.toString().padEnd(52)}║`);
  console.log(`║  Recommendations:   ${totalRecs.toString().padEnd(52)}║`);
  console.log(`║  Executed:          ${executed.toString().padEnd(52)}║`);
  console.log(`║  Win Rate:          ${winRate.toFixed(1).padEnd(51)}%║`);
  console.log(`║  Profit Factor:     ${(profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)).padEnd(52)}║`);
  console.log(`║  Max Drawdown:      ${backtestResult.max_drawdown.toFixed(2).padEnd(51)}%║`);
  console.log("╚═══════════════════════════════════════════════════════════════════════════╝");
}

// =============================================================================
// Run
// =============================================================================

runBacktest()
  .then(() => {
    console.log("\n✓ Backtest complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n✗ Backtest failed:", error);
    process.exit(1);
  });
