/**
 * API Route: /api/breadth-update
 *
 * Calculates and updates breadth data (MCO/MCSI) from Nasdaq-100 OHLC.
 *
 * GET  - Check current status and latest breadth
 * POST - Trigger breadth calculation and update database
 *
 * Query params (POST):
 *   ?force=true - Force recalculation even if already have today's data
 */

import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';

// Initialize clients
const yahooFinance = new YahooFinance();
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// =============================================================================
// Types
// =============================================================================

interface OHLCBar {
  date: string;
  close: number;
}

interface DailyBreadth {
  date: string;
  advances: number;
  declines: number;
  netAdvances: number;
}

interface CalculatedBreadth {
  date: string;
  mco: number;
  mcsi: number;
  mcoZscore: number;
  mcsiZscore: number;
  advances: number;
  declines: number;
}

// =============================================================================
// Constants
// =============================================================================

const NASDAQ_100_TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'AVGO', 'COST',
  'ADBE', 'AMD', 'NFLX', 'CSCO', 'INTC', 'QCOM', 'INTU', 'TXN', 'AMAT', 'MU',
  'LRCX', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'NXPI', 'ON', 'ADI', 'MCHP', 'ASML',
  'CRM', 'ADSK', 'PANW', 'CRWD', 'DDOG', 'ZS', 'FTNT', 'WDAY', 'TEAM', 'MDB',
  'CSGP', 'CTSH', 'CDW',
  'BKNG', 'ABNB', 'DASH', 'MELI', 'PYPL', 'TTD', 'TTWO', 'EA',
  'AMGN', 'GILD', 'REGN', 'VRTX', 'ISRG', 'IDXX', 'DXCM', 'ILMN', 'BIIB', 'MRNA',
  'GEHC', 'AZN',
  'TMUS', 'CMCSA', 'CHTR', 'WBD',
  'PEP', 'KDP', 'MNST', 'KHC', 'MDLZ', 'SBUX', 'LULU', 'ROST', 'ORLY', 'CPRT',
  'DLTR', 'FAST', 'ODFL', 'PCAR', 'CSX',
  'HON', 'GE', 'CEG', 'XEL', 'EXC', 'AEP',
  'BKR', 'FANG',
  'CTAS', 'PAYX', 'VRSK', 'ADP',
  'MAR', 'RCL', 'EXPE',
  'PDD', 'JD', 'BIDU', 'NTES',
];

// =============================================================================
// Helper Functions
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calculateZscore(values: number[], idx: number, window: number = 252): number {
  const start = Math.max(0, idx - window + 1);
  const slice = values.slice(start, idx + 1);
  if (slice.length < 20) return 0;
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  const stdev = Math.sqrt(variance);
  return stdev > 0 ? (values[idx] - mean) / stdev : 0;
}

// =============================================================================
// Data Fetching
// =============================================================================

async function fetchOHLCForTicker(ticker: string, days: number): Promise<OHLCBar[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const result = await yahooFinance.chart(ticker, {
      period1: startDate.toISOString().split('T')[0],
      period2: endDate.toISOString().split('T')[0],
      interval: '1d',
    });

    if (!result.quotes || result.quotes.length === 0) return [];

    return result.quotes
      .filter(q => q.close != null)
      .map(q => ({
        date: new Date(q.date).toISOString().split('T')[0],
        close: q.close!,
      }));
  } catch {
    return [];
  }
}

async function fetchAllOHLC(tickers: string[], days: number): Promise<Map<string, OHLCBar[]>> {
  const ohlcData = new Map<string, OHLCBar[]>();
  const BATCH_SIZE = 10;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async ticker => {
        const bars = await fetchOHLCForTicker(ticker, days);
        return { ticker, bars };
      })
    );

    for (const { ticker, bars } of batchResults) {
      if (bars.length > 0) {
        ohlcData.set(ticker, bars);
      }
    }

    if (i + BATCH_SIZE < tickers.length) {
      await delay(200);
    }
  }

  return ohlcData;
}

// =============================================================================
// Breadth Calculation
// =============================================================================

