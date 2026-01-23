/**
 * Task 2 — Liquid Leaders Universe Scan (EOD)
 *
 * Scans Nasdaq-100 for liquid growth leaders using locked filters.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * @see agent_tasks.md Task 2
 * @see agent_skeleton_v1.0.md (universe filters)
 */

import Decimal from 'decimal.js';
import { UniverseScanOutput, UniverseLeader, RefreshFrequency } from '@/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Raw ticker data input for universe scanning
 */
export interface TickerData {
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
  /** Whether ticker is excluded (China ADR) */
  is_china_adr?: boolean;
  /** Whether ticker is in a defensive sector */
  is_defensive?: boolean;
}

/**
 * Universe filter criteria (locked filters from agent_skeleton)
 */
export interface UniverseFilterCriteria {
  /** Minimum relative strength (default: 70) */
  min_rs?: number;
  /** Minimum daily liquidity in millions (default: 50) */
  min_liquidity_m?: number;
  /** Minimum ADR percentage (default: 1.5) */
  min_adr_pct?: number;
  /** Maximum ADR percentage (default: 15) */
  max_adr_pct?: number;
  /** Minimum price (default: 10) */
  min_price?: number;
  /** Exclude China ADRs (default: true) */
  exclude_china?: boolean;
  /** Exclude defensive sectors (default: true) */
  exclude_defensives?: boolean;
  /** Target count range (default: { min: 30, max: 40 }) */
  target_count?: { min: number; max: number };
}

/**
 * Filter result with pass/fail reason
 */
interface FilterResult {
  passed: boolean;
  reason?: string;
}

// =============================================================================
// Default Filter Criteria
// =============================================================================

/**
 * Default locked filter criteria for Liquid Leaders universe
 * These are the "locked filters" from agent_skeleton_v1.0.md
 */
export const DEFAULT_UNIVERSE_CRITERIA: Required<UniverseFilterCriteria> = {
  min_rs: 70,
  min_liquidity_m: 50,
  min_adr_pct: 1.5,
  max_adr_pct: 15,
  min_price: 10,
  exclude_china: true,
  exclude_defensives: true,
  target_count: { min: 30, max: 40 },
};

/**
 * Defensive sector themes to exclude
 */
const DEFENSIVE_THEMES = [
  'Utilities',
  'Consumer Staples',
  'Healthcare',
  'Real Estate',
  'REITs',
  'Tobacco',
  'Food & Beverage',
];

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
// Filter Functions
// =============================================================================

/**
 * Check if ticker passes relative strength filter
 */
function passesRsFilter(ticker: TickerData, minRs: number): FilterResult {
  if (ticker.rs >= minRs) {
    return { passed: true };
  }
  return { passed: false, reason: `RS ${ticker.rs} < ${minRs}` };
}

/**
 * Check if ticker passes liquidity filter
 */
function passesLiquidityFilter(ticker: TickerData, minLiquidity: number): FilterResult {
  const liquidity = toDecimal(ticker.liquidity_m);
  const minLiq = toDecimal(minLiquidity);

  if (liquidity.gte(minLiq)) {
    return { passed: true };
  }
  return { passed: false, reason: `Liquidity ${ticker.liquidity_m}M < ${minLiquidity}M` };
}

/**
 * Check if ticker passes ADR filter (min and max)
 */
function passesAdrFilter(
  ticker: TickerData,
  minAdr: number,
  maxAdr: number
): FilterResult {
  const adr = toDecimal(ticker.adr_pct);
  const min = toDecimal(minAdr);
  const max = toDecimal(maxAdr);

  if (adr.lt(min)) {
    return { passed: false, reason: `ADR ${ticker.adr_pct}% < ${minAdr}%` };
  }
  if (adr.gt(max)) {
    return { passed: false, reason: `ADR ${ticker.adr_pct}% > ${maxAdr}%` };
  }
  return { passed: true };
}

/**
 * Check if ticker passes price filter
 */
function passesPriceFilter(ticker: TickerData, minPrice: number): FilterResult {
  const price = toDecimal(ticker.price);
  const min = toDecimal(minPrice);

  if (price.gte(min)) {
    return { passed: true };
  }
  return { passed: false, reason: `Price $${ticker.price} < $${minPrice}` };
}

/**
 * Check if ticker passes China ADR exclusion
 */
function passesChinaFilter(ticker: TickerData, excludeChina: boolean): FilterResult {
  if (!excludeChina) {
    return { passed: true };
  }
  if (ticker.is_china_adr) {
    return { passed: false, reason: 'China ADR excluded' };
  }
  return { passed: true };
}

/**
 * Check if ticker passes defensive sector exclusion
 */
function passesDefensiveFilter(
  ticker: TickerData,
  excludeDefensives: boolean
): FilterResult {
  if (!excludeDefensives) {
    return { passed: true };
  }

  // Check explicit flag first
  if (ticker.is_defensive) {
    return { passed: false, reason: 'Defensive sector excluded' };
  }

  // Check theme against known defensive themes
  const theme = ticker.theme.toLowerCase();
  for (const defensive of DEFENSIVE_THEMES) {
    if (theme.includes(defensive.toLowerCase())) {
      return { passed: false, reason: `Defensive theme (${ticker.theme}) excluded` };
    }
  }

  return { passed: true };
}

