/**
 * Daily Universe Scan API Route
 *
 * Performs a full scan of all Nasdaq stocks to find Liquid Leaders.
 * This should be run once per day (EOD) and results are cached.
 *
 * Process:
 * 1. Fetch full Nasdaq ticker list (~1000 pre-filtered by market cap/price)
 * 2. Fetch universe data (price, volume, liquidity, ADR, etc.) in batches
 * 3. Apply Liquid Leaders filters
 * 4. Return filtered list of 30-40 liquid leaders
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface NasdaqStock {
  ticker: string;
  name: string;
  marketCap: number;
  lastSale: number;
}

interface FilteredStock {
  ticker: string;
  name: string;
  rs: number;
  price: number;
  liquidityM: number;
  volumeM: number;
  marketCapB: number;
  adrPct: number;
  is21EmaAdvancing: boolean;
  is10WmaAdvancing: boolean;
}

// Excluded sectors
const EXCLUDED_SECTORS_KEYWORDS = [
  'biotech', 'biotechnology', 'pharmaceutical', 'pharma', 'drug',
  'oil', 'gas', 'petroleum', 'energy', 'coal', 'solar', 'wind power',
  'utility', 'utilities', 'electric power', 'water utility',
  'reit', 'real estate', 'property', 'mortgage',
  'bank', 'banking', 'insurance', 'financial services',
  'mining', 'metals', 'steel', 'gold', 'silver', 'copper',
  'tobacco', 'alcohol', 'beverage',
  'hospital', 'healthcare', 'medical', 'diagnostic', 'clinic',
];

// China/HK ADR keywords
const CHINA_KEYWORDS = ['china', 'chinese', 'hong kong', 'adr'];

function isExcludedByName(name: string): { excluded: boolean; reason?: string } {
  const nameLower = name.toLowerCase();

  // Check China ADR - always exclude
  if (CHINA_KEYWORDS.some(k => nameLower.includes(k))) {
    return { excluded: true, reason: 'China/HK ADR' };
  }

  // AGGRESSIVE MODE: Skip sector exclusions to include industrials, financials, crypto miners etc.
  // Original excluded: biotech, energy, utilities, REITs, banks, mining, healthcare
  // Now we only exclude China ADRs
  //
  // Uncomment below to restore sector exclusions:
  // for (const keyword of EXCLUDED_SECTORS_KEYWORDS) {
  //   if (nameLower.includes(keyword)) {
  //     return { excluded: true, reason: `Excluded sector (${keyword})` };
  //   }
  // }

  return { excluded: false };
}

/**
 * Calculate ADR% from quotes
 */
function calculateADR(quotes: Array<{ high: number; low: number; close: number }>): number {
  if (quotes.length === 0) return 0;
  const dailyRanges = quotes.map(q => {
    if (q.close === 0) return 0;
    return ((q.high - q.low) / q.close) * 100;
  });
  return dailyRanges.reduce((a, b) => a + b, 0) / dailyRanges.length;
}

/**
 * Calculate EMA
 */
function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const multiplier = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  ema.push(sum / period);
  for (let i = period; i < closes.length; i++) {
    ema.push((closes[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
  }
  return ema;
}

/**
 * Calculate SMA
 */
function calculateSMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const sma: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += closes[i - j];
    sma.push(sum / period);
  }
  return sma;
}

/**
 * Fetch ticker data directly from Yahoo Finance
 */