function calculateDailyBreadth(ohlcData: Map<string, OHLCBar[]>): DailyBreadth[] {
  const allDates = new Set<string>();
  for (const bars of ohlcData.values()) {
    for (const bar of bars) {
      allDates.add(bar.date);
    }
  }

  const sortedDates = Array.from(allDates).sort();
  const dailyBreadth: DailyBreadth[] = [];

  for (let i = 1; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const prevDate = sortedDates[i - 1];
    let advances = 0;
    let declines = 0;

    for (const [, bars] of ohlcData.entries()) {
      const todayBar = bars.find(b => b.date === date);
      const prevBar = bars.find(b => b.date === prevDate);
      if (todayBar && prevBar) {
        if (todayBar.close > prevBar.close) advances++;
        else if (todayBar.close < prevBar.close) declines++;
      }
    }

    dailyBreadth.push({ date, advances, declines, netAdvances: advances - declines });
  }

  return dailyBreadth;
}

function calculateMcClellan(dailyBreadth: DailyBreadth[]): CalculatedBreadth[] {
  if (dailyBreadth.length < 40) return [];

  const netAdvances = dailyBreadth.map(d => d.netAdvances);
  const ema19 = calculateEMA(netAdvances, 19);
  const ema39 = calculateEMA(netAdvances, 39);

  const results: CalculatedBreadth[] = [];
  let cumMcsi = 0;
  const mcoValues: number[] = [];
  const mcsiValues: number[] = [];

  for (let i = 38; i < dailyBreadth.length; i++) {
    const mco = ema19[i] - ema39[i];
    cumMcsi += mco;
    mcoValues.push(mco);
    mcsiValues.push(cumMcsi);

    const mcoIdx = mcoValues.length - 1;
    results.push({
      date: dailyBreadth[i].date,
      mco,
      mcsi: cumMcsi,
      mcoZscore: calculateZscore(mcoValues, mcoIdx),
      mcsiZscore: calculateZscore(mcsiValues, mcoIdx),
      advances: dailyBreadth[i].advances,
      declines: dailyBreadth[i].declines,
    });
  }

  return results;
}

// =============================================================================
// API Routes
// =============================================================================

export async function GET() {
  try {
    // Get latest breadth data
    const { data, error } = await supabase
      .from('breadth_data')
      .select('*')
      .order('date', { ascending: false })
      .limit(5);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];
    const latestDate = data?.[0]?.date;
    const isStale = !latestDate || latestDate < today;

    return NextResponse.json({
      success: true,
      today,
      latestDate,
      isStale,
      needsUpdate: isStale,
      recent: data?.map(d => ({
        date: d.date,
        mco: d.mco,
        mcsi: d.mcsi,
        mco_z: d.mco_z,
        mcsi_z: d.mcsi_z,
        source: d.source,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    // Check if we already have today's data
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('breadth_data')
      .select('date')
      .eq('date', today)
      .eq('source', 'calculated')
      .single();

    if (existing && !force) {
      return NextResponse.json({
        success: true,
        message: 'Already have calculated data for today',
        date: today,
        skipped: true,
      });
    }

    // Fetch OHLC data (need ~300 days for good z-scores)
    console.log('[Breadth API] Fetching OHLC data...');
    const ohlcData = await fetchAllOHLC(NASDAQ_100_TICKERS, 300);

    if (ohlcData.size < 50) {
      return NextResponse.json({
        error: `Insufficient data: only got ${ohlcData.size} tickers`,
      }, { status: 500 });
    }

    // Calculate breadth
    console.log('[Breadth API] Calculating breadth...');
    const dailyBreadth = calculateDailyBreadth(ohlcData);
    const breadthResults = calculateMcClellan(dailyBreadth);

    if (breadthResults.length === 0) {
      return NextResponse.json({ error: 'No breadth results calculated' }, { status: 500 });
    }

    // Save last 5 days
    const toSave = breadthResults.slice(-5);
    let saved = 0;

    for (const breadth of toSave) {
      const { error } = await supabase
        .from('breadth_data')
        .upsert({
          date: breadth.date,
          mco: breadth.mco,
          mcsi: breadth.mcsi,
          mco_z: breadth.mcoZscore,
          mcsi_z: breadth.mcsiZscore,
          source: 'calculated',
        }, { onConflict: 'date' });

      if (!error) saved++;
    }

    const latest = breadthResults[breadthResults.length - 1];

    console.log(`[Breadth API] Saved ${saved} records. Latest: ${latest.date}`);

    return NextResponse.json({
      success: true,
      tickersFetched: ohlcData.size,
      daysCalculated: breadthResults.length,
      daysSaved: saved,
      latest: {
        date: latest.date,
        mco: latest.mco,
        mcsi: latest.mcsi,
        mco_z: latest.mcoZscore,
        mcsi_z: latest.mcsiZscore,
        advances: latest.advances,
        declines: latest.declines,
      },
    });
  } catch (error) {
    console.error('[Breadth API] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
