/**
 * Run strict pullback scan on full universe
 * Run with: npx tsx src/tasks/__tests__/strict-scan-full.ts
 */

// Combine: External scan tickers + popular liquid leaders
const UNIVERSE = [
  // From external scan
  'SNDK', 'SATS', 'MU', 'BE', 'WDC', 'APLD', 'PL', 'ASML', 'STX', 'IREN',
  'W', 'TER', 'AMD', 'FTAI', 'LRCX', 'WULF', 'IBKR', 'AMAT', 'ASTS', 'CIFR',
  'KLAC', 'LITE', 'RKLB', 'EOSE', 'CVNA', 'HUT', 'APH', 'CAT', 'LHX', 'KTOS',
  'COMP', 'COHR', 'GLW', 'MTSI', 'VRT', 'ADI', 'CLS', 'CIEN', 'LMT', 'MCHP',
  'NOC', 'ENTG', 'ON', 'HWM', 'JBL', 'GS', 'GEV', 'MDB', 'NBIS',
  // Additional popular tech/growth
  'NVDA', 'TSLA', 'META', 'GOOGL', 'AMZN', 'MSFT', 'AAPL', 'AVGO', 'TSM', 'NFLX',
  'CRM', 'ORCL', 'ADBE', 'NOW', 'SNOW', 'PANW', 'CRWD', 'ZS', 'DDOG', 'NET',
  'PLTR', 'COIN', 'MSTR', 'HOOD', 'SOFI', 'UPST', 'AFRM', 'SQ', 'PYPL', 'V',
  'MA', 'AXP', 'JPM', 'BAC', 'WFC', 'C', 'MS', 'SCHW', 'BLK', 'ICE',
  'COST', 'WMT', 'TGT', 'HD', 'LOW', 'TJX', 'ROST', 'BURL', 'ULTA', 'LULU',
  'NKE', 'SBUX', 'MCD', 'CMG', 'DPZ', 'YUM', 'QSR', 'WING', 'SHAK', 'CAVA',
];

const STRICT_CRITERIA = {
  min_dist_21_atr: 0,
  max_dist_21_atr: 1.1,
  min_dist_50_atr: -0.5,
  max_dist_50_atr: 4.0,
  min_close_range_pct: 10,
  require_contraction: true,
  max_weekly_return_pct: 15,
  require_advancing_21ema: true,
  require_advancing_10wma: false,
};

interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchOHLC(ticker: string): Promise<OHLCBar[] | null> {
  try {
    const response = await fetch(`http://localhost:3000/api/market-data?ticker=${ticker}&days=60`);
    if (!response.ok) return null;
    const json = await response.json();
    return json.data;
  } catch {
    return null;
  }
}

function calculateEMA(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const emaValues: number[] = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emaValues.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    emaValues.push(ema);
  }
  return emaValues;
}

function calculateATR(bars: OHLCBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;
  const trValues: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i-1].close),
      Math.abs(bars[i].low - bars[i-1].close)
    );
    trValues.push(tr);
  }
  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }
  return atr;
}

