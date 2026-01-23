/**
 * Universe Data API Route
 *
 * Server-side endpoint for fetching ticker data for Task 2 (Universe Scan).
 * Supports both single ticker (GET) and batch (POST) requests.
 */

import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface UniverseTickerData {
  ticker: string;
  price: number;
  avgVolume: number;
  adrPct: number;
  liquidityM: number;
  high21: number;
  low21: number;
  close: number;
}

/**
 * Calculate ADR% from OHLC data
 * ADR = Average((High - Low) / Close) over N days
 */
function calculateADR(
  quotes: Array<{ high: number; low: number; close: number }>
): number {
  if (quotes.length === 0) return 0;

  const dailyRanges = quotes.map(q => {
    if (q.close === 0) return 0;
    return ((q.high - q.low) / q.close) * 100;
  });

  const sum = dailyRanges.reduce((a, b) => a + b, 0);
  return sum / dailyRanges.length;
}

/**
 * Fetch data for a single ticker
 */
async function fetchSingleTicker(ticker: string): Promise<UniverseTickerData | null> {
  try {
    // Fetch 30 days of data for calculations
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 45); // Extra buffer for weekends/holidays

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    const quotes = result?.quotes as Array<{
      date: Date;
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number | null;
    }> | undefined;

    if (!quotes || quotes.length === 0) {
      console.warn(`[UniverseAPI] No data for ${ticker}`);
      return null;
    }

    // Filter valid quotes and take last 21 days
    const validQuotes = quotes
      .filter(q => q.close !== null && q.high !== null && q.low !== null && q.volume !== null)
      .slice(-21);

    if (validQuotes.length < 10) {
      console.warn(`[UniverseAPI] Insufficient data for ${ticker}: ${validQuotes.length} bars`);
      return null;
    }

    // Calculate metrics
    const latestQuote = validQuotes[validQuotes.length - 1];
    const close = latestQuote.close ?? 0;

    // Average volume over 21 days
    const avgVolume = validQuotes.reduce((sum, q) => sum + (q.volume ?? 0), 0) / validQuotes.length;

    // Calculate ADR%
    const adrPct = calculateADR(
      validQuotes.map(q => ({
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
      }))
    );

    // 21-day high/low
    const high21 = Math.max(...validQuotes.map(q => q.high ?? 0));
    const low21 = Math.min(...validQuotes.map(q => q.low ?? 0));

    // Liquidity = Average Volume * Price / 1,000,000
    const liquidityM = (avgVolume * close) / 1_000_000;

    return {
      ticker,
      price: close,
      avgVolume: Math.round(avgVolume),
      adrPct: Math.round(adrPct * 100) / 100, // Round to 2 decimals
      liquidityM: Math.round(liquidityM * 10) / 10, // Round to 1 decimal
      high21,
      low21,
      close,
    };
  } catch (error) {
    console.error(`[UniverseAPI] Error fetching ${ticker}:`, error);
    return null;
  }
}

/**
 * GET /api/universe-data?ticker=AAPL
 * Fetches data for a single ticker
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

  const data = await fetchSingleTicker(ticker.toUpperCase());

  if (!data) {
    return NextResponse.json(
      { success: false, error: `Failed to fetch data for ${ticker}` },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data });
}

/**
 * POST /api/universe-data
 * Batch fetches data for multiple tickers
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

    // Limit batch size to prevent timeout
    const MAX_BATCH = 20;
    if (tickers.length > MAX_BATCH) {
      return NextResponse.json(
        { success: false, error: `Batch size exceeds maximum of ${MAX_BATCH}` },
        { status: 400 }
      );
    }

    console.log(`[UniverseAPI] Batch fetching ${tickers.length} tickers`);

    // Fetch all tickers in parallel
    const promises = tickers.map(ticker => fetchSingleTicker(ticker.toUpperCase()));
    const results = await Promise.all(promises);

    // Filter out failed fetches
    const data = results.filter((r): r is UniverseTickerData => r !== null);

    console.log(`[UniverseAPI] Batch complete: ${data.length}/${tickers.length} successful`);

    return NextResponse.json({
      success: true,
      data,
      failed: tickers.filter((_, i) => results[i] === null),
    });
  } catch (error) {
    console.error('[UniverseAPI] Batch error:', error);
    return NextResponse.json(
      { success: false, error: 'Batch fetch failed' },
      { status: 500 }
    );
  }
}
