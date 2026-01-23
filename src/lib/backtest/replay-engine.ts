/**
 * Replay Engine
 *
 * Runs the trading agent pipeline on historical data to generate
 * trade recommendations for each day in the backtest range.
 *
 * @module backtest/replay-engine
 */

import Decimal from "decimal.js";
import { v4 as uuidv4 } from "uuid";
import { HistoricalDataLoader, StockData } from "./data-loader";
import type {
  DailyContext,
  Candidate,
  TradeRecommendation,
  ActualTrade,
  ScoringWeights,
  DEFAULT_SCORING_WEIGHTS,
  Grade,
  EntryMode,
  BacktestConfig,
  DailyBacktestResult,
  TradeAction,
  DiscordTradeOutcome,
  ExitReason,
} from "./types";
import { DiscordTradeData } from "./data-loader";

// =============================================================================
// Types
// =============================================================================

interface ReplayOptions {
  weights: ScoringWeights;
  equity: number;
  maxPositions: number;
  newsletterBoost: boolean; // Boost score if in newsletter pullbacks
}

const DEFAULT_REPLAY_OPTIONS: ReplayOptions = {
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
};

// =============================================================================
// RS Calculation
// =============================================================================

interface RSData {
  ticker: string;
  rs: number;
  return3m: number;
  return6m: number;
  return12m: number;
}

/**
 * Calculate relative strength for a ticker
 */
function calculateRS(bars: { date: string; close: number }[]): {
  return3m: number;
  return6m: number;
  return12m: number;
  weighted: number;
} {
  if (bars.length < 21) {
    return { return3m: 0, return6m: 0, return12m: 0, weighted: 0 };
  }

  const latestClose = bars[bars.length - 1].close;

  // Find closes at different lookback periods
  const close3m = bars.length >= 63 ? bars[bars.length - 63]?.close : bars[0].close;
  const close6m = bars.length >= 126 ? bars[bars.length - 126]?.close : bars[0].close;
  const close12m = bars.length >= 252 ? bars[bars.length - 252]?.close : bars[0].close;

  const return3m = close3m ? ((latestClose - close3m) / close3m) * 100 : 0;
  const return6m = close6m ? ((latestClose - close6m) / close6m) * 100 : 0;
  const return12m = close12m ? ((latestClose - close12m) / close12m) * 100 : 0;

  // Weighted average: 40% 3M, 35% 6M, 25% 12M
  const weighted = return3m * 0.4 + return6m * 0.35 + return12m * 0.25;

  return { return3m, return6m, return12m, weighted };
}

/**
 * Calculate RS percentile rank
 */
function calculateRSPercentile(tickers: RSData[]): Map<string, number> {
  const sorted = [...tickers].sort((a, b) => b.rs - a.rs);
  const percentiles = new Map<string, number>();

  for (let i = 0; i < sorted.length; i++) {
    const percentile = Math.round(((sorted.length - i) / sorted.length) * 100);
    percentiles.set(sorted[i].ticker, percentile);
  }

  return percentiles;
}

// =============================================================================
// Candidate Generation
// =============================================================================

/**
 * China ADR tickers to exclude
 */
const CHINA_ADRS = new Set([
  "BABA", "JD", "PDD", "BIDU", "NIO", "XPEV", "LI", "TME", "BILI", "TAL",
  "EDU", "NTES", "VNET", "YMM", "FUTU", "TIGR", "DIDI", "IQ", "HUYA", "DOYU",
]);

/**
 * Defensive tickers to exclude in uptrends
 */
const DEFENSIVE_TICKERS = new Set([
  "XLU", "XLP", "VZ", "T", "SO", "DUK", "D", "NEE", "AEP", "XEL",
]);

/**
 * Detect if price is in contraction (lower ATR)
 */
function detectContraction(bars: { high: number; low: number; close: number }[]): boolean {
  if (bars.length < 10) return false;

  // Calculate recent ATR (5-day) vs longer ATR (20-day)
  const calcATR = (slice: typeof bars) => {
    let sum = 0;
    for (let i = 1; i < slice.length; i++) {
      const tr = Math.max(
        slice[i].high - slice[i].low,
        Math.abs(slice[i].high - slice[i - 1].close),
        Math.abs(slice[i].low - slice[i - 1].close)
      );
      sum += tr;
    }
    return sum / (slice.length - 1);
  };

  const recentATR = calcATR(bars.slice(-5));
  const longerATR = calcATR(bars.slice(-20));

  // Contraction if recent ATR is 20%+ lower than longer ATR
  return recentATR < longerATR * 0.8;
}

