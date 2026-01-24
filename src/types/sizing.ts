/**
 * Task 6 — Position Sizing & Risk Gate (Agent-led)
 * Computes position size, risk metrics, and applies risk gate.
 * @see agent_tasks.md Task 6
 * @see agent_skeleton_v1.0.md Section 6 (Risk & Sizing)
 */

import { EntryMode } from './readiness';

/**
 * Risk gate result
 * - PASS: Trade is approved for execution
 * - WITHHOLD: Trade is blocked by risk gate
 */
export type GateResult = 'PASS' | 'WITHHOLD';

/**
 * Reason for withholding a trade
 */
export type WithholdReason =
  | 'regime_forbids_entries'
  | 'ner_exceeds_limit'
  | 'earnings_too_close'
  | 'exposure_limit_reached';

/**
 * Action type for trade recommendations (sizing-specific)
 * NEW_ENTRY: Fresh position
 * ADD: Adding to existing position
 */
export type SizingActionType = 'NEW_ENTRY' | 'ADD';

/**
 * Position sizing multipliers breakdown
 * Combined multiplier = state × breadth × qqqe
 */
export interface SizingMultipliers {
  /** State multiplier: 0.5 (DEFENSIVE) to 1.2 (PRESSING) */
  state: number;
  /** State label used for multiplier (TESTING/PRESSING/DEFENSIVE/etc.) */
  state_label?: string;
  /** Breadth direction multiplier: 0.7 to 1.2 */
  breadth: number;
  /** Breadth direction label */
  breadth_direction?: string;
  /** QQQE structure multiplier: 0.5 (below) to 1.1 (above) */
  qqqe: number;
  /** QQQE position label */
  qqqe_position?: string;
  /** Combined multiplier (capped 0.3-1.3) */
  combined: number;
}

/**
 * Task 6 output payload (per ticker)
 * Contains sizing calculations and risk gate decision.
 */
export interface SizingOutput {
  task: 'sizing';
  /** Stock ticker symbol */
  ticker: string;
  /** Entry mode (determines default position %) */
  mode: EntryMode;
  /** Position size as percentage of equity (10-15%) */
  position_percent: number;
  /** Position size in dollars */
  position_dollars: number;
  /** Entry price */
  entry: number;
  /** Structural stop loss (21EMA low band) */
  ssl: number;
  /** Number of shares to buy */
  shares: number;
  /** Risk per share in dollars (entry - ssl) */
  r_per_share: number;
  /** Price target for 2R trim (1/3 position) */
  trim_2r_price: number;
  /** Equity capital risk percentage */
  ec_risk_percent: number;
  /** Risk gate result */
  gate: GateResult;
  /** Reason for withholding (only if gate=WITHHOLD) */
  withhold_reason?: WithholdReason;

  // === NEW: Multiplier and discord format fields ===

  /** Sizing multipliers breakdown */
  multipliers?: SizingMultipliers;
  /** Action type: NEW_ENTRY or ADD (if existing position) */
  action_type?: SizingActionType;
  /** Discord format: "Long 12% AAPL @ 145.50" */
  discord_format?: string;
  /** Trim fraction for profit taking: "1/3" */
  trim_fraction?: string;
  /** Target R multiple for trim: 2 */
  trim_target_r?: number;

  // === Backtest-Style Scoring Fields ===

  /** Setup grade: A (perfect), B (good), C (acceptable) */
  grade?: 'A' | 'B' | 'C';
  /** Total score based on backtest weights */
  score?: number;
  /** Relative strength rating (0-99) */
  rs?: number;
  /** Distance to 21EMA in ATR units */
  dist_21ema_atr?: number;
  /** Closing range percentage (0-100) */
  close_range_pct?: number;
  /** Whether price is contracting */
  is_contracting?: boolean;
  /** Setup type description */
  setup_type?: string;
}

/**
 * Batch sizing output for multiple tickers
 */
export interface SizingBatchOutput {
  task: 'sizing_batch';
  /** Individual sizing outputs */
  sizing: SizingOutput[];
  /** Total planned exposure in dollars */
  total_planned_dollars?: number;
  /** Total planned risk percentage */
  total_planned_risk_pct?: number;
}
