/**
 * Relative Strength (RS) Data API Route
 *
 * Server-side endpoint for calculating RS ratings.
 * Fetches 12 months of price history and calculates IBD-style RS.
 */

import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// =============================================================================
// Types
// =============================================================================

interface RSData {
  ticker: string;
  rs: number;
  perf3m: number;
  perf6m: number;
  perf9m: number;
  perf12m: number;
  weightedPerf: number;
}

interface PriceData {
  date: string;
  close: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

function calcPerformance(startPrice: number, endPrice: number): number {
  if (startPrice === 0) return 0;
  return ((endPrice - startPrice) / startPrice) * 100;
}

function getPriceNDaysAgo(prices: PriceData[], tradingDays: number): number | null {
  const idx = prices.length - 1 - tradingDays;
  if (idx < 0) return null;
  return prices[idx]?.close ?? null;
}

/**
 * Fetch 12+ months of price history for a ticker
 */
async function fetchPriceHistory(ticker: string): Promise<PriceData[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 380); // ~15 months buffer

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    const quotes = result?.quotes as Array<{
      date: Date;
      close: number | null;
    }> | undefined;

    if (!quotes || quotes.length === 0) {
      return [];
    }

    return quotes
      .filter(q => q.close !== null)
      .map(q => ({
        date: new Date(q.date).toISOString().split('T')[0],
        close: q.close as number,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)); // Oldest first
  } catch (error) {
    console.error(`[RS-API] Error fetching history for ${ticker}:`, error);
    return [];
  }
}

/**
 * Calculate performance metrics for a ticker
 */
function calculatePerformanceMetrics(
  ticker: string,
  prices: PriceData[]
): Omit<RSData, 'rs'> | null {
  if (prices.length < 21) {
    return null;
  }

  const currentPrice = prices[prices.length - 1]?.close;
  if (!currentPrice || currentPrice === 0) {
    return null;
  }

  // Trading days approximation
  const price3m = getPriceNDaysAgo(prices, 63);
  const price6m = getPriceNDaysAgo(prices, 126);
  const price9m = getPriceNDaysAgo(prices, 189);
  const price12m = getPriceNDaysAgo(prices, 252);

  const perf3m = price3m ? calcPerformance(price3m, currentPrice) : 0;
  const perf6m = price6m ? calcPerformance(price6m, currentPrice) : perf3m;
  const perf9m = price9m ? calcPerformance(price9m, currentPrice) : perf6m;
  const perf12m = price12m ? calcPerformance(price12m, currentPrice) : perf9m;

  // IBD-style weighted performance
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
 */
function calculateRSRatings(performanceData: Array<Omit<RSData, 'rs'>>): RSData[] {
  if (performanceData.length === 0) return [];

  const sorted = [...performanceData].sort(
    (a, b) => b.weightedPerf - a.weightedPerf
  );

  const total = sorted.length;

  return sorted.map((data, index) => {
    const percentile = 1 - (index / (total - 1 || 1));
    const rs = Math.max(1, Math.min(99, Math.round(percentile * 98) + 1));
    return { ...data, rs };
  });
}

// =============================================================================
// API Routes
// =============================================================================

/**
 * GET /api/rs-data?ticker=AAPL
 * Get RS data for a single ticker (requires universe context for ranking)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: 'Missing ticker parameter' },
      { status: 400 }
    );
  }

  const prices = await fetchPriceHistory(ticker.toUpperCase());

  if (prices.length < 21) {
    return NextResponse.json(
      { success: false, error: `Insufficient price history for ${ticker}` },
      { status: 404 }
    );
  }

  const metrics = calculatePerformanceMetrics(ticker.toUpperCase(), prices);

  if (!metrics) {
    return NextResponse.json(
      { success: false, error: `Failed to calculate metrics for ${ticker}` },
      { status: 500 }
    );
  }

  // For single ticker, RS is relative to itself (50 as placeholder)
  // Real RS requires universe context
  return NextResponse.json({
    success: true,
    data: { ...metrics, rs: 50 },
    note: 'Single ticker RS is placeholder. Use POST with universe for real ranking.',
  });
}

/**
 * POST /api/rs-data
 * Calculate RS ratings for multiple tickers (proper universe ranking)
 * Body: { tickers: string[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tickers: string[] = body.tickers;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid tickers array' },
        { status: 400 }
      );
    }

    console.log(`[RS-API] Calculating RS for ${tickers.length} tickers...`);
    const startTime = Date.now();

    // Fetch price history for all tickers in parallel (batched)
    const BATCH_SIZE = 10;
    const allPrices: Map<string, PriceData[]> = new Map();

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (t) => {
        const prices = await fetchPriceHistory(t.toUpperCase());
        return { ticker: t.toUpperCase(), prices };
      });

      const batchResults = await Promise.all(batchPromises);
      for (const { ticker, prices } of batchResults) {
        if (prices.length >= 21) {
          allPrices.set(ticker, prices);
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`[RS-API] Fetched history for ${allPrices.size}/${tickers.length} tickers`);

    // Calculate performance metrics
    const performanceData: Array<Omit<RSData, 'rs'>> = [];

    const allPricesArray = Array.from(allPrices.entries());
    for (const [ticker, prices] of allPricesArray) {
      const metrics = calculatePerformanceMetrics(ticker, prices);
      if (metrics) {
        performanceData.push(metrics);
      }
    }

    // Calculate RS ratings relative to the universe
    const rsData = calculateRSRatings(performanceData);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[RS-API] Calculated RS for ${rsData.length} tickers in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      data: rsData,
      stats: {
        requested: tickers.length,
        calculated: rsData.length,
        elapsed: `${elapsed}s`,
      },
    });
  } catch (error) {
    console.error('[RS-API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'RS calculation failed' },
      { status: 500 }
    );
  }
}
