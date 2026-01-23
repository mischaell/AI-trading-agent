/**
 * Ticker Structure Analysis Module
 *
 * Analyzes individual tickers for 21EMA structure, ATR, and pullback metrics.
 * Used by Task 3 (Pullback Scan) to identify quality pullback setups.
 *
 * All calculations use Decimal.js for precision.
 *
 * @see pullback-scan.ts
 */

import Decimal from 'decimal.js';

// =============================================================================
// Types
// =============================================================================

export interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TickerStructureAnalysis {
  ticker: string;
  // Price data
  close: number;
  high: number;
  low: number;
  // 21EMA Structure (the "cloud")
  ema21_high: number;    // MA of highs
  ema21_close: number;   // MA of closes
  ema21_low: number;     // MA of lows
  // 50EMA
  ema50_close: number;
  // ATR
  atr14: number;
  // Distance metrics (in ATR units)
  dist_21ema_atr: number;
  dist_50ema_atr: number;
  // Structure position
  structure_position: 'above_cloud' | 'inside_cloud' | 'below_cloud';
  structure_intact: boolean; // close >= ema21_low
  // Other metrics
  weekly_return_pct: number;
  close_range_pct: number;   // Position in daily range (0-100)
  is_contracting: boolean;   // 5-day range < 20-day range
  range_5d: number;
  range_20d: number;
  // Metadata
  bars_count: number;
  latest_date: string;
}

// =============================================================================
// Cache
// =============================================================================

interface CacheEntry {
  data: TickerStructureAnalysis;
  expiry: number;
}

const analysisCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCached(ticker: string): TickerStructureAnalysis | null {
  const entry = analysisCache.get(ticker);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    analysisCache.delete(ticker);
    return null;
  }
  return entry.data;
}

function setCache(ticker: string, data: TickerStructureAnalysis): void {
  analysisCache.set(ticker, {
    data,
    expiry: Date.now() + CACHE_TTL,
  });
}

export function clearAnalysisCache(): void {
  analysisCache.clear();
}

// =============================================================================
// Decimal Helpers
// =============================================================================

function toDecimal(value: number | string | Decimal): Decimal {
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

// =============================================================================
// EMA Calculation
// =============================================================================

/**
 * Calculate Exponential Moving Average
 * @param values - Array of values (oldest first)
 * @param period - EMA period
 * @returns Array of EMA values
 */
function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const k = toDecimal(2).div(toDecimal(period).plus(1));
  const emaValues: number[] = [];

  // First EMA = SMA of first N periods
  let sum = new Decimal(0);
  for (let i = 0; i < period; i++) {
    sum = sum.plus(values[i]);
  }
  let ema = sum.div(period);
  emaValues.push(ema.toNumber());

  // Subsequent EMAs
  for (let i = period; i < values.length; i++) {
    const price = toDecimal(values[i]);
    ema = price.times(k).plus(ema.times(toDecimal(1).minus(k)));
    emaValues.push(ema.toNumber());
  }

  return emaValues;
}

/**
 * Get the latest EMA value
 */
function getLatestEMA(values: number[], period: number): number {
  const emaValues = calculateEMA(values, period);
  return emaValues[emaValues.length - 1] ?? 0;
}

// =============================================================================
// ATR Calculation
// =============================================================================

/**
 * Calculate True Range for a single bar
 */
function calculateTR(high: number, low: number, prevClose: number): number {
  const h = toDecimal(high);
  const l = toDecimal(low);
  const pc = toDecimal(prevClose);

  const hl = h.minus(l).abs();
  const hpc = h.minus(pc).abs();
  const lpc = l.minus(pc).abs();

  return Decimal.max(hl, hpc, lpc).toNumber();
}

/**
 * Calculate Average True Range
 * @param bars - OHLC bars (oldest first)
 * @param period - ATR period (default 14)
 * @returns ATR value
 */
function calculateATR(bars: OHLCBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;

  // Calculate TR for each bar (skip first bar, no prev close)
  const trValues: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = calculateTR(bars[i].high, bars[i].low, bars[i - 1].close);
    trValues.push(tr);
  }

  // First ATR = SMA of first N TRs
  let sum = new Decimal(0);
  for (let i = 0; i < period; i++) {
    sum = sum.plus(trValues[i]);
  }
  let atr = sum.div(period);

  // Subsequent ATRs using smoothing
  for (let i = period; i < trValues.length; i++) {
    const tr = toDecimal(trValues[i]);
    atr = atr.times(period - 1).plus(tr).div(period);
  }

  return atr.toNumber();
}

