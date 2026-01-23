/**
 * Task 3 — Liquid Leaders 21DMA Pullback Scan (EOD)
 * Filters universe to 5-10 pullback candidates near 21EMA structure.
 * @see agent_tasks.md Task 3
 */

import { RefreshFrequency } from './universe';

/** Pullback scan filter rules (display strings) */
export interface PullbackScanRules {
  /** Max distance from 21EMA structure */
  not_extended: string;
  /** ATR distance range from 21EMA: "-0.5 to +1.0 x ATR" */
  dist_21_atr: string;
  /** ATR distance range from 50EMA: "0 to +3.0 x ATR" */
  dist_50_atr: string;
  /** Minimum closing range: "> 20% daily closing range" */
  close_in_upper_range: string;
  /** Price contraction requirement */
  contraction: string;
  /** Max weekly return: "< 12%" */
  weekly_return: string;
  /** Minimum days to earnings: "7+ days" */
  earnings: string;
}

/** Preliminary readiness grade for pullback candidates */
export type ReadinessGrade = 'A' | 'B' | 'C';

/**
 * Individual pullback candidate data
 * Candidates pass the pullback scan filters and are evaluated for entry readiness.
 */
export interface PullbackCandidate {
  /** Rank in the pullback scan */
  rank: number;
  /** Stock ticker symbol */
  ticker: string;
  /** Relative strength ranking (0-99) */
  rs: number;
  /** Sector/theme classification */
  theme: string;
  /** Current price */
  price: number;
  /** Average daily range percentage */
  adr_pct: number;
  /** Distance to 21EMA in ATR units */
  dist_21_atr: number;
  /** Distance to 50EMA in ATR units */
  dist_50_atr: number;
  /** Closing range percentage (0-100) */
  close_pct: number;
  /** Whether price is contracting (5d vs 20d) */
  contraction: boolean;
  /** Weekly return percentage */
  weekly_return_pct: number;
  /** Days until earnings */
  earnings_days: number;
  /** Preliminary readiness grade */
  ready_grade: ReadinessGrade;
}

/**
 * Task 3 output payload
 * Contains 5-10 pullback candidates for downstream readiness evaluation.
 */
export interface PullbackScanOutput {
  task: 'pullback_scan';
  /** When this scan was refreshed */
  refresh: RefreshFrequency;
  /** Number of pullback candidates (typically 5-10) */
  count: number;
  /** List of ticker symbols */
  tickers: string[];
  /** Detailed candidate data */
  candidates: PullbackCandidate[];
  /** Active scan filter rules (for display) */
  rules?: PullbackScanRules;
}
