/**
 * Outcome Calculator
 *
 * Forward-simulates trades to determine outcomes:
 * - Did it hit 2R target?
 * - Did it get stopped out?
 * - What was the max favorable/adverse excursion?
 *
 * @module backtest/outcome-calculator
 */

import Decimal from "decimal.js";
import { HistoricalDataLoader, fetchOHLC, OHLC } from "./data-loader";
import type {
  TradeRecommendation,
  ActualTrade,
  TradeOutcome,
  ExitReason,
  DailyBacktestResult,
} from "./types";

// =============================================================================
// Types
// =============================================================================

interface SimulationResult {
  exitReason: ExitReason;
  exitDate: string | null;
  exitPrice: number | null;
  rAchieved: number | null;
  holdingDays: number;
  mfeR: number; // Max Favorable Excursion in R
  mfePrice: number;
  mfeDate: string;
  maeR: number; // Max Adverse Excursion in R
  maePrice: number;
  maeDate: string;
}

interface SimulationConfig {
  maxHoldingDays: number; // Max days to simulate
  useClosingStops: boolean; // Stop triggers on close below SSL
  slippageBps: number; // Slippage in basis points
}

const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  maxHoldingDays: 60,
  useClosingStops: true, // Soft stop - exit on close below SSL
  slippageBps: 5,
};

// =============================================================================
// Forward Simulation
// =============================================================================

/**
 * Simulate a trade forward from entry to exit
 */
async function simulateTrade(
  entryDate: string,
  entryPrice: number,
  ssl: number,
  target2R: number,
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG
): Promise<SimulationResult> {
  // Calculate R per share
  const rPerShare = new Decimal(entryPrice).minus(ssl).toNumber();

  if (rPerShare <= 0) {
    return {
      exitReason: "no_entry",
      exitDate: null,
      exitPrice: null,
      rAchieved: null,
      holdingDays: 0,
      mfeR: 0,
      mfePrice: entryPrice,
      mfeDate: entryDate,
      maeR: 0,
      maePrice: entryPrice,
      maeDate: entryDate,
    };
  }

  // Fetch forward price data (dummy ticker - we'll use SPY as proxy for market days)
  // In production, this would use the actual ticker
  const endDate = new Date(entryDate);
  endDate.setDate(endDate.getDate() + config.maxHoldingDays + 5);

  // For now, return a placeholder - in real implementation,
  // we'd fetch actual ticker data
  return {
    exitReason: "still_open",
    exitDate: null,
    exitPrice: null,
    rAchieved: null,
    holdingDays: 0,
    mfeR: 0,
    mfePrice: entryPrice,
    mfeDate: entryDate,
    maeR: 0,
    maePrice: entryPrice,
    maeDate: entryDate,
  };
}

/**
 * Simulate trade with actual price bars
 */