/**
 * Calculate close position in daily range (0-100%)
 */
function calculateCloseInRange(bar: { open: number; high: number; low: number; close: number }): number {
  const range = bar.high - bar.low;
  if (range === 0) return 50;
  return ((bar.close - bar.low) / range) * 100;
}

/**
 * Determine grade based on setup quality
 */
function determineGrade(
  distTo21EMA: number,
  contraction: boolean,
  closeInRange: number,
  structureIntact: boolean
): Grade {
  // Grade A: Perfect setup
  if (
    Math.abs(distTo21EMA) <= 0.3 &&
    contraction &&
    closeInRange >= 60 &&
    structureIntact
  ) {
    return "A";
  }

  // Grade B: Good setup
  if (
    Math.abs(distTo21EMA) <= 0.7 &&
    closeInRange >= 40 &&
    structureIntact
  ) {
    return "B";
  }

  // Grade C: Acceptable
  return "C";
}

/**
 * Determine entry mode based on price action
 */
function determineMode(
  distTo21EMA: number,
  priceAboveStructure: boolean,
  closeInRange: number
): EntryMode {
  // MODE2: Reclaim & backtest (price above structure, near 21EMA)
  if (priceAboveStructure && distTo21EMA >= 0 && distTo21EMA <= 0.5) {
    return "MODE2";
  }

  // MODE1: Weakness into structure (price at or below structure)
  return "MODE1";
}

/**
 * Generate candidates from universe
 */
async function generateCandidates(
  date: string,
  context: DailyContext,
  loader: HistoricalDataLoader,
  options: ReplayOptions
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];

  // Get universe tickers
  const universeTickers = loader.getUniverseTickers(date);
  const newsletterPullbacks = new Set(loader.getPullbackCandidates(date));

  // Calculate RS for all tickers
  const rsData: RSData[] = [];
  for (const ticker of universeTickers) {
    if (CHINA_ADRS.has(ticker)) continue;
    if (context.market_state === "CONFIRMED_UPTREND" && DEFENSIVE_TICKERS.has(ticker)) continue;

    const stockData = await loader.getStockData(ticker, date);
    if (!stockData || stockData.bars.length < 21) continue;

    const rs = calculateRS(stockData.bars);
    rsData.push({
      ticker,
      rs: rs.weighted,
      return3m: rs.return3m,
      return6m: rs.return6m,
      return12m: rs.return12m,
    });
  }

  // Calculate RS percentiles
  const rsPercentiles = calculateRSPercentile(rsData);

  // Filter candidates:
  // - Discord tickers: RS >= 30 (relaxed to improve matching)
  // - Other tickers: RS >= 70 (strict liquid leaders filter)
  const discordTickers = new Set(loader.getDiscordTickers());
  const liquidLeaders = rsData.filter((r) => {
    const rsPercentile = rsPercentiles.get(r.ticker) || 0;
    const isDiscord = discordTickers.has(r.ticker);
    return isDiscord ? rsPercentile >= 30 : rsPercentile >= 70;
  });

  // Generate candidates for each qualified ticker
  for (const leader of liquidLeaders) {
    const stockData = await loader.getStockData(leader.ticker, date);
    if (!stockData) continue;

    const { latestClose, ma21High, ma21Close, ma21Low, atr14, distTo21EMA, bars } = stockData;
    const isDiscord = discordTickers.has(leader.ticker);

    // Check if within ATR bounds for entry
    // Discord tickers: relaxed bounds (-2.0 to +3.0 ATR)
    // Other tickers: strict bounds (-0.5 to +1.0 ATR)
    const atrLower = isDiscord ? -2.0 : -0.5;
    const atrUpper = isDiscord ? 3.0 : 1.0;
    if (distTo21EMA < atrLower || distTo21EMA > atrUpper) continue;

    // Check structure intact (skip for Discord tickers)
    const structureIntact = latestClose >= ma21Low;
    if (!structureIntact && !isDiscord) continue;

    // Get latest bar for close range calculation
    const latestBar = bars[bars.length - 1];
    const closeInRange = calculateCloseInRange(latestBar);

    // Check weekly return (not too extended)
    // Discord tickers: allow up to 25% weekly extension
    // Other tickers: max 12%
    const weekAgoClose = bars.length >= 5 ? bars[bars.length - 5].close : latestClose;
    const weeklyReturn = ((latestClose - weekAgoClose) / weekAgoClose) * 100;
    const maxWeeklyReturn = isDiscord ? 25 : 12;
    if (weeklyReturn > maxWeeklyReturn) continue;

    // Detect contraction
    const contraction = detectContraction(bars);

    // Determine grade and mode
    const priceAboveStructure = latestClose > ma21Close;
    const grade = determineGrade(distTo21EMA, contraction, closeInRange, structureIntact);
    const mode = determineMode(distTo21EMA, priceAboveStructure, closeInRange);

    // Determine setup type
    let setupType = mode === "MODE2" ? "reclaim & backtest" : "weakness into structure";
    if (contraction) setupType += " + contraction";

    // Determine trigger
    const trigger = mode === "MODE2"
      ? "Strength reclaim (R2G / 21 high reclaim)"
      : "Support hold at 21EMA";

    candidates.push({
      ticker: leader.ticker,
      date,
      rs_rank: leader.rs,
      rs_percentile: rsPercentiles.get(leader.ticker) || 0,
      grade,
      mode,
      setup_type: setupType,
      trigger,
      dist_to_21ema_atr: distTo21EMA,
      contraction,
      close_in_range_pct: closeInRange,
      close: latestClose,
      ma_high: ma21High,
      ma_close: ma21Close,
      ma_low: ma21Low,
      atr: atr14,
      earnings_days: -1, // Unknown in backtest
      structure_intact: structureIntact,
      atr_bounds_ok: distTo21EMA >= -0.5 && distTo21EMA <= 1.0,
    });
  }

  console.log(`[ReplayEngine] Generated ${candidates.length} candidates for ${date}`);
  return candidates;
}

