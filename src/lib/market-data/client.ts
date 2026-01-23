/**
 * Yahoo Finance Market Data Client
 *
 * Fetches real-time and historical market data via API route.
 * Includes in-memory caching to reduce API calls.
 */

// =============================================================================
// Types
// =============================================================================

export interface OHLCData {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuoteData {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

// =============================================================================
// Cache Configuration
// =============================================================================

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const QUOTE_TTL = 5 * 60 * 1000; // 5 minutes
const OHLC_TTL = 24 * 60 * 60 * 1000; // 1 day

const quoteCache = new Map<string, CacheEntry<QuoteData>>();
const ohlcCache = new Map<string, CacheEntry<OHLCData[]>>();

// =============================================================================
// Cache Helpers
// =============================================================================

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  data: T,
  ttl: number
): void {
  cache.set(key, {
    data,
    expiry: Date.now() + ttl,
  });
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Fetch daily OHLC data for a ticker via API route
 * @param ticker - Stock symbol (e.g., 'AAPL', 'QQQE')
 * @param days - Number of trading days to fetch (default 30)
 * @returns Array of OHLC data, oldest first (for EMA calculation)
 */
export async function fetchOHLC(ticker: string, days = 30): Promise<OHLCData[]> {
  const cacheKey = `${ticker}-${days}`;

  // Check cache first
  const cached = getCached(ohlcCache, cacheKey);
  if (cached) {
    console.log(`[MarketData] Cache hit for ${ticker} OHLC`);
    return cached;
  }

  try {
    const response = await fetch(`/api/market-data?ticker=${encodeURIComponent(ticker)}&days=${days}`);
    const json = await response.json();

    if (!response.ok || !json.data) {
      console.warn(`[MarketData] API error for ${ticker}:`, json.error);
      return [];
    }

    const ohlcData: OHLCData[] = json.data;

    // Cache the result
    setCache(ohlcCache, cacheKey, ohlcData, OHLC_TTL);
    console.log(`[MarketData] Fetched ${ohlcData.length} OHLC bars for ${ticker}`);

    return ohlcData;
  } catch (error) {
    console.error(`[MarketData] Failed to fetch OHLC for ${ticker}:`, error);
    return [];
  }
}

/**
 * Fetch current quote for a single ticker
 * Note: Quotes currently return null - would need separate API endpoint
 * @param ticker - Stock symbol
 * @returns Quote data with price, change, volume
 */
export async function fetchQuote(ticker: string): Promise<QuoteData | null> {
  // Check cache first
  const cached = getCached(quoteCache, ticker);
  if (cached) {
    console.log(`[MarketData] Cache hit for ${ticker} quote`);
    return cached;
  }

  // For now, return null - would need a separate /api/quote endpoint
  // This is a placeholder for future implementation
  console.log(`[MarketData] Quote endpoint not implemented for ${ticker}`);
  return null;
}

/**
 * Fetch quotes for multiple tickers in batch
 * @param tickers - Array of stock symbols
 * @returns Map of ticker -> QuoteData
 */
export async function fetchBatchQuotes(
  tickers: string[]
): Promise<Map<string, QuoteData>> {
  const results = new Map<string, QuoteData>();

  // Fetch each quote (currently returns null)
  for (const ticker of tickers) {
    const quote = await fetchQuote(ticker);
    if (quote) {
      results.set(ticker, quote);
    }
  }

  return results;
}

/**
 * Fetch QQQE daily data for 21EMA calculation
 * Fetches 35+ days to ensure enough data for EMA warmup
 * @returns OHLC data for QQQE ETF, oldest first
 */
export async function fetchQQQE(): Promise<OHLCData[]> {
  // Need at least 21 days for EMA, plus buffer for warmup
  return fetchOHLC('QQQE', 35);
}

/**
 * Fetch SPY daily data (useful for market analysis)
 * @returns OHLC data for SPY ETF
 */
export async function fetchSPY(): Promise<OHLCData[]> {
  return fetchOHLC('SPY', 35);
}

/**
 * Clear all caches (useful for testing or forcing refresh)
 */
export function clearCache(): void {
  quoteCache.clear();
  ohlcCache.clear();
  console.log('[MarketData] Cache cleared');
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getCacheStats(): { quotes: number; ohlc: number } {
  return {
    quotes: quoteCache.size,
    ohlc: ohlcCache.size,
  };
}