function simulateWithBars(
  entryDate: string,
  entryPrice: number,
  ssl: number,
  target2R: number,
  bars: OHLC[],
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG
): SimulationResult {
  const rPerShare = new Decimal(entryPrice).minus(ssl).toNumber();

  if (rPerShare <= 0) {
    return {
      exitReason: "no_entry",
      exitDate: null,
      exitPrice: null,
      rAchieved: null,
      holdingDays: 0,
      mfeR: 0,
      mfePrice: entryPrice,
      mfeDate: entryDate,
      maeR: 0,
      maePrice: entryPrice,
      maeDate: entryDate,
    };
  }

  // Filter bars to start after entry date
  const futureBars = bars.filter((b) => b.date > entryDate);

  if (futureBars.length === 0) {
    return {
      exitReason: "still_open",
      exitDate: null,
      exitPrice: null,
      rAchieved: null,
      holdingDays: 0,
      mfeR: 0,
      mfePrice: entryPrice,
      mfeDate: entryDate,
      maeR: 0,
      maePrice: entryPrice,
      maeDate: entryDate,
    };
  }

  // Track MFE and MAE
  let mfeR = 0;
  let mfePrice = entryPrice;
  let mfeDate = entryDate;
  let maeR = 0;
  let maePrice = entryPrice;
  let maeDate = entryDate;

  // Simulate day by day
  for (let i = 0; i < Math.min(futureBars.length, config.maxHoldingDays); i++) {
    const bar = futureBars[i];

    // Update MFE (max high)
    const highR = new Decimal(bar.high).minus(entryPrice).div(rPerShare).toNumber();
    if (highR > mfeR) {
      mfeR = highR;
      mfePrice = bar.high;
      mfeDate = bar.date;
    }

    // Update MAE (max low)
    const lowR = new Decimal(bar.low).minus(entryPrice).div(rPerShare).toNumber();
    if (lowR < maeR) {
      maeR = lowR;
      maePrice = bar.low;
      maeDate = bar.date;
    }

    // Check if hit 2R target (high >= target2R)
    if (bar.high >= target2R) {
      const exitPrice = target2R;
      const rAchieved = new Decimal(exitPrice)
        .minus(entryPrice)
        .div(rPerShare)
        .toNumber();

      return {
        exitReason: "hit_2r",
        exitDate: bar.date,
        exitPrice,
        rAchieved,
        holdingDays: i + 1,
        mfeR,
        mfePrice,
        mfeDate,
        maeR,
        maePrice,
        maeDate,
      };
    }

    // Check if stopped out
    if (config.useClosingStops) {
      // Soft stop: close below SSL
      if (bar.close < ssl) {
        // Exit at next day open (simulate with slippage)
        const nextBar = futureBars[i + 1];
        const exitPrice = nextBar
          ? nextBar.open * (1 - config.slippageBps / 10000)
          : bar.close;

        const rAchieved = new Decimal(exitPrice)
          .minus(entryPrice)
          .div(rPerShare)
          .toNumber();

        return {
          exitReason: "stopped_out",
          exitDate: nextBar?.date || bar.date,
          exitPrice,
          rAchieved,
          holdingDays: i + 1,
          mfeR,
          mfePrice,
          mfeDate,
          maeR,
          maePrice,
          maeDate,
        };
      }
    } else {
      // Hard stop: low touches SSL
      if (bar.low <= ssl) {
        const exitPrice = ssl;
        const rAchieved = new Decimal(exitPrice)
          .minus(entryPrice)
          .div(rPerShare)
          .toNumber();

        return {
          exitReason: "stopped_out",
          exitDate: bar.date,
          exitPrice,
          rAchieved,
          holdingDays: i + 1,
          mfeR,
          mfePrice,
          mfeDate,
          maeR,
          maePrice,
          maeDate,
        };
      }
    }

    // Check if hit 3R (extended target)
    const target3R = entryPrice + rPerShare * 3;
    if (bar.high >= target3R) {
      const exitPrice = target3R;
      const rAchieved = 3;

      return {
        exitReason: "hit_3r",
        exitDate: bar.date,
        exitPrice,
        rAchieved,
        holdingDays: i + 1,
        mfeR,
        mfePrice,
        mfeDate,
        maeR,
        maePrice,
        maeDate,
      };
    }
  }

  // Max holding period reached, still open
  const lastBar = futureBars[Math.min(futureBars.length - 1, config.maxHoldingDays - 1)];
  const rAchieved = new Decimal(lastBar.close)
    .minus(entryPrice)
    .div(rPerShare)
    .toNumber();

  return {
    exitReason: "still_open",
    exitDate: lastBar.date,
    exitPrice: lastBar.close,
    rAchieved,
    holdingDays: Math.min(futureBars.length, config.maxHoldingDays),
    mfeR,
    mfePrice,
    mfeDate,
    maeR,
    maePrice,
    maeDate,
  };
}

// =============================================================================
// Outcome Calculator
// =============================================================================

export class OutcomeCalculator {
  private config: SimulationConfig;

  constructor(config: Partial<SimulationConfig> = {}) {
    this.config = { ...DEFAULT_SIMULATION_CONFIG, ...config };
  }

