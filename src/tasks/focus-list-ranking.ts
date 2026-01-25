/**
 * Task 5 — Focus List Ranking (Top 5)
 *
 * Scores and ranks ready candidates, with optional manual promotion.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * Scoring factors (100 points max):
 * - Ready Grade: 30 pts (A=30, B=20, C=10)
 * - Distance to 21EMA: 25 pts (tighter = better)
 * - Entry Mode: 15 pts (MODE2=15, MODE1=10)
 * - Contraction: 10 pts (Yes=10, No=0)
 * - Close Range: 10 pts (scaled)
 * - Relative Strength: 10 pts (scaled)
 *
 * @see agent_tasks.md Task 5
 * @see agent_skeleton_v1.0.md Section 7 (Manual Promotion)
 */

import Decimal from 'decimal.js';
import {
  FocusListOutput,
  FocusListCandidate,
  ManualPromotion,
  ManualPromotionReason,
  ReclaimBacktestGrade,
  EntryMode,
} from '@/types';
import { ReadinessRow } from '@/types/readiness';
import { ReadinessGrade } from '@/types/pullback';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended readiness data for focus list ranking
 */
export interface FocusListTickerData extends ReadinessRow {
  /** Readiness grade from pullback scan (A/B/C) */
  ready_grade: ReadinessGrade;
  /** Whether price is contracting */
  contraction: boolean;
  /** Closing range percentage (0-100) */
  close_range_pct: number;
  /** Relative strength (0-99) */
  rs: number;
  /** Sector/theme */
  theme: string;
  /** Reclaim/backtest quality grade (for manual promotion) */
  reclaim_backtest_grade?: ReclaimBacktestGrade;
  /** Current price */
  price?: number;
  /** Whether structure data is approximated (no real data available) */
  is_approximated?: boolean;
}

/**
 * Scoring weights for ranking (sum = 100)
 */
export interface ScoringWeights {
  /** Weight for readiness grade A/B/C (default: 30) */
  ready_grade: number;
  /** Weight for distance to 21EMA (default: 25) */
  dist_21_atr: number;
  /** Weight for entry mode MODE1/MODE2 (default: 15) */
  entry_mode: number;
  /** Weight for contraction (default: 10) */
  contraction: number;
  /** Weight for close range (default: 10) */
  close_range: number;
  /** Weight for relative strength (default: 10) */
  rs: number;
}

/**
 * Manual promotion request
 */
export interface ManualPromotionRequest {
  /** Ticker to promote */
  ticker: string;
  /** Must be 'best_reclaim_backtest_quality' */
  reason: ManualPromotionReason;
}

/**
 * Scored candidate with breakdown
 */
interface ScoredCandidate {
  data: FocusListTickerData;
  total_score: Decimal;
  score_breakdown: {
    ready_grade: Decimal;
    dist_21_atr: Decimal;
    entry_mode: Decimal;
    contraction: Decimal;
    close_range: Decimal;
    rs: Decimal;
  };
  is_promoted: boolean;
}

// =============================================================================
// Default Weights
// =============================================================================

/**
 * Default scoring weights (sum = 100)
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  ready_grade: 30,
  dist_21_atr: 25,
  entry_mode: 15,
  contraction: 10,
  close_range: 10,
  rs: 10,
};

// =============================================================================
// Decimal Helpers
// =============================================================================

/**
 * Convert any numeric input to Decimal
 */
function toDecimal(value: Decimal | number | string): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

// =============================================================================
// Scoring Functions
// =============================================================================

/**
 * Score readiness grade
 * A = full weight, B = 2/3, C = 1/3
 */
function scoreReadyGrade(grade: ReadinessGrade, weight: number): Decimal {
  const w = toDecimal(weight);
  switch (grade) {
    case 'A':
      return w; // 100% of weight
    case 'B':
      return w.times(2).div(3); // 66% of weight
    case 'C':
      return w.div(3); // 33% of weight
    default:
      return new Decimal(0);
  }
}

