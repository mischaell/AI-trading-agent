/**
 * Comprehensive Filter Criteria Tests
 *
 * Tests filter logic WITHOUT requiring full scans.
 * Uses mock data to validate filter behavior.
 *
 * Run with: npx tsx src/tasks/__tests__/filter-criteria.test.ts
 */

// =============================================================================
// MOCK DATA - Representative sample of expected tickers with real-ish values
// =============================================================================

interface MockStock {
  ticker: string;
  name: string;
  exchange: 'NASDAQ' | 'NYSE';
  price: number;
  liquidityM: number;
  volumeM: number;
  marketCapB: number;
  adrPct: number;
  rs: number;
  // Sector info
  isChina: boolean;
  sector: string;
}

const MOCK_STOCKS: MockStock[] = [
  // Crypto miners (high ADR) - should PASS aggressive, FAIL default
  { ticker: 'WULF', name: 'TeraWulf Inc', exchange: 'NASDAQ', price: 13.72, liquidityM: 286, volumeM: 20.8, marketCapB: 5.7, adrPct: 6.87, rs: 92, isChina: false, sector: 'Crypto Mining' },
  { ticker: 'APLD', name: 'Applied Digital Corporation', exchange: 'NASDAQ', price: 36.00, liquidityM: 1350, volumeM: 37.5, marketCapB: 10.1, adrPct: 9.39, rs: 95, isChina: false, sector: 'Crypto Mining' },
  { ticker: 'IREN', name: 'Iris Energy Limited', exchange: 'NASDAQ', price: 52.03, liquidityM: 1901, volumeM: 36.5, marketCapB: 17.1, adrPct: 8.94, rs: 94, isChina: false, sector: 'Crypto Mining' },
  { ticker: 'HUT', name: 'Hut 8 Corp', exchange: 'NASDAQ', price: 56.07, liquidityM: 268, volumeM: 4.78, marketCapB: 6.1, adrPct: 8.05, rs: 91, isChina: false, sector: 'Crypto Mining' },
  { ticker: 'CIFR', name: 'Cipher Mining Inc', exchange: 'NASDAQ', price: 16.37, liquidityM: 426, volumeM: 26.0, marketCapB: 6.5, adrPct: 9.15, rs: 90, isChina: false, sector: 'Crypto Mining' },

  // Defense (NYSE) - should PASS aggressive, need NYSE scan
  { ticker: 'NOC', name: 'Northrop Grumman Corporation', exchange: 'NYSE', price: 663.10, liquidityM: 646, volumeM: 0.97, marketCapB: 94.9, adrPct: 2.90, rs: 78, isChina: false, sector: 'Aerospace & Defense' },
  { ticker: 'LMT', name: 'Lockheed Martin Corporation', exchange: 'NYSE', price: 445.00, liquidityM: 800, volumeM: 1.8, marketCapB: 106.0, adrPct: 2.50, rs: 75, isChina: false, sector: 'Aerospace & Defense' },
  { ticker: 'LHX', name: 'L3Harris Technologies', exchange: 'NYSE', price: 353.86, liquidityM: 555, volumeM: 1.57, marketCapB: 66.2, adrPct: 2.51, rs: 72, isChina: false, sector: 'Aerospace & Defense' },

  // Financials (should PASS aggressive, excluded by default)
  { ticker: 'GS', name: 'Goldman Sachs Group Inc', exchange: 'NYSE', price: 650.00, liquidityM: 1200, volumeM: 1.85, marketCapB: 195.0, adrPct: 2.30, rs: 85, isChina: false, sector: 'Financial Services' },
  { ticker: 'IBKR', name: 'Interactive Brokers Group', exchange: 'NASDAQ', price: 75.81, liquidityM: 355, volumeM: 4.69, marketCapB: 128.9, adrPct: 2.85, rs: 82, isChina: false, sector: 'Financial Services' },

  // Industrial (NYSE)
  { ticker: 'CAT', name: 'Caterpillar Inc', exchange: 'NYSE', price: 380.00, liquidityM: 1500, volumeM: 3.95, marketCapB: 185.0, adrPct: 2.80, rs: 80, isChina: false, sector: 'Machinery' },
  { ticker: 'VRT', name: 'Vertiv Holdings', exchange: 'NYSE', price: 181.38, liquidityM: 817, volumeM: 4.51, marketCapB: 69.3, adrPct: 4.10, rs: 88, isChina: false, sector: 'Industrial Equipment' },

  // Semis (should PASS all filters)
  { ticker: 'AMD', name: 'Advanced Micro Devices', exchange: 'NASDAQ', price: 251.23, liquidityM: 8465, volumeM: 33.7, marketCapB: 409.0, adrPct: 3.63, rs: 89, isChina: false, sector: 'Semiconductors' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', price: 186.44, liquidityM: 25000, volumeM: 134.0, marketCapB: 4580.0, adrPct: 4.20, rs: 97, isChina: false, sector: 'Semiconductors' },
  { ticker: 'MU', name: 'Micron Technology', exchange: 'NASDAQ', price: 390.73, liquidityM: 12580, volumeM: 32.2, marketCapB: 439.8, adrPct: 4.62, rs: 93, isChina: false, sector: 'Semiconductors' },
  { ticker: 'KLAC', name: 'KLA Corporation', exchange: 'NASDAQ', price: 1545.87, liquidityM: 1498, volumeM: 0.97, marketCapB: 203.6, adrPct: 3.13, rs: 91, isChina: false, sector: 'Semiconductors' },
  { ticker: 'AMAT', name: 'Applied Materials', exchange: 'NASDAQ', price: 319.88, liquidityM: 2021, volumeM: 6.32, marketCapB: 254.8, adrPct: 2.91, rs: 90, isChina: false, sector: 'Semiconductors' },
  { ticker: 'LRCX', name: 'Lam Research', exchange: 'NASDAQ', price: 680.00, liquidityM: 1800, volumeM: 2.65, marketCapB: 87.0, adrPct: 3.50, rs: 89, isChina: false, sector: 'Semiconductors' },

  // Software (should PASS all)
  { ticker: 'MDB', name: 'MongoDB Inc', exchange: 'NASDAQ', price: 410.89, liquidityM: 800, volumeM: 1.95, marketCapB: 30.0, adrPct: 4.80, rs: 97, isChina: false, sector: 'Software' },
  { ticker: 'CRWD', name: 'CrowdStrike Holdings', exchange: 'NASDAQ', price: 469.08, liquidityM: 1500, volumeM: 3.20, marketCapB: 115.0, adrPct: 3.90, rs: 98, isChina: false, sector: 'Software' },

  // Space/Tech
  { ticker: 'RKLB', name: 'Rocket Lab USA', exchange: 'NASDAQ', price: 80.38, liquidityM: 2154, volumeM: 26.8, marketCapB: 42.9, adrPct: 8.12, rs: 96, isChina: false, sector: 'Aerospace' },
  { ticker: 'ASTS', name: 'AST SpaceMobile', exchange: 'NASDAQ', price: 45.00, liquidityM: 600, volumeM: 13.3, marketCapB: 15.0, adrPct: 7.50, rs: 94, isChina: false, sector: 'Telecom' },

  // Should FAIL - China ADR
  { ticker: 'BABA', name: 'Alibaba Group Holding - ADR', exchange: 'NYSE', price: 85.00, liquidityM: 5000, volumeM: 58.8, marketCapB: 200.0, adrPct: 3.50, rs: 70, isChina: true, sector: 'E-Commerce' },
  { ticker: 'PDD', name: 'PDD Holdings Inc - ADR', exchange: 'NASDAQ', price: 145.00, liquidityM: 3000, volumeM: 20.7, marketCapB: 200.0, adrPct: 4.20, rs: 75, isChina: true, sector: 'E-Commerce' },

  // Should FAIL - Too low liquidity
  { ticker: 'TINY', name: 'Tiny Corp', exchange: 'NASDAQ', price: 25.00, liquidityM: 50, volumeM: 2.0, marketCapB: 1.0, adrPct: 5.00, rs: 80, isChina: false, sector: 'Tech' },

  // Should FAIL - Too high ADR (even for aggressive)
  { ticker: 'WILD', name: 'Wild Stock Inc', exchange: 'NASDAQ', price: 15.00, liquidityM: 300, volumeM: 20.0, marketCapB: 2.0, adrPct: 25.00, rs: 85, isChina: false, sector: 'Crypto' },

  // Should FAIL - Too low price
  { ticker: 'PNNY', name: 'Penny Stock Inc', exchange: 'NASDAQ', price: 3.50, liquidityM: 150, volumeM: 42.9, marketCapB: 0.8, adrPct: 6.00, rs: 88, isChina: false, sector: 'Tech' },

  // Should FAIL - Too low ADR (boring)
  { ticker: 'BORE', name: 'Boring Utility Corp', exchange: 'NYSE', price: 100.00, liquidityM: 500, volumeM: 5.0, marketCapB: 50.0, adrPct: 1.50, rs: 60, isChina: false, sector: 'Utilities' },
];

// =============================================================================
// FILTER CRITERIA DEFINITIONS
// =============================================================================

interface FilterCriteria {
  minLiquidityM: number;
  minVolumeM: number;
  minMarketCapB: number;
  minAdrPct: number;
  maxAdrPct: number;
  minPrice: number;
  excludeChina: boolean;
  excludeSectors: boolean;
}

const DEFAULT_CRITERIA: FilterCriteria = {
  minLiquidityM: 250,
  minVolumeM: 1.0,
  minMarketCapB: 1.0,
  minAdrPct: 2.5,
  maxAdrPct: 10.0,
  minPrice: 10,
  excludeChina: true,
  excludeSectors: true,
};

const AGGRESSIVE_CRITERIA: FilterCriteria = {
  minLiquidityM: 100,
  minVolumeM: 0.5,
  minMarketCapB: 0.5,
  minAdrPct: 2.0,
  maxAdrPct: 20.0,
  minPrice: 5,
  excludeChina: true,
  excludeSectors: false, // No sector exclusions
};

const EXCLUDED_SECTOR_KEYWORDS = [
  'biotech', 'pharmaceutical', 'pharma', 'drug',
  'oil', 'gas', 'petroleum', 'energy',
  'utility', 'utilities',
  'reit', 'real estate',
  'bank', 'banking', 'insurance', 'financial services',
  'mining', 'metals', 'steel', 'gold', 'silver',
  'tobacco', 'alcohol',
  'hospital', 'healthcare', 'medical', 'diagnostic',
];

// =============================================================================
// FILTER FUNCTIONS
// =============================================================================

function passesFilters(stock: MockStock, criteria: FilterCriteria): { passed: boolean; failReason?: string } {
  // China ADR check
  if (criteria.excludeChina && stock.isChina) {
    return { passed: false, failReason: 'China ADR' };
  }

  // Sector exclusion check
  if (criteria.excludeSectors) {
    const sectorLower = stock.sector.toLowerCase();
    for (const keyword of EXCLUDED_SECTOR_KEYWORDS) {
      if (sectorLower.includes(keyword)) {
        return { passed: false, failReason: `Excluded sector: ${keyword}` };
      }
    }
  }

  // Numeric filters
  if (stock.liquidityM < criteria.minLiquidityM) {
    return { passed: false, failReason: `Liquidity $${stock.liquidityM}M < $${criteria.minLiquidityM}M` };
  }
  if (stock.volumeM < criteria.minVolumeM) {
    return { passed: false, failReason: `Volume ${stock.volumeM}M < ${criteria.minVolumeM}M` };
  }
  if (stock.marketCapB < criteria.minMarketCapB) {
    return { passed: false, failReason: `Market cap $${stock.marketCapB}B < $${criteria.minMarketCapB}B` };
  }
  if (stock.adrPct < criteria.minAdrPct) {
    return { passed: false, failReason: `ADR ${stock.adrPct}% < ${criteria.minAdrPct}%` };
  }
  if (stock.adrPct > criteria.maxAdrPct) {
    return { passed: false, failReason: `ADR ${stock.adrPct}% > ${criteria.maxAdrPct}%` };
  }
  if (stock.price < criteria.minPrice) {
    return { passed: false, failReason: `Price $${stock.price} < $${criteria.minPrice}` };
  }

  return { passed: true };
}

// =============================================================================
// TESTS
// =============================================================================

function runTests() {
  console.log('='.repeat(70));
  console.log('FILTER CRITERIA UNIT TESTS');
  console.log('='.repeat(70));
  console.log('');

  let passed = 0;
  let failed = 0;

  function test(name: string, condition: boolean) {
    if (condition) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}`);
      failed++;
    }
  }

  // ----- DEFAULT CRITERIA TESTS -----
  console.log('\n📋 DEFAULT CRITERIA TESTS\n');

  test('AMD passes default criteria',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'AMD')!, DEFAULT_CRITERIA).passed);

  test('NVDA passes default criteria',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'NVDA')!, DEFAULT_CRITERIA).passed);

  test('MDB passes default criteria',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'MDB')!, DEFAULT_CRITERIA).passed);

  test('BABA fails default criteria (China ADR)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'BABA')!, DEFAULT_CRITERIA).passed);

  test('GS fails default criteria (financial services)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'GS')!, DEFAULT_CRITERIA).passed);

  test('IBKR fails default criteria (financial services)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'IBKR')!, DEFAULT_CRITERIA).passed);

  test('TINY fails default criteria (low liquidity)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'TINY')!, DEFAULT_CRITERIA).passed);

  test('PNNY fails default criteria (low price)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'PNNY')!, DEFAULT_CRITERIA).passed);

  // ----- AGGRESSIVE CRITERIA TESTS -----
  console.log('\n📋 AGGRESSIVE CRITERIA TESTS\n');

  test('WULF passes aggressive criteria (crypto miner)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'WULF')!, AGGRESSIVE_CRITERIA).passed);

  test('APLD passes aggressive criteria (crypto miner)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'APLD')!, AGGRESSIVE_CRITERIA).passed);

  test('IREN passes aggressive criteria (crypto miner)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'IREN')!, AGGRESSIVE_CRITERIA).passed);

  test('HUT passes aggressive criteria (crypto miner)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'HUT')!, AGGRESSIVE_CRITERIA).passed);

  test('NOC passes aggressive criteria (defense - no sector exclusion)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'NOC')!, AGGRESSIVE_CRITERIA).passed);

  test('LMT passes aggressive criteria (defense)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'LMT')!, AGGRESSIVE_CRITERIA).passed);

  test('GS passes aggressive criteria (financial - no sector exclusion)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'GS')!, AGGRESSIVE_CRITERIA).passed);

  test('IBKR passes aggressive criteria (financial)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'IBKR')!, AGGRESSIVE_CRITERIA).passed);

  test('CAT passes aggressive criteria (industrial)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'CAT')!, AGGRESSIVE_CRITERIA).passed);

  test('VRT passes aggressive criteria (industrial)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'VRT')!, AGGRESSIVE_CRITERIA).passed);

  test('RKLB passes aggressive criteria (high ADR ok)',
    passesFilters(MOCK_STOCKS.find(s => s.ticker === 'RKLB')!, AGGRESSIVE_CRITERIA).passed);

  test('BABA fails aggressive criteria (China ADR still excluded)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'BABA')!, AGGRESSIVE_CRITERIA).passed);

  test('WILD fails aggressive criteria (ADR > 20%)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'WILD')!, AGGRESSIVE_CRITERIA).passed);

  test('TINY fails aggressive criteria (liquidity < $100M)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'TINY')!, AGGRESSIVE_CRITERIA).passed);

  test('BORE fails aggressive criteria (ADR < 2%)',
    !passesFilters(MOCK_STOCKS.find(s => s.ticker === 'BORE')!, AGGRESSIVE_CRITERIA).passed);

  // ----- EXCHANGE COVERAGE TESTS -----
  console.log('\n📋 EXCHANGE COVERAGE TESTS\n');

  const nasdaqStocks = MOCK_STOCKS.filter(s => s.exchange === 'NASDAQ');
  const nyseStocks = MOCK_STOCKS.filter(s => s.exchange === 'NYSE');

  test(`NASDAQ stocks in mock data: ${nasdaqStocks.length}`, nasdaqStocks.length > 0);
  test(`NYSE stocks in mock data: ${nyseStocks.length}`, nyseStocks.length > 0);

  const nasdaqPassing = nasdaqStocks.filter(s => passesFilters(s, AGGRESSIVE_CRITERIA).passed);
  const nysePassing = nyseStocks.filter(s => passesFilters(s, AGGRESSIVE_CRITERIA).passed);

  test(`NASDAQ stocks passing aggressive: ${nasdaqPassing.length}/${nasdaqStocks.length}`,
    nasdaqPassing.length >= 15);
  test(`NYSE stocks passing aggressive: ${nysePassing.length}/${nyseStocks.length}`,
    nysePassing.length >= 5);

  // Expected tickers that are NYSE (should pass filters but need NYSE scan)
  const expectedNYSE = ['NOC', 'LMT', 'LHX', 'GS', 'CAT', 'VRT'];
  const nysePassingTickers = nysePassing.map(s => s.ticker);

  for (const ticker of expectedNYSE) {
    const stock = MOCK_STOCKS.find(s => s.ticker === ticker);
    if (stock) {
      test(`${ticker} (NYSE) passes aggressive filters`,
        passesFilters(stock, AGGRESSIVE_CRITERIA).passed);
    }
  }

  // ----- SUMMARY -----
  console.log('\n' + '='.repeat(70));
  console.log(`RESULTS: ${passed}/${passed + failed} tests passed`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
  }

  // ----- FILTER SUMMARY -----
  console.log('\n' + '='.repeat(70));
  console.log('FILTER SUMMARY');
  console.log('='.repeat(70));

  const allPassingAggressive = MOCK_STOCKS.filter(s => passesFilters(s, AGGRESSIVE_CRITERIA).passed);
  const allPassingDefault = MOCK_STOCKS.filter(s => passesFilters(s, DEFAULT_CRITERIA).passed);

  console.log(`\nDefault criteria: ${allPassingDefault.length}/${MOCK_STOCKS.length} pass`);
  console.log(`Aggressive criteria: ${allPassingAggressive.length}/${MOCK_STOCKS.length} pass`);

  console.log('\nAggressive-only (not in default):');
  const aggressiveOnly = allPassingAggressive.filter(
    s => !allPassingDefault.includes(s)
  );
  for (const s of aggressiveOnly) {
    console.log(`  ${s.ticker} (${s.exchange}) - ${s.sector}`);
  }
}

runTests();
