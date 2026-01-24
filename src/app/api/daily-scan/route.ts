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
 * 4. Cache results in Supabase
 * 5. Return filtered list of 30-40 liquid leaders
 */

import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface NasdaqStock {
  ticker: string;
  name: string;
  marketCap: number;
  lastSale: number;
}

interface UniverseDataItem {
  ticker: string;
  price: number;
  avgVolume: number;
  volumeM: number;
  adrPct: number;
  liquidityM: number;
  marketCapB: number;
  is21EmaAdvancing: boolean;
  is10WmaAdvancing: boolean;
}

interface RSData {
  ticker: string;
  rs: number;
}

// Excluded sectors
const EXCLUDED_SECTORS_KEYWORDS = [
  'biotech', 'biotechnology', 'pharmaceutical', 'pharma', 'drug',
  'oil', 'gas', 'petroleum', 'energy', 'coal', 'solar', 'wind',
  'utility', 'utilities', 'electric power', 'water',
  'reit', 'real estate', 'property', 'mortgage',
  'bank', 'banking', 'insurance', 'financial services',
  'mining', 'metals', 'steel', 'gold', 'silver', 'copper',
  'tobacco', 'alcohol', 'beverage',
  'hospital', 'healthcare', 'medical', 'diagnostic', 'clinic',
];

// China/HK ADR keywords
const CHINA_KEYWORDS = ['china', 'chinese', 'hong kong', 'hk', 'adr'];

function isExcludedByName(name: string): { excluded: boolean; reason?: string } {
  const nameLower = name.toLowerCase();

  // Check China ADR
  if (CHINA_KEYWORDS.some(k => nameLower.includes(k))) {
    return { excluded: true, reason: 'China/HK ADR' };
  }

  // Check excluded sectors
  for (const keyword of EXCLUDED_SECTORS_KEYWORDS) {
    if (nameLower.includes(keyword)) {
      return { excluded: true, reason: `Excluded sector (${keyword})` };
    }
  }

  return { excluded: false };
}

/**
 * POST /api/daily-scan
 * Runs the full daily universe scan
 */
