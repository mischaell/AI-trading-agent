/**
 * Task 5 — Focus List Ranking (Top 5)
 * Scores and ranks ready candidates, with optional manual promotion.
 * @see agent_tasks.md Task 5
 * @see agent_skeleton_v1.0.md Section 7 (Focus List Manual Promotion)
 */

import { EntryMode } from './readiness';

/** Allowed reason for manual promotion (strict constraint) */
export type ManualPromotionReason = 'best_reclaim_backtest_quality';

/**
 * Manual promotion details
 * Only one promotion allowed per cycle, only for specific reason.
 */
export interface ManualPromotion {
  /** Whether manual promotion was used */
  used: boolean;
  /** Ticker that was promoted (null if not used) */
  ticker: string | null;
  /** Reason for promotion (must be 'best_reclaim_backtest_quality' or null) */
  reason: ManualPromotionReason | null;
}

/** Reclaim/backtest quality grade */
export type ReclaimBacktestGrade = 'A' | 'B' | 'C';

/**
 * Focus list candidate with full details
 * Extended from readiness data with ranking and sizing prep.
 */
export interface FocusListCandidate {
  /** Rank in focus list (1-5) */
  rank: number;
  /** Stock ticker symbol */
  ticker: string;
  /** Sector/theme classification */
  theme: string;
  /** Assigned entry mode */
  mode: EntryMode;
  /** Setup type description */
  setup: string;
  /** Entry trigger description */
  entry_trigger: string;
  /** Distance to 21EMA in ATR units */
  dist_to_21ema_atr: number;
  /** Days until earnings */
  earnings_days: number;
  /** Reclaim/backtest quality grade */
  reclaim_backtest_grade: ReclaimBacktestGrade;
  /** Whether this candidate was manually promoted */
  is_promoted?: boolean;
}

/**
 * Task 5 output payload
 * Contains top 5 ranked candidates ready for sizing.
 */
export interface FocusListOutput {
  task: 'focus_list';
  /** Top 5 ticker symbols */
  top5: string[];
  /** Manual promotion details */
  manual_promotion: ManualPromotion;
  /** Full candidate details (optional, for UI) */
  candidates?: FocusListCandidate[];
}
