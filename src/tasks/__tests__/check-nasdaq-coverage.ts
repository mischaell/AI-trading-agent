/**
 * Check which expected tickers are NOT on NASDAQ
 * Run with: npx tsx src/tasks/__tests__/check-nasdaq-coverage.ts
 */

const EXPECTED_TICKERS = [
  'WULF', 'APLD', 'IREN', 'HUT', 'CLS', 'PL', 'AMD', 'AMAT', 'RKLB', 'CIFR',
  'KLAC', 'VRT', 'MU', 'IBKR', 'COMP', 'NOC', 'TER', 'STX', 'LHX', 'W',
  'ASML', 'CIEN', 'FTAI', 'BE', 'LMT', 'GEV', 'JBL', 'ADI', 'APH', 'MCHP',
  'CVNA', 'GLW', 'SATS', 'LRCX', 'HWM', 'MDB', 'ON', 'MTSI', 'ASTS', 'NBIS',
  'WDC', 'COHR', 'KTOS', 'ENTG', 'CAT', 'GS', 'LITE', 'SNDK', 'EOSE'
];

async function main() {
  // Fetch NASDAQ tickers
  const response = await fetch('http://localhost:3000/api/nasdaq-tickers');
  const json = await response.json();
  const nasdaqTickers = new Set(json.tickers as string[]);

  console.log(`Total NASDAQ tickers: ${nasdaqTickers.size}`);
  console.log(`Expected tickers: ${EXPECTED_TICKERS.length}`);
  console.log('');

  const onNasdaq: string[] = [];
  const notOnNasdaq: string[] = [];

  for (const ticker of EXPECTED_TICKERS) {
    if (nasdaqTickers.has(ticker)) {
      onNasdaq.push(ticker);
    } else {
      notOnNasdaq.push(ticker);
    }
  }

  console.log('='.repeat(50));
  console.log(`ON NASDAQ: ${onNasdaq.length}`);
  console.log('='.repeat(50));
  console.log(onNasdaq.join(', '));

  console.log('');
  console.log('='.repeat(50));
  console.log(`NOT ON NASDAQ (NYSE?): ${notOnNasdaq.length}`);
  console.log('='.repeat(50));
  console.log(notOnNasdaq.join(', '));

  if (notOnNasdaq.length > 0) {
    console.log('\n>>> These tickers are likely NYSE stocks and won\'t appear in daily scan!');
  }
}

main().catch(console.error);
