/**
 * Relative Strength (RS) Calculation Module
 *
 * Calculates IBD-style Relative Strength ratings for stocks.
 * RS compares a stock's price performance to the overall market
 * and ranks it on a 1-99 scale (99 = strongest).
 *
 * Calculation methodology:
 * - 40% weight on 3-month performance
 * - 20% weight on 6-month performance
 * - 20% weight on 9-month performance
 * - 20% weight on 12-month performance
 *
 * @see https://www.investors.com/ibd-university/find-evaluate-stocks/exclusive-ratings/
 */

// =============================================================================
// Types
// =============================================================================

export interface RSData {
  ticker: string;
  rs: number;              // 1-99 RS rating
  perf3m: number;          // 3-month performance %
  perf6m: number;          // 6-month performance %
  perf9m: number;          // 9-month performance %
  perf12m: number;         // 12-month performance %
  weightedPerf: number;    // Weighted performance score
}

export interface PriceHistory {
  ticker: string;
  prices: Array<{
    date: string;
    close: number;
  }>;
}

// =============================================================================
// Performance Calculation
// =============================================================================

/**
 * Calculate percentage change between two prices
 */
function calcPerformance(startPrice: number, endPrice: number): number {
  if (startPrice === 0) return 0;
  return ((endPrice - startPrice) / startPrice) * 100;
}

/**
 * Get price from a specific number of trading days ago
 * Returns null if not enough data
 */
function getPriceNDaysAgo(
  prices: Array<{ date: string; close: number }>,
  tradingDays: number
): number | null {
  // Prices should be sorted newest first or oldest first
  // We assume oldest first (chronological order)
  const idx = prices.length - 1 - tradingDays;
  if (idx < 0) return null;
  return prices[idx]?.close ?? null;
}

/**
 * Calculate performance metrics for a single ticker
 *
 * @param prices - Array of {date, close} sorted oldest first
 * @returns Performance metrics or null if insufficient data
 */
export function calculatePerformanceMetrics(
  ticker: string,
  prices: Array<{ date: string; close: number }>
): Omit<RSData, 'rs'> | null {
  if (prices.length < 21) {
    console.warn(`[RS] Insufficient data for ${ticker}: ${prices.length} bars`);
    return null;
  }

  const currentPrice = prices[prices.length - 1]?.close;
  if (!currentPrice || currentPrice === 0) {
    return null;
  }

  // Trading days approximation:
  // 3 months ≈ 63 trading days
  // 6 months ≈ 126 trading days
  // 9 months ≈ 189 trading days
  // 12 months ≈ 252 trading days

  const price3m = getPriceNDaysAgo(prices, 63);
  const price6m = getPriceNDaysAgo(prices, 126);
  const price9m = getPriceNDaysAgo(prices, 189);
  const price12m = getPriceNDaysAgo(prices, 252);

  // Calculate performance for each period
  // Use available data, default to 0 if period not available
  const perf3m = price3m ? calcPerformance(price3m, currentPrice) : 0;
  const perf6m = price6m ? calcPerformance(price6m, currentPrice) : perf3m;
  const perf9m = price9m ? calcPerformance(price9m, currentPrice) : perf6m;
  const perf12m = price12m ? calcPerformance(price12m, currentPrice) : perf9m;

  // IBD-style weighted performance:
  // 40% 3-month + 20% 6-month + 20% 9-month + 20% 12-month
  const weightedPerf = (perf3m * 0.4) + (perf6m * 0.2) + (perf9m * 0.2) + (perf12m * 0.2);

  return {
    ticker,
    perf3m: Math.round(perf3m * 100) / 100,
    perf6m: Math.round(perf6m * 100) / 100,
    perf9m: Math.round(perf9m * 100) / 100,
    perf12m: Math.round(perf12m * 100) / 100,
    weightedPerf: Math.round(weightedPerf * 100) / 100,
  };
}

/**
 * Calculate RS ratings for a group of stocks
 * RS is a percentile ranking (1-99) based on weighted performance
 *
 * @param performanceData - Array of performance metrics for all stocks
 * @returns Array of RSData with RS ratings
 */
export function calculateRSRatings(
  performanceData: Array<Omit<RSData, 'rs'>>
): RSData[] {
  if (performanceData.length === 0) return [];

  // Sort by weighted performance (descending)
  const sorted = [...performanceData].sort(
    (a, b) => b.weightedPerf - a.weightedPerf
  );

  // Calculate RS rating (1-99 percentile)
  const total = sorted.length;

  return sorted.map((data, index) => {
    // RS = percentile rank * 99
    // Top performer gets 99, worst gets 1
    const percentile = 1 - (index / (total - 1 || 1));
    const rs = Math.max(1, Math.min(99, Math.round(percentile * 98) + 1));

    return {
      ...data,
      rs,
    };
  });
}

// =============================================================================
// API Functions (client-side)
// =============================================================================

/**
 * Fetch RS data for a single ticker via API
 */
export async function fetchTickerRS(ticker: string): Promise<RSData | null> {
  try {
    const response = await fetch(`/api/rs-data?ticker=${encodeURIComponent(ticker)}`);

    if (!response.ok) {
      console.warn(`[RS] Failed to fetch RS for ${ticker}`);
      return null;
    }

    const data = await response.json();
    if (!data.success) {
      return null;
    }

    return data.data as RSData;
  } catch (error) {
    console.error(`[RS] Error fetching RS for ${ticker}:`, error);
    return null;
  }
}

/**
 * Fetch RS data for multiple tickers via batch API
 */
export async function fetchBatchRS(tickers: string[]): Promise<Map<string, RSData>> {
  const results = new Map<string, RSData>();

  try {
    const response = await fetch('/api/rs-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    });

    if (!response.ok) {
      console.warn('[RS] Batch fetch failed');
      return results;
    }

    const data = await response.json();
    if (data.success && Array.isArray(data.data)) {
      for (const rs of data.data as RSData[]) {
        results.set(rs.ticker, rs);
      }
    }
  } catch (error) {
    console.error('[RS] Batch fetch error:', error);
  }

  return results;
}