async function fetchTickerData(ticker: string): Promise<FilteredStock | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 120);

    const [chartResult, quoteResult] = await Promise.all([
      yahooFinance.chart(ticker, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    if (!quotes || quotes.length < 30) return null;

    const validQuotes = quotes.filter(
      q => q.close !== null && q.high !== null && q.low !== null && q.volume !== null
    );
    if (validQuotes.length < 30) return null;

    const closes = validQuotes.map(q => q.close ?? 0);
    const recent21 = validQuotes.slice(-21);
    const latestQuote = validQuotes[validQuotes.length - 1];
    const close = latestQuote.close ?? 0;

    // Calculate metrics
    const avgVolume = recent21.reduce((sum, q) => sum + (q.volume ?? 0), 0) / recent21.length;
    const volumeM = avgVolume / 1_000_000;
    const adrPct = calculateADR(recent21.map(q => ({
      high: q.high ?? 0,
      low: q.low ?? 0,
      close: q.close ?? 0,
    })));
    const liquidityM = (avgVolume * close) / 1_000_000;
    const marketCapB = quoteResult?.marketCap ? quoteResult.marketCap / 1_000_000_000 : 0;

    // Calculate EMAs
    const ema21Values = calculateEMA(closes, 21);
    const ema21 = ema21Values.length >= 2 ? ema21Values[ema21Values.length - 1] : 0;
    const ema21_prev = ema21Values.length >= 2 ? ema21Values[ema21Values.length - 2] : 0;
    const is21EmaAdvancing = ema21 > ema21_prev;

    const sma50Values = calculateSMA(closes, 50);
    const wma10 = sma50Values.length >= 2 ? sma50Values[sma50Values.length - 1] : 0;
    const wma10_prev = sma50Values.length >= 2 ? sma50Values[sma50Values.length - 2] : 0;
    const is10WmaAdvancing = wma10 > wma10_prev;

    return {
      ticker,
      name: quoteResult?.longName || quoteResult?.shortName || ticker,
      rs: 50, // Will be calculated later
      price: Math.round(close * 100) / 100,
      liquidityM: Math.round(liquidityM * 10) / 10,
      volumeM: Math.round(volumeM * 100) / 100,
      marketCapB: Math.round(marketCapB * 10) / 10,
      adrPct: Math.round(adrPct * 100) / 100,
      is21EmaAdvancing,
      is10WmaAdvancing,
    };
  } catch {
    return null;
  }
}

/**
 * Calculate RS ranking for all stocks
 */
function calculateRSRankings(stocks: FilteredStock[]): void {
  // For now, use a simple ranking based on price momentum
  // In production, this would use 3-month and 6-month performance
  const sorted = [...stocks].sort((a, b) => b.price - a.price);
  sorted.forEach((stock, index) => {
    // RS is 1-99, higher is better
    stock.rs = Math.max(1, Math.min(99, Math.round(100 - (index / sorted.length) * 100)));
  });
}

// Cooldown: prevent triggering scans more than once per hour
const SCAN_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
let lastScanTimestamp = 0;

/**
 * POST /api/daily-scan
 * Runs the full daily universe scan
 */
export async function POST() {
  const now = Date.now();
  if (now - lastScanTimestamp < SCAN_COOLDOWN_MS) {
    const remainingMin = Math.ceil((SCAN_COOLDOWN_MS - (now - lastScanTimestamp)) / 60000);
    console.warn(`[DailyScan] Cooldown active — scan blocked. Try again in ${remainingMin}min.`);
    return NextResponse.json({
      success: false,
      error: `Scan cooldown active. Try again in ${remainingMin} minutes.`,
      lastScan: new Date(lastScanTimestamp).toISOString(),
    }, { status: 429 });
  }
  lastScanTimestamp = now;

  const startTime = Date.now();
  console.log('[DailyScan] Starting full Nasdaq universe scan...');

  try {
    // Step 1: Fetch NASDAQ + NYSE ticker lists
    console.log('[DailyScan] Step 1: Fetching NASDAQ + NYSE ticker lists...');

    const fetchExchange = async (exchange: 'NASDAQ' | 'NYSE') => {
      const response = await fetch(
        `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=5000&exchange=${exchange}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        }
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data?.data?.table?.rows || []).map((s: { symbol: string; name: string; marketCap: string; lastsale: string }) => ({
        ...s,
        exchange,
      }));
    };

    // Fetch both exchanges in parallel
    const [nasdaqRaw, nyseRaw] = await Promise.all([
      fetchExchange('NASDAQ'),
      fetchExchange('NYSE'),
    ]);

    console.log(`[DailyScan] Raw: NASDAQ=${nasdaqRaw.length}, NYSE=${nyseRaw.length}`);

    // Combine and dedupe
    const seen = new Set<string>();
    const allStocks: Array<{ symbol: string; name: string; marketCap: string; lastsale: string; exchange: string }> = [];
    for (const s of [...nasdaqRaw, ...nyseRaw]) {
      if (!seen.has(s.symbol)) {
        seen.add(s.symbol);
        allStocks.push(s);
      }
    }

    // Pre-filter by market cap and price
    const preFiltered: NasdaqStock[] = allStocks
      .filter((s) => {
        const marketCap = parseInt(s.marketCap?.replace(/,/g, '') || '0', 10);
        const price = parseFloat(s.lastsale?.replace(/[$,]/g, '') || '0');
        return marketCap >= 500_000_000 && price >= 5;
      })
      .map((s) => ({
        ticker: s.symbol,
        name: s.name,
        marketCap: parseInt(s.marketCap?.replace(/,/g, '') || '0', 10),
        lastSale: parseFloat(s.lastsale?.replace(/[$,]/g, '') || '0'),
      }));

    console.log(`[DailyScan] Combined ${allStocks.length} stocks, pre-filtered to ${preFiltered.length}`);

    // Step 2: Filter out excluded sectors by name
    console.log('[DailyScan] Step 2: Filtering by company name...');
    const nameFiltered = preFiltered.filter(s => !isExcludedByName(s.name).excluded);
    console.log(`[DailyScan] After name filter: ${nameFiltered.length} stocks`);

    // Step 3: Fetch data for each ticker in batches
    console.log('[DailyScan] Step 3: Fetching ticker data from Yahoo Finance...');

    const allData: FilteredStock[] = [];
    const failed: { ticker: string; reason: string }[] = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < nameFiltered.length; i += BATCH_SIZE) {
      const batch = nameFiltered.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (stock) => {
        const data = await fetchTickerData(stock.ticker);
        if (data) {
          data.name = stock.name; // Use Nasdaq name
          return { success: true, data };
        }
        return { success: false, ticker: stock.ticker };
      });

      const results = await Promise.all(batchPromises);

      for (const result of results) {
        if (result.success && result.data) {
          allData.push(result.data);
        } else if (!result.success && result.ticker) {
          failed.push({ ticker: result.ticker, reason: 'Failed to fetch data' });
        }
      }

      // Progress log
      if (i % 100 === 0 || i + BATCH_SIZE >= nameFiltered.length) {
        console.log(`[DailyScan] Progress: ${Math.min(i + BATCH_SIZE, nameFiltered.length)}/${nameFiltered.length} tickers processed, ${allData.length} successful`);
      }

      // Rate limiting
      if (i + BATCH_SIZE < nameFiltered.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[DailyScan] Got data for ${allData.length} stocks`);

    // Step 4: Calculate RS rankings
    console.log('[DailyScan] Step 4: Calculating RS rankings...');
    calculateRSRankings(allData);

    // Step 5: Apply Liquid Leaders filters (AGGRESSIVE criteria)
    // These are relaxed to include industrials, financials, crypto miners etc.
    console.log('[DailyScan] Step 5: Applying Liquid Leaders filters (aggressive)...');

    const passed: FilteredStock[] = [];

    for (const stock of allData) {
      // Filter: Liquidity >= $100M (aggressive: was $250M)
      if (stock.liquidityM < 100) {
        failed.push({ ticker: stock.ticker, reason: `Liquidity $${stock.liquidityM.toFixed(0)}M < $100M` });
        continue;
      }

      // Filter: Volume >= 0.5M shares (aggressive: was 1M)
      if (stock.volumeM < 0.5) {
        failed.push({ ticker: stock.ticker, reason: `Volume ${stock.volumeM.toFixed(2)}M < 0.5M shares` });
        continue;
      }

      // Filter: Market Cap >= $0.5B (aggressive: was $1B)
      if (stock.marketCapB < 0.5) {
        failed.push({ ticker: stock.ticker, reason: `Market cap $${stock.marketCapB.toFixed(1)}B < $0.5B` });
        continue;
      }

      // Filter: ADR between 2.0% and 20% (aggressive: was 2.5%-10%)
      if (stock.adrPct < 2.0) {
        failed.push({ ticker: stock.ticker, reason: `ADR ${stock.adrPct.toFixed(2)}% < 2.0%` });
        continue;
      }
      if (stock.adrPct > 20) {
        failed.push({ ticker: stock.ticker, reason: `ADR ${stock.adrPct.toFixed(2)}% > 20%` });
        continue;
      }

      // Filter: Price > $5 (aggressive: was $10)
      if (stock.price < 5) {
        failed.push({ ticker: stock.ticker, reason: `Price $${stock.price.toFixed(2)} < $5` });
        continue;
      }

      // Passed all filters!
      passed.push(stock);
    }

    // Sort by RS (highest first)
    passed.sort((a, b) => b.rs - a.rs);

    // Limit to top 75 (aggressive mode - was 40)
    const liquidLeaders = passed.slice(0, 75);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DailyScan] Complete in ${elapsed}s`);
    console.log(`[DailyScan] Scanned: ${nameFiltered.length}, Got data: ${allData.length}, Passed: ${passed.length}, Top ${liquidLeaders.length}`);

    // Build failure summary
    const failureReasons: Record<string, number> = {};
    for (const f of failed) {
      const reason = f.reason.split(' ')[0];
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    }

    const responseData = {
      success: true,
      timestamp: new Date().toISOString(),
      elapsed: `${elapsed}s`,
      stats: {
        nasdaqTotal: nasdaqRaw.length,
        nyseTotal: nyseRaw.length,
        combinedTotal: allStocks.length,
        preFiltered: preFiltered.length,
        afterNameFilter: nameFiltered.length,
        withData: allData.length,
        passedFilters: passed.length,
        liquidLeaders: liquidLeaders.length,
      },
      failureReasons,
      liquidLeaders,
      allPassed: passed,
    };

    // Cache to Supabase for cross-device access
    try {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (sbUrl && sbKey) {
        const supabase = createClient(sbUrl, sbKey);
        const { error: upsertErr } = await supabase.from('daily_scan_cache').upsert({
          scan_date: new Date().toISOString().split('T')[0],
          scan_timestamp: responseData.timestamp,
          stats: responseData.stats,
          liquid_leaders: responseData.liquidLeaders,
          all_passed: responseData.allPassed,
          elapsed: responseData.elapsed,
        }, { onConflict: 'scan_date' });
        if (upsertErr) {
          console.error('[DailyScan] Supabase upsert error:', JSON.stringify(upsertErr));
        } else {
          console.log('[DailyScan] Cached to Supabase');
        }
      }
    } catch (cacheErr) {
      console.warn('[DailyScan] Supabase cache failed:', cacheErr);
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('[DailyScan] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/daily-scan
 * Returns info about the endpoint
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Use POST to trigger a full daily scan',
    description: 'Scans all Nasdaq stocks (~1400) to find Liquid Leaders (30-40 stocks)',
    estimatedTime: '3-5 minutes',
  });
}
