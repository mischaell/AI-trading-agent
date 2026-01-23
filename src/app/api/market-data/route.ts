/**
 * Market Data API Route
 *
 * Server-side endpoint for fetching Yahoo Finance data.
 * This runs on the server where Node.js modules are available.
 */

import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export interface OHLCData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * GET /api/market-data?ticker=QQQE&days=35
 * Fetches OHLC data for a ticker
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker') || 'QQQE';
  const days = parseInt(searchParams.get('days') || '35', 10);

  try {
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.ceil(days * 1.5));

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
      return NextResponse.json({ error: 'No data returned', data: [] }, { status: 200 });
    }

    // Transform to our format and sort oldest first
    const ohlcData: OHLCData[] = quotes
      .filter((bar) => bar.date && bar.close !== null)
      .map((bar) => ({
        date: new Date(bar.date).toISOString().split('T')[0],
        open: bar.open ?? 0,
        high: bar.high ?? 0,
        low: bar.low ?? 0,
        close: bar.close ?? 0,
        volume: bar.volume ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-days);

    return NextResponse.json({ data: ohlcData });
  } catch (error) {
    console.error('[API/market-data] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market data', data: [] },
      { status: 500 }
    );
  }
}
