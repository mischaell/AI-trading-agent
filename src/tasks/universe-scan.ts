/**
 * Task 2 — Liquid Leaders Universe Scan (EOD)
 *
 * Scans all Nasdaq stocks for liquid growth leaders using locked filters.
 * All calculations use Decimal.js per TradingAgent.clinerules.
 *
 * Filters:
 * - $250M+ daily dollar liquidity
 * - 1M+ shares avg daily volume
 * - ADR between 2.5% and 10%
 * - Price > $10
 * - Market cap > $1B
 * - Excludes China/HK ADRs
 * - Excludes Biotech, Materials, Energy, Utilities, Real Estate, Healthcare, Industrials
 *
 * @see agent_tasks.md Task 2
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
  /** Relative strength ranking (0-99, IBD-like) */
  rs: number;
  /** Average daily range as percentage */
  adr_pct: number;
  /** Average daily dollar liquidity in millions */
  liquidity_m: number;
  /** Average daily volume in millions of shares */
  volume_m?: number;
  /** Current price */
  price: number;
  /** Market capitalization in billions */
  market_cap_b?: number;
  /** Distance to 21EMA in ATR units */
  dist_21ema_atr: number;
  /** Days until earnings */
  earnings_days: number;
  /** Sector/theme classification */
  theme: string;
  /** Whether ticker is excluded (China/HK ADR) */
  is_china_adr?: boolean;
  /** Whether ticker is in an excluded sector */
  is_excluded_sector?: boolean;
}

/**
 * Universe filter criteria (locked filters)
 * Screens all Nasdaq stocks to find liquid growth leaders
 */