// =============================================================================
// Range Calculations
// =============================================================================

/**
 * Calculate N-day high-low range
 */
function calculateRange(bars: OHLCBar[], days: number): number {
  if (bars.length < days) return 0;

  const recentBars = bars.slice(-days);
  const high = Math.max(...recentBars.map(b => b.high));
  const low = Math.min(...recentBars.map(b => b.low));

  return toDecimal(high).minus(low).toNumber();
}

/**
 * Calculate close position in daily range (0-100%)
 */
function calculateCloseRangePct(bar: OHLCBar): number {
  const range = toDecimal(bar.high).minus(bar.low);
  if (range.isZero()) return 50;

  const closeFromLow = toDecimal(bar.close).minus(bar.low);
  return closeFromLow.div(range).times(100).toNumber();
}

/**
 * Calculate weekly return (5 trading days)
 */
function calculateWeeklyReturn(bars: OHLCBar[]): number {
  if (bars.length < 6) return 0;

  const currentClose = toDecimal(bars[bars.length - 1].close);
  const weekAgoClose = toDecimal(bars[bars.length - 6].close);

  if (weekAgoClose.isZero()) return 0;

  return currentClose.minus(weekAgoClose).div(weekAgoClose).times(100).toNumber();
}

// =============================================================================
// Structure Analysis
// =============================================================================

/**
 * Determine price position relative to 21EMA cloud
 */
function determineStructurePosition(
  close: number,
  ema21High: number,
  ema21Close: number,
  ema21Low: number
): 'above_cloud' | 'inside_cloud' | 'below_cloud' {
  const c = toDecimal(close);
  const h = toDecimal(ema21High);
  const m = toDecimal(ema21Close);
  const l = toDecimal(ema21Low);

  // Above cloud: close > all EMAs
  if (c.gt(h) && c.gt(m) && c.gt(l)) {
    return 'above_cloud';
  }

  // Below cloud: close < all EMAs
  if (c.lt(h) && c.lt(m) && c.lt(l)) {
    return 'below_cloud';
  }

  return 'inside_cloud';
}

/**
 * Calculate distance to EMA in ATR units
 */