// =============================================================================
// Scoring & Ranking
// =============================================================================

/**
 * Calculate score for a candidate
 */
function scoreCandidate(
  candidate: Candidate,
  weights: ScoringWeights,
  isNewsletterPick: boolean
): number {
  let score = 0;

  // Grade score
  score += weights.grade[candidate.grade];

  // Distance score (closer to 0 is better)
  const absDist = Math.abs(candidate.dist_to_21ema_atr);
  if (absDist <= 0.2) {
    score += weights.distance.perfect;
  } else if (absDist <= 0.5) {
    score += weights.distance.good;
  } else {
    score += weights.distance.acceptable;
  }

  // Mode score
  score += weights.mode[candidate.mode];

  // Contraction bonus
  if (candidate.contraction) {
    score += weights.contraction;
  }

  // Close in range (scaled 0-10)
  score += (candidate.close_in_range_pct / 100) * weights.close_range_max;

  // RS score
  if (candidate.rs_percentile >= 90) {
    score += weights.rs.high;
  } else if (candidate.rs_percentile >= 80) {
    score += weights.rs.medium;
  } else {
    score += weights.rs.low;
  }

  // Newsletter pick bonus
  if (isNewsletterPick) {
    score += 5;
  }

  return Math.round(score * 100) / 100;
}

/**
 * Rank candidates and select top 5
 */