/**
 * Score distance to 21EMA
 * Tighter to structure = higher score
 * 0 ATR = 25 pts, ±0.5 ATR = 15 pts, ±1.0 ATR = 5 pts
 */
function scoreDist21Atr(dist: number, weight: number): Decimal {
  const d = Math.abs(dist);

  // Stepped scoring per spec:
  // 0 ATR = full weight (25)
  // ±0.5 ATR = 60% (15)
  // ±1.0 ATR = 20% (5)
  // Beyond 1.0 = 0
  if (d <= 0.1) {
    return toDecimal(weight); // 25 pts
  } else if (d <= 0.5) {
    return toDecimal(weight).times(0.6); // 15 pts
  } else if (d <= 1.0) {
    return toDecimal(weight).times(0.2); // 5 pts
  }
  return new Decimal(0);
}

/**
 * Score entry mode
 * MODE2 = full weight (higher confirmation)
 * MODE1 = 2/3 weight (better R/R but less confirmation)
 */
function scoreEntryMode(mode: EntryMode, weight: number): Decimal {
  const w = toDecimal(weight);
  switch (mode) {
    case 'MODE2':
      return w; // 100% of weight
    case 'MODE1':
      return w.times(2).div(3); // 66% of weight
    default:
      return new Decimal(0);
  }
}

/**
 * Score contraction
 * Yes = full weight, No = 0
 */
function scoreContraction(hasContraction: boolean, weight: number): Decimal {
  return hasContraction ? toDecimal(weight) : new Decimal(0);
}

/**
 * Score close range
 * Scale 0-100% to 0-weight
 */
function scoreCloseRange(closeRangePct: number, weight: number): Decimal {
  const w = toDecimal(weight);
  const pct = toDecimal(closeRangePct).div(100);
  return w.times(pct);
}

/**
 * Score relative strength
 * RS 90-99 = 100%, RS 80-89 = 70%, RS 70-79 = 40%, below = 10%
 */
function scoreRelativeStrength(rs: number, weight: number): Decimal {
  const w = toDecimal(weight);

  if (rs >= 90) return w;
  if (rs >= 80) return w.times(0.7);
  if (rs >= 70) return w.times(0.4);
  return w.times(0.1);
}

/**
 * Calculate total score for a candidate
 */
function scoreCandidate(
  candidate: FocusListTickerData,
  weights: ScoringWeights
): ScoredCandidate {
  const breakdown = {
    ready_grade: scoreReadyGrade(candidate.ready_grade, weights.ready_grade),
    dist_21_atr: scoreDist21Atr(candidate.dist_to_21ema_atr, weights.dist_21_atr),
    entry_mode: scoreEntryMode(candidate.mode, weights.entry_mode),
    contraction: scoreContraction(candidate.contraction, weights.contraction),
    close_range: scoreCloseRange(candidate.close_range_pct, weights.close_range),
    rs: scoreRelativeStrength(candidate.rs, weights.rs),
  };

  const total_score = breakdown.ready_grade
    .plus(breakdown.dist_21_atr)
    .plus(breakdown.entry_mode)
    .plus(breakdown.contraction)
    .plus(breakdown.close_range)
    .plus(breakdown.rs);

  return {
    data: candidate,
    total_score,
    score_breakdown: breakdown,
    is_promoted: false,
  };
}

// =============================================================================
// Ranking & Promotion
// =============================================================================

/**
 * Sort candidates by score (descending)
 */
function sortByScore(candidates: ScoredCandidate[]): ScoredCandidate[] {
  return [...candidates].sort((a, b) => {
    // Primary: total score (descending)
    const scoreDiff = b.total_score.minus(a.total_score).toNumber();
    if (scoreDiff !== 0) return scoreDiff;

    // Secondary: RS (descending)
    return b.data.rs - a.data.rs;
  });
}

/**
 * Validate manual promotion request
 *
 * Rules from agent_skeleton Section 7:
 * - Must come from same candidate pool
 * - Only allowed reason: "Best reclaim & backtest quality"
 * - If no clear qualifier → no promotion
 */