export async function POST() {
  const startTime = Date.now();
  console.log('[DailyScan] Starting full Nasdaq universe scan...');

  try {
    // Step 1: Fetch full Nasdaq ticker list
    console.log('[DailyScan] Step 1: Fetching Nasdaq ticker list...');
    const nasdaqResponse = await fetch(`${BASE_URL}/api/nasdaq-tickers`);
    const nasdaqData = await nasdaqResponse.json();

    if (!nasdaqData.success || !nasdaqData.stocks) {
      throw new Error('Failed to fetch Nasdaq tickers');
    }

    const nasdaqStocks: NasdaqStock[] = nasdaqData.stocks;
    console.log(`[DailyScan] Got ${nasdaqStocks.length} pre-filtered Nasdaq stocks`);

    // Step 2: Filter out excluded sectors by name
    console.log('[DailyScan] Step 2: Filtering by company name...');
    const nameFiltered = nasdaqStocks.filter(s => !isExcludedByName(s.name).excluded);
    console.log(`[DailyScan] After name filter: ${nameFiltered.length} stocks`);

    // Step 3: Fetch RS data for all stocks
    console.log('[DailyScan] Step 3: Fetching RS data...');
    const tickers = nameFiltered.map(s => s.ticker);
    const rsMap = new Map<string, number>();

    // Fetch RS in batches of 50
    const RS_BATCH_SIZE = 50;
    for (let i = 0; i < tickers.length; i += RS_BATCH_SIZE) {
      const batch = tickers.slice(i, i + RS_BATCH_SIZE);
      try {
        const rsResponse = await fetch(`${BASE_URL}/api/rs-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: batch }),
        });
        const rsData = await rsResponse.json();
        if (rsData.success && Array.isArray(rsData.data)) {
          for (const item of rsData.data) {
            rsMap.set(item.ticker, item.rs);
          }
        }
      } catch (e) {
        console.warn(`[DailyScan] RS batch error:`, e);
      }

      // Small delay between batches
      if (i + RS_BATCH_SIZE < tickers.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    console.log(`[DailyScan] Got RS data for ${rsMap.size} stocks`);

    // Step 4: Fetch universe data (price, volume, liquidity, ADR, etc.)
    console.log('[DailyScan] Step 4: Fetching universe data...');
    const universeMap = new Map<string, UniverseDataItem>();

    // Fetch in batches of 20 (API limit)
    const UNIVERSE_BATCH_SIZE = 20;
    for (let i = 0; i < tickers.length; i += UNIVERSE_BATCH_SIZE) {
      const batch = tickers.slice(i, i + UNIVERSE_BATCH_SIZE);
      try {
        const univResponse = await fetch(`${BASE_URL}/api/universe-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers: batch }),
        });
        const univData = await univResponse.json();
        if (univData.success && Array.isArray(univData.data)) {
          for (const item of univData.data) {
            universeMap.set(item.ticker, item);
          }
        }
      } catch (e) {
        console.warn(`[DailyScan] Universe batch error:`, e);
      }

      // Progress log
      if (i % 100 === 0) {
        console.log(`[DailyScan] Progress: ${i}/${tickers.length} tickers processed`);
      }

      // Rate limiting
      if (i + UNIVERSE_BATCH_SIZE < tickers.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
    console.log(`[DailyScan] Got universe data for ${universeMap.size} stocks`);

    // Step 5: Apply Liquid Leaders filters
    console.log('[DailyScan] Step 5: Applying Liquid Leaders filters...');

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

    const passed: FilteredStock[] = [];
    const failed: { ticker: string; reason: string }[] = [];

    for (const stock of nameFiltered) {
      const { ticker, name } = stock;
      const rs = rsMap.get(ticker);
      const univ = universeMap.get(ticker);

      // Skip if no data
      if (rs === undefined || !univ) {
        failed.push({ ticker, reason: 'Missing data' });
        continue;
      }

      // Filter: Liquidity >= $250M
      if (univ.liquidityM < 250) {
        failed.push({ ticker, reason: `Liquidity $${univ.liquidityM.toFixed(0)}M < $250M` });
        continue;
      }

      // Filter: Volume >= 1M shares
      if (univ.volumeM < 1) {
        failed.push({ ticker, reason: `Volume ${univ.volumeM.toFixed(2)}M < 1M shares` });
        continue;
      }

      // Filter: Market Cap >= $1B
      if (univ.marketCapB < 1) {
        failed.push({ ticker, reason: `Market cap $${univ.marketCapB.toFixed(1)}B < $1B` });
        continue;
      }

      // Filter: ADR between 2.5% and 10%
      if (univ.adrPct < 2.5) {
        failed.push({ ticker, reason: `ADR ${univ.adrPct.toFixed(2)}% < 2.5%` });
        continue;
      }
      if (univ.adrPct > 10) {
        failed.push({ ticker, reason: `ADR ${univ.adrPct.toFixed(2)}% > 10%` });
        continue;
      }

      // Filter: Price > $10
      if (univ.price < 10) {
        failed.push({ ticker, reason: `Price $${univ.price.toFixed(2)} < $10` });
        continue;
      }

      // Passed all filters!
      passed.push({
        ticker,
        name,
        rs,
        price: univ.price,
        liquidityM: univ.liquidityM,
        volumeM: univ.volumeM,
        marketCapB: univ.marketCapB,
        adrPct: univ.adrPct,
        is21EmaAdvancing: univ.is21EmaAdvancing,
        is10WmaAdvancing: univ.is10WmaAdvancing,
      });
    }

    // Sort by RS (highest first)
    passed.sort((a, b) => b.rs - a.rs);

    // Limit to top 40
    const liquidLeaders = passed.slice(0, 40);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DailyScan] Complete in ${elapsed}s`);
    console.log(`[DailyScan] Scanned: ${nameFiltered.length}, Passed: ${passed.length}, Top 40: ${liquidLeaders.length}`);

    // Build failure summary
    const failureReasons: Record<string, number> = {};
    for (const f of failed) {
      const reason = f.reason.split(' ')[0]; // Get first word
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      elapsed: `${elapsed}s`,
      stats: {
        nasdaqTotal: nasdaqData.total,
        preFiltered: nasdaqStocks.length,
        afterNameFilter: nameFiltered.length,
        withRsData: rsMap.size,
        withUniverseData: universeMap.size,
        passedFilters: passed.length,
        liquidLeaders: liquidLeaders.length,
      },
      failureReasons,
      liquidLeaders,
      // Include all passed for reference
      allPassed: passed,
    });
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
 * Returns cached results or triggers a new scan
 */
export async function GET() {
  // For now, just return info about the endpoint
  return NextResponse.json({
    success: true,
    message: 'Use POST to trigger a full daily scan',
    description: 'Scans all Nasdaq stocks (~1000) to find Liquid Leaders (30-40 stocks)',
    estimatedTime: '2-3 minutes',
  });
}
