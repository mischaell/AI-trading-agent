/**
 * Universe Data Module
 *
 * Provides Nasdaq-100 ticker list and functions to fetch universe data
 * for Task 2 (Liquid Leaders Universe Scan).
 *
 * @see universe-scan.ts
 */

// =============================================================================
// Types
// =============================================================================

export interface UniverseTickerData {
  ticker: string;
  price: number;
  avgVolume: number;       // 21-day average volume
  adrPct: number;          // Average Daily Range %
  liquidityM: number;      // Daily dollar liquidity in millions
  high21: number;          // 21-day high
  low21: number;           // 21-day low
  close: number;           // Latest close
}

// =============================================================================
// Nasdaq-100 Ticker List
// =============================================================================

/**
 * Returns the Nasdaq-100 ticker list (as of Jan 2025)
 * This list is updated quarterly - last updated after Dec 2024 rebalance
 */
export function getNasdaq100Tickers(): string[] {
  return [
    // Mega-caps
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'AVGO', 'COST',
    // Large-caps Tech
    'ADBE', 'AMD', 'NFLX', 'CSCO', 'INTC', 'QCOM', 'INTU', 'TXN', 'AMAT', 'MU',
    'LRCX', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'NXPI', 'ON', 'ADI', 'MCHP', 'ASML',
    // Software & Cloud
    'CRM', 'ADSK', 'PANW', 'CRWD', 'DDOG', 'ZS', 'FTNT', 'WDAY', 'TEAM', 'MDB',
    'SNOW', 'SPLK', 'ANSS', 'CSGP', 'CTSH', 'CDW', 'PAYC',
    // Consumer Internet
    'BKNG', 'ABNB', 'DASH', 'MELI', 'PYPL', 'TTD', 'TTWO', 'EA',
    // Healthcare/Biotech
    'AMGN', 'GILD', 'REGN', 'VRTX', 'ISRG', 'IDXX', 'DXCM', 'ILMN', 'BIIB', 'MRNA',
    'GEHC', 'AZN',
    // Telecom/Media
    'TMUS', 'CMCSA', 'CHTR', 'WBD',
    // Consumer
    'PEP', 'KDP', 'MNST', 'KHC', 'MDLZ', 'SBUX', 'LULU', 'ROST', 'ORLY', 'CPRT',
    'DLTR', 'FAST', 'ODFL', 'PCAR', 'CSX',
    // Industrial/Conglomerate
    'HON', 'CTAS', 'PAYX', 'VRSK', 'ROP', 'MAR', 'ADP',
    // Energy/Utilities
    'AEP', 'XEL', 'EXC', 'CEG', 'FANG', 'BKR',
    // Financials/Other
    'CCEP', 'GFS', 'ARM', 'SMCI', 'LIN',
    // China ADRs (flagged for exclusion)
    'PDD', 'JD', 'BIDU',
  ];
}

/**
 * Known China ADRs in the Nasdaq-100
 * Used by Task 2 to exclude China exposure
 */
export const CHINA_ADRS = new Set(['PDD', 'JD', 'BIDU', 'NTES', 'BABA']);

/**
 * Theme/Sector classification for tickers
 */
