/**
 * Test Script for Task 2 (Universe Scan) with Real Yahoo Finance Data
 *
 * This script tests the universe scan pipeline with real data including
 * real RS (Relative Strength) calculation based on 12-month price history.
 *
 * Run with: npx tsx src/lib/market-data/__tests__/test-task2.ts
 *
 * Prerequisites:
 * - Dev server must be running (npm run dev)
 * - Script fetches data via API routes
 */

// Node 18+ has native fetch

// =============================================================================
// Types
// =============================================================================

interface UniverseTickerData {
  ticker: string;
  price: number;
  avgVolume: number;
  adrPct: number;
  liquidityM: number;
  high21: number;
  low21: number;
  close: number;
}

interface RSData {
  ticker: string;
  rs: number;
  perf3m: number;
  perf6m: number;
  perf9m: number;
  perf12m: number;
  weightedPerf: number;
}

interface TickerData {
  ticker: string;
  rs: number;
  adr_pct: number;
  liquidity_m: number;
  price: number;
  dist_21ema_atr: number;
  earnings_days: number;
  theme: string;
  is_china_adr?: boolean;
  is_defensive?: boolean;
  perf3m?: number;
  perf6m?: number;
}

interface UniverseLeader {
  rank: number;
  ticker: string;
  rs: number;
  adr_pct: number;
  liquidity_m: number;
  price: number;
  dist_21ema_atr: number;
  earnings_days: number;
  theme: string;
}

interface UniverseScanOutput {
  task: string;
  refresh: string;
  count: number;
  tickers: string[];
  leaders: UniverseLeader[];
}

// =============================================================================
// Nasdaq-100 Tickers
// =============================================================================

const NASDAQ_100_TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'AVGO', 'COST',
  'ADBE', 'AMD', 'NFLX', 'CSCO', 'INTC', 'QCOM', 'INTU', 'TXN', 'AMAT', 'MU',
  'LRCX', 'KLAC', 'SNPS', 'CDNS', 'MRVL', 'NXPI', 'ON', 'ADI', 'MCHP', 'ASML',
  'CRM', 'ADSK', 'PANW', 'CRWD', 'DDOG', 'ZS', 'FTNT', 'WDAY', 'TEAM', 'MDB',
  'ANSS', 'CSGP', 'CTSH', 'CDW',
  'BKNG', 'ABNB', 'DASH', 'MELI', 'PYPL', 'TTD', 'TTWO', 'EA',
  'AMGN', 'GILD', 'REGN', 'VRTX', 'ISRG', 'IDXX', 'DXCM', 'ILMN', 'BIIB', 'MRNA',
  'GEHC', 'AZN',
  'TMUS', 'CMCSA', 'CHTR', 'WBD',
  'PEP', 'KDP', 'MNST', 'KHC', 'MDLZ', 'SBUX', 'LULU', 'ROST', 'ORLY', 'CPRT',
  'DLTR', 'FAST', 'ODFL', 'PCAR', 'CSX',
  'HON', 'CTAS', 'PAYX', 'VRSK', 'ROP', 'MAR', 'ADP',
  'AEP', 'XEL', 'EXC', 'CEG', 'FANG', 'BKR',
  'CCEP', 'GFS', 'ARM', 'SMCI', 'LIN',
  'PDD', 'JD', 'BIDU',
];

const CHINA_ADRS = new Set(['PDD', 'JD', 'BIDU', 'NTES', 'BABA']);

const DEFENSIVE_THEMES = [
  'Utilities', 'Consumer Staples', 'Healthcare', 'Real Estate',
  'REITs', 'Tobacco', 'Food & Beverage',
];

