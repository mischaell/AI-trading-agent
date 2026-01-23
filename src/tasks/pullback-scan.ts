/**
 * Task 3 — Liquid Leaders 21DMA Pullback Scan (EOD)
 *
 * Filters universe to 5-10 pullback candidates near 21EMA structure.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * @see agent_tasks.md Task 3
 * @see agent_skeleton_v1.0.md Section 2 (Structure Definition)
 */

import Decimal from 'decimal.js';
import {
  PullbackScanOutput,
  PullbackCandidate,
  PullbackScanRules,
  ReadinessGrade,
  RefreshFrequency,
} from '@/types';
import { UniverseLeader } from '@/types/universe';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended ticker data for pullback scanning
 * Includes additional metrics beyond UniverseLeader
 */
export interface PullbackTickerData extends UniverseLeader {
  /** Distance to 50EMA in ATR units */
  dist_50ema_atr: number;
  /** Daily closing range percentage (0-100) */
  close_range_pct: number;
  /** Whether price is contracting (5d range < 20d range) */
  is_contracting: boolean;
  /** Weekly return percentage */
  weekly_return_pct: number;
  /** Current ATR value */
  atr: number;
  /** 21EMA high band (MAHigh) */
  ema21_high: number;
  /** 21EMA close band (MAClose) */
  ema21_close: number;
  /** 21EMA low band (MALow) */
  ema21_low: number;
  /** Current close price */
  close: number;
}

/**
 * Pullback filter criteria
 */
export interface PullbackFilterCriteria {
  /** Min distance to 21EMA in ATR (-0.5 default) */
  min_dist_21_atr?: number;
  /** Max distance to 21EMA in ATR (+1.0 default) */
  max_dist_21_atr?: number;
  /** Min distance to 50EMA in ATR (0 default) */
  min_dist_50_atr?: number;
  /** Max distance to 50EMA in ATR (+3.0 default) */
  max_dist_50_atr?: number;
  /** Min closing range percentage (20% default) */
  min_close_range_pct?: number;
  /** Require price contraction (default: false for flexibility) */
  require_contraction?: boolean;
  /** Max weekly return percentage (12% default) */
  max_weekly_return_pct?: number;
  /** Min days to earnings (7 default) */
  min_earnings_days?: number;
  /** Target candidate count range */
  target_count?: { min: number; max: number };
}

/**
 * Structure position relative to 21EMA cloud
 */
type StructurePosition = 'above_cloud' | 'inside_cloud' | 'below_cloud';

/**
 * Individual filter check result
 */
interface FilterCheck {
  name: string;
  passed: boolean;
  value: string;
  reason?: string;
}

/**
 * Complete filter result for a ticker
 */
interface PullbackFilterResult {
  ticker: string;
  passed: boolean;
  checks: FilterCheck[];
  score: number;
  grade: ReadinessGrade;
}

// =============================================================================
// Default Filter Criteria
// =============================================================================

/**
 * Default locked filter criteria for pullback scan
 * Based on agent_skeleton and wireframe specifications
 */
export const DEFAULT_PULLBACK_CRITERIA: Required<PullbackFilterCriteria> = {
  min_dist_21_atr: -0.5,
  max_dist_21_atr: 1.0,
  min_dist_50_atr: 0,
  max_dist_50_atr: 3.0,
  min_close_range_pct: 20,
  require_contraction: false, // Soft filter - affects grade, not pass/fail
  max_weekly_return_pct: 12,
  min_earnings_days: 7,
  target_count: { min: 5, max: 10 },
};

/**
 * Scan rules for display (human-readable)
 */
