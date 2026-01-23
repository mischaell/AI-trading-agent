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
