/**
 * Earnings Data API Route
 *
 * Fetches next earnings date for tickers from Yahoo Finance.
 * Returns days until earnings (or -1 if unknown).
 *
 * @see docs/TESTS.md for test patterns
 */

import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// =============================================================================
// Types
// =============================================================================

export interface EarningsData {
  ticker: string;
  earningsDate: string | null;  // ISO date string or null
  daysUntilEarnings: number;     // -1 if unknown, otherwise days
  source: 'yahoo' | 'unknown';
}

// =============================================================================
// Cache
// =============================================================================

interface CacheEntry {
  data: EarningsData;
  expiry: number;
}

const earningsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCached(ticker: string): EarningsData | null {
  const entry = earningsCache.get(ticker);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    earningsCache.delete(ticker);
    return null;
  }
  return entry.data;
}

function setCache(ticker: string, data: EarningsData): void {
  earningsCache.set(ticker, {
    data,
    expiry: Date.now() + CACHE_TTL,
  });
}

// =============================================================================
// Helpers
// =============================================================================

function calculateDaysUntil(dateStr: string | null): number {
  if (!dateStr) return -1;

  try {
    const earningsDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    earningsDate.setHours(0, 0, 0, 0);

    const diffTime = earningsDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // If earnings already passed (negative days), return a large number
    // indicating we don't have info about next earnings
    if (diffDays < 0) return -1;

    return diffDays;
  } catch {
    return -1;
  }
}

async function fetchEarningsForTicker(ticker: string): Promise<EarningsData> {
  // Check cache first
  const cached = getCached(ticker);
  if (cached) {
    return cached;
  }

  try {
    // Use quoteSummary to get calendar events including earnings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.quoteSummary(ticker, {
      modules: ['calendarEvents'],
    });

    // Extract earnings date from calendarEvents
    const calendarEvents = result?.calendarEvents;
    const earnings = calendarEvents?.earnings;

    // Yahoo returns earningsDate as an array of possible dates
    // Take the first one if available
    let earningsDateStr: string | null = null;

    if (earnings?.earningsDate && Array.isArray(earnings.earningsDate) && earnings.earningsDate.length > 0) {
      const earningsDate = earnings.earningsDate[0];
      if (earningsDate) {
        earningsDateStr = new Date(earningsDate).toISOString().split('T')[0];
      }
    }

    const data: EarningsData = {
      ticker,
      earningsDate: earningsDateStr,
      daysUntilEarnings: calculateDaysUntil(earningsDateStr),
      source: earningsDateStr ? 'yahoo' : 'unknown',
    };

    setCache(ticker, data);
    return data;
  } catch (error) {
    console.warn(`[API/earnings-data] Failed to fetch earnings for ${ticker}:`, error);

    // Return unknown result (will pass the earnings filter)
    const data: EarningsData = {
      ticker,
      earningsDate: null,
      daysUntilEarnings: -1,
      source: 'unknown',
    };

    // Cache even failures to avoid repeated requests
    setCache(ticker, data);
    return data;
  }
}

// =============================================================================
// API Routes
// =============================================================================

/**
 * GET /api/earnings-data?ticker=AAPL
 * Fetches earnings date for a single ticker
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

  try {
    const data = await fetchEarningsForTicker(ticker.toUpperCase());
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[API/earnings-data] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch earnings data' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/earnings-data
 * Fetches earnings dates for multiple tickers (batch)
 * Body: { tickers: string[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tickers: string[] = body.tickers;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing or empty tickers array' },
        { status: 400 }
      );
    }

    // Limit batch size to prevent timeout
    const MAX_BATCH = 20;
    if (tickers.length > MAX_BATCH) {
      return NextResponse.json(
        { success: false, error: `Batch size limited to ${MAX_BATCH} tickers` },
        { status: 400 }
      );
    }

    // Fetch in parallel with rate limiting
    const results: EarningsData[] = [];
    const BATCH_SIZE = 5;
    const DELAY_MS = 500;

    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
      const batch = tickers.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(t => fetchEarningsForTicker(t.toUpperCase()));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limit delay between batches
      if (i + BATCH_SIZE < tickers.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error('[API/earnings-data] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch earnings data' },
      { status: 500 }
    );
  }
}