function validateManualPromotion(
  request: ManualPromotionRequest | undefined,
  candidates: ScoredCandidate[],
  top5Tickers: string[]
): ManualPromotion {
  // No promotion requested
  if (!request) {
    return {
      used: false,
      ticker: null,
      reason: null,
    };
  }

  // Validate reason
  if (request.reason !== 'best_reclaim_backtest_quality') {
    console.warn(`Invalid promotion reason: ${request.reason}. Only 'best_reclaim_backtest_quality' allowed.`);
    return {
      used: false,
      ticker: null,
      reason: null,
    };
  }

  // Check if ticker is in candidate pool
  const candidateTickers = candidates.map(c => c.data.ticker);
  if (!candidateTickers.includes(request.ticker)) {
    console.warn(`Promotion ticker ${request.ticker} not in candidate pool.`);
    return {
      used: false,
      ticker: null,
      reason: null,
    };
  }

  // Check if already in top 5
  if (top5Tickers.includes(request.ticker)) {
    console.warn(`Promotion ticker ${request.ticker} already in top 5.`);
    return {
      used: false,
      ticker: null,
      reason: null,
    };
  }

  // Validate reclaim/backtest quality
  const promotedCandidate = candidates.find(c => c.data.ticker === request.ticker);
  if (promotedCandidate) {
    const grade = promotedCandidate.data.reclaim_backtest_grade;
    if (grade !== 'A') {
      console.warn(`Promotion candidate ${request.ticker} does not have grade A reclaim/backtest quality.`);
      // Allow but warn - the trader knows best
    }
  }

  return {
    used: true,
    ticker: request.ticker,
    reason: request.reason,
  };
}

/**
 * Apply manual promotion to rankings
 * Promotes ticker to position 5 (or replaces #5 if not in top 5)
 */
function applyPromotion(
  rankedCandidates: ScoredCandidate[],
  promotion: ManualPromotion
): ScoredCandidate[] {
  if (!promotion.used || !promotion.ticker) {
    return rankedCandidates;
  }

  const promotedIdx = rankedCandidates.findIndex(c => c.data.ticker === promotion.ticker);

  if (promotedIdx === -1 || promotedIdx < 5) {
    // Not found or already in top 5
    return rankedCandidates;
  }

  // Remove promoted candidate from current position
  const promoted = { ...rankedCandidates[promotedIdx], is_promoted: true };
  const result = [...rankedCandidates];
  result.splice(promotedIdx, 1);

  // Insert at position 5 (index 4)
  result.splice(4, 0, promoted);

  return result;
}

// =============================================================================
// Output Conversion
// =============================================================================

/**
 * Convert scored candidate to FocusListCandidate
 */
function toFocusListCandidate(
  scored: ScoredCandidate,
  rank: number
): FocusListCandidate {
  const data = scored.data;

  return {
    rank,
    ticker: data.ticker,
    theme: data.theme,
    mode: data.mode,
    setup: data.setup ?? '',
    entry_trigger: data.entry_trigger ?? '',
    dist_to_21ema_atr: data.dist_to_21ema_atr,
    earnings_days: data.earnings_days ?? 999,
    earnings_unknown: data.earnings_days === undefined || data.earnings_days === null,
    reclaim_backtest_grade: data.reclaim_backtest_grade ?? (data.ready_grade as ReclaimBacktestGrade),
    is_promoted: scored.is_promoted,
    // Backtest-style scoring fields
    score: scored.total_score.toNumber(),
    rs: data.rs,
    price: data.price,
    close_range_pct: data.close_range_pct,
    is_contracting: data.contraction,
    is_approximated: data.is_approximated,
  };
}

// =============================================================================
// Main Export
// =============================================================================

/** Minimum earnings days to be considered tradeable */
const MIN_EARNINGS_DAYS = 7;

