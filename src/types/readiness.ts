/**
 * Task 4 — Entry Readiness (Daily Close Only)
 * Evaluates pullback candidates at daily close and assigns entry mode.
 * @see agent_tasks.md Task 4
 * @see agent_skeleton_v1.0.md Section 3 (Entry Modes)
 */

/**
 * Entry mode for ready candidates
 * - MODE1: Weakness into structure (best R/R, lower confirmation)
 * - MODE2: Reclaim & Backtest / Confirmation (higher confirmation)
 */
export type EntryMode = 'MODE1' | 'MODE2';

/**
 * Individual readiness row for a pullback candidate
 * Evaluated at daily close only.
 */
export interface ReadinessRow {
  /** Stock ticker symbol */
  ticker: string;
  /** Whether candidate is ready for entry */
  ready: boolean;
  /** Assigned entry mode (only meaningful if ready=true) */
  mode: EntryMode;
  /** Distance to 21EMA in ATR units */
  dist_to_21ema_atr: number;
  /** Days until earnings (must be >= 7 for entry) */
  earnings_days?: number;
  /** Setup type description */
  setup?: string;
  /** Entry trigger description */
  entry_trigger?: string;
}

/**
 * Task 4 output payload
 * Contains readiness evaluation for all pullback candidates.
 */
export interface ReadinessOutput {
  task: 'readiness';
  /** Readiness rows for each candidate */
  rows: ReadinessRow[];
  /** Count of ready candidates */
  ready_count?: number;
  /** Count of not-ready candidates */
  not_ready_count?: number;
}
