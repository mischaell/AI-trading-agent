/**
 * API Route to fix portfolio position entry prices
 *
 * Updates all positions with historical prices from N days ago
 * to create more realistic test data.
 *
 * POST /api/fix-positions?days=7
 */

import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface PositionRow {
  id: string;
  ticker: string;
  shares: number;
  avg_price: number;
  ssl: number;
  trim_2r_price: number | null;
}

interface UpdateResult {
  ticker: string;
  old_price: number;
  new_price: number;
  new_ssl: number;
  new_trim_2r: number;
  success: boolean;
  error?: string;
}

/**
 * Fetch historical price from N trading days ago
 */
async function getHistoricalPrice(ticker: string, daysAgo: number): Promise<number | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.ceil(daysAgo * 2)); // Buffer for weekends

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
      return null;
    }

    // Get the price from N trading days ago
    const validQuotes = quotes.filter(q => q.close !== null);
    if (validQuotes.length < daysAgo) {
      // Not enough history, use earliest available
      return validQuotes[0]?.close ?? null;
    }

    // Get the Nth from last quote
    const targetIndex = validQuotes.length - daysAgo - 1;
    return validQuotes[Math.max(0, targetIndex)]?.close ?? null;
  } catch (error) {
    console.error(`[FixPositions] Failed to fetch price for ${ticker}:`, error);
    return null;
  }
}

export async function POST(request: Request) {
  // Check Supabase config
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { success: false, error: 'Supabase not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Parse days parameter
  const { searchParams } = new URL(request.url);
  const daysAgo = parseInt(searchParams.get('days') || '7', 10);

  console.log(`[FixPositions] Updating positions with prices from ${daysAgo} days ago`);

  try {
    // Get all positions
    const { data: positions, error: fetchError } = await supabase
      .from('positions')
      .select('id, ticker, shares, avg_price, ssl, trim_2r_price');

    if (fetchError) {
      throw fetchError;
    }

    if (!positions || positions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No positions to update',
        updates: [],
      });
    }

    console.log(`[FixPositions] Found ${positions.length} positions to update`);

    const results: UpdateResult[] = [];

    // Update each position
    for (const pos of positions as PositionRow[]) {
      const historicalPrice = await getHistoricalPrice(pos.ticker, daysAgo);

      if (historicalPrice === null) {
        results.push({
          ticker: pos.ticker,
          old_price: pos.avg_price,
          new_price: pos.avg_price,
          new_ssl: pos.ssl,
          new_trim_2r: pos.trim_2r_price ?? 0,
          success: false,
          error: 'Failed to fetch historical price',
        });
        continue;
      }

      // Calculate new SSL (4% below entry - typical stop distance)
      const newSsl = Number((historicalPrice * 0.96).toFixed(2));

      // Calculate new 2R price: entry + 2 * risk, where risk = entry - ssl
      const risk = historicalPrice - newSsl;
      const newTrim2r = Number((historicalPrice + 2 * risk).toFixed(2));

      // Update position in database
      const { error: updateError } = await supabase
        .from('positions')
        .update({
          avg_price: historicalPrice,
          ssl: newSsl,
          trim_2r_price: newTrim2r,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pos.id);

      if (updateError) {
        results.push({
          ticker: pos.ticker,
          old_price: pos.avg_price,
          new_price: historicalPrice,
          new_ssl: newSsl,
          new_trim_2r: newTrim2r,
          success: false,
          error: updateError.message,
        });
      } else {
        results.push({
          ticker: pos.ticker,
          old_price: pos.avg_price,
          new_price: historicalPrice,
          new_ssl: newSsl,
          new_trim_2r: newTrim2r,
          success: true,
        });
        console.log(`[FixPositions] ${pos.ticker}: $${pos.avg_price.toFixed(2)} -> $${historicalPrice.toFixed(2)}`);
      }
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: true,
      message: `Updated ${successCount}/${positions.length} positions with prices from ${daysAgo} days ago`,
      updates: results,
    });
  } catch (error) {
    console.error('[FixPositions] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return NextResponse.json({
    usage: 'POST /api/fix-positions?days=7',
    description: 'Updates all position entry prices with historical prices from N days ago',
    parameters: {
      days: 'Number of trading days ago to use for entry price (default: 7)',
    },
  });
}