/**
 * Task 5 — Focus List Ranking (Top 5)
 *
 * Scores and ranks ready candidates, with optional manual promotion.
 * Prioritizes tradeable candidates (earnings >= 7 days) over blocked ones.
 *
 * @param candidates - Array of READY candidates from Task 4
 * @param weights - Scoring weights (uses defaults if not specified)
 * @param manualPromotion - Optional manual promotion request
 * @returns FocusListOutput with top 5 and promotion details
 *
 * @example
 * ```typescript
 * const result = rankFocusList(readyCandidates);
 * console.log(result.top5); // ['NVDA', 'META', 'GOOGL', 'ANET', 'AMZN']
 *
 * // With manual promotion
 * const resultWithPromo = rankFocusList(readyCandidates, undefined, {
 *   ticker: 'CRWD',
 *   reason: 'best_reclaim_backtest_quality',
 * });
 * console.log(resultWithPromo.manual_promotion.used); // true
 * ```
 */
export function rankFocusList(
  candidates: FocusListTickerData[],
  weights?: Partial<ScoringWeights>,
  manualPromotion?: ManualPromotionRequest
): FocusListOutput {
  // Use all candidates (no longer filtering by ready status)
  if (candidates.length === 0) {
    return {
      task: 'focus_list',
      top5: [],
      manual_promotion: {
        used: false,
        ticker: null,
        reason: null,
      },
      candidates: [],
    };
  }

  // Merge weights with defaults
  const mergedWeights: ScoringWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...weights,
  };

  // Score all candidates
  const scoredCandidates = candidates.map(c => scoreCandidate(c, mergedWeights));

  // Separate tradeable (earnings >= 7 days or unknown) from blocked
  const isTradeable = (c: ScoredCandidate): boolean => {
    const earningsDays = c.data.earnings_days ?? 999; // Unknown = tradeable
    return earningsDays >= MIN_EARNINGS_DAYS || earningsDays < 0; // <0 means no earnings date
  };

  const tradeable = scoredCandidates.filter(isTradeable);
  const blocked = scoredCandidates.filter(c => !isTradeable(c));

  // Sort each group by score
  const sortedTradeable = sortByScore(tradeable);
  const sortedBlocked = sortByScore(blocked);

  // Output up to 10 tradeable candidates (no blocked/earnings-close candidates)
  // This gives sizing step enough candidates to filter and still have 5 PASS
  const MAX_CANDIDATES = 10;

  // Take up to MAX_CANDIDATES tradeable candidates ONLY (no blocked)
  let rankedCandidates = sortedTradeable.slice(0, MAX_CANDIDATES);

  // Keep all tradeable for potential promotion
  const allRanked = sortedTradeable;

  // Get initial top 5 tickers (before promotion)
  const initialTop5 = rankedCandidates.slice(0, 5).map(c => c.data.ticker);

  // Validate and apply manual promotion
  const promotion = validateManualPromotion(manualPromotion, allRanked, initialTop5);

  if (promotion.used) {
    rankedCandidates = applyPromotion(allRanked, promotion).slice(0, MAX_CANDIDATES);
  }

  // Get final top 5 tickers (for display)
  const top5Candidates = rankedCandidates.slice(0, 5);
  const top5Tickers = top5Candidates.map(c => c.data.ticker);

  // Convert ALL ranked candidates to output format (not just top 5)
  const focusListCandidates = rankedCandidates.map((c, i) =>
    toFocusListCandidate(c, i + 1)
  );

  return {
    task: 'focus_list',
    top5: top5Tickers,
    manual_promotion: promotion,
    candidates: focusListCandidates,
  };
}

/**
 * Get detailed scoring breakdown for all candidates
 * Useful for UI display and debugging
 */
export function getScoringDetails(
  candidates: FocusListTickerData[],
  weights?: Partial<ScoringWeights>
): Array<{
  ticker: string;
  total_score: number;
  breakdown: Record<string, number>;
  rank: number;
}> {
  const mergedWeights: ScoringWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...weights,
  };

  const readyCandidates = candidates.filter(c => c.ready);
  const scoredCandidates = readyCandidates.map(c => scoreCandidate(c, mergedWeights));
  const rankedCandidates = sortByScore(scoredCandidates);

  return rankedCandidates.map((c, i) => ({
    ticker: c.data.ticker,
    total_score: c.total_score.toNumber(),
    breakdown: {
      ready_grade: c.score_breakdown.ready_grade.toNumber(),
      dist_21_atr: c.score_breakdown.dist_21_atr.toNumber(),
      entry_mode: c.score_breakdown.entry_mode.toNumber(),
      contraction: c.score_breakdown.contraction.toNumber(),
      close_range: c.score_breakdown.close_range.toNumber(),
      rs: c.score_breakdown.rs.toNumber(),
    },
    rank: i + 1,
  }));
}

