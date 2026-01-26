/**
 * Test strict pullback scan using PREVIOUS day's close
 * Run with: npx tsx src/tasks/__tests__/strict-pullback-prev-day.ts
 */

const TARGET_TICKERS = ['CIFR', 'RKLB', 'HUT', 'JBL'];

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
  // Use bars up to (length - dayOffset) to simulate previous day
  const endIndex = bars.length - dayOffset;
  const barsToUse = bars.slice(0, endIndex);

  if (barsToUse.length < 55) {
    return { ticker, error: 'Insufficient data' };
  }

  const closes = barsToUse.map(b => b.close);

  // Calculate 21EMA
  const ema21Values = calculateEMA(closes, 21);
  const ema21 = ema21Values[ema21Values.length - 1];
  const ema21Prev = ema21Values[ema21Values.length - 2];

  // Calculate 50EMA
  const ema50Values = calculateEMA(closes, 50);
  const ema50 = ema50Values[ema50Values.length - 1];

  // 10WMA approximation (50-day SMA)
  const last50 = closes.slice(-50);
  const wma10 = last50.reduce((a, b) => a + b, 0) / 50;
  const prev50 = closes.slice(-51, -1);
  const wma10Prev = prev50.reduce((a, b) => a + b, 0) / 50;

  // ATR14
  const atr = calculateATR(barsToUse, 14);

  // Latest bar for this analysis
  const latest = barsToUse[barsToUse.length - 1];
  const close = latest.close;

  // Distance to EMAs
  const dist21 = atr > 0 ? (close - ema21) / atr : 0;
  const dist50 = atr > 0 ? (close - ema50) / atr : 0;

  // Close range %
  const dailyRange = latest.high - latest.low;
  const closeRange = dailyRange > 0 ? ((close - latest.low) / dailyRange) * 100 : 50;

  // Weekly return
  const weekAgoClose = barsToUse[barsToUse.length - 6]?.close || close;
  const weeklyReturn = ((close - weekAgoClose) / weekAgoClose) * 100;

  // Contraction
  const last5 = barsToUse.slice(-5);
  const range5 = Math.max(...last5.map(b => b.high)) - Math.min(...last5.map(b => b.low));
  const last20 = barsToUse.slice(-20);
  const range20 = Math.max(...last20.map(b => b.high)) - Math.min(...last20.map(b => b.low));
  const isContracting = range5 < range20 * 0.8;

  // Advancing EMAs
  const is21Advancing = ema21 > ema21Prev;
  const is10WMAAdvancing = wma10 > wma10Prev;

  const filters = {
    dist_21_atr: {
      value: dist21,
      range: `${STRICT_CRITERIA.min_dist_21_atr} to ${STRICT_CRITERIA.max_dist_21_atr}`,
      passed: dist21 >= STRICT_CRITERIA.min_dist_21_atr && dist21 <= STRICT_CRITERIA.max_dist_21_atr,
    },
    dist_50_atr: {
      value: dist50,
      range: `${STRICT_CRITERIA.min_dist_50_atr} to ${STRICT_CRITERIA.max_dist_50_atr}`,
      passed: dist50 >= STRICT_CRITERIA.min_dist_50_atr && dist50 <= STRICT_CRITERIA.max_dist_50_atr,
    },
    close_range: {
      value: closeRange,
      required: `> ${STRICT_CRITERIA.min_close_range_pct}%`,
      passed: closeRange > STRICT_CRITERIA.min_close_range_pct,
    },
    contraction: {
      value: isContracting,
      required: 'true',
      passed: isContracting === STRICT_CRITERIA.require_contraction,
    },
    weekly_return: {
      value: weeklyReturn,
      required: `< ${STRICT_CRITERIA.max_weekly_return_pct}%`,
      passed: weeklyReturn < STRICT_CRITERIA.max_weekly_return_pct,
    },
    advancing_21ema: {
      value: is21Advancing,
      required: STRICT_CRITERIA.require_advancing_21ema ? 'true' : 'not required',
      passed: !STRICT_CRITERIA.require_advancing_21ema || is21Advancing,
    },
    advancing_10wma: {
      value: is10WMAAdvancing,
      required: STRICT_CRITERIA.require_advancing_10wma ? 'true' : 'not required',
      passed: !STRICT_CRITERIA.require_advancing_10wma || is10WMAAdvancing,
    },
  };

  const allPassed = Object.values(filters).every(f => f.passed);
  const passedCount = Object.values(filters).filter(f => f.passed).length;

  return {
    ticker,
    date: latest.date,
    close,
    ema21: Math.round(ema21 * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    atr: Math.round(atr * 100) / 100,
    filters,
    allPassed,
    passedCount,
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('Strict Pullback Scan - PREVIOUS DAY vs TODAY');
  console.log('='.repeat(70));
  console.log('\nTarget tickers:', TARGET_TICKERS.join(', '));
  console.log('');

  for (const ticker of TARGET_TICKERS) {
    const bars = await fetchOHLC(ticker);
    if (!bars) {
      console.log(`${ticker}: ERROR - Could not fetch data`);
      continue;
    }

    // Analyze previous day (offset 1) and today (offset 0)
    const prevDay = analyzeAtIndex(ticker, bars, 1);
    const today = analyzeAtIndex(ticker, bars, 0);

    console.log('-'.repeat(70));
    console.log(`\n${ticker}:`);

    if ('error' in prevDay || 'error' in today) {
      console.log('  ERROR: Insufficient data');
      continue;
    }

    console.log(`\n  PREVIOUS DAY (${prevDay.date}):`);
    console.log(`  Close: $${prevDay.close.toFixed(2)} | 21EMA: $${prevDay.ema21} | Dist: ${prevDay.filters.dist_21_atr.value.toFixed(2)} ATR`);

    let prevResults = '';
    for (const [name, filter] of Object.entries(prevDay.filters)) {
      const status = filter.passed ? '✓' : '✗';
      prevResults += `${status}${name.slice(0, 3)} `;
    }
    console.log(`  Filters: ${prevResults}`);
    console.log(`  >>> ${prevDay.allPassed ? 'ALL PASSED' : `${prevDay.passedCount}/7 passed`} <<<`);

    console.log(`\n  TODAY (${today.date}):`);
    console.log(`  Close: $${today.close.toFixed(2)} | 21EMA: $${today.ema21} | Dist: ${today.filters.dist_21_atr.value.toFixed(2)} ATR`);

    let todayResults = '';
    for (const [name, filter] of Object.entries(today.filters)) {
      const status = filter.passed ? '✓' : '✗';
      todayResults += `${status}${name.slice(0, 3)} `;
    }
    console.log(`  Filters: ${todayResults}`);
    console.log(`  >>> ${today.allPassed ? 'ALL PASSED' : `${today.passedCount}/7 passed`} <<<`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Legend: dis=dist_21, dis=dist_50, clo=close_range, con=contraction,');
  console.log('        wee=weekly_return, adv=advancing_21ema, adv=advancing_10wma');
  console.log('='.repeat(70));
}

main().catch(console.error);
