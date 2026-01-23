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