const TICKER_THEMES: Record<string, string> = {
  'AAPL': 'Consumer Electronics', 'MSFT': 'Enterprise Software', 'NVDA': 'Semiconductors',
  'GOOGL': 'Internet', 'GOOG': 'Internet', 'AMZN': 'E-Commerce', 'META': 'Social Media',
  'TSLA': 'Electric Vehicles', 'AVGO': 'Semiconductors', 'COST': 'Consumer Staples',
  'AMD': 'Semiconductors', 'INTC': 'Semiconductors', 'QCOM': 'Semiconductors',
  'TXN': 'Semiconductors', 'AMAT': 'Semicon Equipment', 'MU': 'Memory',
  'LRCX': 'Semicon Equipment', 'KLAC': 'Semicon Equipment', 'MRVL': 'Semiconductors',
  'NXPI': 'Semiconductors', 'ON': 'Semiconductors', 'ADI': 'Analog Semis',
  'MCHP': 'Semiconductors', 'ASML': 'Semicon Equipment', 'ARM': 'Semiconductors',
  'SMCI': 'AI Infrastructure', 'GFS': 'Semicon Foundry',
  'ADBE': 'Enterprise Software', 'NFLX': 'Streaming', 'CSCO': 'Networking',
  'INTU': 'FinTech', 'SNPS': 'EDA Software', 'CDNS': 'EDA Software',
  'CRM': 'Enterprise Software', 'ADSK': 'Design Software', 'WDAY': 'Enterprise Software',
  'ANSS': 'Simulation Software', 'CSGP': 'Real Estate Tech', 'CTSH': 'IT Services',
  'CDW': 'IT Distribution',
  'PANW': 'Cybersecurity', 'CRWD': 'Cybersecurity', 'ZS': 'Cybersecurity', 'FTNT': 'Cybersecurity',
  'DDOG': 'Observability', 'TEAM': 'DevOps', 'MDB': 'Database',
  'BKNG': 'Online Travel', 'ABNB': 'Online Travel', 'DASH': 'Food Delivery',
  'MELI': 'E-Commerce LatAm', 'PYPL': 'FinTech', 'TTD': 'AdTech',
  'TTWO': 'Gaming', 'EA': 'Gaming',
  'AMGN': 'Biotech', 'GILD': 'Biotech', 'REGN': 'Biotech', 'VRTX': 'Biotech',
  'ISRG': 'Med Devices', 'IDXX': 'Diagnostics', 'DXCM': 'Med Devices',
  'ILMN': 'Genomics', 'BIIB': 'Biotech', 'MRNA': 'Biotech', 'GEHC': 'Healthcare',
  'AZN': 'Pharma',
  'TMUS': 'Telecom', 'CMCSA': 'Cable', 'CHTR': 'Cable', 'WBD': 'Media',
  'PEP': 'Consumer Staples', 'KDP': 'Consumer Staples', 'MNST': 'Beverages',
  'KHC': 'Consumer Staples', 'MDLZ': 'Consumer Staples', 'SBUX': 'Restaurants',
  'LULU': 'Apparel', 'ROST': 'Retail', 'ORLY': 'Auto Parts', 'CPRT': 'Autos',
  'DLTR': 'Retail', 'FAST': 'Industrial Distribution', 'ODFL': 'Trucking',
  'PCAR': 'Trucking', 'CSX': 'Railroads',
  'HON': 'Industrial Conglomerate', 'CTAS': 'Business Services', 'PAYX': 'HR Services',
  'VRSK': 'Data Analytics', 'ROP': 'Industrial Tech', 'MAR': 'Hotels', 'ADP': 'HR Services',
  'AEP': 'Utilities', 'XEL': 'Utilities', 'EXC': 'Utilities', 'CEG': 'Clean Energy',
  'FANG': 'Oil & Gas', 'BKR': 'Oil Services',
  'CCEP': 'Beverages', 'LIN': 'Industrial Gas',
  'PDD': 'China E-Commerce', 'JD': 'China E-Commerce', 'BIDU': 'China Internet',
};

// =============================================================================
// API Client
// =============================================================================

const BASE_URL = 'http://localhost:3000';

