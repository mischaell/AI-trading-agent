/**
 * Nasdaq Tickers API Route
 *
 * Fetches the complete list of Nasdaq-listed stocks from the Nasdaq API.
 * This should be called once per day to refresh the universe.
 */

import { NextResponse } from 'next/server';

interface NasdaqStock {
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
      rows: NasdaqStock[];
    };
    totalrecords: number;
  };
}

/**
 * GET /api/nasdaq-tickers
 * Returns the full list of Nasdaq-listed stock tickers
 */
export async function GET() {
  try {
    console.log('[NasdaqTickers] Fetching full Nasdaq stock list...');

    const response = await fetch(
      'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=5000&exchange=NASDAQ',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        next: { revalidate: 86400 }, // Cache for 24 hours
      }
    );

    if (!response.ok) {
      throw new Error(`Nasdaq API returned ${response.status}`);
    }

    const data: NasdaqApiResponse = await response.json();

    if (!data?.data?.table?.rows) {
      throw new Error('Invalid response format from Nasdaq API');
    }

    const stocks = data.data.table.rows;
    const tickers = stocks.map(s => s.symbol);

    // Parse market cap for pre-filtering (remove stocks with no market cap)
    const stocksWithData = stocks
      .filter(s => s.marketCap && s.marketCap !== 'N/A' && s.marketCap !== '')
      .map(s => ({
        ticker: s.symbol,
        name: s.name,
        marketCap: parseMarketCap(s.marketCap),
        lastSale: parsePrice(s.lastsale),
      }));

    // Pre-filter: only stocks with market cap > $500M and price > $5
    // This reduces the list from 4000+ to a more manageable size
    const preFiltered = stocksWithData.filter(
      s => s.marketCap >= 500_000_000 && s.lastSale >= 5
    );

    console.log(`[NasdaqTickers] Total: ${stocks.length}, With data: ${stocksWithData.length}, Pre-filtered: ${preFiltered.length}`);

    return NextResponse.json({
      success: true,
      total: stocks.length,
      filtered: preFiltered.length,
      tickers: preFiltered.map(s => s.ticker),
      stocks: preFiltered,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[NasdaqTickers] Error:', error);
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
  // Remove commas and parse
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