/**
 * Apply all filters to a single ticker
 */
function applyFilters(
  ticker: TickerData,
  criteria: Required<UniverseFilterCriteria>
): FilterResult {
  // Check each filter in order of most likely to fail
  const filters = [
    () => passesChinaFilter(ticker, criteria.exclude_china),
    () => passesDefensiveFilter(ticker, criteria.exclude_defensives),
    () => passesRsFilter(ticker, criteria.min_rs),
    () => passesLiquidityFilter(ticker, criteria.min_liquidity_m),
    () => passesPriceFilter(ticker, criteria.min_price),
    () => passesAdrFilter(ticker, criteria.min_adr_pct, criteria.max_adr_pct),
  ];

  for (const filter of filters) {
    const result = filter();
    if (!result.passed) {
      return result;
    }
  }

  return { passed: true };
}

// =============================================================================
// Sorting & Ranking
// =============================================================================

/**
 * Sort tickers by relative strength (descending)
 * Secondary sort by liquidity (descending)
 */
function sortByRsAndLiquidity(tickers: TickerData[]): TickerData[] {
  return [...tickers].sort((a, b) => {
    // Primary: RS descending
    if (b.rs !== a.rs) {
      return b.rs - a.rs;
    }
    // Secondary: Liquidity descending
    return b.liquidity_m - a.liquidity_m;
  });
}

/**
 * Convert TickerData to UniverseLeader with rank
 */
function toUniverseLeader(ticker: TickerData, rank: number): UniverseLeader {
  return {
    rank,
    ticker: ticker.ticker,
    rs: ticker.rs,
    adr_pct: ticker.adr_pct,
    liquidity_m: ticker.liquidity_m,
    price: ticker.price,
    dist_21ema_atr: ticker.dist_21ema_atr,
    earnings_days: ticker.earnings_days,
    theme: ticker.theme,
  };
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Task 2 — Liquid Leaders Universe Scan
 *
 * Scans Nasdaq-100 for liquid growth leaders using locked filters.
 * Returns 30-40 tickers sorted by relative strength.
 *
 * @param tickers - Array of all ticker data to scan
 * @param criteria - Filter criteria (uses defaults if not specified)
 * @param refresh - Refresh frequency (default: 'EOD')
 * @returns UniverseScanOutput with 30-40 liquid leaders
 *
 * @example
 * ```typescript
 * const result = scanLiquidLeaders(allTickers, {
 *   min_rs: 75,  // Override default
 * });
 * console.log(result.count); // 30-40
 * console.log(result.tickers); // ['NVDA', 'META', ...]
 * ```
 */
export function scanLiquidLeaders(
  tickers: TickerData[],
  criteria?: UniverseFilterCriteria,
  refresh: RefreshFrequency = 'EOD'
): UniverseScanOutput {
  // Merge with defaults
  const mergedCriteria: Required<UniverseFilterCriteria> = {
    ...DEFAULT_UNIVERSE_CRITERIA,
    ...criteria,
    target_count: {
      ...DEFAULT_UNIVERSE_CRITERIA.target_count,
      ...criteria?.target_count,
    },
  };

  // Apply filters
  const passedTickers = tickers.filter(ticker => {
    const result = applyFilters(ticker, mergedCriteria);
    return result.passed;
  });

  // Sort by RS and liquidity
  const sortedTickers = sortByRsAndLiquidity(passedTickers);

  // Limit to target count range
  const { min, max } = mergedCriteria.target_count;
  const limitedTickers = sortedTickers.slice(0, max);

  // Warn if below minimum (but don't fail)
  if (limitedTickers.length < min) {
    console.warn(
      `Universe scan returned ${limitedTickers.length} tickers, below target minimum of ${min}`
    );
  }

  // Build output
  const tickerSymbols = limitedTickers.map(t => t.ticker);
  const leaders = limitedTickers.map((t, i) => toUniverseLeader(t, i + 1));

  return {
    task: 'universe_scan',
    refresh,
    count: limitedTickers.length,
    tickers: tickerSymbols,
    leaders,
  };
}

/**
 * Get filter results for debugging/UI display
 *
 * @param tickers - Array of ticker data
 * @param criteria - Filter criteria
 * @returns Map of ticker to filter result
 */
export function getFilterResults(
  tickers: TickerData[],
  criteria?: UniverseFilterCriteria
): Map<string, FilterResult> {
  const mergedCriteria: Required<UniverseFilterCriteria> = {
    ...DEFAULT_UNIVERSE_CRITERIA,
    ...criteria,
    target_count: {
      ...DEFAULT_UNIVERSE_CRITERIA.target_count,
      ...criteria?.target_count,
    },
  };

  const results = new Map<string, FilterResult>();

  for (const ticker of tickers) {
    results.set(ticker.ticker, applyFilters(ticker, mergedCriteria));
  }

  return results;
}

// =============================================================================
// Utility Exports (for testing)
// =============================================================================

export {
  passesRsFilter,
  passesLiquidityFilter,
  passesAdrFilter,
  passesPriceFilter,
  passesChinaFilter,
  passesDefensiveFilter,
  applyFilters,
  sortByRsAndLiquidity,
  toUniverseLeader,
  toDecimal,
  DEFENSIVE_THEMES,
};

export type { FilterResult };