function calculateDistanceATR(price: number, ema: number, atr: number): number {
  if (atr === 0) return 0;
  return toDecimal(price).minus(ema).div(atr).toNumber();
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyze a ticker's structure from OHLC data
 *
 * @param ticker - Ticker symbol
 * @param bars - OHLC bars (oldest first, need 35+ bars)
 * @returns Structure analysis or null if insufficient data
 */
export function analyzeStructure(
  ticker: string,
  bars: OHLCBar[]
): TickerStructureAnalysis | null {
  if (bars.length < 25) {
    console.warn(`[Analysis] Insufficient data for ${ticker}: ${bars.length} bars`);
    return null;
  }

  // Extract price arrays
  const highs = bars.map(b => b.high);
  const closes = bars.map(b => b.close);
  const lows = bars.map(b => b.low);

  // Calculate 21EMA structure (the "cloud")
  const ema21_high = getLatestEMA(highs, 21);
  const ema21_close = getLatestEMA(closes, 21);
  const ema21_low = getLatestEMA(lows, 21);

  // Calculate 50EMA (if enough data)
  const ema50_close = bars.length >= 55 ? getLatestEMA(closes, 50) : ema21_close;

  // Calculate 14-day ATR
  const atr14 = calculateATR(bars, 14);

  // Get latest bar
  const latestBar = bars[bars.length - 1];
  const close = latestBar.close;

  // Calculate distances in ATR units
  const dist_21ema_atr = calculateDistanceATR(close, ema21_close, atr14);
  const dist_50ema_atr = calculateDistanceATR(close, ema50_close, atr14);

  // Determine structure position
  const structure_position = determineStructurePosition(
    close, ema21_high, ema21_close, ema21_low
  );

  // Structure intact if close >= ema21_low
  const structure_intact = toDecimal(close).gte(ema21_low);

  // Calculate other metrics
  const weekly_return_pct = calculateWeeklyReturn(bars);
  const close_range_pct = calculateCloseRangePct(latestBar);

  // Contraction: 5-day range < 20-day range
  const range_5d = calculateRange(bars, 5);
  const range_20d = calculateRange(bars, 20);
  const is_contracting = range_5d < range_20d * 0.8; // 5d range < 80% of 20d range

  return {
    ticker,
    close,
    high: latestBar.high,
    low: latestBar.low,
    ema21_high: Math.round(ema21_high * 100) / 100,
    ema21_close: Math.round(ema21_close * 100) / 100,
    ema21_low: Math.round(ema21_low * 100) / 100,
    ema50_close: Math.round(ema50_close * 100) / 100,
    atr14: Math.round(atr14 * 100) / 100,
    dist_21ema_atr: Math.round(dist_21ema_atr * 100) / 100,
    dist_50ema_atr: Math.round(dist_50ema_atr * 100) / 100,
    structure_position,
    structure_intact,
    weekly_return_pct: Math.round(weekly_return_pct * 100) / 100,
    close_range_pct: Math.round(close_range_pct),
    is_contracting,
    range_5d: Math.round(range_5d * 100) / 100,
    range_20d: Math.round(range_20d * 100) / 100,
    bars_count: bars.length,
    latest_date: latestBar.date,
  };
}

// =============================================================================
// API Functions (client-side)
// =============================================================================

/**
 * Fetch OHLC data from API and analyze structure
 */
export async function analyzeTickerStructure(
  ticker: string
): Promise<TickerStructureAnalysis | null> {
  // Check cache first
  const cached = getCached(ticker);
  if (cached) {
    console.log(`[Analysis] Cache hit for ${ticker}`);
    return cached;
  }

  try {
    // Fetch 60 days of OHLC data (for 50EMA calculation)
    const response = await fetch(
      `/api/market-data?ticker=${encodeURIComponent(ticker)}&days=60`
    );

    if (!response.ok) {
      console.warn(`[Analysis] Failed to fetch data for ${ticker}`);
      return null;
    }

    const json = await response.json();
    const bars: OHLCBar[] = json.data;

    if (!bars || bars.length < 25) {
      console.warn(`[Analysis] Insufficient data for ${ticker}`);
      return null;
    }

    const analysis = analyzeStructure(ticker, bars);

    if (analysis) {
      setCache(ticker, analysis);
    }

    return analysis;
  } catch (error) {
    console.error(`[Analysis] Error analyzing ${ticker}:`, error);
    return null;
  }
}

/**
 * Rate-limited delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Analyze multiple tickers with rate limiting
 *
 * @param tickers - Array of ticker symbols
 * @param onProgress - Optional progress callback
 * @returns Array of successful analyses
 */
export async function batchAnalyzeTickers(
  tickers: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<TickerStructureAnalysis[]> {
  const results: TickerStructureAnalysis[] = [];
  const BATCH_SIZE = 5;
  const DELAY_MS = 1000; // 1 second between batches

  console.log(`[Analysis] Analyzing ${tickers.length} tickers...`);

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    // Analyze batch in parallel
    const batchPromises = batch.map(t => analyzeTickerStructure(t));
    const batchResults = await Promise.all(batchPromises);

    // Collect successful results
    for (const result of batchResults) {
      if (result) {
        results.push(result);
      }
    }

    // Progress callback
    const completed = Math.min(i + BATCH_SIZE, tickers.length);
    if (onProgress) {
      onProgress(completed, tickers.length);
    }

    // Rate limit delay (except for last batch)
    if (i + BATCH_SIZE < tickers.length) {
      await delay(DELAY_MS);
    }
  }

  console.log(`[Analysis] Analyzed ${results.length}/${tickers.length} tickers`);
  return results;
}

// =============================================================================
// Exports for Testing
// =============================================================================

export {
  calculateEMA,
  calculateATR,
  calculateTR,
  calculateRange,
  calculateCloseRangePct,
  calculateWeeklyReturn,
  calculateDistanceATR,
  determineStructurePosition,
  getLatestEMA,
  toDecimal,
};
