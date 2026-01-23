/**
 * Daily Trade Ideas Generator
 *
 * Generates actionable trade ideas using the backtested pipeline.
 * Filters to high-probability setups based on historical performance:
 * - Grade A/B only (75%/62% win rate vs 50% for C)
 * - Prefer "contraction" setups (64% win rate)
 * - RS Rating >= 70 (top 30% relative strength)
 *
 * Run with: npx tsx src/lib/backtest/daily-ideas.ts [date]
 *
 * @module backtest/daily-ideas
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { HistoricalDataLoader } from "./data-loader";
import type {
  DailyContext,
  Candidate,
  TradeRecommendation,
  MarketState,
  Grade,
} from "./types";

// =============================================================================
// Configuration
// =============================================================================

interface FilterConfig {
  minGrade: Grade[];           // Only these grades
  minRsRating: number;         // Minimum IBD RS Rating (1-99)
  preferContraction: boolean;  // Boost contraction setups
  maxIdeas: number;            // Limit output
}

const DEFAULT_FILTER: FilterConfig = {
  minGrade: ["A", "B"],
  minRsRating: 70,
  preferContraction: true,
  maxIdeas: 5,
};

// =============================================================================
// Imports from replay-engine (avoid circular dependency)
// =============================================================================

// We'll import the key functions we need
import {
  generateCandidates,
  rankCandidates,
} from "./replay-engine";

// =============================================================================
// Trade Idea Type
// =============================================================================

interface TradeIdea {
  rank: number;
  ticker: string;
  grade: Grade;
  mode: string;
  rsRating: number;
  score: number;

  // Prices
  entryPrice: number;
  stopLoss: number;       // 21EMA Low (SSL)
  target2R: number;       // 2R profit target
  riskPercent: number;    // Risk per share as %

  // Setup details
  setupType: string;
  hasContraction: boolean;
  distToEMA: number;      // Distance to 21EMA in ATR units

  // Context
  marketState: MarketState;
  permissions: {
    newEntries: boolean;
    adds: boolean;
  };
}

// =============================================================================
// Main Generator
// =============================================================================

async function generateDailyIdeas(
  date: string,
  filter: FilterConfig = DEFAULT_FILTER
): Promise<TradeIdea[]> {
  // Initialize data loader with 60-day lookback for data warmup
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - 60);
  const loader = new HistoricalDataLoader(
    startDate.toISOString().split("T")[0],
    date
  );

  console.log(`[DailyIdeas] Loading data for ${date}...`);
  await loader.preload();

  // Pre-fetch OHLC data
  const tickers = loader.getUniverseTickers(date);
  console.log(`[DailyIdeas] Pre-fetching OHLC for ${tickers.length} tickers...`);
  await loader.preloadOHLC(tickers, (completed, total) => {
    process.stdout.write(`\r  Fetching: ${completed}/${total} (${((completed / total) * 100).toFixed(0)}%)`);
  });
  console.log();

  // Get market context
  const context = await loader.getContext(date);
  console.log(`[DailyIdeas] Market: ${context.market_state}`);

  // Generate all candidates
  const candidates = await generateCandidates(date, context, loader, {
    weights: {
      grade: { A: 30, B: 20, C: 10 },
      distance: { perfect: 25, good: 15, acceptable: 5 },
      mode: { MODE1: 10, MODE2: 15 },
      contraction: 10,
      close_range_max: 10,
      rs: { high: 10, medium: 7, low: 4 },
    },
    equity: 100000,
    maxPositions: 8,
    newsletterBoost: true,
  });

  console.log(`[DailyIdeas] Generated ${candidates.length} raw candidates`);

  // Filter by grade
  const gradeFiltered = candidates.filter((c) =>
    filter.minGrade.includes(c.grade)
  );
  console.log(`[DailyIdeas] After grade filter (${filter.minGrade.join("/")}): ${gradeFiltered.length}`);

  // Filter by RS Rating
  const rsFiltered = gradeFiltered.filter((c) =>
    c.rs_percentile >= filter.minRsRating
  );
  console.log(`[DailyIdeas] After RS filter (>=${filter.minRsRating}): ${rsFiltered.length}`);

  // Rank candidates
  const newsletterPullbacks = new Set(loader.getPullbackCandidates(date));
  const ranked = rankCandidates(rsFiltered, {
    grade: { A: 30, B: 20, C: 10 },
    distance: { perfect: 25, good: 15, acceptable: 5 },
    mode: { MODE1: 10, MODE2: 15 },
    contraction: 10,
    close_range_max: 10,
    rs: { high: 10, medium: 7, low: 4 },
  }, newsletterPullbacks);

  // Sort by score, boost contraction setups
  const sorted = ranked.sort((a, b) => {
    let scoreA = a.score;
    let scoreB = b.score;

    if (filter.preferContraction) {
      if (a.candidate.contraction) scoreA += 15;
      if (b.candidate.contraction) scoreB += 15;
    }

    return scoreB - scoreA;
  });

  // Convert to TradeIdea format
  const ideas: TradeIdea[] = [];

  for (let i = 0; i < Math.min(sorted.length, filter.maxIdeas); i++) {
    const { candidate, score } = sorted[i];

    // Calculate 2R target (no need for full position sizing here)
    const riskPerShare = candidate.close - candidate.ma_low;
    const target2R = candidate.close + (riskPerShare * 2);

    ideas.push({
      rank: i + 1,
      ticker: candidate.ticker,
      grade: candidate.grade,
      mode: candidate.mode,
      rsRating: candidate.rs_percentile,
      score: Math.round(score),

      entryPrice: round2(candidate.close),
      stopLoss: round2(candidate.ma_low),
      target2R: round2(target2R),
      riskPercent: round2((riskPerShare / candidate.close) * 100),

      setupType: candidate.setup_type,
      hasContraction: candidate.contraction,
      distToEMA: round2(candidate.dist_to_21ema_atr),

      marketState: context.market_state,
      permissions: {
        newEntries: context.permissions.new_entries,
        adds: context.permissions.adds,
      },
    });
  }

  return ideas;
}

// =============================================================================
// Formatting
// =============================================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatIdeas(ideas: TradeIdea[], date: string): string {
  const lines: string[] = [];
  const width = 70;

  // Header
  lines.push("┌" + "─".repeat(width - 2) + "┐");
  lines.push("│" + `  DAILY TRADE IDEAS - ${date}`.padEnd(width - 2) + "│");

  if (ideas.length > 0) {
    const market = ideas[0].marketState.replace(/_/g, " ");
    const entries = ideas[0].permissions.newEntries ? "✓" : "✗";
    const adds = ideas[0].permissions.adds ? "✓" : "✗";
    lines.push("│" + `  Market: ${market} | Entries: ${entries} | Adds: ${adds}`.padEnd(width - 2) + "│");
  }

  lines.push("├" + "─".repeat(width - 2) + "┤");

  if (ideas.length === 0) {
    lines.push("│" + "  No high-probability setups found today.".padEnd(width - 2) + "│");
    lines.push("│" + "  Consider relaxing filters or waiting for better setups.".padEnd(width - 2) + "│");
  } else {
    for (const idea of ideas) {
      // Main line
      const mainLine = `  #${idea.rank}  ${idea.ticker.padEnd(6)} Grade ${idea.grade}   ${idea.mode}   RS ${idea.rsRating}   Score ${idea.score}`;
      lines.push("│" + mainLine.padEnd(width - 2) + "│");

      // Price line
      const priceLine = `      Entry: $${idea.entryPrice.toFixed(2)}   Stop: $${idea.stopLoss.toFixed(2)}   Target 2R: $${idea.target2R.toFixed(2)}`;
      lines.push("│" + priceLine.padEnd(width - 2) + "│");

      // Setup line (avoid duplicate "contraction" if already in setupType)
      const contraction = idea.hasContraction && !idea.setupType.includes("contraction") ? " + contraction" : "";
      const setupLine = `      Setup: ${idea.setupType}${contraction}`;
      lines.push("│" + setupLine.padEnd(width - 2) + "│");

      // Risk info
      const riskLine = `      Risk: ${idea.riskPercent.toFixed(1)}% | Dist to 21EMA: ${idea.distToEMA.toFixed(2)} ATR`;
      lines.push("│" + riskLine.padEnd(width - 2) + "│");

      lines.push("│" + " ".repeat(width - 2) + "│");
    }
  }

  // Footer
  lines.push("├" + "─".repeat(width - 2) + "┤");
  lines.push("│" + "  Filters: Grade A/B | RS >= 70 | Prefer contraction".padEnd(width - 2) + "│");
  lines.push("│" + "  Based on backtest: 54% WR, +0.30R expectancy, 1.39 PF".padEnd(width - 2) + "│");
  lines.push("└" + "─".repeat(width - 2) + "┘");

  return lines.join("\n");
}

function formatJSON(ideas: TradeIdea[]): string {
  return JSON.stringify(ideas, null, 2);
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const date = args[0] || new Date().toISOString().split("T")[0];
  const format = args[1] || "pretty"; // "pretty" or "json"

  console.log("═".repeat(70));
  console.log("                    DAILY TRADE IDEAS GENERATOR");
  console.log("═".repeat(70));
  console.log();

  try {
    const ideas = await generateDailyIdeas(date);

    console.log();
    if (format === "json") {
      console.log(formatJSON(ideas));
    } else {
      console.log(formatIdeas(ideas, date));
    }

    // Summary
    console.log();
    console.log(`Generated ${ideas.length} trade ideas for ${date}`);

    if (ideas.length > 0) {
      const avgScore = ideas.reduce((s, i) => s + i.score, 0) / ideas.length;
      const avgRS = ideas.reduce((s, i) => s + i.rsRating, 0) / ideas.length;
      console.log(`Average Score: ${avgScore.toFixed(1)} | Average RS: ${avgRS.toFixed(1)}`);
    }

  } catch (error) {
    console.error("Error generating ideas:", error);
    process.exit(1);
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  generateDailyIdeas,
  formatIdeas,
  formatJSON,
  TradeIdea,
  FilterConfig,
  DEFAULT_FILTER,
};

// Run if executed directly
main().catch(console.error);