/**
 * Check if a candidate qualifies for manual promotion
 * Must have grade A reclaim/backtest quality
 */
export function canBePromoted(candidate: FocusListTickerData): boolean {
  return candidate.reclaim_backtest_grade === 'A';
}

/**
 * Find best promotion candidate from pool
 * Returns the highest scoring candidate with grade A reclaim/backtest
 * that is NOT in the current top 5
 */
export function findBestPromotionCandidate(
  candidates: FocusListTickerData[],
  weights?: Partial<ScoringWeights>
): FocusListTickerData | null {
  const mergedWeights: ScoringWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...weights,
  };

  const readyCandidates = candidates.filter(c => c.ready);
  const scoredCandidates = readyCandidates.map(c => scoreCandidate(c, mergedWeights));
  const rankedCandidates = sortByScore(scoredCandidates);

  // Get top 5 tickers
  const top5Tickers = rankedCandidates.slice(0, 5).map(c => c.data.ticker);

  // Find best candidate outside top 5 with grade A reclaim/backtest
  for (let i = 5; i < rankedCandidates.length; i++) {
    const candidate = rankedCandidates[i];
    if (candidate.data.reclaim_backtest_grade === 'A' &&
        !top5Tickers.includes(candidate.data.ticker)) {
      return candidate.data;
    }
  }

  return null;
}

// =============================================================================
// Data Merging Helpers (Tasks 2-4 Integration)
// =============================================================================

/**
 * Data from Task 2 (Universe Scan) for a ticker
 */
export interface Task2Data {
  ticker: string;
  rs: number;
  theme: string;
}

/**
 * Data from Task 3 (Pullback Scan) for a ticker
 */
export interface Task3Data {
  ticker: string;
  ready_grade: ReadinessGrade;
  contraction: boolean;
  close_range_pct: number;
  dist_21_atr: number;
  dist_50_atr: number;
}

/**
 * Data from Task 4 (Entry Readiness) for a ticker
 */
export interface Task4Data {
  ticker: string;
  ready: boolean;
  mode: EntryMode;
  dist_to_21ema_atr: number;
  earnings_days: number;
  setup?: string;
  entry_trigger?: string;
}

/**
 * Combined data from Tasks 2-4 for focus list ranking
 */
export interface CombinedTaskData {
  task2: Task2Data;
  task3: Task3Data;
  task4: Task4Data;
}

/**
 * Merge data from Tasks 2-4 into FocusListTickerData format
 *
 * @param combined - Combined data from Tasks 2-4
 * @returns FocusListTickerData ready for scoring
 */
export function mergeTasks2To4(combined: CombinedTaskData): FocusListTickerData {
  const { task2, task3, task4 } = combined;

  return {
    // From ReadinessRow (Task 4)
    ticker: task4.ticker,
    ready: task4.ready,
    mode: task4.mode,
    dist_to_21ema_atr: task4.dist_to_21ema_atr,
    earnings_days: task4.earnings_days,
    setup: task4.setup,
    entry_trigger: task4.entry_trigger,

    // From Task 3
    ready_grade: task3.ready_grade,
    contraction: task3.contraction,
    close_range_pct: task3.close_range_pct,

    // From Task 2
    rs: task2.rs,
    theme: task2.theme,

    // Derived - use ready_grade as reclaim_backtest_grade by default
    reclaim_backtest_grade: task3.ready_grade as ReclaimBacktestGrade,
  };
}