async function fetchTickerDataFromAPI(ticker: string): Promise<UniverseTickerData | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/universe-data?ticker=${ticker}`);
    const data = await response.json() as { success: boolean; data?: UniverseTickerData; error?: string };
    if (!data.success || !data.data) return null;
    return data.data;
  } catch (error) {
    console.error(`Failed to fetch ${ticker}:`, error);
    return null;
  }
}

async function fetchRSDataFromAPI(tickers: string[]): Promise<Map<string, RSData>> {
  const results = new Map<string, RSData>();
  try {
    const response = await fetch(`${BASE_URL}/api/rs-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers }),
    });
    const data = await response.json() as { success: boolean; data?: RSData[]; error?: string };
    if (data.success && Array.isArray(data.data)) {
      for (const rs of data.data) {
        results.set(rs.ticker, rs);
      }
    }
  } catch (error) {
    console.error('Failed to fetch RS data:', error);
  }
  return results;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllTickerData(
  tickers: string[],
  batchSize = 5,
  delayMs = 1000
): Promise<UniverseTickerData[]> {
  const results: UniverseTickerData[] = [];

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const batchPromises = batch.map(t => fetchTickerDataFromAPI(t));
    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result) results.push(result);
    }

    const progress = Math.min(i + batchSize, tickers.length);
    process.stdout.write(`\rFetching universe data: ${progress}/${tickers.length}`);

    if (i + batchSize < tickers.length) {
      await delay(delayMs);
    }
  }
  console.log(); // New line

  return results;
}

// =============================================================================
// Filter Logic
// =============================================================================

interface FilterCriteria {
  min_rs: number;
  min_liquidity_m: number;
  min_adr_pct: number;
  max_adr_pct: number;
  min_price: number;
  exclude_china: boolean;
  exclude_defensives: boolean;
}

const DEFAULT_CRITERIA: FilterCriteria = {
  min_rs: 70,
  min_liquidity_m: 50,
  min_adr_pct: 1.5,
  max_adr_pct: 15,
  min_price: 10,
  exclude_china: true,
  exclude_defensives: true,
};

function isDefensiveTheme(theme: string): boolean {
  const lowerTheme = theme.toLowerCase();
  return DEFENSIVE_THEMES.some(d => lowerTheme.includes(d.toLowerCase()));
}

function applyFilters(
  data: UniverseTickerData,
  criteria: FilterCriteria,
  rs: number
): { passed: boolean; reason?: string } {
  const { ticker, price, liquidityM, adrPct } = data;
  const theme = TICKER_THEMES[ticker] || 'Unknown';

  if (criteria.exclude_china && CHINA_ADRS.has(ticker)) {
    return { passed: false, reason: 'China ADR' };
  }
  if (criteria.exclude_defensives && isDefensiveTheme(theme)) {
    return { passed: false, reason: `Defensive (${theme})` };
  }
  if (rs < criteria.min_rs) {
    return { passed: false, reason: `RS ${rs} < ${criteria.min_rs}` };
  }
  if (liquidityM < criteria.min_liquidity_m) {
    return { passed: false, reason: `Liquidity ${liquidityM.toFixed(1)}M < ${criteria.min_liquidity_m}M` };
  }
  if (price < criteria.min_price) {
    return { passed: false, reason: `Price $${price.toFixed(2)} < $${criteria.min_price}` };
  }
  if (adrPct < criteria.min_adr_pct) {
    return { passed: false, reason: `ADR ${adrPct.toFixed(2)}% < ${criteria.min_adr_pct}%` };
  }
  if (adrPct > criteria.max_adr_pct) {
    return { passed: false, reason: `ADR ${adrPct.toFixed(2)}% > ${criteria.max_adr_pct}%` };
  }

  return { passed: true };
}

// =============================================================================
// Main Test
// =============================================================================

