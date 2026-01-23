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

import * as fs from "fs";
import * as path from "path";
import { HistoricalDataLoader } from "./data-loader";
import type {
  DailyContext,
  Candidate,
  TradeRecommendation,
  MarketState,
  Grade,
} from "./types";
import {
  loadJournalEntries,
  aggregateDailyStates,
  type AlexState,
  type DailyState,
} from "./alex-states";

// =============================================================================
// Configuration
// =============================================================================

interface FilterConfig {
  minGrade: Grade[];           // Only these grades
  minRsRating: number;         // Minimum IBD RS Rating (1-99)
  preferContraction: boolean;  // Boost contraction setups
  maxIdeas: number;            // Limit output
  equity: number;              // Account equity for position sizing

  // ATR-based position sizing
  targetNER: number;           // Target New Equity Risk % per trade (e.g., 0.35)
  atrMultiplier: number;       // ATR multiplier for stop (e.g., 1.5)
  maxPositionPct: number;      // Max position size as % of equity (e.g., 15)
  useATRSizing: boolean;       // Enable ATR-based sizing (vs fixed %)
}

const DEFAULT_FILTER: FilterConfig = {
  minGrade: ["A", "B"],
  minRsRating: 70,
  preferContraction: true,
  maxIdeas: 5,
  equity: 100000,              // Default $100k account

  // ATR-based position sizing (balanced risk/return)
  targetNER: 0.35,             // 0.35% risk per trade
  atrMultiplier: 1.5,          // Stop at 1.5 ATR below entry
  maxPositionPct: 15,          // Cap at 15% of equity
  useATRSizing: true,          // Enable by default
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
// Alex State Integration
// =============================================================================

interface AlexStateContext {
  state: AlexState;
  confidence: number;
  topSignal: string;
  recommendation: string;
  positionSizeMultiplier: number;  // Adjust position sizes based on state
  allowNewEntries: boolean;
  allowAdds: boolean;
}

const STATE_RECOMMENDATIONS: Record<AlexState, {
  recommendation: string;
  positionMultiplier: number;
  allowEntries: boolean;
  allowAdds: boolean;
}> = {
  TESTING: {
    recommendation: "Small pilots only (0.125-0.25% risk). Market uncertain.",
    positionMultiplier: 0.5,  // Half size
    allowEntries: true,
    allowAdds: false
  },
  PRESSING: {
    recommendation: "Add to winners. Delta positive, cushion allows aggression.",
    positionMultiplier: 1.2,  // Slightly larger
    allowEntries: true,
    allowAdds: true
  },
  TRIMMING: {
    recommendation: "Trim into strength. Lock in gains, reduce exposure.",
    positionMultiplier: 0.7,
    allowEntries: false,
    allowAdds: false
  },
  DEFENSIVE: {
    recommendation: "Capital preservation. No new entries, manage risk tight.",
    positionMultiplier: 0.5,
    allowEntries: false,
    allowAdds: false
  },
  SELLING: {
    recommendation: "⚠️ QQQE lost 21dma structure. ALL CASH. No new positions.",
    positionMultiplier: 0,
    allowEntries: false,
    allowAdds: false
  },
  NEUTRAL: {
    recommendation: "Normal operations. Follow standard filters.",
    positionMultiplier: 1.0,
    allowEntries: true,
    allowAdds: true
  }
};

function getAlexStateForDate(date: string): AlexStateContext {
  const journalPath = path.join(
    process.cwd(),
    "data/discord-exports/alex-journal.json"
  );

  // Default to NEUTRAL if no journal data
  if (!fs.existsSync(journalPath)) {
    return {
      state: "NEUTRAL",
      confidence: 0,
      topSignal: "No journal data",
      recommendation: STATE_RECOMMENDATIONS.NEUTRAL.recommendation,
      positionSizeMultiplier: 1.0,
      allowNewEntries: true,
      allowAdds: true
    };
  }

  const entries = loadJournalEntries(journalPath);
  const dailyStates = aggregateDailyStates(entries);
  const daily = dailyStates.get(date);

  if (!daily) {
    return {
      state: "NEUTRAL",
      confidence: 0,
      topSignal: "No data for date",
      recommendation: STATE_RECOMMENDATIONS.NEUTRAL.recommendation,
      positionSizeMultiplier: 1.0,
      allowNewEntries: true,
      allowAdds: true
    };
  }

  const stateConfig = STATE_RECOMMENDATIONS[daily.primaryState];
  const topSignal = daily.signals.length > 0
    ? daily.signals[0].keywords[0] || ""
    : "";

  // Calculate confidence from scores
  const maxScore = Math.max(
    daily.summary.testingScore,
    daily.summary.pressingScore,
    daily.summary.trimmingScore,
    daily.summary.defensiveScore,
    daily.summary.sellingScore
  );

  return {
    state: daily.primaryState,
    confidence: Math.min(1, maxScore),
    topSignal,
    recommendation: stateConfig.recommendation,
    positionSizeMultiplier: stateConfig.positionMultiplier,
    allowNewEntries: stateConfig.allowEntries,
    allowAdds: stateConfig.allowAdds
  };
}

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
  stopLoss: number;       // ATR-based stop (or 21EMA Low if tighter)
  stopATR: number;        // Stop based on ATR multiplier
  stop21EMA: number;      // Stop based on 21EMA Low
  target2R: number;       // 2R profit target
  target3R: number;       // 3R profit target
  rPerShare: number;      // Risk per share in $
  atr: number;            // 14-period ATR

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

  // Sizing method used
  sizingMethod: "ATR" | "FIXED";
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

    // Get ATR from candidate
    const atr = candidate.atr;

    // Calculate stops
    const stop21EMA = candidate.ma_low;                           // Traditional 21EMA Low stop
    const stopATR = candidate.close - (atr * filter.atrMultiplier); // ATR-based stop

    // Use ATR stop if enabled, otherwise 21EMA Low
    // Take the tighter of the two for risk management
    let stopLoss: number;
    let sizingMethod: "ATR" | "FIXED";

    if (filter.useATRSizing) {
      // Use ATR-based stop (typically gives more room than 21EMA)
      stopLoss = stopATR;
      sizingMethod = "ATR";
    } else {
      stopLoss = stop21EMA;
      sizingMethod = "FIXED";
    }

    // Ensure stop is below entry
    if (stopLoss >= candidate.close) {
      stopLoss = candidate.close * 0.95; // Fallback: 5% stop
    }

    // Calculate R per share (risk)
    const rPerShare = candidate.close - stopLoss;
    const target2R = candidate.close + (rPerShare * 2);
    const target3R = candidate.close + (rPerShare * 3);

    let entryShares: number;
    let entryPct: number;

    if (filter.useATRSizing) {
      // ATR-based position sizing: Fixed NER approach
      // Shares = (Equity × Target NER%) / R per share
      const targetRiskDollars = equity * (filter.targetNER / 100);
      entryShares = Math.floor(targetRiskDollars / rPerShare);

      // Calculate actual position %
      const entryDollars = entryShares * candidate.close;
      entryPct = entryDollars / equity;

      // Cap at max position size
      if (entryPct > filter.maxPositionPct / 100) {
        entryPct = filter.maxPositionPct / 100;
        const cappedDollars = equity * entryPct;
        entryShares = Math.floor(cappedDollars / candidate.close);
      }
    } else {
      // Fixed % position sizing (original method)
      // MODE1 (Weakness): 11% of equity
      // MODE2 (Reclaim): 13% of equity
      entryPct = candidate.mode === "MODE2" ? 0.13 : 0.11;
      const entryDollars = equity * entryPct;
      entryShares = Math.floor(entryDollars / candidate.close);
    }

    const actualEntryDollars = entryShares * candidate.close;
    const entryRiskDollars = entryShares * rPerShare;
    const entryNER = (entryRiskDollars / equity) * 100;

    // Position sizing for ADD (1/2 of entry)
    const addShares = Math.floor(entryShares / 2);
    const actualAddDollars = addShares * candidate.close;
    const addRiskDollars = addShares * rPerShare;
    const addNER = (addRiskDollars / equity) * 100;
    const addPct = actualAddDollars / equity;

    ideas.push({
      rank: i + 1,
      ticker: candidate.ticker,
      grade: candidate.grade,
      mode: candidate.mode,
      rsRating: candidate.rs_percentile,
      score: Math.round(score),

      entryPrice: round2(candidate.close),
      stopLoss: round2(stopLoss),
      stopATR: round2(stopATR),
      stop21EMA: round2(stop21EMA),
      target2R: round2(target2R),
      target3R: round2(target3R),
      rPerShare: round2(rPerShare),
      atr: round2(atr),

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

      sizingMethod,
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

function formatIdeas(
  ideas: TradeIdea[],
  date: string,
  equity: number = 100000,
  alexState?: AlexStateContext
): string {
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

  // Alex State Section
  if (alexState) {
    lines.push("├" + "─".repeat(width - 2) + "┤");
    const stateIcon = {
      TESTING: "🔬",
      PRESSING: "📈",
      TRIMMING: "✂️",
      DEFENSIVE: "🛡️",
      SELLING: "🚨",
      NEUTRAL: "➖"
    }[alexState.state] || "➖";

    lines.push("│" + `  Alex State: ${stateIcon} ${alexState.state}`.padEnd(width - 2) + "│");
    lines.push("│" + `  ${alexState.recommendation}`.padEnd(width - 2) + "│");

    // Show permissions based on Alex state
    const entryStatus = alexState.allowNewEntries ? "✓ Entries OK" : "✗ NO Entries";
    const addStatus = alexState.allowAdds ? "✓ Adds OK" : "✗ NO Adds";
    const sizeAdj = alexState.positionSizeMultiplier !== 1.0
      ? ` | Size: ${(alexState.positionSizeMultiplier * 100).toFixed(0)}%`
      : "";
    lines.push("│" + `  ${entryStatus} | ${addStatus}${sizeAdj}`.padEnd(width - 2) + "│");

    // Warning for SELLING state
    if (alexState.state === "SELLING") {
      lines.push("│" + " ".repeat(width - 2) + "│");
      lines.push("│" + "  ⚠️  QQQE BELOW 21DMA STRUCTURE - STAY IN CASH ⚠️".padEnd(width - 2) + "│");
    }
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

      // Price line with ATR info
      const priceLine = `      Entry: $${idea.entryPrice.toFixed(2)}   ATR: $${idea.atr.toFixed(2)}`;
      lines.push("│" + priceLine.padEnd(width - 2) + "│");

      // Stop line - show both stops
      const stopLine = `      Stop: $${idea.stopLoss.toFixed(2)} (${idea.sizingMethod})   R: $${idea.rPerShare.toFixed(2)}`;
      lines.push("│" + stopLine.padEnd(width - 2) + "│");

      // Alternative stop reference
      if (idea.sizingMethod === "ATR") {
        const altStopLine = `      (21EMA: $${idea.stop21EMA.toFixed(2)}   ATR×1.5: $${idea.stopATR.toFixed(2)})`;
        lines.push("│" + altStopLine.padEnd(width - 2) + "│");
      }

      // Targets line
      const targetLine = `      Target 2R: $${idea.target2R.toFixed(2)}   Target 3R: $${idea.target3R.toFixed(2)}`;
      lines.push("│" + targetLine.padEnd(width - 2) + "│");

      // Setup line (avoid duplicate "contraction" if already in setupType)
      const contraction = idea.hasContraction && !idea.setupType.includes("contraction") ? " + contraction" : "";
      const setupLine = `      Setup: ${idea.setupType}${contraction}`;
      lines.push("│" + setupLine.padEnd(width - 2) + "│");

      // Entry position sizing
      lines.push("│" + "      ─── ENTRY ───".padEnd(width - 2) + "│");
      const entryLine1 = `      Shares: ${idea.entry.shares}   Position: $${idea.entry.dollars.toLocaleString()} (${idea.entry.portfolioPct.toFixed(1)}%)`;
      lines.push("│" + entryLine1.padEnd(width - 2) + "│");
      const entryLine2 = `      Risk: $${idea.entry.riskDollars.toFixed(0)} (${idea.entry.riskPct.toFixed(2)}% NER)`;
      lines.push("│" + entryLine2.padEnd(width - 2) + "│");

      // Add position sizing
      lines.push("│" + "      ─── ADD ───".padEnd(width - 2) + "│");
      const addLine1 = `      Shares: ${idea.add.shares}   Position: $${idea.add.dollars.toLocaleString()} (${idea.add.portfolioPct.toFixed(1)}%)`;
      lines.push("│" + addLine1.padEnd(width - 2) + "│");
      const addLine2 = `      Risk: $${idea.add.riskDollars.toFixed(0)} (${idea.add.riskPct.toFixed(2)}% NER)`;
      lines.push("│" + addLine2.padEnd(width - 2) + "│");

      lines.push("│" + " ".repeat(width - 2) + "│");
    }

    // Portfolio Summary
    lines.push("├" + "─".repeat(width - 2) + "┤");
    lines.push("│" + "  PORTFOLIO SUMMARY".padEnd(width - 2) + "│");
    lines.push("├" + "─".repeat(width - 2) + "┤");

    const totalEntryDollars = ideas.reduce((s, i) => s + i.entry.dollars, 0);
    const totalEntryPct = ideas.reduce((s, i) => s + i.entry.portfolioPct, 0);
    const totalEntryRisk = ideas.reduce((s, i) => s + i.entry.riskPct, 0);

    const totalAddDollars = ideas.reduce((s, i) => s + i.add.dollars, 0);
    const totalAddPct = ideas.reduce((s, i) => s + i.add.portfolioPct, 0);
    const totalAddRisk = ideas.reduce((s, i) => s + i.add.riskPct, 0);

    const totalWithAddsDollars = totalEntryDollars + totalAddDollars;
    const totalWithAddsPct = totalEntryPct + totalAddPct;
    const totalWithAddsRisk = totalEntryRisk + totalAddRisk;

    // Entry totals
    const entryTotal = `  All Entries:    $${totalEntryDollars.toLocaleString()}  (${totalEntryPct.toFixed(1)}% of portfolio)`;
    lines.push("│" + entryTotal.padEnd(width - 2) + "│");
    const entryRiskLine = `                  Risk: ${totalEntryRisk.toFixed(2)}% NER`;
    lines.push("│" + entryRiskLine.padEnd(width - 2) + "│");

    // With adds totals
    const withAddsTotal = `  + All Adds:     $${totalWithAddsDollars.toLocaleString()}  (${totalWithAddsPct.toFixed(1)}% of portfolio)`;
    lines.push("│" + withAddsTotal.padEnd(width - 2) + "│");
    const withAddsRiskLine = `                  Risk: ${totalWithAddsRisk.toFixed(2)}% NER`;
    lines.push("│" + withAddsRiskLine.padEnd(width - 2) + "│");

    // Cash remaining
    const cashAfterEntries = equity - totalEntryDollars;
    const cashAfterAll = equity - totalWithAddsDollars;
    lines.push("│" + " ".repeat(width - 2) + "│");
    const cashLine1 = `  Cash after entries: $${Math.max(0, cashAfterEntries).toLocaleString()}  (${Math.max(0, (100 - totalEntryPct)).toFixed(1)}%)`;
    lines.push("│" + cashLine1.padEnd(width - 2) + "│");
    const cashLine2 = `  Cash after all:     $${Math.max(0, cashAfterAll).toLocaleString()}  (${Math.max(0, (100 - totalWithAddsPct)).toFixed(1)}%)`;
    lines.push("│" + cashLine2.padEnd(width - 2) + "│");

    // Warning if over 100%
    if (totalEntryPct > 100) {
      lines.push("│" + " ".repeat(width - 2) + "│");
      lines.push("│" + "  ⚠️  ENTRIES EXCEED 100% - Select fewer positions or reduce sizes".padEnd(width - 2) + "│");
    } else if (totalWithAddsPct > 100) {
      lines.push("│" + " ".repeat(width - 2) + "│");
      lines.push("│" + "  ⚠️  ENTRIES + ADDS EXCEED 100% - Prioritize best setups for adds".padEnd(width - 2) + "│");
    }
  }

  // Footer
  lines.push("├" + "─".repeat(width - 2) + "┤");
  lines.push("│" + "  Filters: Grade A/B | RS >= 70 | Prefer contraction".padEnd(width - 2) + "│");
  const avgNER = ideas.length > 0 ? (ideas.reduce((s, i) => s + i.entry.riskPct, 0) / ideas.length).toFixed(2) : "0.35";
  const sizingInfo = ideas.length > 0 && ideas[0].sizingMethod === "ATR"
    ? `  Sizing: ATR-based | Avg NER: ${avgNER}% | Stop: 1.5×ATR | Max: 15%`
    : "  Sizing: Fixed % | MODE1=11%, MODE2=13% | Add=1/2 entry";
  lines.push("│" + sizingInfo.padEnd(width - 2) + "│");
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
    // Get Alex state for the date
    console.log(`[DailyIdeas] Loading Alex state for ${date}...`);
    const alexState = getAlexStateForDate(date);
    console.log(`[DailyIdeas] Alex State: ${alexState.state}`);

    // Adjust filter based on Alex state
    const filter: FilterConfig = {
      ...DEFAULT_FILTER,
      equity,
    };

    // Apply position size multiplier from Alex state
    if (alexState.positionSizeMultiplier !== 1.0) {
      filter.targetNER = DEFAULT_FILTER.targetNER * alexState.positionSizeMultiplier;
      console.log(`[DailyIdeas] Adjusted NER target: ${filter.targetNER.toFixed(3)}%`);
    }

    const ideas = await generateDailyIdeas(date, filter);

    console.log();
    if (format === "json") {
      console.log(formatJSON(ideas));
    } else {
      console.log(formatIdeas(ideas, date, equity, alexState));
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

    // State-based warning
    if (alexState.state === "SELLING") {
      console.log();
      console.log("🚨 ALEX STATE: SELLING - QQQE below 21dma structure");
      console.log("   DO NOT take new positions. Stay in cash until structure reclaims.");
    } else if (alexState.state === "DEFENSIVE") {
      console.log();
      console.log("🛡️ ALEX STATE: DEFENSIVE - Capital preservation mode");
      console.log("   Reduce new entries. Focus on managing existing positions.");
    } else if (alexState.state === "TRIMMING") {
      console.log();
      console.log("✂️ ALEX STATE: TRIMMING - Taking profits into strength");
      console.log("   Lock in gains. Reduce exposure, don't add new positions.");
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
