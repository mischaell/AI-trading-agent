/**
 * Compare our pullback scan with external scan
 * Run with: npx tsx src/tasks/__tests__/compare-scans.ts
 */

// External scan tickers (IBD RS filtered, ranked by 1-day RS)
const EXTERNAL_SCAN = [
  'SNDK', 'SATS', 'MU', 'BE', 'WDC', 'APLD', 'PL', 'ASML', 'STX', 'IREN',
  'W', 'TER', 'AMD', 'FTAI', 'LRCX', 'WULF', 'IBKR', 'AMAT', 'ASTS', 'CIFR',
  'KLAC', 'LITE', 'RKLB', 'EOSE', 'CVNA', 'HUT', 'APH', 'CAT', 'LHX', 'KTOS',
  'COMP', 'COHR', 'GLW', 'MTSI', 'VRT', 'ADI', 'CLS', 'CIEN', 'LMT', 'MCHP',
  'NOC', 'ENTG', 'ON', 'HWM', 'JBL', 'GS', 'GEV', 'MDB', 'NBIS'
];

// Fetch ticker data from our API
async function fetchTickerData(ticker: string) {
  try {
    const response = await fetch(`http://localhost:3000/api/market-data?ticker=${ticker}&days=60`);
    if (!response.ok) return null;
    const json = await response.json();
    return json.data;
  } catch {
    return null;
  }
}

// Analyze a single ticker
function analyzeOHLC(ticker: string, bars: any[]) {
  if (!bars || bars.length < 25) return null;

  // Calculate 21EMA of closes
  const closes = bars.map((b: any) => b.close);
  const k = 2 / 22;
  let ema21 = closes.slice(0, 21).reduce((a: number, b: number) => a + b, 0) / 21;
  for (let i = 21; i < closes.length; i++) {
    ema21 = closes[i] * k + ema21 * (1 - k);
  }

  // Calculate ATR14
  let atr = 0;
  for (let i = 1; i < Math.min(15, bars.length); i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i-1].close),
      Math.abs(bars[i].low - bars[i-1].close)
    );
    atr += tr;
  }
  atr /= 14;

  const latestClose = bars[bars.length - 1].close;
  const prevClose = bars[bars.length - 2]?.close || latestClose;
  const distToEma = atr > 0 ? (latestClose - ema21) / atr : 0;
  const oneDayChange = prevClose > 0 ? ((latestClose - prevClose) / prevClose) * 100 : 0;

  return {
    ticker,
    close: latestClose,
    ema21: Math.round(ema21 * 100) / 100,
    atr: Math.round(atr * 100) / 100,
    dist_21ema_atr: Math.round(distToEma * 100) / 100,
    one_day_change_pct: Math.round(oneDayChange * 100) / 100,
  };
}

async function main() {
  console.log('='.repeat(60));
  console.log('Pullback Scan Comparison');
  console.log('='.repeat(60));
  console.log(`\nExternal scan has ${EXTERNAL_SCAN.length} tickers\n`);

  // Fetch data for all external scan tickers
  console.log('Fetching data for external scan tickers...');
  const results: any[] = [];

  for (const ticker of EXTERNAL_SCAN) {
    const bars = await fetchTickerData(ticker);
    if (bars) {
      const analysis = analyzeOHLC(ticker, bars);
      if (analysis) {
        results.push(analysis);
        process.stdout.write('.');
      } else {
        process.stdout.write('x');
      }
    } else {
      process.stdout.write('x');
    }
  }
  console.log('\n');

  console.log(`Successfully analyzed ${results.length}/${EXTERNAL_SCAN.length} tickers\n`);

  // Apply our aggressive pullback filters
  const AGGRESSIVE_CRITERIA = {
    min_dist_21_atr: -5.0,
    max_dist_21_atr: 6.0,
  };

  // Filter by distance to 21EMA
  const passedFilter = results.filter(r =>
    r.dist_21ema_atr >= AGGRESSIVE_CRITERIA.min_dist_21_atr &&
    r.dist_21ema_atr <= AGGRESSIVE_CRITERIA.max_dist_21_atr
  );

  // Sort by 1-day change (1-day RS)
  passedFilter.sort((a, b) => b.one_day_change_pct - a.one_day_change_pct);

  console.log('='.repeat(60));
  console.log('Results with Aggressive Filter');
  console.log('='.repeat(60));
  console.log(`\nPassed filter: ${passedFilter.length}/${results.length} tickers\n`);

  console.log('Top 20 by 1-day RS:');
  console.log('-'.repeat(60));
  console.log('Rank | Ticker | Close    | Dist 21EMA | 1-Day %');
  console.log('-'.repeat(60));

  passedFilter.slice(0, 20).forEach((r, i) => {
    console.log(
      `${String(i + 1).padStart(4)} | ${r.ticker.padEnd(6)} | $${r.close.toFixed(2).padStart(7)} | ${r.dist_21ema_atr.toFixed(2).padStart(10)} | ${r.one_day_change_pct >= 0 ? '+' : ''}${r.one_day_change_pct.toFixed(2)}%`
    );
  });

  // Calculate overlap
  const ourTickers = new Set(passedFilter.map(r => r.ticker));
  const externalSet = new Set(EXTERNAL_SCAN);

  const overlap = [...ourTickers].filter(t => externalSet.has(t));
  const overlapPct = (overlap.length / EXTERNAL_SCAN.length) * 100;

  console.log('\n' + '='.repeat(60));
  console.log('OVERLAP ANALYSIS');
  console.log('='.repeat(60));
  console.log(`\nExternal scan: ${EXTERNAL_SCAN.length} tickers`);
  console.log(`Our scan (passed filter): ${passedFilter.length} tickers`);
  console.log(`Overlap: ${overlap.length} tickers`);
  console.log(`\n>>> OVERLAP: ${overlapPct.toFixed(1)}% <<<\n`);

  // Show which tickers are missing
  const missing = EXTERNAL_SCAN.filter(t => !ourTickers.has(t));
  if (missing.length > 0) {
    console.log(`Missing tickers (${missing.length}): ${missing.join(', ')}`);
  }

  // Show failed tickers (couldn't fetch data)
  const analyzed = new Set(results.map(r => r.ticker));
  const failedFetch = EXTERNAL_SCAN.filter(t => !analyzed.has(t));
  if (failedFetch.length > 0) {
    console.log(`Failed to fetch (${failedFetch.length}): ${failedFetch.join(', ')}`);
  }

  // Show tickers that failed filter
  const failedFilter = results.filter(r =>
    r.dist_21ema_atr < AGGRESSIVE_CRITERIA.min_dist_21_atr ||
    r.dist_21ema_atr > AGGRESSIVE_CRITERIA.max_dist_21_atr
  );
  if (failedFilter.length > 0) {
    console.log(`\nFailed distance filter (${failedFilter.length}):`);
    failedFilter.forEach(r => {
      console.log(`  ${r.ticker}: dist=${r.dist_21ema_atr} ATR (outside -5 to +6)`);
    });
  }
}

main().catch(console.error);