export const TICKER_THEMES: Record<string, string> = {
  // Mega-caps
  'AAPL': 'Consumer Electronics', 'MSFT': 'Enterprise Software', 'NVDA': 'Semiconductors',
  'GOOGL': 'Internet', 'GOOG': 'Internet', 'AMZN': 'E-Commerce', 'META': 'Social Media',
  'TSLA': 'Electric Vehicles', 'AVGO': 'Semiconductors', 'COST': 'Consumer Staples',
  // Semiconductors
  'AMD': 'Semiconductors', 'INTC': 'Semiconductors', 'QCOM': 'Semiconductors',
  'TXN': 'Semiconductors', 'AMAT': 'Semicon Equipment', 'MU': 'Memory',
  'LRCX': 'Semicon Equipment', 'KLAC': 'Semicon Equipment', 'MRVL': 'Semiconductors',
  'NXPI': 'Semiconductors', 'ON': 'Semiconductors', 'ADI': 'Analog Semis',
  'MCHP': 'Semiconductors', 'ASML': 'Semicon Equipment', 'ARM': 'Semiconductors',
  'SMCI': 'AI Infrastructure', 'GFS': 'Semicon Foundry',
  // Software
  'ADBE': 'Enterprise Software', 'NFLX': 'Streaming', 'CSCO': 'Networking',
  'INTU': 'FinTech', 'SNPS': 'EDA Software', 'CDNS': 'EDA Software',
  'CRM': 'Enterprise Software', 'ADSK': 'Design Software', 'WDAY': 'Enterprise Software',
  'ANSS': 'Simulation Software', 'CSGP': 'Real Estate Tech', 'CTSH': 'IT Services',
  'CDW': 'IT Distribution', 'PAYC': 'HR Software',
  // Cybersecurity
  'PANW': 'Cybersecurity', 'CRWD': 'Cybersecurity', 'ZS': 'Cybersecurity', 'FTNT': 'Cybersecurity',
  // Cloud/Data
  'DDOG': 'Observability', 'TEAM': 'DevOps', 'MDB': 'Database', 'SNOW': 'Data Cloud', 'SPLK': 'Observability',
  // Consumer Internet
  'BKNG': 'Online Travel', 'ABNB': 'Online Travel', 'DASH': 'Food Delivery',
  'MELI': 'E-Commerce LatAm', 'PYPL': 'FinTech', 'TTD': 'AdTech',
  'TTWO': 'Gaming', 'EA': 'Gaming',
  // Healthcare
  'AMGN': 'Biotech', 'GILD': 'Biotech', 'REGN': 'Biotech', 'VRTX': 'Biotech',
  'ISRG': 'Med Devices', 'IDXX': 'Diagnostics', 'DXCM': 'Med Devices',
  'ILMN': 'Genomics', 'BIIB': 'Biotech', 'MRNA': 'Biotech', 'GEHC': 'Healthcare',
  'AZN': 'Pharma',
  // Telecom
  'TMUS': 'Telecom', 'CMCSA': 'Cable', 'CHTR': 'Cable', 'WBD': 'Media',
  // Consumer Staples
  'PEP': 'Consumer Staples', 'KDP': 'Consumer Staples', 'MNST': 'Beverages',
  'KHC': 'Consumer Staples', 'MDLZ': 'Consumer Staples', 'SBUX': 'Restaurants',
  // Retail
  'LULU': 'Apparel', 'ROST': 'Retail', 'ORLY': 'Auto Parts', 'CPRT': 'Autos',
  'DLTR': 'Retail', 'FAST': 'Industrial Distribution', 'ODFL': 'Trucking',
  'PCAR': 'Trucking', 'CSX': 'Railroads',
  // Industrial
  'HON': 'Industrial Conglomerate', 'CTAS': 'Business Services', 'PAYX': 'HR Services',
  'VRSK': 'Data Analytics', 'ROP': 'Industrial Tech', 'MAR': 'Hotels', 'ADP': 'HR Services',
  // Utilities/Energy
  'AEP': 'Utilities', 'XEL': 'Utilities', 'EXC': 'Utilities', 'CEG': 'Clean Energy',
  'FANG': 'Oil & Gas', 'BKR': 'Oil Services',
  // Other
  'CCEP': 'Beverages', 'LIN': 'Industrial Gas',
  // China ADRs
  'PDD': 'China E-Commerce', 'JD': 'China E-Commerce', 'BIDU': 'China Internet',
};

// =============================================================================
// API Functions
// =============================================================================

/**
 * Fetch ticker data for a single ticker via API route
 * Returns null if fetch fails (ticker will be skipped)
 */
export async function fetchTickerData(ticker: string): Promise<UniverseTickerData | null> {
  try {
    const response = await fetch(
      `/api/universe-data?ticker=${encodeURIComponent(ticker)}`
    );

    if (!response.ok) {
      console.warn(`[Universe] Failed to fetch ${ticker}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (!data.success) {
      console.warn(`[Universe] API error for ${ticker}: ${data.error}`);
      return null;
    }

    return data.data as UniverseTickerData;
  } catch (error) {
    console.error(`[Universe] Error fetching ${ticker}:`, error);
    return null;
  }
}

/**
 * Rate-limited delay helper
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch universe data for multiple tickers with rate limiting
 * Rate limit: 5 requests per second to avoid Yahoo Finance throttling
 *
 * @param tickers - Array of ticker symbols
 * @param onProgress - Optional callback for progress updates
 * @returns Array of successfully fetched ticker data
 */
export async function fetchUniverseData(
  tickers: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<UniverseTickerData[]> {
  const results: UniverseTickerData[] = [];
  const BATCH_SIZE = 5;
  const DELAY_MS = 1000; // 1 second between batches = 5 req/sec

  console.log(`[Universe] Fetching data for ${tickers.length} tickers...`);

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    // Fetch batch in parallel
    const batchPromises = batch.map(ticker => fetchTickerData(ticker));
    const batchResults = await Promise.all(batchPromises);

    // Collect successful results
    for (const result of batchResults) {
      if (result) {
        results.push(result);
      }
    }

    // Progress callback
    const completed = Math.min(i + BATCH_SIZE, tickers.length);
    if (onProgress) {
      onProgress(completed, tickers.length);
    }
    console.log(`[Universe] Progress: ${completed}/${tickers.length}`);

    // Rate limit delay (except for last batch)
    if (i + BATCH_SIZE < tickers.length) {
      await delay(DELAY_MS);
    }
  }

  console.log(`[Universe] Fetched ${results.length}/${tickers.length} tickers successfully`);
  return results;
}

/**
 * Batch fetch ticker data via single API call (more efficient)
 * Falls back to individual fetches if batch endpoint fails
 */
export async function fetchUniverseDataBatch(
  tickers: string[]
): Promise<UniverseTickerData[]> {
  try {
    const response = await fetch('/api/universe-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    });

    if (!response.ok) {
      console.warn('[Universe] Batch fetch failed, falling back to individual fetches');
      return fetchUniverseData(tickers);
    }

    const data = await response.json();
    if (!data.success) {
      console.warn('[Universe] Batch API error, falling back to individual fetches');
      return fetchUniverseData(tickers);
    }

    return data.data as UniverseTickerData[];
  } catch (error) {
    console.error('[Universe] Batch fetch error:', error);
    return fetchUniverseData(tickers);
  }
}
