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
  equity: number;              // Account equity for position sizing
}

const DEFAULT_FILTER: FilterConfig = {
  minGrade: ["A", "B"],
  minRsRating: 70,
  preferContraction: true,
  maxIdeas: 5,
  equity: 100000,              // Default $100k account
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

interface PositionSize {
  shares: number;
  dollars: number;
  portfolioPct: number;     // % of portfolio
  riskDollars: number;      // Total $ at risk (shares × R per share)
  riskPct: number;          // NER - New Equity Risk %
}

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
  target3R: number;       // 3R profit target
  rPerShare: number;      // Risk per share in $

  // Position Sizing
  entry: PositionSize;    // Full entry position
  add: PositionSize;      // Add position (1/2 size)

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

  // Convert to TradeIdea format with position sizing
  const ideas: TradeIdea[] = [];
  const equity = filter.equity;

  for (let i = 0; i < Math.min(sorted.length, filter.maxIdeas); i++) {
    const { candidate, score } = sorted[i];

    // Calculate R per share (risk)
    const rPerShare = candidate.close - candidate.ma_low;
    const target2R = candidate.close + (rPerShare * 2);
    const target3R = candidate.close + (rPerShare * 3);

    // Position sizing for ENTRY
    // MODE1 (Weakness): 11% of equity
    // MODE2 (Reclaim): 13% of equity
    const entryPct = candidate.mode === "MODE2" ? 0.13 : 0.11;
    const entryDollars = equity * entryPct;
    const entryShares = Math.floor(entryDollars / candidate.close);
    const actualEntryDollars = entryShares * candidate.close;
    const entryRiskDollars = entryShares * rPerShare;
    const entryNER = (entryRiskDollars / equity) * 100;

    // Position sizing for ADD
    // Adds are typically 1/2 the entry size (5.5-6.5% of equity)
    const addPct = entryPct / 2;
    const addDollars = equity * addPct;
    const addShares = Math.floor(addDollars / candidate.close);
    const actualAddDollars = addShares * candidate.close;
    const addRiskDollars = addShares * rPerShare;
    const addNER = (addRiskDollars / equity) * 100;

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
      target3R: round2(target3R),
      rPerShare: round2(rPerShare),

      // Entry position
      entry: {
        shares: entryShares,
        dollars: round2(actualEntryDollars),
        portfolioPct: round2(entryPct * 100),
        riskDollars: round2(entryRiskDollars),
        riskPct: round2(entryNER),
      },

      // Add position
      add: {
        shares: addShares,
        dollars: round2(actualAddDollars),
        portfolioPct: round2(addPct * 100),
        riskDollars: round2(addRiskDollars),
        riskPct: round2(addNER),
      },

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

function formatIdeas(ideas: TradeIdea[], date: string, equity: number = 100000): string {
  const lines: string[] = [];
  const width = 78;

  // Header
  lines.push("┌" + "─".repeat(width - 2) + "┐");
  lines.push("│" + `  DAILY TRADE IDEAS - ${date}`.padEnd(width - 2) + "│");
  lines.push("│" + `  Account: $${equity.toLocaleString()}`.padEnd(width - 2) + "│");

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
      const priceLine = `      Entry: $${idea.entryPrice.toFixed(2)}   Stop: $${idea.stopLoss.toFixed(2)}   R: $${idea.rPerShare.toFixed(2)}`;
      lines.push("│" + priceLine.padEnd(width - 2) + "│");

      // Targets line
      const targetLine = `      Target 2R: $${idea.target2R.toFixed(2)}   Target 3R: $${idea.target3R.toFixed(2)}`;
      lines.push("│" + targetLine.padEnd(width - 2) + "│");

      // Setup line (avoid duplicate "contraction" if already in setupType)
      const contraction = idea.hasContraction && !idea.setupType.includes("contraction") ? " + contraction" : "";
      const setupLine = `      Setup: ${idea.setupType}${contraction}`;
      lines.push("│" + setupLine.padEnd(width - 2) + "│");

      // Entry position sizing
      lines.push("│" + "      ─── ENTRY ───".padEnd(width - 2) + "│");
      const entryLine1 = `      Shares: ${idea.entry.shares}   Position: $${idea.entry.dollars.toLocaleString()} (${idea.entry.portfolioPct}%)`;
      lines.push("│" + entryLine1.padEnd(width - 2) + "│");
      const entryLine2 = `      Risk: $${idea.entry.riskDollars.toFixed(0)} (${idea.entry.riskPct.toFixed(2)}% NER)`;
      lines.push("│" + entryLine2.padEnd(width - 2) + "│");

      // Add position sizing
      lines.push("│" + "      ─── ADD ───".padEnd(width - 2) + "│");
      const addLine1 = `      Shares: ${idea.add.shares}   Position: $${idea.add.dollars.toLocaleString()} (${idea.add.portfolioPct}%)`;
      lines.push("│" + addLine1.padEnd(width - 2) + "│");
      const addLine2 = `      Risk: $${idea.add.riskDollars.toFixed(0)} (${idea.add.riskPct.toFixed(2)}% NER)`;
      lines.push("│" + addLine2.padEnd(width - 2) + "│");

      lines.push("│" + " ".repeat(width - 2) + "│");
    }
  }

  // Footer
  lines.push("├" + "─".repeat(width - 2) + "┤");
  lines.push("│" + "  Filters: Grade A/B | RS >= 70 | Prefer contraction".padEnd(width - 2) + "│");
  lines.push("│" + "  Position: MODE1=11%, MODE2=13% | Add=1/2 entry size".padEnd(width - 2) + "│");
  lines.push("│" + "  Backtest: 54% WR, +0.30R expectancy, 1.39 PF".padEnd(width - 2) + "│");
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
  const equityArg = args[1] ? parseInt(args[1], 10) : 100000;
  const format = args[2] || "pretty"; // "pretty" or "json"

  const equity = isNaN(equityArg) ? 100000 : equityArg;

  console.log("═".repeat(78));
  console.log("                       DAILY TRADE IDEAS GENERATOR");
  console.log("═".repeat(78));
  console.log();
  console.log(`Usage: npx tsx daily-ideas.ts [date] [equity] [format]`);
  console.log(`       date:   YYYY-MM-DD (default: today)`);
  console.log(`       equity: Account size in $ (default: 100000)`);
  console.log(`       format: 'pretty' or 'json' (default: pretty)`);
  console.log();

  try {
    const filter: FilterConfig = {
      ...DEFAULT_FILTER,
      equity,
    };
    const ideas = await generateDailyIdeas(date, filter);

    console.log();
    if (format === "json") {
      console.log(formatJSON(ideas));
    } else {
      console.log(formatIdeas(ideas, date, equity));
    }

    // Summary
    console.log();
    console.log(`Generated ${ideas.length} trade ideas for ${date}`);

    if (ideas.length > 0) {
      const avgScore = ideas.reduce((s, i) => s + i.score, 0) / ideas.length;
      const avgRS = ideas.reduce((s, i) => s + i.rsRating, 0) / ideas.length;
      const totalEntryRisk = ideas.reduce((s, i) => s + i.entry.riskPct, 0);
      console.log(`Average Score: ${avgScore.toFixed(1)} | Average RS: ${avgRS.toFixed(1)}`);
      console.log(`Total Entry Risk (all ideas): ${totalEntryRisk.toFixed(2)}% NER`);
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
  PositionSize,
  FilterConfig,
  DEFAULT_FILTER,
};

// Run if executed directly
main().catch(console.error);
