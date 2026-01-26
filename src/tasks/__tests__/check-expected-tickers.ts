/**
 * Quick test to check why expected tickers aren't in Liquid Leaders
 * Run with: npx tsx src/tasks/__tests__/check-expected-tickers.ts
 */

const EXPECTED_TICKERS = [
  'WULF', 'APLD', 'IREN', 'HUT', 'CLS', 'PL', 'AMD', 'AMAT', 'RKLB', 'CIFR',
  'KLAC', 'VRT', 'MU', 'IBKR', 'COMP', 'NOC', 'TER', 'STX', 'LHX', 'W',
  'ASML', 'CIEN', 'FTAI', 'BE', 'LMT', 'GEV', 'JBL', 'ADI', 'APH', 'MCHP',
  'CVNA', 'GLW', 'SATS', 'LRCX', 'HWM', 'MDB', 'ON', 'MTSI', 'ASTS', 'NBIS',
  'WDC', 'COHR', 'KTOS', 'ENTG', 'CAT', 'GS', 'LITE', 'SNDK', 'EOSE'
];

interface TickerData {
  ticker: string;
  price: number;
  liquidityM: number;
  volumeM: number;
  marketCapB: number;
  adrPct: number;
  rs?: number;
}

async function fetchTickerData(ticker: string): Promise<TickerData | null> {
  try {
    const response = await fetch(`http://localhost:3000/api/universe-data?ticker=${ticker}`);
    if (!response.ok) return null;
    const json = await response.json();
    if (!json.success || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('Checking Expected Tickers');
  console.log('='.repeat(70));
  console.log(`\nChecking ${EXPECTED_TICKERS.length} expected tickers...\n`);

  const results: { ticker: string; data: TickerData | null; passesFilters: boolean; failReason?: string }[] = [];

  // Aggressive filter criteria
  const FILTERS = {
    minLiquidityM: 100,
    minVolumeM: 0.5,
    minMarketCapB: 0.5,
    minAdrPct: 2.0,
    maxAdrPct: 20,
    minPrice: 5,
  };

  for (const ticker of EXPECTED_TICKERS) {
    const data = await fetchTickerData(ticker);

    let passesFilters = true;
    let failReason: string | undefined;

    if (!data) {
      passesFilters = false;
      failReason = 'NO DATA';
    } else {
      if (data.liquidityM < FILTERS.minLiquidityM) {
        passesFilters = false;
        failReason = `Liquidity $${data.liquidityM.toFixed(0)}M < $${FILTERS.minLiquidityM}M`;
      } else if (data.volumeM < FILTERS.minVolumeM) {
        passesFilters = false;
        failReason = `Volume ${data.volumeM.toFixed(2)}M < ${FILTERS.minVolumeM}M`;
      } else if (data.marketCapB < FILTERS.minMarketCapB) {
        passesFilters = false;
        failReason = `Market cap $${data.marketCapB.toFixed(1)}B < $${FILTERS.minMarketCapB}B`;
      } else if (data.adrPct < FILTERS.minAdrPct) {
        passesFilters = false;
        failReason = `ADR ${data.adrPct.toFixed(2)}% < ${FILTERS.minAdrPct}%`;
      } else if (data.adrPct > FILTERS.maxAdrPct) {
        passesFilters = false;
        failReason = `ADR ${data.adrPct.toFixed(2)}% > ${FILTERS.maxAdrPct}%`;
      } else if (data.price < FILTERS.minPrice) {
        passesFilters = false;
        failReason = `Price $${data.price.toFixed(2)} < $${FILTERS.minPrice}`;
      }
    }

    results.push({ ticker, data, passesFilters, failReason });
    process.stdout.write(passesFilters ? '✓' : '✗');
  }

  console.log('\n');

  // Separate passed and failed
  const passed = results.filter(r => r.passesFilters);
  const failed = results.filter(r => !r.passesFilters);

  console.log('='.repeat(70));
  console.log(`PASSED: ${passed.length}/${EXPECTED_TICKERS.length}`);
  console.log('='.repeat(70));

  // Sort passed by RS (if available)
  passed.sort((a, b) => (b.data?.rs ?? 0) - (a.data?.rs ?? 0));

  console.log('\nTicker | Price    | Liq(M) | Vol(M) | MCap(B) | ADR%   | RS');
  console.log('-'.repeat(70));
  for (const r of passed.slice(0, 20)) {
    const d = r.data!;
    console.log(
      `${r.ticker.padEnd(6)} | $${d.price.toFixed(2).padStart(7)} | ${d.liquidityM.toFixed(0).padStart(6)} | ${d.volumeM.toFixed(2).padStart(6)} | ${d.marketCapB.toFixed(1).padStart(7)} | ${d.adrPct.toFixed(2).padStart(6)} | ${d.rs ?? '?'}`
    );
  }

  if (failed.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log(`FAILED: ${failed.length}/${EXPECTED_TICKERS.length}`);
    console.log('='.repeat(70));
    console.log('\nTicker | Reason');
    console.log('-'.repeat(70));
    for (const r of failed) {
      console.log(`${r.ticker.padEnd(6)} | ${r.failReason}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Expected tickers: ${EXPECTED_TICKERS.length}`);
  console.log(`Pass aggressive filters: ${passed.length}`);
  console.log(`Fail filters: ${failed.length}`);

  if (passed.length > 0) {
    console.log(`\nPassed tickers: ${passed.map(p => p.ticker).join(', ')}`);
  }
}

main().catch(console.error);
