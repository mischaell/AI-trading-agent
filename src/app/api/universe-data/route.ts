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
  volumeM: number;           // Volume in millions of shares
  adrPct: number;
  liquidityM: number;
  marketCapB: number;        // Market cap in billions
  high21: number;
  low21: number;
  close: number;
  ema21: number;             // 21-day EMA
  ema21_prev: number;        // Previous day 21-day EMA
  is21EmaAdvancing: boolean; // Whether 21EMA is rising
  wma10: number;             // 10-week MA (approx 50-day)
  wma10_prev: number;        // Previous 10-week MA
  is10WmaAdvancing: boolean; // Whether 10WMA is rising
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
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];

  const multiplier = 2 / (period + 1);
  const ema: number[] = [];

  // Start with SMA for first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  ema.push(sum / period);

  // Calculate EMA for remaining values
  for (let i = period; i < closes.length; i++) {
    ema.push((closes[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }

  return ema;
}

/**
 * Calculate SMA (Simple Moving Average)
 */
function calculateSMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];

  const sma: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += closes[i - j];
    }
    sma.push(sum / period);
  }

  return sma;
}

/**
 * Fetch data for a single ticker
 */
async function fetchSingleTicker(ticker: string): Promise<UniverseTickerData | null> {
  try {
    // Fetch 90 days of data for EMA/SMA calculations
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 120); // Extra buffer for weekends/holidays

    // Fetch chart data and quote data in parallel
    const [chartResult, quoteResult] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yahooFinance.chart(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      }) as Promise<any>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yahooFinance.quote(ticker).catch(() => null) as Promise<any>,
    ]);

    const quotes = chartResult?.quotes as Array<{
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

    // Filter valid quotes
    const validQuotes = quotes
      .filter(q => q.close !== null && q.high !== null && q.low !== null && q.volume !== null);

    if (validQuotes.length < 30) {
      console.warn(`[UniverseAPI] Insufficient data for ${ticker}: ${validQuotes.length} bars`);
      return null;
    }

    // Get closes for EMA/SMA calculation
    const closes = validQuotes.map(q => q.close ?? 0);

    // Calculate 21-day EMA
    const ema21Values = calculateEMA(closes, 21);
    const ema21 = ema21Values.length >= 2 ? ema21Values[ema21Values.length - 1] : 0;
    const ema21_prev = ema21Values.length >= 2 ? ema21Values[ema21Values.length - 2] : 0;
    const is21EmaAdvancing = ema21 > ema21_prev;

    // Calculate 50-day SMA (approximation for 10-week MA)
    const sma50Values = calculateSMA(closes, 50);
    const wma10 = sma50Values.length >= 2 ? sma50Values[sma50Values.length - 1] : 0;
    const wma10_prev = sma50Values.length >= 2 ? sma50Values[sma50Values.length - 2] : 0;
    const is10WmaAdvancing = wma10 > wma10_prev;

    // Use last 21 days for volume and ADR calculations
    const recent21 = validQuotes.slice(-21);

    // Calculate metrics
    const latestQuote = validQuotes[validQuotes.length - 1];
    const close = latestQuote.close ?? 0;

    // Average volume over 21 days
    const avgVolume = recent21.reduce((sum, q) => sum + (q.volume ?? 0), 0) / recent21.length;

    // Volume in millions of shares
    const volumeM = avgVolume / 1_000_000;

    // Calculate ADR%
    const adrPct = calculateADR(
      recent21.map(q => ({
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
      }))
    );

    // 21-day high/low
    const high21 = Math.max(...recent21.map(q => q.high ?? 0));
    const low21 = Math.min(...recent21.map(q => q.low ?? 0));

    // Liquidity = Average Volume * Price / 1,000,000
    const liquidityM = (avgVolume * close) / 1_000_000;

    // Market cap from quote data (in billions)
    const marketCapB = quoteResult?.marketCap ? quoteResult.marketCap / 1_000_000_000 : 0;

    return {
      ticker,
      price: close,
      avgVolume: Math.round(avgVolume),
      volumeM: Math.round(volumeM * 100) / 100, // Round to 2 decimals
      adrPct: Math.round(adrPct * 100) / 100, // Round to 2 decimals
      liquidityM: Math.round(liquidityM * 10) / 10, // Round to 1 decimal
      marketCapB: Math.round(marketCapB * 10) / 10, // Round to 1 decimal
      high21,
      low21,
      close,
      ema21: Math.round(ema21 * 100) / 100,
      ema21_prev: Math.round(ema21_prev * 100) / 100,
      is21EmaAdvancing,
      wma10: Math.round(wma10 * 100) / 100,
      wma10_prev: Math.round(wma10_prev * 100) / 100,
      is10WmaAdvancing,
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