async function runTest() {
  console.log('='.repeat(70));
  console.log('Task 2 Universe Scan Test - Real Yahoo Finance Data + Real RS');
  console.log('='.repeat(70));
  console.log();

  // -------------------------------------------------------------------------
  // Step 1: Fetch RS Data (12-month price history based)
  // -------------------------------------------------------------------------
  console.log(`Step 1: Calculating RS for ${NASDAQ_100_TICKERS.length} tickers...`);
  console.log('(This fetches 12 months of price history for each ticker)');
  console.log();

  const rsStartTime = Date.now();
  const rsData = await fetchRSDataFromAPI(NASDAQ_100_TICKERS);
  const rsTime = ((Date.now() - rsStartTime) / 1000).toFixed(1);

  console.log(`RS calculation complete in ${rsTime}s`);
  console.log(`Tickers with RS data: ${rsData.size}/${NASDAQ_100_TICKERS.length}`);
  console.log();

  // Show top 10 by RS
  const sortedByRS = [...rsData.values()].sort((a, b) => b.rs - a.rs);
  console.log('Top 10 by Relative Strength:');
  console.log('-'.repeat(70));
  console.log('Ticker'.padEnd(8) + 'RS'.padEnd(5) + '3M%'.padEnd(10) + '6M%'.padEnd(10) + '12M%'.padEnd(10) + 'Weighted');
  console.log('-'.repeat(70));
  for (const rs of sortedByRS.slice(0, 10)) {
    console.log(
      rs.ticker.padEnd(8) +
      String(rs.rs).padEnd(5) +
      (rs.perf3m >= 0 ? '+' : '') + rs.perf3m.toFixed(1).padEnd(9) +
      (rs.perf6m >= 0 ? '+' : '') + rs.perf6m.toFixed(1).padEnd(9) +
      (rs.perf12m >= 0 ? '+' : '') + rs.perf12m.toFixed(1).padEnd(9) +
      (rs.weightedPerf >= 0 ? '+' : '') + rs.weightedPerf.toFixed(1)
    );
  }
  console.log();

  // -------------------------------------------------------------------------
  // Step 2: Fetch Universe Data (price, volume, ADR)
  // -------------------------------------------------------------------------
  console.log(`Step 2: Fetching universe data for ${NASDAQ_100_TICKERS.length} tickers...`);
  console.log('(Rate limited to 5 requests/second)');
  console.log();

  const universeStartTime = Date.now();
  const tickerData = await fetchAllTickerData(NASDAQ_100_TICKERS);
  const universeTime = ((Date.now() - universeStartTime) / 1000).toFixed(1);

  console.log(`Universe fetch complete in ${universeTime}s`);
  console.log(`Total tickers fetched: ${tickerData.length}/${NASDAQ_100_TICKERS.length}`);
  console.log();

  // -------------------------------------------------------------------------
  // Step 3: Apply Filters
  // -------------------------------------------------------------------------
  console.log('Step 3: Applying filters...');
  console.log('-'.repeat(40));

  const filterStats = {
    total: tickerData.length,
    no_rs: 0,
    china: 0,
    defensive: 0,
    rs: 0,
    liquidity: 0,
    price: 0,
    adr: 0,
    passed: 0,
  };

  const passedTickers: TickerData[] = [];

  for (const data of tickerData) {
    const rsInfo = rsData.get(data.ticker);
    if (!rsInfo) {
      filterStats.no_rs++;
      continue;
    }

    const rs = rsInfo.rs;
    const result = applyFilters(data, DEFAULT_CRITERIA, rs);

    if (!result.passed) {
      if (result.reason?.includes('China')) filterStats.china++;
      else if (result.reason?.includes('Defensive')) filterStats.defensive++;
      else if (result.reason?.includes('RS')) filterStats.rs++;
      else if (result.reason?.includes('Liquidity')) filterStats.liquidity++;
      else if (result.reason?.includes('Price')) filterStats.price++;
      else if (result.reason?.includes('ADR')) filterStats.adr++;
    } else {
      filterStats.passed++;
      passedTickers.push({
        ticker: data.ticker,
        rs,
        adr_pct: data.adrPct,
        liquidity_m: data.liquidityM,
        price: data.price,
        dist_21ema_atr: 0,
        earnings_days: 30,
        theme: TICKER_THEMES[data.ticker] || 'Unknown',
        perf3m: rsInfo.perf3m,
        perf6m: rsInfo.perf6m,
      });
    }
  }

  console.log(`Filter Results:`);
  console.log(`  Total scanned:        ${filterStats.total}`);
  console.log(`  No RS data:           ${filterStats.no_rs}`);
  console.log(`  Excluded - China ADR: ${filterStats.china}`);
  console.log(`  Excluded - Defensive: ${filterStats.defensive}`);
  console.log(`  Excluded - RS < 70:   ${filterStats.rs}`);
  console.log(`  Excluded - Liquidity: ${filterStats.liquidity}`);
  console.log(`  Excluded - Price:     ${filterStats.price}`);
  console.log(`  Excluded - ADR:       ${filterStats.adr}`);
  console.log(`  --------------------------------`);
  console.log(`  Passed all filters:   ${filterStats.passed}`);
  console.log();

  // -------------------------------------------------------------------------
  // Step 4: Sort by RS and take top 40
  // -------------------------------------------------------------------------
  const sortedLeaders = passedTickers
    .sort((a, b) => b.rs - a.rs)
    .slice(0, 40);

  // -------------------------------------------------------------------------
  // Step 5: Build output
  // -------------------------------------------------------------------------
  const output: UniverseScanOutput = {
    task: 'universe_scan',
    refresh: 'EOD',
    count: sortedLeaders.length,
    tickers: sortedLeaders.map(t => t.ticker),
    leaders: sortedLeaders.map((t, i) => ({
      rank: i + 1,
      ticker: t.ticker,
      rs: t.rs,
      adr_pct: t.adr_pct,
      liquidity_m: t.liquidity_m,
      price: t.price,
      dist_21ema_atr: t.dist_21ema_atr,
      earnings_days: t.earnings_days,
      theme: t.theme,
    })),
  };

  // -------------------------------------------------------------------------
  // Step 6: Print results
  // -------------------------------------------------------------------------
  console.log('='.repeat(70));
  console.log('LIQUID LEADERS OUTPUT');
  console.log('='.repeat(70));
  console.log();
  console.log(`Final count: ${output.count} (target: 30-40)`);
  console.log();

  console.log('Top 15 Leaders (sorted by RS):');
  console.log('-'.repeat(90));
  console.log(
    'Rank'.padEnd(6) +
    'Ticker'.padEnd(8) +
    'RS'.padEnd(5) +
    'ADR%'.padEnd(8) +
    'Liq($M)'.padEnd(10) +
    'Price'.padEnd(10) +
    '3M%'.padEnd(10) +
    'Theme'
  );
  console.log('-'.repeat(90));

  for (const leader of output.leaders.slice(0, 15)) {
    const perf3m = passedTickers.find(t => t.ticker === leader.ticker)?.perf3m ?? 0;
    console.log(
      String(leader.rank).padEnd(6) +
      leader.ticker.padEnd(8) +
      String(leader.rs).padEnd(5) +
      leader.adr_pct.toFixed(2).padEnd(8) +
      leader.liquidity_m.toFixed(1).padEnd(10) +
      ('$' + leader.price.toFixed(2)).padEnd(10) +
      ((perf3m >= 0 ? '+' : '') + perf3m.toFixed(1) + '%').padEnd(10) +
      leader.theme
    );
  }

  console.log();
  console.log('Full ticker list:');
  console.log(output.tickers.join(', '));
  console.log();

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  console.log('='.repeat(70));
  console.log('VALIDATION');
  console.log('='.repeat(70));

  const validations = [
    { name: 'Count >= 25 (reasonable minimum)', pass: output.count >= 25 },
    { name: 'Count <= 40 (maximum)', pass: output.count <= 40 },
    { name: 'Has leaders array', pass: output.leaders.length > 0 },
    { name: 'Leaders have required fields', pass: output.leaders.every(l =>
      l.ticker && typeof l.rs === 'number' && typeof l.price === 'number'
    )},
    { name: 'Sorted by RS descending', pass: output.leaders.every((l, i, arr) =>
      i === 0 || arr[i - 1].rs >= l.rs
    )},
    { name: 'No China ADRs', pass: !output.tickers.some(t => CHINA_ADRS.has(t)) },
    { name: 'All RS >= 70', pass: output.leaders.every(l => l.rs >= 70) },
  ];

  for (const v of validations) {
    console.log(`${v.pass ? '✓' : '✗'} ${v.name}`);
  }

  const allPassed = validations.every(v => v.pass);
  console.log();
  console.log(allPassed ? '✓ ALL VALIDATIONS PASSED' : '✗ SOME VALIDATIONS FAILED');
  console.log();

  // Summary timing
  const totalTime = parseFloat(rsTime) + parseFloat(universeTime);
  console.log(`Total execution time: ${totalTime.toFixed(1)}s`);

  return output;
}

// Run the test
runTest().catch(console.error);