export const PULLBACK_SCAN_RULES: PullbackScanRules = {
  not_extended: '< 1x ADR from 21EMA structure',
  dist_21_atr: '-0.5 to +1.0 x ATR from 21EMA',
  dist_50_atr: '0 to +3.0 x ATR from 50EMA',
  close_in_upper_range: '> 20% daily closing range',
  contraction: 'Price contraction (5d vs 20d)',
  weekly_return: 'Weekly return < 12%',
  earnings: 'Earnings in 7+ days',
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
// Structure Analysis
// =============================================================================

/**
 * Determine price position relative to 21EMA structure cloud
 *
 * @param close - Current close price
 * @param ema21High - 21EMA of highs
 * @param ema21Close - 21EMA of closes
 * @param ema21Low - 21EMA of lows
 * @returns Structure position
 */
function determineStructurePosition(
  close: Decimal,
  ema21High: Decimal,
  ema21Close: Decimal,
  ema21Low: Decimal
): StructurePosition {
  // Above cloud: close > all three EMAs
  if (close.gt(ema21High) && close.gt(ema21Close) && close.gt(ema21Low)) {
    return 'above_cloud';
  }

  // Below cloud: close < all three EMAs
  if (close.lt(ema21High) && close.lt(ema21Close) && close.lt(ema21Low)) {
    return 'below_cloud';
  }

  // Inside cloud
  return 'inside_cloud';
}

// =============================================================================
// Filter Functions
// =============================================================================

/**
 * Check distance to 21EMA filter
 */
function checkDist21Filter(
  ticker: PullbackTickerData,
  minDist: number,
  maxDist: number
): FilterCheck {
  const dist = toDecimal(ticker.dist_21ema_atr);
  const min = toDecimal(minDist);
  const max = toDecimal(maxDist);

  const passed = dist.gte(min) && dist.lte(max);

  return {
    name: 'dist_21_atr',
    passed,
    value: `${ticker.dist_21ema_atr.toFixed(2)}`,
    reason: passed ? undefined : `Dist21 ${ticker.dist_21ema_atr.toFixed(2)} outside [${minDist}, ${maxDist}]`,
  };
}

/**
 * Check distance to 50EMA filter
 */
function checkDist50Filter(
  ticker: PullbackTickerData,
  minDist: number,
  maxDist: number
): FilterCheck {
  const dist = toDecimal(ticker.dist_50ema_atr);
  const min = toDecimal(minDist);
  const max = toDecimal(maxDist);

  const passed = dist.gte(min) && dist.lte(max);

  return {
    name: 'dist_50_atr',
    passed,
    value: `${ticker.dist_50ema_atr.toFixed(2)}`,
    reason: passed ? undefined : `Dist50 ${ticker.dist_50ema_atr.toFixed(2)} outside [${minDist}, ${maxDist}]`,
  };
}

/**
 * Check closing range filter
 */
function checkCloseRangeFilter(
  ticker: PullbackTickerData,
  minPct: number
): FilterCheck {
  const closeRange = toDecimal(ticker.close_range_pct);
  const min = toDecimal(minPct);

  const passed = closeRange.gte(min);

  return {
    name: 'close_range',
    passed,
    value: `${ticker.close_range_pct.toFixed(0)}%`,
    reason: passed ? undefined : `Close range ${ticker.close_range_pct.toFixed(0)}% < ${minPct}%`,
  };
}

/**
 * Check contraction filter (soft filter - affects grade)
 */
function checkContractionFilter(
  ticker: PullbackTickerData,
  require: boolean
): FilterCheck {
  // If not required, always pass but note the value
  if (!require) {
    return {
      name: 'contraction',
      passed: true,
      value: ticker.is_contracting ? 'YES' : 'NO',
    };
  }

  return {
    name: 'contraction',
    passed: ticker.is_contracting,
    value: ticker.is_contracting ? 'YES' : 'NO',
    reason: ticker.is_contracting ? undefined : 'No contraction',
  };
}

/**
 * Check weekly return filter
 */
function checkWeeklyReturnFilter(
  ticker: PullbackTickerData,
  maxPct: number
): FilterCheck {
  const weeklyRet = toDecimal(ticker.weekly_return_pct);
  const max = toDecimal(maxPct);

  const passed = weeklyRet.lte(max);

  return {
    name: 'weekly_return',
    passed,
    value: `${ticker.weekly_return_pct.toFixed(1)}%`,
    reason: passed ? undefined : `Weekly return ${ticker.weekly_return_pct.toFixed(1)}% > ${maxPct}%`,
  };
}

/**
 * Check earnings filter
 */
function checkEarningsFilter(
  ticker: PullbackTickerData,
  minDays: number
): FilterCheck {
  const passed = ticker.earnings_days >= minDays;

  return {
    name: 'earnings',
    passed,
    value: `${ticker.earnings_days}d`,
    reason: passed ? undefined : `Earnings in ${ticker.earnings_days}d < ${minDays}d`,
  };
}

/**
 * Apply all pullback filters to a ticker
 */
function applyPullbackFilters(
  ticker: PullbackTickerData,
  criteria: Required<PullbackFilterCriteria>
): PullbackFilterResult {
  const checks: FilterCheck[] = [
    checkDist21Filter(ticker, criteria.min_dist_21_atr, criteria.max_dist_21_atr),
    checkDist50Filter(ticker, criteria.min_dist_50_atr, criteria.max_dist_50_atr),
    checkCloseRangeFilter(ticker, criteria.min_close_range_pct),
    checkContractionFilter(ticker, criteria.require_contraction),
    checkWeeklyReturnFilter(ticker, criteria.max_weekly_return_pct),
    checkEarningsFilter(ticker, criteria.min_earnings_days),
  ];

  // Count passed checks for scoring
  const passedCount = checks.filter(c => c.passed).length;
  const totalHardFilters = checks.filter(c => c.name !== 'contraction').length;
  const passedHardFilters = checks.filter(c => c.name !== 'contraction' && c.passed).length;

  // Overall pass: all hard filters must pass
  const passed = passedHardFilters === totalHardFilters;

  // Score based on all checks (including soft filters)
  const score = passedCount / checks.length;

  // Grade based on score and contraction
  const grade = calculateGrade(score, ticker.is_contracting, ticker.close_range_pct);

  return {
    ticker: ticker.ticker,
    passed,
    checks,
    score,
    grade,
  };
}

// =============================================================================
// Grading
// =============================================================================

/**
 * Calculate readiness grade based on filter score and quality metrics
 *
 * Grade A: High quality pullback
 * - Score >= 0.9
 * - Price contraction present
 * - Close in upper range (>= 50%)
 *
 * Grade B: Acceptable pullback
 * - Score >= 0.7
 * - Some quality indicators present
 *
 * Grade C: Marginal pullback
 * - Passed hard filters
 * - Missing quality indicators
 */
function calculateGrade(
  score: number,
  isContracting: boolean,
  closeRangePct: number
): ReadinessGrade {
  const scoreDecimal = toDecimal(score);
  const closeRange = toDecimal(closeRangePct);

  // Grade A: High quality
  if (scoreDecimal.gte(0.9) && isContracting && closeRange.gte(50)) {
    return 'A';
  }

  // Grade A: Very high score even without contraction
  if (scoreDecimal.gte(0.95) && closeRange.gte(60)) {
    return 'A';
  }

  // Grade B: Good quality
  if (scoreDecimal.gte(0.7) && (isContracting || closeRange.gte(40))) {
    return 'B';
  }

  // Grade B: Decent score
  if (scoreDecimal.gte(0.8)) {
    return 'B';
  }

  // Grade C: Marginal
  return 'C';
}

// =============================================================================
// Sorting & Ranking
// =============================================================================

/**
 * Sort candidates by grade (A > B > C), then by RS (descending)
 */
function sortCandidates(
  candidates: Array<{ data: PullbackTickerData; result: PullbackFilterResult }>
): Array<{ data: PullbackTickerData; result: PullbackFilterResult }> {
  const gradeOrder: Record<ReadinessGrade, number> = { A: 0, B: 1, C: 2 };

  return [...candidates].sort((a, b) => {
    // Primary: Grade (A first)
    const gradeCompare = gradeOrder[a.result.grade] - gradeOrder[b.result.grade];
    if (gradeCompare !== 0) return gradeCompare;

    // Secondary: Score (higher first)
    if (b.result.score !== a.result.score) {
      return b.result.score - a.result.score;
    }

    // Tertiary: RS (higher first)
    return b.data.rs - a.data.rs;
  });
}

/**
 * Convert to PullbackCandidate output format
 */
function toPullbackCandidate(
  data: PullbackTickerData,
  result: PullbackFilterResult,
  rank: number
): PullbackCandidate {
  return {
    rank,
    ticker: data.ticker,
    rs: data.rs,
    theme: data.theme,
    price: data.close,
    adr_pct: data.adr_pct,
    dist_21_atr: data.dist_21ema_atr,
    dist_50_atr: data.dist_50ema_atr,
    close_pct: data.close_range_pct,
    contraction: data.is_contracting,
    weekly_return_pct: data.weekly_return_pct,
    earnings_days: data.earnings_days,
    ready_grade: result.grade,
  };
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Task 3 — Liquid Leaders 21DMA Pullback Scan
 *
 * Filters universe to 5-10 pullback candidates near 21EMA structure.
 * Candidates are graded A/B/C based on pullback quality.
 *
 * @param leaders - Array of universe leaders from Task 2 with extended data
 * @param criteria - Pullback filter criteria (uses defaults if not specified)
 * @param refresh - Refresh frequency (default: 'EOD')
 * @returns PullbackScanOutput with 5-10 candidates
 *
 * @example
 * ```typescript
 * const result = scanPullbackCandidates(leadersWithData, {
 *   max_dist_21_atr: 0.8,  // Tighter filter
 * });
 * console.log(result.count); // 5-10
 * console.log(result.candidates[0].ready_grade); // 'A'
 * ```
 */
export function scanPullbackCandidates(
  leaders: PullbackTickerData[],
  criteria?: PullbackFilterCriteria,
  refresh: RefreshFrequency = 'EOD'
): PullbackScanOutput {
  // Merge with defaults
  const mergedCriteria: Required<PullbackFilterCriteria> = {
    ...DEFAULT_PULLBACK_CRITERIA,
    ...criteria,
    target_count: {
      ...DEFAULT_PULLBACK_CRITERIA.target_count,
      ...criteria?.target_count,
    },
  };

  // Apply filters to all leaders
  const results = leaders.map(leader => ({
    data: leader,
    result: applyPullbackFilters(leader, mergedCriteria),
  }));

  // Filter to only passed candidates
  const passedCandidates = results.filter(r => r.result.passed);

  // Sort by grade and RS
  const sortedCandidates = sortCandidates(passedCandidates);

  // Limit to target count range
  const { max } = mergedCriteria.target_count;
  const limitedCandidates = sortedCandidates.slice(0, max);

  // Warn if below minimum
  const { min } = mergedCriteria.target_count;
  if (limitedCandidates.length < min) {
    console.warn(
      `Pullback scan returned ${limitedCandidates.length} candidates, below target minimum of ${min}`
    );
  }

  // Build output
  const tickerSymbols = limitedCandidates.map(c => c.data.ticker);
  const candidates = limitedCandidates.map((c, i) =>
    toPullbackCandidate(c.data, c.result, i + 1)
  );

  return {
    task: 'pullback_scan',
    refresh,
    count: limitedCandidates.length,
    tickers: tickerSymbols,
    candidates,
    rules: PULLBACK_SCAN_RULES,
  };
}

/**
 * Get detailed filter results for debugging/UI display
 *
 * @param leaders - Array of universe leaders
 * @param criteria - Filter criteria
 * @returns Array of detailed filter results
 */
export function getPullbackFilterResults(
  leaders: PullbackTickerData[],
  criteria?: PullbackFilterCriteria
): PullbackFilterResult[] {
  const mergedCriteria: Required<PullbackFilterCriteria> = {
    ...DEFAULT_PULLBACK_CRITERIA,
    ...criteria,
    target_count: {
      ...DEFAULT_PULLBACK_CRITERIA.target_count,
      ...criteria?.target_count,
    },
  };

  return leaders.map(leader => applyPullbackFilters(leader, mergedCriteria));
}

/**
 * Calculate structure position for a ticker
 * Exported for use in other modules
 */
export function getStructurePosition(ticker: PullbackTickerData): StructurePosition {
  return determineStructurePosition(
    toDecimal(ticker.close),
    toDecimal(ticker.ema21_high),
    toDecimal(ticker.ema21_close),
    toDecimal(ticker.ema21_low)
  );
}

// =============================================================================
// Utility Exports (for testing)
// =============================================================================

export {
  checkDist21Filter,
  checkDist50Filter,
  checkCloseRangeFilter,
  checkContractionFilter,
  checkWeeklyReturnFilter,
  checkEarningsFilter,
  applyPullbackFilters,
  calculateGrade,
  sortCandidates,
  toPullbackCandidate,
  determineStructurePosition,
  toDecimal,
};

export type { StructurePosition, FilterCheck, PullbackFilterResult };