/**
 * Batch merge data from Tasks 2-4
 *
 * @param task2Map - Map of ticker -> Task 2 data
 * @param task3Map - Map of ticker -> Task 3 data
 * @param task4Data - Array of Task 4 readiness rows
 * @returns Array of FocusListTickerData for all READY candidates
 */
export function batchMergeTasks(
  task2Map: Map<string, Task2Data>,
  task3Map: Map<string, Task3Data>,
  task4Data: Task4Data[]
): FocusListTickerData[] {
  const results: FocusListTickerData[] = [];

  for (const t4 of task4Data) {
    // Only include READY candidates
    if (!t4.ready) continue;

    const t2 = task2Map.get(t4.ticker);
    const t3 = task3Map.get(t4.ticker);

    if (!t2 || !t3) {
      console.warn(`Missing data for ticker ${t4.ticker}, skipping`);
      continue;
    }

    results.push(mergeTasks2To4({
      task2: t2,
      task3: t3,
      task4: t4,
    }));
  }

  return results;
}

/**
 * Detailed scoring result for display/debugging
 */
export interface DetailedScoringResult {
  ticker: string;
  rank: number;
  total_score: number;
  // Individual scores
  grade_score: number;
  grade_max: number;
  dist_score: number;
  dist_max: number;
  mode_score: number;
  mode_max: number;
  contraction_score: number;
  contraction_max: number;
  close_range_score: number;
  close_range_max: number;
  rs_score: number;
  rs_max: number;
  // Input values
  ready_grade: ReadinessGrade;
  dist_21_atr: number;
  mode: EntryMode;
  contraction: boolean;
  close_range_pct: number;
  rs: number;
  // Other data
  theme: string;
  is_promoted: boolean;
}

/**
 * Get detailed scoring breakdown with all scoring components
 * Useful for test output and debugging
 */
export function getDetailedScoringBreakdown(
  candidates: FocusListTickerData[],
  weights?: Partial<ScoringWeights>
): DetailedScoringResult[] {
  const mergedWeights: ScoringWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...weights,
  };

  const readyCandidates = candidates.filter(c => c.ready);
  const scoredCandidates = readyCandidates.map(c => scoreCandidate(c, mergedWeights));
  const rankedCandidates = sortByScore(scoredCandidates);

  return rankedCandidates.map((c, i) => ({
    ticker: c.data.ticker,
    rank: i + 1,
    total_score: Math.round(c.total_score.toNumber() * 100) / 100,
    // Individual scores
    grade_score: Math.round(c.score_breakdown.ready_grade.toNumber() * 100) / 100,
    grade_max: mergedWeights.ready_grade,
    dist_score: Math.round(c.score_breakdown.dist_21_atr.toNumber() * 100) / 100,
    dist_max: mergedWeights.dist_21_atr,
    mode_score: Math.round(c.score_breakdown.entry_mode.toNumber() * 100) / 100,
    mode_max: mergedWeights.entry_mode,
    contraction_score: Math.round(c.score_breakdown.contraction.toNumber() * 100) / 100,
    contraction_max: mergedWeights.contraction,
    close_range_score: Math.round(c.score_breakdown.close_range.toNumber() * 100) / 100,
    close_range_max: mergedWeights.close_range,
    rs_score: Math.round(c.score_breakdown.rs.toNumber() * 100) / 100,
    rs_max: mergedWeights.rs,
    // Input values
    ready_grade: c.data.ready_grade,
    dist_21_atr: c.data.dist_to_21ema_atr,
    mode: c.data.mode,
    contraction: c.data.contraction,
    close_range_pct: c.data.close_range_pct,
    rs: c.data.rs,
    // Other data
    theme: c.data.theme,
    is_promoted: c.is_promoted,
  }));
}

// =============================================================================
// Utility Exports (for testing)
// =============================================================================

export {
  scoreReadyGrade,
  scoreDist21Atr,
  scoreEntryMode,
  scoreContraction,
  scoreCloseRange,
  scoreRelativeStrength,
  scoreCandidate,
  sortByScore,
  validateManualPromotion,
  applyPromotion,
  toFocusListCandidate,
  toDecimal,
};

export type { ScoredCandidate };