  /**
   * Calculate outcome for a single recommendation
   */
  async calculateOutcome(
    recommendation: TradeRecommendation,
    actualTrade: ActualTrade | null,
    futureBars: OHLC[]
  ): Promise<TradeOutcome> {
    const wasExecuted = actualTrade !== null;

    // If not executed, simulate what would have happened
    if (!wasExecuted) {
      const simResult = simulateWithBars(
        recommendation.date,
        recommendation.entry_price,
        recommendation.ssl,
        recommendation.trim_price_2r,
        futureBars,
        this.config
      );

      return {
        recommendation,
        actual_trade: null,
        was_executed: false,
        execution_price_variance: null,
        execution_size_variance: null,
        execution_day_diff: null,

        entry_date: null,
        exit_date: null,
        exit_reason: "no_entry",
        r_achieved: null,
        gain_pct: null,
        holding_days: null,

        mfe_r: simResult.mfeR,
        mfe_price: simResult.mfePrice,
        mfe_date: simResult.mfeDate,
        mae_r: simResult.maeR,
        mae_price: simResult.maePrice,
        mae_date: simResult.maeDate,

        simulated_exit_reason: simResult.exitReason,
        simulated_r: simResult.rAchieved,
        simulated_holding_days: simResult.holdingDays,
      };
    }

    // Trade was executed - calculate execution quality
    const actualEntry = actualTrade.entry_price || recommendation.entry_price;
    const priceVariance = (actualEntry - recommendation.entry_price) / recommendation.entry_price;

    const actualSizePct = actualTrade.position_pct || recommendation.position_pct;
    const sizeVariance = (actualSizePct - recommendation.position_pct) / recommendation.position_pct;

    // Calculate day difference
    const recDate = new Date(recommendation.date);
    const tradeDate = new Date(actualTrade.date);
    const dayDiff = Math.round((tradeDate.getTime() - recDate.getTime()) / (1000 * 60 * 60 * 24));

    // Use actual SSL if provided, otherwise use recommended
    const actualSSL = actualTrade.ssl || recommendation.ssl;
    const actual2R = actualEntry + (actualEntry - actualSSL) * 2;

    // Simulate from actual entry
    const simResult = simulateWithBars(
      actualTrade.date,
      actualEntry,
      actualSSL,
      actual2R,
      futureBars,
      this.config
    );

    // Determine exit reason from actual trade if available
    let exitReason: ExitReason = simResult.exitReason;
    let rAchieved = simResult.rAchieved;
    let gainPct = null;

    if (actualTrade.r_multiple !== null) {
      rAchieved = actualTrade.r_multiple;
      if (rAchieved >= 2) exitReason = "hit_2r";
      else if (rAchieved <= -0.9) exitReason = "stopped_out";
      else if (rAchieved > 0) exitReason = "manual_close_profit";
      else exitReason = "manual_close_loss";
    }

    if (actualTrade.gain_pct !== null) {
      gainPct = actualTrade.gain_pct;
    }

    return {
      recommendation,
      actual_trade: actualTrade,
      was_executed: true,
      execution_price_variance: priceVariance,
      execution_size_variance: sizeVariance,
      execution_day_diff: dayDiff,

      entry_date: actualTrade.date,
      exit_date: simResult.exitDate,
      exit_reason: exitReason,
      r_achieved: rAchieved,
      gain_pct: gainPct,
      holding_days: simResult.holdingDays,

      mfe_r: simResult.mfeR,
      mfe_price: simResult.mfePrice,
      mfe_date: simResult.mfeDate,
      mae_r: simResult.maeR,
      mae_price: simResult.maePrice,
      mae_date: simResult.maeDate,

      simulated_exit_reason: null,
      simulated_r: null,
      simulated_holding_days: null,
    };
  }

  /**
   * Calculate outcomes for a daily result
   */
  async calculateDailyOutcomes(
    result: DailyBacktestResult,
    loader: HistoricalDataLoader
  ): Promise<TradeOutcome[]> {
    const outcomes: TradeOutcome[] = [];

    for (const rec of result.recommendations) {
      // Find matching actual trade
      const actualTrade = result.actual_trades.find(
        (t) => t.recommendation_id === rec.id
      ) || null;

      // Fetch future bars for simulation
      const futureEndDate = new Date(result.date);
      futureEndDate.setDate(futureEndDate.getDate() + this.config.maxHoldingDays + 10);

      const stockData = await loader.getStockData(
        rec.ticker,
        futureEndDate.toISOString().split("T")[0]
      );

      const futureBars = stockData?.bars || [];

      const outcome = await this.calculateOutcome(rec, actualTrade, futureBars);
      outcomes.push(outcome);
    }

    return outcomes;
  }

  /**
   * Process all daily results and calculate outcomes
   */
  async processAllResults(
    results: DailyBacktestResult[],
    loader: HistoricalDataLoader,
    onProgress?: (completed: number, total: number) => void
  ): Promise<DailyBacktestResult[]> {
    const processedResults: DailyBacktestResult[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      // Skip if no recommendations
      if (result.recommendations.length === 0) {
        processedResults.push(result);
        onProgress?.(i + 1, results.length);
        continue;
      }

      const outcomes = await this.calculateDailyOutcomes(result, loader);

      processedResults.push({
        ...result,
        outcomes,
      });

      onProgress?.(i + 1, results.length);

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return processedResults;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Aggregate outcomes from multiple daily results
 */
export function aggregateOutcomes(results: DailyBacktestResult[]): TradeOutcome[] {
  return results.flatMap((r) => r.outcomes);
}

/**
 * Filter to only executed trades
 */
export function filterExecuted(outcomes: TradeOutcome[]): TradeOutcome[] {
  return outcomes.filter((o) => o.was_executed);
}

/**
 * Filter to only winning trades
 */
export function filterWinners(outcomes: TradeOutcome[]): TradeOutcome[] {
  return outcomes.filter((o) => o.r_achieved !== null && o.r_achieved > 0);
}

/**
 * Filter to only losing trades
 */
export function filterLosers(outcomes: TradeOutcome[]): TradeOutcome[] {
  return outcomes.filter((o) => o.r_achieved !== null && o.r_achieved <= 0);
}

// =============================================================================
// Exports
// =============================================================================

export default {
  OutcomeCalculator,
  simulateWithBars,
  aggregateOutcomes,
  filterExecuted,
  filterWinners,
  filterLosers,
};