function rankCandidates(
  candidates: Candidate[],
  weights: ScoringWeights,
  newsletterPullbacks: Set<string>
): { candidate: Candidate; score: number }[] {
  const scored = candidates.map((c) => ({
    candidate: c,
    score: scoreCandidate(c, weights, newsletterPullbacks.has(c.ticker)),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top 5
  return scored.slice(0, 5);
}

// =============================================================================
// Position Sizing
// =============================================================================

/**
 * Size position and apply risk gate
 */
function sizePosition(
  candidate: Candidate,
  score: number,
  rank: number,
  equity: number,
  context: DailyContext
): TradeRecommendation {
  const id = uuidv4();

  // Position sizing based on mode
  const positionPct = candidate.mode === "MODE2" ? 0.13 : 0.11;
  const positionDollars = new Decimal(equity).times(positionPct);
  const shares = positionDollars.div(candidate.close).floor().toNumber();
  const actualPositionDollars = new Decimal(shares).times(candidate.close);

  // SSL is the 21EMA Low
  const ssl = candidate.ma_low;

  // R per share
  const rPerShare = new Decimal(candidate.close).minus(ssl);

  // NER calculation
  const totalR = rPerShare.times(shares);
  const nerPct = totalR.div(equity).times(100).toNumber();

  // 2R target
  const trim2R = new Decimal(candidate.close).plus(rPerShare.times(2)).toNumber();

  // Trim shares (1/3 at 2R)
  const trimShares = Math.floor(shares / 3);

  // Risk gate
  let gatePassed = true;
  let gateReason: string | null = null;

  // Check market permissions
  if (!context.permissions.new_entries) {
    gatePassed = false;
    gateReason = "Market state forbids new entries";
  }

  // Check NER limits
  const nerLimit = candidate.mode === "MODE2" ? 0.5 : 0.25;
  if (nerPct > nerLimit && gatePassed) {
    gatePassed = false;
    gateReason = `NER ${nerPct.toFixed(2)}% exceeds ${candidate.mode} limit of ${nerLimit}%`;
  }

  // Check SSL validity
  if (ssl >= candidate.close && gatePassed) {
    gatePassed = false;
    gateReason = "SSL above entry price";
  }

  return {
    id,
    date: candidate.date,
    ticker: candidate.ticker,
    candidate,
    focus_rank: rank,
    score,

    entry_price: candidate.close,
    position_pct: positionPct * 100,
    position_dollars: actualPositionDollars.toNumber(),
    shares,

    ssl,
    r_per_share: rPerShare.toNumber(),
    ner_pct: nerPct,

    trim_shares: trimShares,
    trim_price_2r: trim2R,

    gate_passed: gatePassed,
    gate_reason: gateReason,

    market_state: context.market_state,
    daily_context_id: context.newsletter_id || context.date,
  };
}

// =============================================================================
// Trade Matching
// =============================================================================

/**
 * Convert Discord trade data to ActualTrade
 */
function convertDiscordTrade(data: DiscordTradeData): ActualTrade {
  return {
    id: data.id,
    date: data.trade_date,
    ticker: data.ticker,
    action: data.action as TradeAction,
    side: (data.side as "Long" | "Short") || "Long",
    entry_price: data.entry_price,
    position_pct: data.position_pct,
    ssl: data.ssl,
    ec_risk_pct: data.ec_risk_pct,
    exit_price: data.exit_price,
    gain_pct: data.gain_pct,
    r_multiple: data.r_multiple,
    trim_fraction: data.trim_fraction,
    recommendation_id: null,
    journal_entry_id: null,
    discord_message_id: data.discord_message_id,
    raw_message: data.raw_message,
  };
}

/**
 * Calculate days between two date strings (YYYY-MM-DD format)
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Match recommendations to actual trades with fuzzy date matching
 *
 * Matching strategy:
 * 1. Same ticker + same day = perfect match
 * 2. Same ticker + within window (±2 days) = fuzzy match
 * 3. Prioritize earlier recommendations for the same trade
 * 4. Track match quality for analysis
 */
interface MatchResult {
  trade: ActualTrade;
  recommendation: TradeRecommendation | null;
  matchType: "exact" | "fuzzy" | "unmatched";
  dayOffset: number | null;
}

function matchTrades(
  recommendations: TradeRecommendation[],
  actualTrades: ActualTrade[],
  options: { dateWindowDays?: number } = {}
): {
  matched: number;
  unmatched: number;
  byOffset: Record<number, number>;
  matches: MatchResult[];
} {
  const dateWindow = options.dateWindowDays ?? 2;
  const stats = {
    matched: 0,
    unmatched: 0,
    byOffset: {} as Record<number, number>,
    matches: [] as MatchResult[],
  };

  // Index recommendations by ticker for faster lookup
  const recsByTicker = new Map<string, TradeRecommendation[]>();
  for (const rec of recommendations) {
    const existing = recsByTicker.get(rec.ticker) || [];
    existing.push(rec);
    recsByTicker.set(rec.ticker, existing);
  }

  // Sort recommendations by date for each ticker (oldest first)
  for (const recs of recsByTicker.values()) {
    recs.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Track which recommendations have been used
  const usedRecs = new Set<string>();

  for (const trade of actualTrades) {
    // Only match entry-type trades
    if (trade.action !== "ENTRY" && trade.action !== "ADD") {
      continue;
    }

    const tickerRecs = recsByTicker.get(trade.ticker);
    if (!tickerRecs || tickerRecs.length === 0) {
      stats.unmatched++;
      stats.matches.push({
        trade,
        recommendation: null,
        matchType: "unmatched",
        dayOffset: null,
      });
      continue;
    }

    // Find best matching recommendation (same day preferred, then closest within window)
    let bestMatch: TradeRecommendation | null = null;
    let bestOffset = Infinity;

    for (const rec of tickerRecs) {
      if (usedRecs.has(rec.id)) continue;

      const offset = daysBetween(rec.date, trade.date);

      // Trade should be on or after recommendation (offset >= 0)
      // and within the window
      if (offset >= 0 && offset <= dateWindow) {
        if (offset < bestOffset) {
          bestOffset = offset;
          bestMatch = rec;
        }
      }
    }

    if (bestMatch) {
      trade.recommendation_id = bestMatch.id;
      usedRecs.add(bestMatch.id);
      stats.matched++;
      stats.byOffset[bestOffset] = (stats.byOffset[bestOffset] || 0) + 1;
      stats.matches.push({
        trade,
        recommendation: bestMatch,
        matchType: bestOffset === 0 ? "exact" : "fuzzy",
        dayOffset: bestOffset,
      });
    } else {
      stats.unmatched++;
      stats.matches.push({
        trade,
        recommendation: null,
        matchType: "unmatched",
        dayOffset: null,
      });
    }
  }

  return stats;
}

// =============================================================================
// Replay Engine
// =============================================================================

export class ReplayEngine {
  private loader: HistoricalDataLoader;
  private options: ReplayOptions;

  constructor(
    startDate: string,
    endDate: string,
    options: Partial<ReplayOptions> = {}
  ) {
    this.loader = new HistoricalDataLoader(startDate, endDate);
    this.options = { ...DEFAULT_REPLAY_OPTIONS, ...options };
  }

  /**
   * Initialize the engine (preload data)
   */
  async initialize(): Promise<void> {
    await this.loader.preload();
  }

  /**
   * Replay a single date
   */
  async replayDate(date: string): Promise<DailyBacktestResult> {
    console.log(`[ReplayEngine] Replaying ${date}`);

    // Get daily context
    const context = await this.loader.getContext(date);

    // Generate candidates
    const candidates = await generateCandidates(
      date,
      context,
      this.loader,
      this.options
    );

    // Get newsletter pullbacks for scoring boost
    const newsletterPullbacks = new Set(this.loader.getPullbackCandidates(date));

    // Rank candidates
    const ranked = rankCandidates(
      candidates,
      this.options.weights,
      newsletterPullbacks
    );

    // Size positions and apply risk gate
    const recommendations: TradeRecommendation[] = [];
    for (let i = 0; i < ranked.length; i++) {
      const { candidate, score } = ranked[i];
      const rec = sizePosition(
        candidate,
        score,
        i + 1,
        this.options.equity,
        context
      );
      recommendations.push(rec);
    }

    // Get actual trades for this date (and nearby dates for fuzzy matching)
    const discordTrades = this.loader.getTrades(date);
    const actualTrades = discordTrades.map(convertDiscordTrade);

    // Match recommendations to actual trades (with ±2 day window)
    const matchStats = matchTrades(recommendations, actualTrades, { dateWindowDays: 2 });

    if (matchStats.matched > 0) {
      const offsetDetails = Object.entries(matchStats.byOffset)
        .map(([offset, count]) => `${offset}d:${count}`)
        .join(", ");
      console.log(`[ReplayEngine] ${date}: Matched ${matchStats.matched} trades (${offsetDetails})`);
    }

    return {
      date,
      context,
      recommendations,
      actual_trades: actualTrades,
      outcomes: [], // Will be filled by OutcomeCalculator
      discord_outcomes: [], // Will be filled after fuzzy matching in replayAll
    };
  }

  /**
   * Replay all dates in range
   */
  async replayAll(
    onProgress?: (completed: number, total: number, date: string) => void
  ): Promise<DailyBacktestResult[]> {
    const dates = this.loader.getDateRange();
    const results: DailyBacktestResult[] = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      try {
        const result = await this.replayDate(date);
        results.push(result);
      } catch (error) {
        console.error(`[ReplayEngine] Error replaying ${date}:`, error);
      }

      onProgress?.(i + 1, dates.length, date);

      // Small delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // After all dates are replayed, do comprehensive fuzzy matching
    // This allows recommendations from day N to match trades from day N+1, N+2
    const allRecommendations = results.flatMap((r) => r.recommendations);
    const allDiscordTrades = this.loader.getAllTrades();
    const allActualTrades = allDiscordTrades.map(convertDiscordTrade);

    // Clear existing matches and re-match with fuzzy logic
    for (const trade of allActualTrades) {
      trade.recommendation_id = null;
    }

    const matchStats = matchTrades(allRecommendations, allActualTrades, {
      dateWindowDays: 2,
    });

    console.log(`\n[ReplayEngine] ═══════════════════════════════════════════════`);
    console.log(`[ReplayEngine] FUZZY MATCHING SUMMARY (±2 day window)`);
    console.log(`[ReplayEngine] ───────────────────────────────────────────────`);
    console.log(`[ReplayEngine] Total Discord ENTRY/ADD trades: ${matchStats.matched + matchStats.unmatched}`);
    console.log(`[ReplayEngine] Matched to recommendations:     ${matchStats.matched}`);
    console.log(`[ReplayEngine] Unmatched (off-thesis):         ${matchStats.unmatched}`);
    if (Object.keys(matchStats.byOffset).length > 0) {
      console.log(`[ReplayEngine] By offset: ${Object.entries(matchStats.byOffset)
        .map(([offset, count]) => `${offset}d=${count}`)
        .join(", ")}`);
    }
    console.log(`[ReplayEngine] ═══════════════════════════════════════════════\n`);

    // Create DiscordTradeOutcome for ALL trades (matched and unmatched)
    const discordOutcomes: DiscordTradeOutcome[] = matchStats.matches.map((match) => {
      // Determine exit info from Discord trade data if available
      let exitReason: ExitReason = "still_open";
      if (match.trade.r_multiple !== null) {
        if (match.trade.r_multiple >= 2) exitReason = "hit_2r";
        else if (match.trade.r_multiple < 0) exitReason = "stopped_out";
        else exitReason = "manual_close_profit";
      } else if (match.trade.gain_pct !== null) {
        if (match.trade.gain_pct < 0) exitReason = "stopped_out";
        else exitReason = "manual_close_profit";
      }

      return {
        trade: match.trade,
        matched_recommendation: match.recommendation,
        match_type: match.matchType,
        match_day_offset: match.dayOffset,
        exit_date: null, // Would need to look up from CLOSE/STOP_OUT trades
        exit_reason: exitReason,
        r_achieved: match.trade.r_multiple,
        gain_pct: match.trade.gain_pct,
        holding_days: null,
        outcome_source: match.trade.r_multiple !== null || match.trade.gain_pct !== null
          ? "discord" as const
          : "simulated" as const,
      };
    });

    // Update actual_trades in results with the matched trades
    const tradesByDate = new Map<string, ActualTrade[]>();
    const outcomesByDate = new Map<string, DiscordTradeOutcome[]>();

    for (const trade of allActualTrades) {
      const existing = tradesByDate.get(trade.date) || [];
      existing.push(trade);
      tradesByDate.set(trade.date, existing);
    }

    for (const outcome of discordOutcomes) {
      const existing = outcomesByDate.get(outcome.trade.date) || [];
      existing.push(outcome);
      outcomesByDate.set(outcome.trade.date, existing);
    }

    for (const result of results) {
      result.actual_trades = tradesByDate.get(result.date) || [];
      result.discord_outcomes = outcomesByDate.get(result.date) || [];
    }

    return results;
  }

  /**
   * Get the data loader (for outcome calculation)
   */
  getLoader(): HistoricalDataLoader {
    return this.loader;
  }
}

// =============================================================================
// Exports
// =============================================================================

export default {
  ReplayEngine,
  generateCandidates,
  rankCandidates,
  sizePosition,
  calculateRS,
};
