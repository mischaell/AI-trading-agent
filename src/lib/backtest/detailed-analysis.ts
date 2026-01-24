import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import {
  loadJournalEntries,
  aggregateDailyStates,
  detectState,
  detectBreadthSignals,
} from "./alex-states";
import { HistoricalDataLoader, NASDAQ_100_TICKERS, type BreadthData } from "./data-loader";
import { generateCandidates, rankCandidates } from "./replay-engine";

const date = process.argv[2] || "2026-01-23";

async function main() {
  const journalPath = path.join(process.cwd(), "data/discord-exports/alex-journal.json");

  const entries = loadJournalEntries(journalPath);
  const dailyStates = aggregateDailyStates(entries);
  const daily = dailyStates.get(date);

  console.log("═".repeat(90));
  console.log("                         DETAILED ANALYSIS FOR " + date);
  console.log("═".repeat(90));

  // ============================================================================
  // SECTION 1: MARKET STATE (QQQE, MCO, MCSI) - FROM ACTUAL DATA
  // ============================================================================
  console.log("\n┌" + "─".repeat(88) + "┐");
  console.log("│  1. MARKET STATE INDICATORS (from actual data)                                         │");
  console.log("└" + "─".repeat(88) + "┘");

  // Initialize data loader to get actual market data
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - 60);
  const loader = new HistoricalDataLoader(startDate.toISOString().split("T")[0], date);
  await loader.preload();

  // Get actual DailyContext with QQQE and breadth data
  const context = await loader.getContext(date);

  // QQQE Structure from actual price data
  console.log("\n  📊 QQQE 21EMA STRUCTURE (actual data):");
  console.log("  " + "─".repeat(60));
  console.log("  Close:        $" + context.qqqe_close.toFixed(2));
  console.log("  21EMA High:   $" + context.qqqe_ma_high.toFixed(2));
  console.log("  21EMA Close:  $" + context.qqqe_ma_close.toFixed(2));
  console.log("  21EMA Low:    $" + context.qqqe_ma_low.toFixed(2));
  console.log("  Position:     " + context.qqqe_position.toUpperCase());
  console.log("  Slope:        " + context.qqqe_slope);

  // Determine QQQE health
  let qqqeHealth = "NEUTRAL";
  if (context.qqqe_position === "above") {
    qqqeHealth = "BULLISH ✅";
  } else if (context.qqqe_position === "below") {
    qqqeHealth = "BEARISH ⚠️ (below 21EMA structure)";
  } else {
    qqqeHealth = "INSIDE (testing structure)";
  }
  console.log("  Health:       " + qqqeHealth);

  // Pre-fetch OHLC for Nasdaq 100 to calculate breadth
  console.log("\n  Calculating Nasdaq 100 breadth indicators...");
  await loader.preloadOHLC(NASDAQ_100_TICKERS, () => {});
  const breadth = loader.getBreadthAsOf(date);

  // MCO from calculated Nasdaq 100 breadth
  console.log("\n  📈 MCO (McClellan Oscillator) - Nasdaq 100:");
  console.log("  " + "─".repeat(60));
  if (breadth) {
    console.log("  Advances:     " + breadth.advances + " stocks");
    console.log("  Declines:     " + breadth.declines + " stocks");
    console.log("  Net Adv:      " + breadth.netAdvances);
    console.log("  MCO:          " + breadth.mco.toFixed(2));
    console.log("  Z-Score:      " + breadth.mcoZscore.toFixed(2) + "σ");

    // Interpret MCO
    let mcoInterpretation = "NEUTRAL";
    if (breadth.mcoZscore <= -1) {
      mcoInterpretation = "🔴 OVERSOLD (" + breadth.mcoZscore.toFixed(2) + "σ) - Washout/Fear";
    } else if (breadth.mcoZscore <= -0.5) {
      mcoInterpretation = "🟡 WEAK (" + breadth.mcoZscore.toFixed(2) + "σ) - Below average";
    } else if (breadth.mcoZscore >= 1) {
      mcoInterpretation = "🔴 OVERBOUGHT (" + breadth.mcoZscore.toFixed(2) + "σ) - Extended";
    } else if (breadth.mcoZscore >= 0.5) {
      mcoInterpretation = "🟢 STRONG (" + breadth.mcoZscore.toFixed(2) + "σ) - Above average";
    } else if (breadth.mco > 0) {
      mcoInterpretation = "🟢 POSITIVE - Breadth expanding";
    } else {
      mcoInterpretation = "🟡 NEGATIVE - Breadth contracting";
    }
    console.log("  Status:       " + mcoInterpretation);
  } else {
    console.log("  Reading:      No data available");
  }

  // MCSI from calculated Nasdaq 100 breadth
  console.log("\n  📉 MCSI (McClellan Summation Index) - Nasdaq 100:");
  console.log("  " + "─".repeat(60));
  if (breadth) {
    console.log("  MCSI:         " + breadth.mcsi.toFixed(2));
    console.log("  Z-Score:      " + breadth.mcsiZscore.toFixed(2) + "σ");

    // Interpret MCSI
    let mcsiInterpretation = "NEUTRAL";
    if (breadth.mcsiZscore <= -1) {
      mcsiInterpretation = "🔴 OVERSOLD (" + breadth.mcsiZscore.toFixed(2) + "σ) - Deep value zone";
    } else if (breadth.mcsiZscore <= -0.5) {
      mcsiInterpretation = "🟡 WEAK (" + breadth.mcsiZscore.toFixed(2) + "σ) - Downtrend";
    } else if (breadth.mcsiZscore >= 1) {
      mcsiInterpretation = "🔴 EXTENDED (" + breadth.mcsiZscore.toFixed(2) + "σ) - Caution";
    } else if (breadth.mcsiZscore >= 0.5) {
      mcsiInterpretation = "🟢 STRONG (" + breadth.mcsiZscore.toFixed(2) + "σ) - Healthy uptrend";
    } else if (breadth.mcsi > 0) {
      mcsiInterpretation = "🟢 POSITIVE - Cumulative breadth positive";
    } else {
      mcsiInterpretation = "🟡 NEGATIVE - Cumulative breadth negative";
    }
    console.log("  Status:       " + mcsiInterpretation);

    // Trend detection (compare to recent values)
    console.log("\n  📊 BREADTH TREND:");
    console.log("  " + "─".repeat(60));

    // Determine hook direction by looking at recent MCO changes
    const recentDates = Array.from(loader.calculateBreadth().keys()).sort().slice(-5);
    if (recentDates.length >= 2) {
      const prevBreadth = loader.getBreadth(recentDates[recentDates.length - 2]);
      if (prevBreadth && breadth) {
        const mcoChange = breadth.mco - prevBreadth.mco;
        const mcsiChange = breadth.mcsi - prevBreadth.mcsi;

        const mcoDir = mcoChange > 2 ? "↑ HOOK UP" : mcoChange < -2 ? "↓ HOOK DOWN" : "→ FLAT";
        const mcsiDir = mcsiChange > 5 ? "↑ TRENDING UP" : mcsiChange < -5 ? "↓ TRENDING DOWN" : "→ FLAT";

        console.log("  MCO Change:   " + mcoChange.toFixed(2) + " (" + mcoDir + ")");
        console.log("  MCSI Change:  " + mcsiChange.toFixed(2) + " (" + mcsiDir + ")");
      }
    }
  } else {
    console.log("  Reading:      No data available");
  }

  // Breadth Consensus
  console.log("\n  📊 BREADTH CONSENSUS:");
  console.log("  " + "─".repeat(60));
  console.log("  Newsletter:   " + (context.breadth_consensus || "No data"));
  console.log("  TLMM Signal:  " + (context.tlmm_signal || "No data"));

  // Overall Market Assessment
  console.log("\n  ⟹ MARKET STATE:     " + context.market_state);
  console.log("  ⟹ NEW ENTRIES:      " + (context.permissions.new_entries ? "✓ Allowed" : "✗ NOT Allowed"));
  console.log("  ⟹ ADDS:             " + (context.permissions.adds ? "✓ Allowed" : "✗ NOT Allowed"));
  console.log("  ⟹ PRESSING:         " + (context.permissions.pressing ? "✓ Allowed" : "✗ NOT Allowed"));

  // Alex State from journal (behavioral overlay)
  if (daily) {
    console.log("\n  📋 ALEX BEHAVIORAL STATE (from journal):");
    console.log("  " + "─".repeat(60));
    console.log("  State:        " + daily.primaryState);
    console.log("  Breadth Dir:  MCSI=" + daily.breadthSummary.mcsiDirection +
                " MCO=" + daily.breadthSummary.mcoDirection +
                " Ext=" + daily.breadthSummary.breadthExtDirection);
    console.log("  Overall:      " + daily.breadthSummary.overallBreadth);

    if (daily.entries.length > 0) {
      console.log("\n  Key excerpt:");
      const excerpt = daily.entries[0].content.substring(0, 300).replace(/\n/g, "\n  ");
      console.log("  " + excerpt);
      if (daily.entries[0].content.length > 300) console.log("  ...");
    }
  }

  // ============================================================================
  // SECTION 2: POSITION SIZING CALCULATION (using calculated breadth)
  // ============================================================================
  console.log("\n\n┌" + "─".repeat(88) + "┐");
  console.log("│  2. POSITION SIZING CALCULATION                                                        │");
  console.log("└" + "─".repeat(88) + "┘");

  const STATE_MULTIPLIERS: Record<string, number> = {
    TESTING: 0.5,
    PRESSING: 1.2,
    TRIMMING: 0.7,
    DEFENSIVE: 0.5,
    SELLING: 0,
    NEUTRAL: 1.0
  };

  const primaryState = daily?.primaryState || "NEUTRAL";

  // Get previous day's breadth to determine DIRECTION
  const allBreadthDates = Array.from(loader.calculateBreadth().keys()).sort();
  // Find the index of today or the most recent date before today
  let todayIndex = -1;
  for (let i = allBreadthDates.length - 1; i >= 0; i--) {
    if (allBreadthDates[i] <= date) {
      todayIndex = i;
      break;
    }
  }
  const prevBreadth = todayIndex > 0 ? loader.getBreadth(allBreadthDates[todayIndex - 1]) : null;
  const todayBreadthDate = todayIndex >= 0 ? allBreadthDates[todayIndex] : null;

  // Calculate direction changes
  let mcoDirection = "FLAT";
  let mcsiDirection = "FLAT";
  let mcoChange = 0;
  let mcsiChange = 0;

  if (breadth && prevBreadth) {
    mcoChange = breadth.mco - prevBreadth.mco;
    mcsiChange = breadth.mcsi - prevBreadth.mcsi;

    // MCO direction (short-term momentum)
    if (mcoChange > 3) mcoDirection = "HOOK UP ↑";
    else if (mcoChange > 1) mcoDirection = "EXPANDING ↗";
    else if (mcoChange < -3) mcoDirection = "HOOK DOWN ↓";
    else if (mcoChange < -1) mcoDirection = "CONTRACTING ↘";
    else mcoDirection = "FLAT →";

    // MCSI direction (intermediate trend)
    if (mcsiChange > 10) mcsiDirection = "ACCELERATING ↑↑";
    else if (mcsiChange > 3) mcsiDirection = "TRENDING UP ↑";
    else if (mcsiChange < -10) mcsiDirection = "ACCELERATING DOWN ↓↓";
    else if (mcsiChange < -3) mcsiDirection = "TRENDING DOWN ↓";
    else mcsiDirection = "FLAT →";
  }

  // Determine breadth multiplier based on DIRECTION + Z-SCORE
  let breadthMultiplier = 1.0;
  let breadthReason = "NEUTRAL";

  if (breadth) {
    // Primary: Direction determines aggression
    const isExpanding = mcoChange > 1 || (mcoChange > 0 && mcsiChange > 0);
    const isContracting = mcoChange < -1 || (mcoChange < 0 && mcsiChange < 0);
    const isHookingUp = mcoChange > 3;
    const isHookingDown = mcoChange < -3;

    // Secondary: Z-score determines extremes
    const isOversold = breadth.mcoZscore <= -1;
    const isOverbought = breadth.mcoZscore >= 1;

    if (isHookingUp && !isOverbought) {
      // Hook up from non-overbought = aggressive
      breadthMultiplier = 1.2;
      breadthReason = "MCO HOOK UP ↑ (" + mcoChange.toFixed(1) + ")";
    } else if (isHookingDown) {
      // Hook down = defensive
      breadthMultiplier = 0.7;
      breadthReason = "MCO HOOK DOWN ↓ (" + mcoChange.toFixed(1) + ")";
    } else if (isOversold && isExpanding) {
      // Oversold + expanding = potential bottom, be careful but opportunistic
      breadthMultiplier = 0.9;
      breadthReason = "OVERSOLD + EXPANDING (z=" + breadth.mcoZscore.toFixed(2) + "σ)";
    } else if (isOverbought && isContracting) {
      // Overbought + contracting = potential top, defensive
      breadthMultiplier = 0.6;
      breadthReason = "OVERBOUGHT + CONTRACTING (z=" + breadth.mcoZscore.toFixed(2) + "σ)";
    } else if (isOverbought) {
      // Just overbought
      breadthMultiplier = 0.8;
      breadthReason = "OVERBOUGHT (z=" + breadth.mcoZscore.toFixed(2) + "σ)";
    } else if (isOversold) {
      // Just oversold
      breadthMultiplier = 0.75;
      breadthReason = "OVERSOLD (z=" + breadth.mcoZscore.toFixed(2) + "σ)";
    } else if (isExpanding) {
      // Normal expanding
      breadthMultiplier = 1.1;
      breadthReason = "EXPANDING ↗ (MCO+" + mcoChange.toFixed(1) + ")";
    } else if (isContracting) {
      // Normal contracting
      breadthMultiplier = 0.85;
      breadthReason = "CONTRACTING ↘ (MCO" + mcoChange.toFixed(1) + ")";
    } else {
      // Flat
      breadthMultiplier = 1.0;
      breadthReason = "FLAT → (MCO " + breadth.mco.toFixed(1) + ")";
    }
  }

  // QQQE structure multiplier
  let qqqeMultiplier = 1.0;
  let qqqeReason = "INSIDE structure";
  if (context.qqqe_position === "above") {
    qqqeMultiplier = 1.1;
    qqqeReason = "ABOVE 21EMA structure ✅";
  } else if (context.qqqe_position === "below") {
    qqqeMultiplier = 0.5;
    qqqeReason = "BELOW 21EMA structure ⚠️";
  }

  // Portfolio settings with position size constraints
  const PORTFOLIO = 100000;
  const MIN_POSITION = 5000;   // Minimum position size
  const MAX_POSITION = 20000;  // Maximum position size
  const TARGET_POSITION = 10000;  // Target position in middle of range

  // Base NER calibrated for $5k-$20k positions:
  // - Target average position: $10k-$12k
  // - Typical stop = 1.5 ATR ≈ 6-8% of stock price
  // - For $12k position with 7% stop, risk = $840 = 0.84% of $100k
  // - For $8k position with 7% stop, risk = $560 = 0.56% of $100k
  // - For $15k position with 7% stop, risk = $1050 = 1.05% of $100k
  // Base NER of 1.5% gives healthy sizing with room for state adjustment
  const baseNER = 1.5;
  const stateMultiplier = STATE_MULTIPLIERS[primaryState] || 1.0;

  // Final calculation: State × Breadth × QQQE
  const rawMultiplier = stateMultiplier * breadthMultiplier * qqqeMultiplier;
  const finalMultiplier = Math.min(1.3, Math.max(0.3, rawMultiplier)); // Cap at 130%, floor at 30%
  const adjustedNER = baseNER * finalMultiplier;

  console.log("\n  📊 BREADTH DIRECTION:");
  console.log("  " + "─".repeat(50));
  console.log("  MCO Today:           " + (breadth?.mco.toFixed(2) || "N/A"));
  console.log("  MCO Yesterday:       " + (prevBreadth?.mco.toFixed(2) || "N/A"));
  console.log("  MCO Change:          " + mcoChange.toFixed(2) + " → " + mcoDirection);
  console.log("  MCSI Change:         " + mcsiChange.toFixed(2) + " → " + mcsiDirection);

  console.log("\n  📊 PORTFOLIO SETTINGS:");
  console.log("  " + "─".repeat(50));
  console.log("  Portfolio:           $" + PORTFOLIO.toLocaleString());
  console.log("  Min Position:        $" + MIN_POSITION.toLocaleString());
  console.log("  Max Position:        $" + MAX_POSITION.toLocaleString());
  console.log("  Target Position:     $" + TARGET_POSITION.toLocaleString());

  console.log("\n  📊 SIZING INPUTS:");
  console.log("  " + "─".repeat(50));
  console.log("  Base NER:            " + baseNER + "%");
  console.log("  State:               " + primaryState + " → " + stateMultiplier + "x");
  console.log("  Breadth:             " + breadthReason + " → " + breadthMultiplier.toFixed(2) + "x");
  console.log("  QQQE:                " + qqqeReason + " → " + qqqeMultiplier.toFixed(2) + "x");
  console.log("  " + "─".repeat(50));
  console.log("  Raw Multiplier:      " + stateMultiplier + " × " + breadthMultiplier.toFixed(2) + " × " + qqqeMultiplier.toFixed(2) + " = " + rawMultiplier.toFixed(2) + "x");
  console.log("  Final Multiplier:    " + finalMultiplier.toFixed(2) + "x (capped 0.3-1.3)");
  console.log("  ⟹ Adjusted NER:     " + adjustedNER.toFixed(2) + "%");
  console.log("  ⟹ Risk per Trade:   $" + (PORTFOLIO * adjustedNER / 100).toFixed(0));

  // ============================================================================
  // SECTION 3: STOCK CANDIDATE SELECTION
  // ============================================================================
  console.log("\n\n┌" + "─".repeat(88) + "┐");
  console.log("│  3. STOCK CANDIDATE SELECTION                                                          │");
  console.log("└" + "─".repeat(88) + "┘");

  // Pre-fetch OHLC data for all tickers
  const tickers = loader.getUniverseTickers(date);
  console.log("\n  Pre-fetching OHLC for " + tickers.length + " tickers...");
  await loader.preloadOHLC(tickers, () => {});

  // Generate candidates
  const candidates = await generateCandidates(date, context, loader, {
    weights: { grade: { A: 30, B: 20, C: 10 }, distance: { perfect: 25, good: 15, acceptable: 5 },
               mode: { MODE1: 10, MODE2: 15 }, contraction: 10, close_range_max: 10,
               rs: { high: 10, medium: 7, low: 4 } },
    equity: 100000, maxPositions: 8, newsletterBoost: true
  });

  // Filter and rank
  const gradeFiltered = candidates.filter(c => c.grade === "A" || c.grade === "B");
  const rsFiltered = gradeFiltered.filter(c => c.rs_percentile >= 70);
  const newsletterPullbacks = new Set(loader.getPullbackCandidates(date));
  const ranked = rankCandidates(rsFiltered, {
    grade: { A: 30, B: 20, C: 10 }, distance: { perfect: 25, good: 15, acceptable: 5 },
    mode: { MODE1: 10, MODE2: 15 }, contraction: 10, close_range_max: 10,
    rs: { high: 10, medium: 7, low: 4 }
  }, newsletterPullbacks);

  // Sort by score with contraction boost
  const sorted = ranked.sort((a, b) => {
    let scoreA = a.score + (a.candidate.contraction ? 15 : 0);
    let scoreB = b.score + (b.candidate.contraction ? 15 : 0);
    return scoreB - scoreA;
  });

  console.log("\n  📋 FILTERING PIPELINE:");
  console.log("  " + "─".repeat(60));
  console.log("  Raw Candidates:     " + candidates.length);
  console.log("  After Grade (A/B):  " + gradeFiltered.length);
  console.log("  After RS (≥70):     " + rsFiltered.length);
  console.log("  Final Ranked:       " + sorted.length);

  // Show top 5 with full scoring breakdown
  console.log("\n\n┌" + "─".repeat(88) + "┐");
  console.log("│  4. TOP 5 CANDIDATES - DETAILED SCORING                                                │");
  console.log("└" + "─".repeat(88) + "┘");

  // Get existing open positions to determine NEW ENTRY vs ADD
  const allTrades = loader.getAllTrades();
  const openPositions = new Map<string, { shares: number; avgPrice: number }>();

  // Track open positions by processing trades chronologically
  for (const trade of allTrades.sort((a, b) => a.trade_date.localeCompare(b.trade_date))) {
    if (trade.trade_date > date) continue; // Only consider trades up to analysis date

    const ticker = trade.ticker;
    if (trade.action === "ENTRY" || trade.action === "ADD") {
      const existing = openPositions.get(ticker) || { shares: 0, avgPrice: 0 };
      const newShares = Math.round((trade.position_pct || 0) / 100 * PORTFOLIO / (trade.entry_price || 1));
      existing.shares += newShares;
      existing.avgPrice = trade.entry_price || existing.avgPrice;
      openPositions.set(ticker, existing);
    } else if (trade.action === "CLOSE" || trade.action === "STOP_OUT") {
      openPositions.delete(ticker);
    } else if (trade.action === "TRIM") {
      const existing = openPositions.get(ticker);
      if (existing) {
        // Reduce position by trim fraction (default 1/3)
        const trimFraction = trade.trim_fraction === "1/2" ? 0.5 : 0.33;
        existing.shares = Math.round(existing.shares * (1 - trimFraction));
        if (existing.shares <= 0) openPositions.delete(ticker);
      }
    }
  }

  const top5 = sorted.slice(0, 5);
  for (let i = 0; i < top5.length; i++) {
    const { candidate: c, score } = top5[i];
    const contractionBoost = c.contraction ? 15 : 0;
    const finalScore = score + contractionBoost;

    console.log("\n  ┌" + "─".repeat(84) + "┐");
    console.log("  │  #" + (i + 1) + "  " + c.ticker.padEnd(6) + "                                                                         │");
    console.log("  └" + "─".repeat(84) + "┘");

    console.log("\n    📈 PRICE DATA:");
    console.log("    Close:          $" + c.close.toFixed(2));
    console.log("    21 EMA:         $" + (c.ma_value?.toFixed(2) || "N/A"));
    console.log("    21 EMA Low:     $" + (c.ma_low?.toFixed(2) || "N/A"));
    console.log("    ATR (14):       $" + c.atr.toFixed(2));

    console.log("\n    📊 SCORING BREAKDOWN:");
    console.log("    " + "─".repeat(50));

    // Grade score
    const gradeScore = c.grade === "A" ? 30 : c.grade === "B" ? 20 : 10;
    console.log("    Grade:          " + c.grade + "         → +" + gradeScore + " pts");

    // RS score
    const rsScore = c.rs_percentile >= 90 ? 10 : c.rs_percentile >= 80 ? 7 : 4;
    console.log("    RS Rating:      " + c.rs_percentile + "        → +" + rsScore + " pts");

    // Mode score
    const modeScore = c.mode === "MODE2" ? 15 : 10;
    const modeLabel = c.mode === "MODE2" ? "reclaim & backtest" : "weakness into structure";
    console.log("    Mode:           " + c.mode + " (" + modeLabel + ") → +" + modeScore + " pts");

    // Distance score
    const distLabel = c.dist_to_21ema_atr <= 0.5 ? "perfect" : c.dist_to_21ema_atr <= 1.0 ? "good" : "acceptable";
    const distScore = distLabel === "perfect" ? 25 : distLabel === "good" ? 15 : 5;
    console.log("    Distance:       " + c.dist_to_21ema_atr.toFixed(2) + " ATR (" + distLabel + ") → +" + distScore + " pts");

    // Contraction
    console.log("    Contraction:    " + (c.contraction ? "Yes" : "No") + "       → +" + contractionBoost + " pts");

    // Setup type
    console.log("    Setup:          " + c.setup_type);

    console.log("    " + "─".repeat(50));
    console.log("    TOTAL SCORE:    " + finalScore + " pts");

    // Position sizing for this stock with min/max constraints
    const stopATR = c.close - (c.atr * 1.5);
    const rPerShare = c.close - stopATR;
    const stopPct = (rPerShare / c.close) * 100;
    const targetRiskDollars = PORTFOLIO * (adjustedNER / 100);

    // Calculate position from risk
    let sharesFromRisk = Math.floor(targetRiskDollars / rPerShare);
    let positionFromRisk = sharesFromRisk * c.close;

    // Apply min/max constraints
    let finalShares = sharesFromRisk;
    let finalPosition = positionFromRisk;
    let sizeNote = "";

    if (positionFromRisk < MIN_POSITION) {
      // Below minimum - scale up to minimum
      finalShares = Math.ceil(MIN_POSITION / c.close);
      finalPosition = finalShares * c.close;
      sizeNote = " (scaled to min)";
    } else if (positionFromRisk > MAX_POSITION) {
      // Above maximum - cap at maximum
      finalShares = Math.floor(MAX_POSITION / c.close);
      finalPosition = finalShares * c.close;
      sizeNote = " (capped at max)";
    }

    const actualRisk = finalShares * rPerShare;
    const actualNER = (actualRisk / PORTFOLIO) * 100;
    const positionPct = (finalPosition / PORTFOLIO) * 100;

    // Round position to nearest $1,000 for cleaner display
    const positionRounded = Math.round(finalPosition / 1000) * 1000;
    const riskRounded = Math.round(actualRisk / 10) * 10;

    // Calculate trim target (2R)
    const trimTargetPrice = c.close + (rPerShare * 2);

    // Determine if this is NEW ENTRY or ADD
    const existingPosition = openPositions.get(c.ticker);
    const actionType = existingPosition ? "ADD" : "NEW ENTRY";

    // Calculate ADD sizing (half of entry size)
    const addShares = Math.floor(finalShares / 2);
    const addPosition = addShares * c.close;
    const addPositionRounded = Math.round(addPosition / 1000) * 1000;
    const addPositionPct = (addPosition / PORTFOLIO) * 100;
    const addRisk = addShares * rPerShare;
    const addNER = (addRisk / PORTFOLIO) * 100;

    console.log("\n    💰 TRADE RECOMMENDATIONS:");
    console.log("    " + "═".repeat(50));

    // NEW ENTRY format (matching discord)
    console.log("\n    📗 NEW ENTRY:");
    console.log("    ──────────────────────────────────────────────");
    console.log("    Long " + Math.round(positionPct) + "% " + c.ticker + " @ " + c.close.toFixed(2));
    console.log("    SSL @ " + stopATR.toFixed(2));
    console.log("    EC Risk: -" + actualNER.toFixed(2) + "%");
    console.log("    Trim: 1/3 at 2R @ " + trimTargetPrice.toFixed(2));
    console.log("    ──────────────────────────────────────────────");
    console.log("    Shares: " + finalShares + "  |  Position: $" + positionRounded.toLocaleString());

    // ADD format (matching discord)
    console.log("\n    📘 ADD (to existing position):");
    console.log("    ──────────────────────────────────────────────");
    console.log("    ADD " + Math.round(addPositionPct) + "% " + c.ticker + " @ " + c.close.toFixed(2));
    console.log("    SSL @ " + stopATR.toFixed(2));
    console.log("    EC Risk: -" + addNER.toFixed(2) + "%");
    console.log("    ──────────────────────────────────────────────");
    console.log("    Shares: " + addShares + "  |  Position: $" + addPositionRounded.toLocaleString());

    // Show if there's an existing position
    if (existingPosition) {
      console.log("\n    ⚠️  EXISTING POSITION: ~" + existingPosition.shares + " shares");
    }
  }

  console.log("\n\n" + "═".repeat(90));
  console.log("                              END OF ANALYSIS");
  console.log("═".repeat(90));
}

main().catch(console.error);
