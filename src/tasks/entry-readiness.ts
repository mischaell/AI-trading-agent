/**
 * Task 4 — Entry Readiness (Daily Close Only)
 *
 * Evaluates pullback candidates at daily close and assigns entry mode.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * Entry Modes (from agent_skeleton_v1.0.md Section 3):
 * - MODE1: Weakness into structure (best R/R, lower confirmation, 0.25% NER)
 * - MODE2: Reclaim & backtest (higher confirmation, 0.50% NER)
 *
 * @see agent_tasks.md Task 4
 * @see agent_skeleton_v1.0.md Section 3 (Entry Modes)
 * @see agent_skeleton_v1.0.md Section 6 (Risk & Sizing)
 */

import Decimal from 'decimal.js';
import {
  ReadinessOutput,
  ReadinessRow,
  EntryMode,
} from '@/types';
import { PullbackCandidate, ReadinessGrade } from '@/types/pullback';

// =============================================================================
// Types
// =============================================================================

/**
 * Bar color based on 21EMA structure
 * From agent_skeleton_v1.0.md Section 2.2
 */
export type BarColor = 'bullish' | 'bearish' | 'neutral';

/**
 * Extended pullback data for readiness evaluation
 * Includes daily close data and structure details
 */
export interface ReadinessTickerData extends PullbackCandidate {
  /** Current daily close price */
  close: number;
  /** Previous daily close price */
  prev_close: number;
  /** Daily high */
  high: number;
  /** Daily low */
  low: number;
  /** 21EMA high band (MAHigh) */
  ema21_high: number;
  /** 21EMA close band (MAClose) */
  ema21_close: number;
  /** 21EMA low band (MALow) */
  ema21_low: number;
  /** Previous day's 21EMA low (for structure break detection) */
  prev_ema21_low: number;
  /** Whether price reclaimed structure today (close > ema21_high after being below) */
  reclaimed_structure?: boolean;
  /** Whether this is a higher low vs prior swing */
  is_higher_low?: boolean;
  /** Whether structure is intact (not broken) */
  structure_intact?: boolean;
}

/**
 * Readiness evaluation criteria
 */
export interface ReadinessCriteria {
  /** Min distance to 21EMA in ATR (-0.5 default) */
  min_dist_21_atr?: number;
  /** Max distance to 21EMA in ATR (+1.0 default) */
  max_dist_21_atr?: number;
  /** Min days to earnings (7 default) */
  min_earnings_days?: number;
  /** Require structure to be intact (true default) */
  require_structure_intact?: boolean;
}

/**
 * Detailed readiness evaluation result
 */
interface ReadinessEvaluation {
  ticker: string;
  ready: boolean;
  mode: EntryMode;
  dist_to_21ema_atr: number;
  reasons: string[];
  bar_color: BarColor;
  structure_position: 'above' | 'inside' | 'below';
  setup_type: string;
  entry_trigger: string;
}

// =============================================================================
// Default Criteria
// =============================================================================

/**
 * Default readiness evaluation criteria
 */
