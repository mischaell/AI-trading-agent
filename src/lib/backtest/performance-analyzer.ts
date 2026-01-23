/**
 * Performance Analyzer
 *
 * Calculates comprehensive performance metrics from trade outcomes:
 * - Win rate, profit factor, expectancy
 * - Performance by mode, grade, market state
 * - Equity curve and drawdown
 * - Insights and recommendations
 *
 * @module backtest/performance-analyzer
 */

import Decimal from "decimal.js";
import type {
  TradeOutcome,
  PerformanceMetrics,
  PerformanceByCategory,
  PerformanceComparison,
  DailyBacktestResult,
  BacktestResult,
  BacktestConfig,
  EntryMode,
  Grade,
  MarketState,
  DiscordTradeOutcome,
} from "./types";
import { aggregateOutcomes, filterExecuted, filterWinners, filterLosers } from "./outcome-calculator";

// =============================================================================
// Metric Calculation Helpers
// =============================================================================

/**
 * Calculate basic performance metrics from outcomes
 */
function calculateMetrics(outcomes: TradeOutcome[]): PerformanceMetrics {
  const executed = outcomes.filter((o) => o.was_executed);
  const withR = executed.filter((o) => o.r_achieved !== null);

  const winners = withR.filter((o) => o.r_achieved! > 0);
  const losers = withR.filter((o) => o.r_achieved! <= 0);
  const breakeven = withR.filter((o) => o.r_achieved === 0);

  // Win rate
  const winRate = withR.length > 0 ? winners.length / withR.length : 0;

  // R calculations
  const totalR = withR.reduce((sum, o) => sum + (o.r_achieved || 0), 0);
  const avgWinnerR = winners.length > 0
    ? winners.reduce((sum, o) => sum + (o.r_achieved || 0), 0) / winners.length
    : 0;
  const avgLoserR = losers.length > 0
    ? losers.reduce((sum, o) => sum + (o.r_achieved || 0), 0) / losers.length
    : 0;

  const largestWinnerR = winners.length > 0
    ? Math.max(...winners.map((o) => o.r_achieved || 0))
    : 0;
  const largestLoserR = losers.length > 0
    ? Math.min(...losers.map((o) => o.r_achieved || 0))
    : 0;

  // Profit factor
  const grossProfit = winners.reduce((sum, o) => sum + (o.r_achieved || 0), 0);
  const grossLoss = Math.abs(losers.reduce((sum, o) => sum + (o.r_achieved || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Expectancy
  const expectancy = withR.length > 0
    ? (winRate * avgWinnerR) + ((1 - winRate) * avgLoserR)
    : 0;

  // Holding periods
  const holdingDays = withR.filter((o) => o.holding_days !== null);
  const avgHoldingDays = holdingDays.length > 0
    ? holdingDays.reduce((sum, o) => sum + (o.holding_days || 0), 0) / holdingDays.length
    : 0;

  const winnerHoldingDays = winners.filter((o) => o.holding_days !== null);
  const avgWinnerHoldingDays = winnerHoldingDays.length > 0
    ? winnerHoldingDays.reduce((sum, o) => sum + (o.holding_days || 0), 0) / winnerHoldingDays.length
    : 0;

  const loserHoldingDays = losers.filter((o) => o.holding_days !== null);
  const avgLoserHoldingDays = loserHoldingDays.length > 0
    ? loserHoldingDays.reduce((sum, o) => sum + (o.holding_days || 0), 0) / loserHoldingDays.length
    : 0;

  // Exit analysis
  const hit2r = withR.filter((o) => o.exit_reason === "hit_2r" || o.exit_reason === "hit_3r");
  const stoppedOut = withR.filter((o) => o.exit_reason === "stopped_out");
  const manualClose = withR.filter((o) =>
    o.exit_reason === "manual_close_profit" || o.exit_reason === "manual_close_loss"
  );

  const hit2rRate = withR.length > 0 ? hit2r.length / withR.length : 0;
  const stoppedOutRate = withR.length > 0 ? stoppedOut.length / withR.length : 0;
  const manualCloseRate = withR.length > 0 ? manualClose.length / withR.length : 0;

  // Execution quality
  const withPriceVariance = executed.filter((o) => o.execution_price_variance !== null);
  const avgPriceVariance = withPriceVariance.length > 0
    ? withPriceVariance.reduce((sum, o) => sum + Math.abs(o.execution_price_variance || 0), 0) / withPriceVariance.length
    : 0;

  const withSizeVariance = executed.filter((o) => o.execution_size_variance !== null);
  const avgSizeVariance = withSizeVariance.length > 0
    ? withSizeVariance.reduce((sum, o) => sum + Math.abs(o.execution_size_variance || 0), 0) / withSizeVariance.length
    : 0;

  const sameDayExecutions = executed.filter((o) => o.execution_day_diff === 0);
  const sameDayExecutionRate = executed.length > 0 ? sameDayExecutions.length / executed.length : 0;

  return {
    period_start: "",
    period_end: "",
    total_recommendations: outcomes.length,
    executed_count: executed.length,
    skipped_count: outcomes.length - executed.length,
    total_trades: withR.length,
    winning_trades: winners.length,
    losing_trades: losers.length,
    breakeven_trades: breakeven.length,
    win_rate: winRate,
    total_r: totalR,
    avg_winner_r: avgWinnerR,
    avg_loser_r: avgLoserR,
    largest_winner_r: largestWinnerR,
    largest_loser_r: largestLoserR,
    profit_factor: profitFactor,
    expectancy,
    avg_holding_days: avgHoldingDays,
    avg_winner_holding_days: avgWinnerHoldingDays,
    avg_loser_holding_days: avgLoserHoldingDays,
    hit_2r_rate: hit2rRate,
    stopped_out_rate: stoppedOutRate,
    manual_close_rate: manualCloseRate,
    avg_price_variance: avgPriceVariance,
    avg_size_variance: avgSizeVariance,
    same_day_execution_rate: sameDayExecutionRate,
  };
}

/**
 * Calculate metrics by category
 */
function calculateMetricsByCategory(outcomes: TradeOutcome[]): PerformanceByCategory {
  // By Mode
  const byMode: Record<EntryMode, PerformanceMetrics> = {
    MODE1: calculateMetrics(outcomes.filter((o) => o.recommendation.candidate.mode === "MODE1")),
    MODE2: calculateMetrics(outcomes.filter((o) => o.recommendation.candidate.mode === "MODE2")),
  };

  // By Grade
  const byGrade: Record<Grade, PerformanceMetrics> = {
    A: calculateMetrics(outcomes.filter((o) => o.recommendation.candidate.grade === "A")),
    B: calculateMetrics(outcomes.filter((o) => o.recommendation.candidate.grade === "B")),
    C: calculateMetrics(outcomes.filter((o) => o.recommendation.candidate.grade === "C")),
  };

  // By Market State
  const marketStates: MarketState[] = [
    "CONFIRMED_UPTREND",
    "RALLY_ATTEMPT",
    "UPTREND_UNDER_PRESSURE",
    "PULLBACK",
    "CORRECTION",
    "DOWNTREND",
  ];

  const byMarketState: Record<MarketState, PerformanceMetrics> = {} as Record<MarketState, PerformanceMetrics>;
  for (const state of marketStates) {
    byMarketState[state] = calculateMetrics(
      outcomes.filter((o) => o.recommendation.market_state === state)
    );
  }

  // By Setup Type
  const setupTypes = new Set(outcomes.map((o) => o.recommendation.candidate.setup_type));
  const bySetupType: Record<string, PerformanceMetrics> = {};
  for (const setup of setupTypes) {
    bySetupType[setup] = calculateMetrics(
      outcomes.filter((o) => o.recommendation.candidate.setup_type === setup)
    );
  }

  return {
    by_mode: byMode,
    by_grade: byGrade,
    by_market_state: byMarketState,
    by_setup_type: bySetupType,
  };
}

// =============================================================================
// Equity Curve Calculation
// =============================================================================

interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

/**
 * Calculate equity curve from daily results
 */
function calculateEquityCurve(
  results: DailyBacktestResult[],
  initialEquity: number
): { curve: EquityPoint[]; maxDrawdown: number; maxDrawdownDate: string } {
  const curve: EquityPoint[] = [];
  let equity = initialEquity;
  let peakEquity = initialEquity;
  let maxDrawdown = 0;
  let maxDrawdownDate = "";

  // Sort results by date
  const sortedResults = [...results].sort((a, b) => a.date.localeCompare(b.date));

  for (const result of sortedResults) {
    // Calculate daily P&L from closed trades
    let dailyPL = 0;

    for (const outcome of result.outcomes) {
      if (outcome.was_executed && outcome.r_achieved !== null) {
        // Estimate P&L based on position size and R
        const positionDollars = outcome.recommendation.position_dollars;
        const rPerShare = outcome.recommendation.r_per_share;
        const shares = outcome.recommendation.shares;

        // P&L = R achieved * R per share * shares
        const pl = outcome.r_achieved * rPerShare * shares;
        dailyPL += pl;
      }
    }

    equity += dailyPL;

    // Update peak and drawdown
    if (equity > peakEquity) {
      peakEquity = equity;
    }

    const drawdown = ((peakEquity - equity) / peakEquity) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownDate = result.date;
    }

    curve.push({
      date: result.date,
      equity,
      drawdown,
    });
  }

  return { curve, maxDrawdown, maxDrawdownDate };
}

// =============================================================================
// Insight Generation
// =============================================================================

/**
 * Generate insights from performance data
 */
function generateInsights(
  overall: PerformanceMetrics,
  byCategory: PerformanceByCategory
): string[] {
  const insights: string[] = [];

  // Win rate insights
  if (overall.win_rate >= 0.6) {
    insights.push(`Strong win rate of ${(overall.win_rate * 100).toFixed(1)}%`);
  } else if (overall.win_rate < 0.5) {
    insights.push(`Win rate below 50% (${(overall.win_rate * 100).toFixed(1)}%) - consider tightening entry criteria`);
  }

  // Mode comparison
  const mode1WinRate = byCategory.by_mode.MODE1.win_rate;
  const mode2WinRate = byCategory.by_mode.MODE2.win_rate;
  const modeDiff = Math.abs(mode1WinRate - mode2WinRate) * 100;

  if (modeDiff >= 10) {
    const betterMode = mode1WinRate > mode2WinRate ? "MODE1" : "MODE2";
    const worseModeWin = Math.min(mode1WinRate, mode2WinRate) * 100;
    const betterModeWin = Math.max(mode1WinRate, mode2WinRate) * 100;
    insights.push(
      `${betterMode} outperforms by ${modeDiff.toFixed(1)}% win rate (${betterModeWin.toFixed(1)}% vs ${worseModeWin.toFixed(1)}%)`
    );
  }

  // Grade comparison
  const gradeAWinRate = byCategory.by_grade.A.win_rate;
  const gradeBWinRate = byCategory.by_grade.B.win_rate;

  if (gradeAWinRate < gradeBWinRate && gradeBWinRate - gradeAWinRate > 0.1) {
    insights.push(
      `Grade B trades outperforming Grade A - review grading criteria`
    );
  }

  // Profit factor
  if (overall.profit_factor >= 2.0) {
    insights.push(`Excellent profit factor of ${overall.profit_factor.toFixed(2)}`);
  } else if (overall.profit_factor < 1.5) {
    insights.push(`Profit factor of ${overall.profit_factor.toFixed(2)} - aim for 2.0+`);
  }

  // Hit 2R rate
  if (overall.hit_2r_rate >= 0.4) {
    insights.push(`${(overall.hit_2r_rate * 100).toFixed(1)}% of trades hit 2R target`);
  } else if (overall.hit_2r_rate < 0.25) {
    insights.push(`Low 2R hit rate (${(overall.hit_2r_rate * 100).toFixed(1)}%) - consider adjusting targets`);
  }

  // Stopped out rate
  if (overall.stopped_out_rate > 0.4) {
    insights.push(
      `High stop-out rate (${(overall.stopped_out_rate * 100).toFixed(1)}%) - stops may be too tight`
    );
  }

  // Best setup type
  const setupEntries = Object.entries(byCategory.by_setup_type);
  const bestSetup = setupEntries
    .filter(([_, m]) => m.total_trades >= 5)
    .sort((a, b) => b[1].win_rate - a[1].win_rate)[0];

  if (bestSetup && bestSetup[1].win_rate >= 0.6) {
    insights.push(
      `Best setup: "${bestSetup[0]}" with ${(bestSetup[1].win_rate * 100).toFixed(1)}% win rate (${bestSetup[1].total_trades} trades)`
    );
  }

  // Expectancy
  if (overall.expectancy >= 0.5) {
    insights.push(`Positive expectancy of ${overall.expectancy.toFixed(2)}R per trade`);
  }

  // Holding period analysis
  if (overall.avg_winner_holding_days < overall.avg_loser_holding_days) {
    insights.push(
      `Winners exit faster (${overall.avg_winner_holding_days.toFixed(1)} days) than losers (${overall.avg_loser_holding_days.toFixed(1)} days) - good discipline`
    );
  }

  return insights;
}

// =============================================================================
// Performance Analyzer
// =============================================================================

export class PerformanceAnalyzer {
  /**
   * Analyze backtest results and generate full report
   */
  analyze(
    results: DailyBacktestResult[],
    config: BacktestConfig
  ): BacktestResult {
    // Aggregate all outcomes
    const allOutcomes = aggregateOutcomes(results);

    // Calculate overall performance
    const overallPerformance = calculateMetrics(allOutcomes);
    overallPerformance.period_start = config.start_date;
    overallPerformance.period_end = config.end_date;

    // Calculate by category
    const performanceByCategory = calculateMetricsByCategory(allOutcomes);

    // Calculate comparison (agent vs actual)
    const executedOutcomes = allOutcomes.filter((o) => o.was_executed);
    const agentMetrics = calculateMetrics(allOutcomes); // All recommendations
    const actualMetrics = calculateMetrics(executedOutcomes); // Only executed

    // Simulate newsletter-only picks (if we had that data)
    // For now, just compare agent vs actual
    const comparison: PerformanceComparison = {
      agent_recommendations: agentMetrics,
      actual_execution: actualMetrics,
      newsletter_picks: null,
      random_baseline: null,
    };

    // Calculate equity curve
    const { curve, maxDrawdown, maxDrawdownDate } = calculateEquityCurve(
      results,
      config.initial_equity
    );

    // Find best/worst trades
    const sortedByR = [...executedOutcomes]
      .filter((o) => o.r_achieved !== null)
      .sort((a, b) => (b.r_achieved || 0) - (a.r_achieved || 0));

    const bestTrades = sortedByR.slice(0, 5);
    const worstTrades = sortedByR.slice(-5).reverse();

    // Generate insights
    const insights = generateInsights(overallPerformance, performanceByCategory);

    return {
      config,
      daily_results: results,
      overall_performance: overallPerformance,
      performance_by_category: performanceByCategory,
      comparison,
      equity_curve: curve,
      max_drawdown: maxDrawdown,
      max_drawdown_date: maxDrawdownDate,
      best_trades: bestTrades,
      worst_trades: worstTrades,
      insights,
    };
  }

  /**
   * Generate summary report as formatted string
   */
  generateReport(result: BacktestResult): string {
    const { overall_performance: p, performance_by_category: cat, insights } = result;

    let report = "";

    report += "═".repeat(70) + "\n";
    report += "                    BACKTEST PERFORMANCE REPORT\n";
    report += "═".repeat(70) + "\n\n";

    report += `Period: ${result.config.start_date} to ${result.config.end_date}\n`;
    report += `Initial Equity: $${result.config.initial_equity.toLocaleString()}\n\n`;

    // Overall Stats
    report += "─".repeat(70) + "\n";
    report += "OVERALL PERFORMANCE\n";
    report += "─".repeat(70) + "\n";
    report += `Total Recommendations: ${p.total_recommendations}\n`;
    report += `Executed:              ${p.executed_count} (${((p.executed_count / p.total_recommendations) * 100).toFixed(1)}%)\n`;
    report += `Trades with Outcome:   ${p.total_trades}\n\n`;

    report += `Win Rate:              ${(p.win_rate * 100).toFixed(1)}% (${p.winning_trades}W / ${p.losing_trades}L)\n`;
    report += `Profit Factor:         ${p.profit_factor === Infinity ? "∞" : p.profit_factor.toFixed(2)}\n`;
    report += `Expectancy:            ${p.expectancy.toFixed(2)}R per trade\n`;
    report += `Total R:               ${p.total_r >= 0 ? "+" : ""}${p.total_r.toFixed(2)}R\n\n`;

    report += `Avg Winner:            +${p.avg_winner_r.toFixed(2)}R\n`;
    report += `Avg Loser:             ${p.avg_loser_r.toFixed(2)}R\n`;
    report += `Largest Winner:        +${p.largest_winner_r.toFixed(2)}R\n`;
    report += `Largest Loser:         ${p.largest_loser_r.toFixed(2)}R\n\n`;

    // Exit Analysis
    report += "─".repeat(70) + "\n";
    report += "EXIT ANALYSIS\n";
    report += "─".repeat(70) + "\n";
    report += `Hit 2R Target:         ${(p.hit_2r_rate * 100).toFixed(1)}%\n`;
    report += `Stopped Out:           ${(p.stopped_out_rate * 100).toFixed(1)}%\n`;
    report += `Manual Close:          ${(p.manual_close_rate * 100).toFixed(1)}%\n\n`;

    report += `Avg Holding (all):     ${p.avg_holding_days.toFixed(1)} days\n`;
    report += `Avg Holding (winners): ${p.avg_winner_holding_days.toFixed(1)} days\n`;
    report += `Avg Holding (losers):  ${p.avg_loser_holding_days.toFixed(1)} days\n\n`;

    // By Mode
    report += "─".repeat(70) + "\n";
    report += "PERFORMANCE BY MODE\n";
    report += "─".repeat(70) + "\n";
    report += `MODE1 (Weakness):      ${(cat.by_mode.MODE1.win_rate * 100).toFixed(1)}% win rate, ${cat.by_mode.MODE1.total_trades} trades, ${cat.by_mode.MODE1.expectancy.toFixed(2)}R expectancy\n`;
    report += `MODE2 (Reclaim):       ${(cat.by_mode.MODE2.win_rate * 100).toFixed(1)}% win rate, ${cat.by_mode.MODE2.total_trades} trades, ${cat.by_mode.MODE2.expectancy.toFixed(2)}R expectancy\n\n`;

    // By Grade
    report += "─".repeat(70) + "\n";
    report += "PERFORMANCE BY GRADE\n";
    report += "─".repeat(70) + "\n";
    report += `Grade A:               ${(cat.by_grade.A.win_rate * 100).toFixed(1)}% win rate, ${cat.by_grade.A.total_trades} trades\n`;
    report += `Grade B:               ${(cat.by_grade.B.win_rate * 100).toFixed(1)}% win rate, ${cat.by_grade.B.total_trades} trades\n`;
    report += `Grade C:               ${(cat.by_grade.C.win_rate * 100).toFixed(1)}% win rate, ${cat.by_grade.C.total_trades} trades\n\n`;

    // Equity Curve Summary
    report += "─".repeat(70) + "\n";
    report += "EQUITY CURVE\n";
    report += "─".repeat(70) + "\n";
    const finalEquity = result.equity_curve[result.equity_curve.length - 1]?.equity || result.config.initial_equity;
    const totalReturn = ((finalEquity - result.config.initial_equity) / result.config.initial_equity) * 100;
    report += `Final Equity:          $${finalEquity.toLocaleString()}\n`;
    report += `Total Return:          ${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2)}%\n`;
    report += `Max Drawdown:          -${result.max_drawdown.toFixed(2)}% (${result.max_drawdown_date})\n\n`;

    // Insights
    report += "─".repeat(70) + "\n";
    report += "INSIGHTS\n";
    report += "─".repeat(70) + "\n";
    for (const insight of insights) {
      report += `• ${insight}\n`;
    }
    report += "\n";

    // Best Trades
    report += "─".repeat(70) + "\n";
    report += "TOP 5 TRADES\n";
    report += "─".repeat(70) + "\n";
    for (const trade of result.best_trades) {
      report += `${trade.recommendation.ticker} (${trade.recommendation.date}): +${trade.r_achieved?.toFixed(2)}R - ${trade.exit_reason}\n`;
    }
    report += "\n";

    // Worst Trades
    report += "─".repeat(70) + "\n";
    report += "WORST 5 TRADES\n";
    report += "─".repeat(70) + "\n";
    for (const trade of result.worst_trades) {
      report += `${trade.recommendation.ticker} (${trade.recommendation.date}): ${trade.r_achieved?.toFixed(2)}R - ${trade.exit_reason}\n`;
    }
    report += "\n";

    // Discord Trade Breakdown
    const allDiscordOutcomes = result.daily_results.flatMap((r) => r.discord_outcomes || []);
    if (allDiscordOutcomes.length > 0) {
      report += "─".repeat(70) + "\n";
      report += "DISCORD TRADE BREAKDOWN (All ENTRY/ADD)\n";
      report += "─".repeat(70) + "\n";

      const matched = allDiscordOutcomes.filter((o) => o.match_type !== "unmatched");
      const unmatched = allDiscordOutcomes.filter((o) => o.match_type === "unmatched");

      report += `Total Discord Trades:  ${allDiscordOutcomes.length}\n`;
      report += `Matched (on-thesis):   ${matched.length} (${((matched.length / allDiscordOutcomes.length) * 100).toFixed(1)}%)\n`;
      report += `Unmatched (off-thesis): ${unmatched.length} (${((unmatched.length / allDiscordOutcomes.length) * 100).toFixed(1)}%)\n\n`;

      // Calculate win rates for matched vs unmatched
      const matchedWithR = matched.filter((o) => o.r_achieved !== null);
      const unmatchedWithR = unmatched.filter((o) => o.r_achieved !== null);

      const matchedWinners = matchedWithR.filter((o) => (o.r_achieved || 0) > 0);
      const unmatchedWinners = unmatchedWithR.filter((o) => (o.r_achieved || 0) > 0);

      if (matchedWithR.length > 0) {
        const matchedWinRate = (matchedWinners.length / matchedWithR.length) * 100;
        const matchedAvgR = matchedWithR.reduce((s, o) => s + (o.r_achieved || 0), 0) / matchedWithR.length;
        report += `Matched Win Rate:      ${matchedWinRate.toFixed(1)}% (${matchedWinners.length}/${matchedWithR.length}), Avg R: ${matchedAvgR.toFixed(2)}\n`;
      }

      if (unmatchedWithR.length > 0) {
        const unmatchedWinRate = (unmatchedWinners.length / unmatchedWithR.length) * 100;
        const unmatchedAvgR = unmatchedWithR.reduce((s, o) => s + (o.r_achieved || 0), 0) / unmatchedWithR.length;
        report += `Unmatched Win Rate:    ${unmatchedWinRate.toFixed(1)}% (${unmatchedWinners.length}/${unmatchedWithR.length}), Avg R: ${unmatchedAvgR.toFixed(2)}\n`;
      }

      // Show unmatched tickers
      if (unmatched.length > 0) {
        const unmatchedTickers = [...new Set(unmatched.map((o) => o.trade.ticker))].sort();
        report += `\nOff-Thesis Tickers:    ${unmatchedTickers.join(", ")}\n`;
      }
    }

    report += "\n" + "═".repeat(70) + "\n";

    return report;
  }
}

// =============================================================================
// Exports
// =============================================================================

export default {
  PerformanceAnalyzer,
  calculateMetrics,
  calculateMetricsByCategory,
  calculateEquityCurve,
  generateInsights,
};
