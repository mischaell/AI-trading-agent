/**
 * All Tickers API Route (NASDAQ + NYSE)
 *
 * Fetches the complete list of US stocks from both NASDAQ and NYSE exchanges.
 * Pre-filters to reduce the list to ~2000 tradeable stocks.
 */

import { NextResponse } from 'next/server';

interface StockData {
  symbol: string;
  name: string;
  lastsale: string;
  netchange: string;
  pctchange: string;
  marketCap: string;
}

interface NasdaqApiResponse {
  data: {
    table: {
      rows: StockData[];
    };
    totalrecords: number;
  };
}

interface PreFilteredStock {
  ticker: string;
  name: string;
  exchange: 'NASDAQ' | 'NYSE';
  marketCap: number;
  lastSale: number;
}

/**
 * Fetch stocks from a single exchange
 */
async function fetchExchange(exchange: 'NASDAQ' | 'NYSE'): Promise<PreFilteredStock[]> {
  try {
    console.log(`[AllTickers] Fetching ${exchange} stocks...`);

    const response = await fetch(
      `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=5000&exchange=${exchange}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        next: { revalidate: 86400 }, // Cache for 24 hours
      }
    );

    if (!response.ok) {
      console.error(`[AllTickers] ${exchange} API returned ${response.status}`);
      return [];
    }

    const data: NasdaqApiResponse = await response.json();

    if (!data?.data?.table?.rows) {
      console.error(`[AllTickers] Invalid response format for ${exchange}`);
      return [];
    }

    const stocks = data.data.table.rows;
    console.log(`[AllTickers] ${exchange}: ${stocks.length} total stocks`);

    // Parse and pre-filter
    const filtered = stocks
      .filter(s => s.marketCap && s.marketCap !== 'N/A' && s.marketCap !== '')
      .map(s => ({
        ticker: s.symbol,
        name: s.name,
        exchange,
        marketCap: parseMarketCap(s.marketCap),
        lastSale: parsePrice(s.lastsale),
      }))
      .filter(s => s.marketCap >= 500_000_000 && s.lastSale >= 5);

    console.log(`[AllTickers] ${exchange}: ${filtered.length} after pre-filter`);
    return filtered;
  } catch (error) {
    console.error(`[AllTickers] Error fetching ${exchange}:`, error);
    return [];
  }
}

/**
 * GET /api/all-tickers
 * Returns combined list of NASDAQ + NYSE stocks, pre-filtered
 */
export async function GET() {
  try {
    console.log('[AllTickers] Fetching NASDAQ + NYSE stocks...');
    const startTime = Date.now();

    // Fetch both exchanges in parallel
    const [nasdaqStocks, nyseStocks] = await Promise.all([
      fetchExchange('NASDAQ'),
      fetchExchange('NYSE'),
    ]);

    // Combine and dedupe (some stocks may be listed on both)
    const seen = new Set<string>();
    const combined: PreFilteredStock[] = [];

    for (const stock of [...nasdaqStocks, ...nyseStocks]) {
      if (!seen.has(stock.ticker)) {
        seen.add(stock.ticker);
        combined.push(stock);
      }
    }

    // Sort by market cap descending
    combined.sort((a, b) => b.marketCap - a.marketCap);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[AllTickers] Complete in ${elapsed}s: NASDAQ=${nasdaqStocks.length}, NYSE=${nyseStocks.length}, Combined=${combined.length}`);

    return NextResponse.json({
      success: true,
      nasdaq: nasdaqStocks.length,
      nyse: nyseStocks.length,
      total: combined.length,
      tickers: combined.map(s => s.ticker),
      stocks: combined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AllTickers] Error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Parse market cap string like "4,560,381,000,000" to number
 */
function parseMarketCap(marketCap: string): number {
  if (!marketCap || marketCap === 'N/A') return 0;
  const cleaned = marketCap.replace(/,/g, '');
  return parseInt(cleaned, 10) || 0;
}

/**
 * Parse price string like "$187.67" to number
 */
function parsePrice(price: string): number {
  if (!price) return 0;
  const cleaned = price.replace(/[$,]/g, '');
  return parseFloat(cleaned) || 0;
}