export interface UniverseFilterCriteria {
  /** Minimum relative strength rank (IBD-like, default: top 1000 = effectively no limit) */
  min_rs?: number;
  /** Minimum daily dollar liquidity in millions (default: 250) */
  min_liquidity_m?: number;
  /** Minimum average daily volume in millions of shares (default: 1) */
  min_volume_m?: number;
  /** Minimum ADR percentage (default: 2.5) */
  min_adr_pct?: number;
  /** Maximum ADR percentage (default: 10) */
  max_adr_pct?: number;
  /** Minimum price (default: 10) */
  min_price?: number;
  /** Minimum market cap in billions (default: 1) */
  min_market_cap_b?: number;
  /** Exclude China & HK ADRs (default: true) */
  exclude_china?: boolean;
  /** Exclude specific sectors (default: true) */
  exclude_sectors?: boolean;
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
 * Screens all Nasdaq stocks for liquid growth leaders
 */
export const DEFAULT_UNIVERSE_CRITERIA: Required<UniverseFilterCriteria> = {
  min_rs: 0,                    // Top 1000 RS rank (no minimum, sorted by RS)
  min_liquidity_m: 250,         // $250M daily dollar liquidity
  min_volume_m: 1,              // 1M shares avg daily volume
  min_adr_pct: 2.5,             // ADR > 2.5%
  max_adr_pct: 10,              // ADR < 10%
  min_price: 10,                // Price > $10
  min_market_cap_b: 1,          // Market cap > $1B
  exclude_china: true,          // Exclude China & HK ADRs
  exclude_sectors: true,        // Exclude specific sectors
  target_count: { min: 30, max: 40 },
};

/**
 * Sectors to exclude from universe
 * Biotech, Materials, Defensive, Energy, Utilities, Real Estate, Healthcare, Industrials
 */
const EXCLUDED_SECTORS = [
  // Biotech
  'Biotech',
  'Biotechnology',
  'Pharmaceuticals',
  // Materials
  'Materials',
  'Basic Materials',
  'Chemicals',
  'Metals & Mining',
  // Defensive / Consumer Staples
  'Consumer Staples',
  'Food & Beverage',
  'Tobacco',
  'Household Products',
  // Energy
  'Energy',
  'Oil & Gas',
  'Petroleum',
  // Utilities
  'Utilities',
  'Electric Utilities',
  'Gas Utilities',
  // Real Estate
  'Real Estate',
  'REITs',
  // Healthcare (excluding biotech already listed)
  'Healthcare',
  'Health Care',
  'Medical Devices',
  'Healthcare Services',
  // Industrials
  'Industrials',
  'Industrial',
  'Aerospace & Defense',
  'Machinery',
  'Construction',
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
 * Check if ticker passes volume filter
 */
function passesVolumeFilter(ticker: TickerData, minVolume: number): FilterResult {
  // If volume not provided, assume it passes (backwards compatibility)
  if (ticker.volume_m === undefined) {
    return { passed: true };
  }

  const volume = toDecimal(ticker.volume_m);
  const minVol = toDecimal(minVolume);

  if (volume.gte(minVol)) {
    return { passed: true };
  }
  return { passed: false, reason: `Volume ${ticker.volume_m.toFixed(2)}M shares < ${minVolume}M` };
}

/**
 * Check if ticker passes market cap filter
 */
function passesMarketCapFilter(ticker: TickerData, minMarketCap: number): FilterResult {
  // If market cap not provided, assume it passes (backwards compatibility)
  if (ticker.market_cap_b === undefined) {
    return { passed: true };
  }

  const marketCap = toDecimal(ticker.market_cap_b);
  const minCap = toDecimal(minMarketCap);

  if (marketCap.gte(minCap)) {
    return { passed: true };
  }
  return { passed: false, reason: `Market cap $${ticker.market_cap_b.toFixed(1)}B < $${minMarketCap}B` };
}

/**
 * Check if ticker passes sector exclusion filter
 */
function passesSectorFilter(
  ticker: TickerData,
  excludeSectors: boolean
): FilterResult {
  if (!excludeSectors) {
    return { passed: true };
  }

  // Check explicit flag first
  if (ticker.is_excluded_sector) {
    return { passed: false, reason: `Excluded sector (${ticker.theme})` };
  }

  // Check theme against excluded sectors
  const theme = ticker.theme.toLowerCase();
  for (const sector of EXCLUDED_SECTORS) {
    if (theme.includes(sector.toLowerCase())) {
      return { passed: false, reason: `Excluded sector (${ticker.theme})` };
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
    () => passesSectorFilter(ticker, criteria.exclude_sectors),
    () => passesMarketCapFilter(ticker, criteria.min_market_cap_b),
    () => passesLiquidityFilter(ticker, criteria.min_liquidity_m),
    () => passesVolumeFilter(ticker, criteria.min_volume_m),
    () => passesPriceFilter(ticker, criteria.min_price),
    () => passesAdrFilter(ticker, criteria.min_adr_pct, criteria.max_adr_pct),
    () => passesRsFilter(ticker, criteria.min_rs),
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
 * Scans all Nasdaq stocks for liquid growth leaders using locked filters:
 * - $250M+ daily dollar liquidity
 * - 1M+ shares avg daily volume
 * - ADR between 2.5% and 10%
 * - Price > $10
 * - Market cap > $1B
 * - Excludes China/HK ADRs
 * - Excludes Biotech, Materials, Energy, Utilities, Real Estate, Healthcare, Industrials
 *
 * Returns 30-40 tickers sorted by relative strength.
 *
 * @param tickers - Array of all ticker data to scan
 * @param criteria - Filter criteria (uses defaults if not specified)
 * @param refresh - Refresh frequency (default: 'EOD')
 * @returns UniverseScanOutput with 30-40 liquid leaders
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
  passesVolumeFilter,
  passesMarketCapFilter,
  passesAdrFilter,
  passesPriceFilter,
  passesChinaFilter,
  passesSectorFilter,
  applyFilters,
  sortByRsAndLiquidity,
  toUniverseLeader,
  toDecimal,
  EXCLUDED_SECTORS,
};

export type { FilterResult };
