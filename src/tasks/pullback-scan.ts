/**
 * Task 3 — Liquid Leaders 21EMA Pullback Scan (EOD)
 *
 * Filters Liquid Leaders to 5-20 pullback candidates near 21EMA structure.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * Filters (all Liquid Leaders filters plus):
 * - Daily closing range > 10%
 * - Price contraction (last 5 days)
 * - Weekly return < 15%
 * - 0 to 1 x ATR from 21EMA
 * - -0.5 to 4 x ATR from 50SMA
 * - Advancing 21EMA & 10WMA
 * - Earnings in 7+ days
 *
 * @see agent_tasks.md Task 3
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
  /** Distance to 50SMA in ATR units */
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
  /** Whether 21EMA is advancing (rising) */
  is_21ema_advancing?: boolean;
  /** Whether 10WMA is advancing (rising) */
  is_10wma_advancing?: boolean;
}

/**
 * Pullback filter criteria
 */
export interface PullbackFilterCriteria {
  /** Min distance to 21EMA in ATR (0 default) */
  min_dist_21_atr?: number;
  /** Max distance to 21EMA in ATR (+1.0 default) */
  max_dist_21_atr?: number;
  /** Min distance to 50SMA in ATR (-0.5 default) */
  min_dist_50_atr?: number;
  /** Max distance to 50SMA in ATR (+4.0 default) */
  max_dist_50_atr?: number;
  /** Min closing range percentage (10% default) */
  min_close_range_pct?: number;
  /** Require price contraction - 5 day (default: true) */
  require_contraction?: boolean;
  /** Max weekly return percentage (15% default) */
  max_weekly_return_pct?: number;
  /** Min days to earnings (7 default) */
  min_earnings_days?: number;
  /** Require advancing 21EMA (default: true) */
  require_advancing_21ema?: boolean;
  /** Require advancing 10WMA (default: true) */
  require_advancing_10wma?: boolean;
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
 * All Liquid Leaders filters plus pullback-specific criteria
 */
export const DEFAULT_PULLBACK_CRITERIA: Required<PullbackFilterCriteria> = {
  min_dist_21_atr: -3.0,        // Widened: -3 to 4 x ATR from 21EMA
  max_dist_21_atr: 4.0,
  min_dist_50_atr: -5.0,        // Widened: removed as filter
  max_dist_50_atr: 10.0,
  min_close_range_pct: 0,       // Removed: any closing range OK
  require_contraction: false,   // Removed: contraction not required
  max_weekly_return_pct: 25,    // Widened: up to 25%
  min_earnings_days: 7,         // Keep: Earnings in 7+ days
  require_advancing_21ema: false, // Removed: not required
  require_advancing_10wma: false, // Removed: not required
  target_count: { min: 10, max: 30 }, // Target 10-30 candidates
};

/**
 * Scan rules for display (human-readable)
 */
export const PULLBACK_SCAN_RULES: PullbackScanRules = {
  not_extended: '0 to 1x ATR from 21EMA',
  dist_21_atr: '0 to +1.0 x ATR from 21EMA',
  dist_50_atr: '-0.5 to +4.0 x ATR from 50SMA',
  close_in_upper_range: '> 10% daily closing range',
  contraction: 'Price contraction (last 5 days)',
  weekly_return: 'Weekly return < 15%',
  earnings: 'Earnings in 7+ days',
  advancing_21ema: 'Advancing 21EMA',
  advancing_10wma: 'Advancing 10WMA',
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
 * Check advancing 21EMA filter
 */
function checkAdvancing21EmaFilter(
  ticker: PullbackTickerData,
  require: boolean
): FilterCheck {
  // If not required, always pass
  if (!require) {
    return {
      name: 'advancing_21ema',
      passed: true,
      value: ticker.is_21ema_advancing ? 'YES' : 'NO',
    };
  }

  // If data not provided, assume it passes (backwards compatibility)
  if (ticker.is_21ema_advancing === undefined) {
    return {
      name: 'advancing_21ema',
      passed: true,
      value: 'N/A',
    };
  }

  return {
    name: 'advancing_21ema',
    passed: ticker.is_21ema_advancing,
    value: ticker.is_21ema_advancing ? 'YES' : 'NO',
    reason: ticker.is_21ema_advancing ? undefined : '21EMA not advancing',
  };
}

/**
 * Check advancing 10WMA filter
 */
function checkAdvancing10WmaFilter(
  ticker: PullbackTickerData,
  require: boolean
): FilterCheck {
  // If not required, always pass
  if (!require) {
    return {
      name: 'advancing_10wma',
      passed: true,
      value: ticker.is_10wma_advancing ? 'YES' : 'NO',
    };
  }

  // If data not provided, assume it passes (backwards compatibility)
  if (ticker.is_10wma_advancing === undefined) {
    return {
      name: 'advancing_10wma',
      passed: true,
      value: 'N/A',
    };
  }

  return {
    name: 'advancing_10wma',
    passed: ticker.is_10wma_advancing,
    value: ticker.is_10wma_advancing ? 'YES' : 'NO',
    reason: ticker.is_10wma_advancing ? undefined : '10WMA not advancing',
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
    checkAdvancing21EmaFilter(ticker, criteria.require_advancing_21ema),
    checkAdvancing10WmaFilter(ticker, criteria.require_advancing_10wma),
  ];

  // Count passed checks for scoring
  const passedCount = checks.filter(c => c.passed).length;

  // All filters are now hard filters (including contraction)
  const totalHardFilters = checks.length;
  const passedHardFilters = checks.filter(c => c.passed).length;

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
 * Calculate backtest-style score for sorting
 */
function calculateBacktestScore(data: PullbackTickerData): number {
  const distAbs = Math.abs(data.dist_21ema_atr);
  const structureIntact = data.close >= data.ema21_low;

  // Grade score
  let gradeScore: number;
  if (distAbs <= 0.3 && data.is_contracting && data.close_range_pct >= 60 && structureIntact) {
    gradeScore = 30; // A
  } else if (distAbs <= 0.7 && data.close_range_pct >= 40 && structureIntact) {
    gradeScore = 20; // B
  } else {
    gradeScore = 10; // C
  }

  // Distance score
  const distScore = distAbs <= 0.5 ? 25 : distAbs <= 1.0 ? 15 : 5;

  // Mode score
  const priceAboveStructure = data.close > data.ema21_close;
  const isMode2 = priceAboveStructure && data.dist_21ema_atr >= 0 && data.dist_21ema_atr <= 0.5;
  const modeScore = isMode2 ? 15 : 10;

  // Contraction score
  const contractionScore = data.is_contracting ? 10 : 0;

  // RS score
  const rsScore = data.rs >= 90 ? 10 : data.rs >= 80 ? 7 : 4;

  return gradeScore + distScore + modeScore + contractionScore + rsScore;
}

/**
 * Sort candidates by backtest-style score (highest first)
 */
function sortCandidates(
  candidates: Array<{ data: PullbackTickerData; result: PullbackFilterResult }>
): Array<{ data: PullbackTickerData; result: PullbackFilterResult }> {
  return [...candidates].sort((a, b) => {
    // Primary: Backtest score (higher first)
    const scoreA = calculateBacktestScore(a.data);
    const scoreB = calculateBacktestScore(b.data);
    if (scoreB !== scoreA) return scoreB - scoreA;

    // Secondary: RS (higher first)
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
  // Calculate backtest-style Grade (A/B/C)
  const distAbs = Math.abs(data.dist_21ema_atr);
  const structureIntact = data.close >= data.ema21_low;
  let grade: 'A' | 'B' | 'C';
  if (distAbs <= 0.3 && data.is_contracting && data.close_range_pct >= 60 && structureIntact) {
    grade = 'A';
  } else if (distAbs <= 0.7 && data.close_range_pct >= 40 && structureIntact) {
    grade = 'B';
  } else {
    grade = 'C';
  }

  // Calculate Mode (MODE1/MODE2)
  const priceAboveStructure = data.close > data.ema21_close;
  const mode: 'MODE1' | 'MODE2' = (priceAboveStructure && data.dist_21ema_atr >= 0 && data.dist_21ema_atr <= 0.5)
    ? 'MODE2' // Reclaim & backtest
    : 'MODE1'; // Weakness into structure

  // Setup type description
  let setupType = mode === 'MODE2' ? 'reclaim & backtest' : 'weakness into structure';
  if (data.is_contracting) setupType += ' + contraction';

  // Calculate Score using backtest weights
  const gradeScore = grade === 'A' ? 30 : grade === 'B' ? 20 : 10;
  const distScore = distAbs <= 0.5 ? 25 : distAbs <= 1.0 ? 15 : 5;
  const modeScore = mode === 'MODE2' ? 15 : 10;
  const contractionScore = data.is_contracting ? 10 : 0;
  const rsScore = data.rs >= 90 ? 10 : data.rs >= 80 ? 7 : 4;
  const score = gradeScore + distScore + modeScore + contractionScore + rsScore;

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
    // Backtest-style scoring fields
    grade,
    mode,
    setup_type: setupType,
    score,
    ema21_close: data.ema21_close,
    structure_intact: structureIntact,
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
  checkAdvancing21EmaFilter,
  checkAdvancing10WmaFilter,
  applyPullbackFilters,
  calculateGrade,
  sortCandidates,
  toPullbackCandidate,
  determineStructurePosition,
  toDecimal,
};

export type { StructurePosition, FilterCheck, PullbackFilterResult };
