/**
 * Task 2 — Liquid Leaders Universe Scan (EOD)
 * Scans for 30-40 liquid leaders from Nasdaq-100 using locked filters.
 * @see agent_tasks.md Task 2
 */

/** Refresh frequency for scans */
export type RefreshFrequency = 'EOD' | 'INTRADAY';

/**
 * Individual leader data from the universe scan
 * Extended data for UI enrichment (not in base YAML output)
 */
export interface UniverseLeader {
  /** Rank in the universe (1 = highest RS) */
  rank: number;
  /** Stock ticker symbol */
  ticker: string;
  /** Relative strength ranking (0-99) */
  rs: number;
  /** Average daily range as percentage */
  adr_pct: number;
  /** Average daily dollar liquidity in millions */
  liquidity_m: number;
  /** Current price */
  price: number;
  /** Distance to 21EMA in ATR units */
  dist_21ema_atr: number;
  /** Days until earnings */
  earnings_days: number;
  /** Sector/theme classification */
  theme: string;

  // === Calculated Structure Fields (from ticker-analysis) ===

  /** 21EMA of closes */
  ema21_close?: number;
  /** 21EMA of lows (structure floor) */
  ema21_low?: number;
  /** 50EMA of closes */
  ema50_close?: number;
  /** 14-day ATR */
  atr14?: number;
  /** Distance to 50EMA in ATR units */
  dist_50ema_atr?: number;
  /** Structure position: above_cloud, inside_cloud, below_cloud */
  structure_position?: 'above_cloud' | 'inside_cloud' | 'below_cloud';
  /** Whether structure is intact (close >= ema21_low) */
  structure_intact?: boolean;
  /** Weekly return percentage */
  weekly_return_pct?: number;
  /** Position in daily range (0-100%) */
  close_range_pct?: number;
  /** Whether volatility is contracting (5-day ATR < 80% of 20-day ATR) */
  is_contracting?: boolean;

  // === Backtest-Style Scoring Fields ===

  /** Setup grade: A (perfect), B (good), C (acceptable) */
  grade?: 'A' | 'B' | 'C';
  /** Entry mode: MODE1 (weakness into structure), MODE2 (reclaim & backtest) */
  mode?: 'MODE1' | 'MODE2';
  /** Setup type description */
  setup_type?: string;
  /** Total score based on backtest weights */
  score?: number;
}

/**
 * Task 2 output payload
 * Contains 30-40 liquid leaders that pass universe filters.
 */
export interface UniverseScanOutput {
  task: 'universe_scan';
  /** When this scan was refreshed */
  refresh: RefreshFrequency;
  /** Number of leaders in universe (typically 30-40) */
  count: number;
  /** List of ticker symbols */
  tickers: string[];
  /** Detailed leader data (optional, for UI enrichment) */
  leaders?: UniverseLeader[];
}