export const DEFAULT_READINESS_CRITERIA: Required<ReadinessCriteria> = {
  min_dist_21_atr: -0.5,
  max_dist_21_atr: 1.0,
  min_earnings_days: 7,
  require_structure_intact: true,
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
// Bar Color & Structure Analysis
// =============================================================================

/**
 * Determine bar color based on close vs 21EMA structure
 * From agent_skeleton_v1.0.md Section 2.2
 *
 * - Bullish (black): close > MAHigh AND close > MAClose AND close > MALow
 * - Bearish (pink): close < MALow AND close < MAClose AND close < MAHigh
 * - Neutral: everything else
 */
function determineBarColor(
  close: Decimal,
  ema21High: Decimal,
  ema21Close: Decimal,
  ema21Low: Decimal
): BarColor {
  // Bullish: close above all three EMAs
  if (close.gt(ema21High) && close.gt(ema21Close) && close.gt(ema21Low)) {
    return 'bullish';
  }

  // Bearish: close below all three EMAs
  if (close.lt(ema21High) && close.lt(ema21Close) && close.lt(ema21Low)) {
    return 'bearish';
  }

  // Neutral: inside the structure
  return 'neutral';
}

/**
 * Determine structure position
 */
function determineStructurePosition(
  close: Decimal,
  ema21High: Decimal,
  ema21Low: Decimal
): 'above' | 'inside' | 'below' {
  if (close.gt(ema21High)) return 'above';
  if (close.lt(ema21Low)) return 'below';
  return 'inside';
}

/**
 * Check if structure is intact (not broken)
 * Structure is broken if daily close < MALow (21EMA low band)
 */
function isStructureIntact(
  close: Decimal,
  ema21Low: Decimal,
  prevClose: Decimal,
  prevEma21Low: Decimal
): boolean {
  // Current close must not be below current MALow
  if (close.lt(ema21Low)) {
    return false;
  }

  // If previous close was below previous MALow, structure was broken
  // (but may have been reclaimed)
  return true;
}

/**
 * Check if price reclaimed structure
 * Reclaim = was below structure, now back inside or above
 */
function hasReclaimedStructure(
  close: Decimal,
  prevClose: Decimal,
  ema21High: Decimal,
  ema21Low: Decimal,
  prevEma21Low: Decimal
): boolean {
  // Previous close was below structure
  const wasBelow = prevClose.lt(prevEma21Low);

  // Current close is inside or above structure
  const nowInsideOrAbove = close.gte(ema21Low);

  return wasBelow && nowInsideOrAbove;
}

// =============================================================================
// Entry Mode Assignment
// =============================================================================

/**
 * Determine entry mode based on price action and structure
 *
 * MODE1 — Weakness into Structure:
 * - Price pulling back INTO the 21EMA structure zone
 * - Best R/R, lower confirmation
 * - Trigger: close inside structure, neutral bar
 *
 * MODE2 — Reclaim & Backtest:
 * - Price reclaimed structure and is holding/retesting
 * - Higher confirmation, slightly worse R/R
 * - Trigger: reclaimed structure, higher low formation
 */
function determineEntryMode(
  ticker: ReadinessTickerData,
  close: Decimal,
  prevClose: Decimal,
  ema21High: Decimal,
  ema21Close: Decimal,
  ema21Low: Decimal,
  barColor: BarColor,
  structurePosition: 'above' | 'inside' | 'below'
): { mode: EntryMode; setup: string; trigger: string } {
  // Check for reclaim scenario
  const reclaimed = ticker.reclaimed_structure ?? hasReclaimedStructure(
    close,
    prevClose,
    ema21High,
    ema21Low,
    toDecimal(ticker.prev_ema21_low)
  );

  const isHigherLow = ticker.is_higher_low ?? false;

  // MODE2: Reclaim & Backtest
  // - Reclaimed structure OR
  // - Above structure with higher low formation OR
  // - Bullish bar above structure
  if (reclaimed && (isHigherLow || structurePosition === 'above')) {
    return {
      mode: 'MODE2',
      setup: '2) Reclaim & Backtest → Higher Low',
      trigger: 'Strength reclaim (R2G / 21 high reclaim)',
    };
  }

  if (structurePosition === 'above' && barColor === 'bullish' && isHigherLow) {
    return {
      mode: 'MODE2',
      setup: '2) Reclaim & Backtest → Higher Low',
      trigger: 'Strength reclaim (daily reversal pivot)',
    };
  }

  // MODE1: Weakness into Structure
  // - Inside structure with neutral bar
  // - Pulling back into structure zone
  // - Not extended above structure
  if (structurePosition === 'inside' ||
      (structurePosition === 'above' && close.minus(ema21High).lt(toDecimal(ticker.adr_pct).times(0.5)))) {
    return {
      mode: 'MODE1',
      setup: '1) Uptrend Pullback → Rising 21EMA',
      trigger: 'Weakness into 21 structure (retest)',
    };
  }

  // Default to MODE1 for pullbacks
  return {
    mode: 'MODE1',
    setup: '1) Uptrend Pullback → Rising 21EMA',
    trigger: 'Weakness into 21 structure',
  };
}

// =============================================================================
// Readiness Evaluation
// =============================================================================

/**
 * Evaluate a single candidate for entry readiness
 */
function evaluateCandidate(
  ticker: ReadinessTickerData,
  criteria: Required<ReadinessCriteria>
): ReadinessEvaluation {
  const close = toDecimal(ticker.close);
  const prevClose = toDecimal(ticker.prev_close);
  const ema21High = toDecimal(ticker.ema21_high);
  const ema21Close = toDecimal(ticker.ema21_close);
  const ema21Low = toDecimal(ticker.ema21_low);
  const prevEma21Low = toDecimal(ticker.prev_ema21_low);
  const distTo21Atr = toDecimal(ticker.dist_21_atr);

  const reasons: string[] = [];
  let ready = true;

  // 1. Check ATR bounds
  const minDist = toDecimal(criteria.min_dist_21_atr);
  const maxDist = toDecimal(criteria.max_dist_21_atr);

  if (distTo21Atr.lt(minDist)) {
    ready = false;
    reasons.push(`Dist to 21EMA (${distTo21Atr.toFixed(2)}) < min (${minDist.toFixed(2)})`);
  }

  if (distTo21Atr.gt(maxDist)) {
    ready = false;
    reasons.push(`Dist to 21EMA (${distTo21Atr.toFixed(2)}) > max (${maxDist.toFixed(2)})`);
  }

  // 2. Check structure intact
  const structureIntact = ticker.structure_intact ?? isStructureIntact(
    close,
    ema21Low,
    prevClose,
    prevEma21Low
  );

  if (criteria.require_structure_intact && !structureIntact) {
    ready = false;
    reasons.push('Structure broken (close < MALow)');
  }

  // 3. Check earnings constraint
  if (ticker.earnings_days < criteria.min_earnings_days) {
    ready = false;
    reasons.push(`Earnings in ${ticker.earnings_days}d < ${criteria.min_earnings_days}d minimum`);
  }

  // Determine bar color and structure position
  const barColor = determineBarColor(close, ema21High, ema21Close, ema21Low);
  const structurePosition = determineStructurePosition(close, ema21High, ema21Low);

  // Determine entry mode (even if not ready, for informational purposes)
  const { mode, setup, trigger } = determineEntryMode(
    ticker,
    close,
    prevClose,
    ema21High,
    ema21Close,
    ema21Low,
    barColor,
    structurePosition
  );

  // Add ready reason if passed all checks
  if (ready) {
    reasons.push('All readiness checks passed');
  }

  return {
    ticker: ticker.ticker,
    ready,
    mode,
    dist_to_21ema_atr: distTo21Atr.toNumber(),
    reasons,
    bar_color: barColor,
    structure_position: structurePosition,
    setup_type: setup,
    entry_trigger: trigger,
  };
}

/**
 * Convert evaluation to ReadinessRow
 */
function toReadinessRow(eval_result: ReadinessEvaluation, ticker: ReadinessTickerData): ReadinessRow {
  return {
    ticker: eval_result.ticker,
    ready: eval_result.ready,
    mode: eval_result.mode,
    dist_to_21ema_atr: eval_result.dist_to_21ema_atr,
    earnings_days: ticker.earnings_days,
    setup: eval_result.setup_type,
    entry_trigger: eval_result.entry_trigger,
  };
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Task 4 — Entry Readiness (Daily Close Only)
 *
 * Evaluates pullback candidates at daily close and assigns entry mode.
 * Only evaluates on daily close per EOD discipline (agent_skeleton Section 0.4).
 *
 * @param candidates - Array of pullback candidates from Task 3
 * @param criteria - Readiness criteria (uses defaults if not specified)
 * @returns ReadinessOutput with ready/not-ready status and entry modes
 *
 * @example
 * ```typescript
 * const result = evaluateReadiness(pullbackCandidates);
 *
 * // Get ready candidates
 * const ready = result.rows.filter(r => r.ready);
 * console.log(ready[0].mode); // 'MODE1' or 'MODE2'
 * ```
 */
export function evaluateReadiness(
  candidates: ReadinessTickerData[],
  criteria?: ReadinessCriteria
): ReadinessOutput {
  // Merge with defaults
  const mergedCriteria: Required<ReadinessCriteria> = {
    ...DEFAULT_READINESS_CRITERIA,
    ...criteria,
  };

  // Evaluate each candidate
  const evaluations = candidates.map(candidate =>
    evaluateCandidate(candidate, mergedCriteria)
  );

  // Convert to ReadinessRows
  const rows = candidates.map((candidate, i) =>
    toReadinessRow(evaluations[i], candidate)
  );

  // Count ready vs not ready
  const readyCount = rows.filter(r => r.ready).length;
  const notReadyCount = rows.filter(r => !r.ready).length;

  return {
    task: 'readiness',
    rows,
    ready_count: readyCount,
    not_ready_count: notReadyCount,
  };
}

/**
 * Get detailed evaluation results for debugging/UI display
 *
 * @param candidates - Array of pullback candidates
 * @param criteria - Readiness criteria
 * @returns Array of detailed evaluation results
 */
export function getDetailedEvaluations(
  candidates: ReadinessTickerData[],
  criteria?: ReadinessCriteria
): ReadinessEvaluation[] {
  const mergedCriteria: Required<ReadinessCriteria> = {
    ...DEFAULT_READINESS_CRITERIA,
    ...criteria,
  };

  return candidates.map(candidate =>
    evaluateCandidate(candidate, mergedCriteria)
  );
}

/**
 * Filter to only ready candidates
 *
 * @param output - ReadinessOutput from evaluateReadiness
 * @returns Array of ready ReadinessRows
 */
export function getReadyCandidates(output: ReadinessOutput): ReadinessRow[] {
  return output.rows.filter(r => r.ready);
}

/**
 * Get candidates by mode
 *
 * @param output - ReadinessOutput from evaluateReadiness
 * @param mode - Entry mode to filter by
 * @returns Array of ReadinessRows with specified mode
 */
export function getCandidatesByMode(
  output: ReadinessOutput,
  mode: EntryMode
): ReadinessRow[] {
  return output.rows.filter(r => r.ready && r.mode === mode);
}

/**
 * Get risk parameters for entry mode
 * From agent_skeleton_v1.0.md Section 6
 */
export function getModeRiskParameters(mode: EntryMode): {
  ner_pct: number;
  position_pct_min: number;
  position_pct_max: number;
} {
  switch (mode) {
    case 'MODE1':
      return {
        ner_pct: 0.25,
        position_pct_min: 10,
        position_pct_max: 12,
      };
    case 'MODE2':
      return {
        ner_pct: 0.50,
        position_pct_min: 12,
        position_pct_max: 15,
      };
  }
}

// =============================================================================
// Task 3 Integration Helpers
// =============================================================================

/**
 * Enriched pullback data from Task 3 that includes all structure information
 * This is the intermediate format from test-task3.ts that we need for evaluation
 */
export interface EnrichedPullbackData {
  ticker: string;
  rs: number;
  theme: string;
  price: number;
  adr_pct: number;
  dist_21ema_atr: number;
  dist_50ema_atr: number;
  close_range_pct: number;
  is_contracting: boolean;
  weekly_return_pct: number;
  earnings_days: number;
  // Structure data from analysis
  ema21_high: number;
  ema21_close: number;
  ema21_low: number;
  close: number;
  atr: number;
  // Optional additional data
  prev_close?: number;
  prev_ema21_low?: number;
  liquidity_m?: number;
  rank?: number;
  ready_grade?: 'A' | 'B' | 'C';
}

/**
 * Convert enriched Task 3 data to ReadinessTickerData format
 * This bridges the gap between Task 3 output and Task 4 input
 */
export function convertToReadinessData(
  data: EnrichedPullbackData
): ReadinessTickerData {
  return {
    // PullbackCandidate fields
    rank: data.rank ?? 0,
    ticker: data.ticker,
    rs: data.rs,
    theme: data.theme,
    price: data.price,
    adr_pct: data.adr_pct,
    dist_21_atr: data.dist_21ema_atr,
    dist_50_atr: data.dist_50ema_atr,
    close_pct: data.close_range_pct,
    contraction: data.is_contracting,
    weekly_return_pct: data.weekly_return_pct,
    earnings_days: data.earnings_days,
    ready_grade: data.ready_grade ?? 'B',

    // Extended fields for readiness evaluation
    close: data.close,
    prev_close: data.prev_close ?? data.close * 0.99, // Fallback if not provided
    high: data.close, // Use close as approximation if not provided
    low: data.close * 0.98, // Use approximation if not provided
    ema21_high: data.ema21_high,
    ema21_close: data.ema21_close,
    ema21_low: data.ema21_low,
    prev_ema21_low: data.prev_ema21_low ?? data.ema21_low * 0.99,

    // Computed fields
    structure_intact: data.close >= data.ema21_low,
    reclaimed_structure: false, // Will be determined during evaluation
    is_higher_low: false, // Will be determined during evaluation
  };
}

/**
 * Detailed evaluation result for display/debugging
 */
export interface DetailedReadinessResult {
  ticker: string;
  // Input data
  price: number;
  dist_21_atr: number;
  earnings_days: number;
  // Evaluation results
  atr_check: { pass: boolean; value: number; min: number; max: number };
  structure_check: { pass: boolean; close: number; ma_low: number };
  earnings_check: { pass: boolean; days: number; min_required: number };
  bar_color: BarColor;
  structure_position: 'above' | 'inside' | 'below';
  // Final result
  ready: boolean;
  mode: EntryMode;
  reasons: string[];
  setup: string;
  trigger: string;
}

/**
 * Evaluate readiness with detailed output for debugging/display
 *
 * @param data - Enriched pullback data from Task 3
 * @param criteria - Optional custom criteria
 * @returns Detailed evaluation result
 */
export function evaluateWithDetails(
  data: EnrichedPullbackData,
  criteria?: ReadinessCriteria
): DetailedReadinessResult {
  const mergedCriteria: Required<ReadinessCriteria> = {
    ...DEFAULT_READINESS_CRITERIA,
    ...criteria,
  };

  const readinessData = convertToReadinessData(data);
  const evaluation = evaluateCandidate(readinessData, mergedCriteria);

  // Build detailed result
  return {
    ticker: data.ticker,
    price: data.price,
    dist_21_atr: data.dist_21ema_atr,
    earnings_days: data.earnings_days,

    atr_check: {
      pass: data.dist_21ema_atr >= mergedCriteria.min_dist_21_atr &&
            data.dist_21ema_atr <= mergedCriteria.max_dist_21_atr,
      value: data.dist_21ema_atr,
      min: mergedCriteria.min_dist_21_atr,
      max: mergedCriteria.max_dist_21_atr,
    },

    structure_check: {
      pass: data.close >= data.ema21_low,
      close: data.close,
      ma_low: data.ema21_low,
    },

    earnings_check: {
      pass: data.earnings_days >= mergedCriteria.min_earnings_days ||
            data.earnings_days < 0, // -1 means unknown, which passes
      days: data.earnings_days,
      min_required: mergedCriteria.min_earnings_days,
    },

    bar_color: evaluation.bar_color,
    structure_position: evaluation.structure_position,

    ready: evaluation.ready,
    mode: evaluation.mode,
    reasons: evaluation.reasons,
    setup: evaluation.setup_type,
    trigger: evaluation.entry_trigger,
  };
}

/**
 * Evaluate multiple enriched pullback candidates
 *
 * @param candidates - Array of enriched pullback data from Task 3
 * @param criteria - Optional custom criteria
 * @returns ReadinessOutput for downstream tasks
 */
export function evaluateFromTask3(
  candidates: EnrichedPullbackData[],
  criteria?: ReadinessCriteria
): ReadinessOutput {
  const readinessData = candidates.map(convertToReadinessData);
  return evaluateReadiness(readinessData, criteria);
}

/**
 * Evaluate multiple candidates with detailed output
 *
 * @param candidates - Array of enriched pullback data
 * @param criteria - Optional custom criteria
 * @returns Array of detailed evaluation results
 */
export function evaluateAllWithDetails(
  candidates: EnrichedPullbackData[],
  criteria?: ReadinessCriteria
): DetailedReadinessResult[] {
  return candidates.map(c => evaluateWithDetails(c, criteria));
}

// =============================================================================
// Utility Exports (for testing)
// =============================================================================

export {
  determineBarColor,
  determineStructurePosition,
  isStructureIntact,
  hasReclaimedStructure,
  determineEntryMode,
  evaluateCandidate,
  toReadinessRow,
  toDecimal,
};

export type { ReadinessEvaluation };