function analyzeAtIndex(ticker: string, bars: OHLCBar[], dayOffset: number = 0) {
  const endIndex = bars.length - dayOffset;
  const barsToUse = bars.slice(0, endIndex);

  if (barsToUse.length < 55) return null;

  const closes = barsToUse.map(b => b.close);
  const ema21Values = calculateEMA(closes, 21);
  const ema21 = ema21Values[ema21Values.length - 1];
  const ema21Prev = ema21Values[ema21Values.length - 2];
  const ema50Values = calculateEMA(closes, 50);
  const ema50 = ema50Values[ema50Values.length - 1];
  const atr = calculateATR(barsToUse, 14);
  const latest = barsToUse[barsToUse.length - 1];
  const close = latest.close;

  const dist21 = atr > 0 ? (close - ema21) / atr : 0;
  const dist50 = atr > 0 ? (close - ema50) / atr : 0;
  const dailyRange = latest.high - latest.low;
  const closeRange = dailyRange > 0 ? ((close - latest.low) / dailyRange) * 100 : 50;
  const weekAgoClose = barsToUse[barsToUse.length - 6]?.close || close;
  const weeklyReturn = ((close - weekAgoClose) / weekAgoClose) * 100;

  const last5 = barsToUse.slice(-5);
  const range5 = Math.max(...last5.map(b => b.high)) - Math.min(...last5.map(b => b.low));
  const last20 = barsToUse.slice(-20);
  const range20 = Math.max(...last20.map(b => b.high)) - Math.min(...last20.map(b => b.low));
  const isContracting = range5 < range20 * 0.8;
  const is21Advancing = ema21 > ema21Prev;

  // Check all filters
  const passed = {
    dist21: dist21 >= STRICT_CRITERIA.min_dist_21_atr && dist21 <= STRICT_CRITERIA.max_dist_21_atr,
    dist50: dist50 >= STRICT_CRITERIA.min_dist_50_atr && dist50 <= STRICT_CRITERIA.max_dist_50_atr,
    closeRange: closeRange > STRICT_CRITERIA.min_close_range_pct,
    contraction: !STRICT_CRITERIA.require_contraction || isContracting,
    weeklyReturn: weeklyReturn < STRICT_CRITERIA.max_weekly_return_pct,
    advancing21: !STRICT_CRITERIA.require_advancing_21ema || is21Advancing,
  };

  const allPassed = Object.values(passed).every(p => p);

  return {
    ticker,
    date: latest.date,
    close,
    dist21: Math.round(dist21 * 100) / 100,
    dist50: Math.round(dist50 * 100) / 100,
    closeRange: Math.round(closeRange),
    weeklyReturn: Math.round(weeklyReturn * 100) / 100,
    isContracting,
    is21Advancing,
    passed,
    allPassed,
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('Strict Pullback Scan - Full Universe');
  console.log('='.repeat(70));
  console.log(`\nScanning ${UNIVERSE.length} tickers with strict criteria...`);
  console.log('Using PREVIOUS DAY data (offset 1)\n');

  const passed: any[] = [];
  const failed: any[] = [];
  let fetched = 0;

  for (const ticker of UNIVERSE) {
    const bars = await fetchOHLC(ticker);
    if (!bars) continue;
    fetched++;

    const result = analyzeAtIndex(ticker, bars, 1); // Previous day
    if (!result) continue;

    if (result.allPassed) {
      passed.push(result);
    } else {
      failed.push(result);
    }
    process.stdout.write(result.allPassed ? '✓' : '.');
  }

  console.log('\n');

  // Sort passed by dist21 (tightest first)
  passed.sort((a, b) => a.dist21 - b.dist21);

  console.log('='.repeat(70));
  console.log(`PASSED STRICT CRITERIA: ${passed.length} tickers`);
  console.log('='.repeat(70));
  console.log('');
  console.log('Ticker | Close    | Dist21 | Dist50 | CloseRng | WkRtn  | Contr | 21Adv');
  console.log('-'.repeat(70));

  for (const r of passed) {
    console.log(
      `${r.ticker.padEnd(6)} | $${r.close.toFixed(2).padStart(7)} | ${r.dist21.toFixed(2).padStart(6)} | ${r.dist50.toFixed(2).padStart(6)} | ${(r.closeRange + '%').padStart(8)} | ${(r.weeklyReturn >= 0 ? '+' : '') + r.weeklyReturn.toFixed(1) + '%'} | ${r.isContracting ? 'Yes' : 'No '}   | ${r.is21Advancing ? 'Yes' : 'No'}`
    );
  }

  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Tickers scanned: ${fetched}`);
  console.log(`Passed strict criteria: ${passed.length}`);
  console.log(`Pass rate: ${((passed.length / fetched) * 100).toFixed(1)}%`);
  console.log(`\nTickers: ${passed.map(p => p.ticker).join(', ')}`);
}

main().catch(console.error);
