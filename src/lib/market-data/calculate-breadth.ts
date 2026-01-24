/**
 * Breadth Calculation Module
 *
 * Calculates McClellan Oscillator (MCO) and McClellan Summation Index (MCSI)
 * from Nasdaq-100 constituent OHLC data.
 *
 * MCO = 19-day EMA(Net Advances) - 39-day EMA(Net Advances)
 * MCSI = Cumulative sum of MCO values
 *
 * Run backfill: npx tsx src/lib/market-data/calculate-breadth.ts --backfill
 * Run daily:    npx tsx src/lib/market-data/calculate-breadth.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import YahooFinance from 'yahoo-finance2';
import { createClient } from '@supabase/supabase-js';

// Initialize Yahoo Finance client
const yahooFinance = new YahooFinance();

// =============================================================================
// Types
// =============================================================================

interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface DailyBreadth {
  date: string;
  advances: number;
  declines: number;
  unchanged: number;
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
// Supabase Client
// =============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

    if (!result.quotes || result.quotes.length === 0) {
      return [];
    }

    return result.quotes
      .filter(q => q.open != null && q.close != null)
      .map(q => ({
        date: new Date(q.date).toISOString().split('T')[0],
        open: q.open!,
        high: q.high!,
        low: q.low!,
        close: q.close!,
      }));
  } catch (error) {
    // Silently skip failed tickers
    return [];
  }
}

async function fetchAllOHLC(tickers: string[], days: number): Promise<Map<string, OHLCBar[]>> {
  console.log(`[Breadth] Fetching OHLC for ${tickers.length} tickers (${days} days)...`);

  const ohlcData = new Map<string, OHLCBar[]>();
  const BATCH_SIZE = 10;
  let fetched = 0;

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
        fetched++;
      }
    }

    // Progress update
    process.stdout.write(`\r[Breadth] Fetched ${fetched}/${tickers.length} tickers...`);

    // Rate limiting
    if (i + BATCH_SIZE < tickers.length) {
      await delay(300);
    }
  }

  console.log(`\n[Breadth] Successfully fetched OHLC for ${fetched} tickers`);
  return ohlcData;
}

// =============================================================================
// Breadth Calculation
// =============================================================================

function calculateDailyBreadth(ohlcData: Map<string, OHLCBar[]>): DailyBreadth[] {
  // Get all unique dates
  const allDates = new Set<string>();
  for (const bars of ohlcData.values()) {
    for (const bar of bars) {
      allDates.add(bar.date);
    }
  }

  const sortedDates = Array.from(allDates).sort();
  console.log(`[Breadth] Processing ${sortedDates.length} trading days...`);

  const dailyBreadth: DailyBreadth[] = [];

  for (let i = 1; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const prevDate = sortedDates[i - 1];

    let advances = 0;
    let declines = 0;
    let unchanged = 0;

    for (const [, bars] of ohlcData.entries()) {
      const todayBar = bars.find(b => b.date === date);
      const prevBar = bars.find(b => b.date === prevDate);

      if (todayBar && prevBar) {
        if (todayBar.close > prevBar.close) {
          advances++;
        } else if (todayBar.close < prevBar.close) {
          declines++;
        } else {
          unchanged++;
        }
      }
    }

    dailyBreadth.push({
      date,
      advances,
      declines,
      unchanged,
      netAdvances: advances - declines,
    });
  }

  return dailyBreadth;
}

function calculateMcClellan(dailyBreadth: DailyBreadth[]): CalculatedBreadth[] {
  if (dailyBreadth.length < 40) {
    console.error('[Breadth] Insufficient data for McClellan calculation (need 40+ days)');
    return [];
  }

  // Extract net advances
  const netAdvances = dailyBreadth.map(d => d.netAdvances);

  // Calculate EMAs
  const ema19 = calculateEMA(netAdvances, 19);
  const ema39 = calculateEMA(netAdvances, 39);

  // Calculate MCO and MCSI
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
// Database Operations
// =============================================================================

async function saveBreadthToDatabase(breadth: CalculatedBreadth): Promise<boolean> {
  try {
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

    if (error) {
      console.error(`[Breadth] Failed to save ${breadth.date}:`, error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[Breadth] Error saving ${breadth.date}:`, error);
    return false;
  }
}

async function getLastBreadthDate(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('breadth_data')
      .select('date')
      .eq('source', 'calculated')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data.date;
  } catch {
    return null;
  }
}

// =============================================================================
// Main Functions
// =============================================================================

export async function calculateAndSaveBreadth(
  days: number = 300,
  saveLast: number = 30
): Promise<CalculatedBreadth[]> {
  console.log('\n=== Breadth Calculation ===\n');

  // Fetch OHLC data
  const ohlcData = await fetchAllOHLC(NASDAQ_100_TICKERS, days);

  if (ohlcData.size < 50) {
    console.error(`[Breadth] Only got data for ${ohlcData.size} tickers, need at least 50`);
    return [];
  }

  // Calculate daily breadth
  const dailyBreadth = calculateDailyBreadth(ohlcData);

  // Calculate McClellan indicators
  const breadthResults = calculateMcClellan(dailyBreadth);

  if (breadthResults.length === 0) {
    console.error('[Breadth] No results calculated');
    return [];
  }

  console.log(`[Breadth] Calculated ${breadthResults.length} days of breadth data`);

  // Save last N days to database
  const toSave = breadthResults.slice(-saveLast);
  console.log(`[Breadth] Saving last ${toSave.length} days to database...`);

  let saved = 0;
  for (const breadth of toSave) {
    const success = await saveBreadthToDatabase(breadth);
    if (success) saved++;
  }

  console.log(`[Breadth] Saved ${saved}/${toSave.length} records to database`);

  // Show latest values
  const latest = breadthResults[breadthResults.length - 1];
  console.log('\n[Breadth] Latest values:');
  console.log(`  Date: ${latest.date}`);
  console.log(`  MCO: ${latest.mco.toFixed(2)} (z: ${latest.mcoZscore.toFixed(2)})`);
  console.log(`  MCSI: ${latest.mcsi.toFixed(0)} (z: ${latest.mcsiZscore.toFixed(2)})`);
  console.log(`  Advances: ${latest.advances}, Declines: ${latest.declines}`);

  return breadthResults;
}

export async function updateDailyBreadth(): Promise<CalculatedBreadth | null> {
  console.log('\n=== Daily Breadth Update ===\n');

  // Check last calculated date
  const lastDate = await getLastBreadthDate();
  const today = new Date().toISOString().split('T')[0];

  if (lastDate === today) {
    console.log(`[Breadth] Already have data for today (${today})`);

    // Fetch and return today's data
    const { data } = await supabase
      .from('breadth_data')
      .select('*')
      .eq('date', today)
      .single();

    if (data) {
      return {
        date: data.date,
        mco: data.mco,
        mcsi: data.mcsi,
        mcoZscore: data.mco_z,
        mcsiZscore: data.mcsi_z,
        advances: 0,
        declines: 0,
      };
    }
    return null;
  }

  // Calculate fresh data (need 300 days for good z-scores)
  const results = await calculateAndSaveBreadth(300, 5);

  return results.length > 0 ? results[results.length - 1] : null;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--backfill')) {
    // Full backfill: calculate 300 days, save last 30
    console.log('Running full backfill (300 days history, saving last 30)...');
    await calculateAndSaveBreadth(300, 30);
  } else {
    // Daily update: calculate recent days, save last 5
    console.log('Running daily update...');
    await updateDailyBreadth();
  }

  console.log('\n=== Done ===');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
