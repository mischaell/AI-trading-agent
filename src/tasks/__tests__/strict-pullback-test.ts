/**
 * Test strict "Liquid Leaders 21DMA Pullback" scan criteria
 * Run with: npx tsx src/tasks/__tests__/strict-pullback-test.ts
 *
 * Criteria:
 * - Daily closing range > 10%
 * - Price contraction (last 5 days)
 * - Weekly return < 15%
 * - 0 to 1 x ATR from the 21EMA
 * - -0.5 to 4 x ATR from the 50SMA
 * - Advancing 21EMA & 10WMA
 * - Earnings in 7+ days
 */

// Target stocks from the scan
const TARGET_TICKERS = ['CIFR', 'RKLB', 'HUT', 'JBL'];

// Strict criteria
const STRICT_CRITERIA = {
  min_dist_21_atr: 0,
  max_dist_21_atr: 1.0,
  min_dist_50_atr: -0.5,
  max_dist_50_atr: 4.0,
  min_close_range_pct: 10,
  require_contraction: true,
  max_weekly_return_pct: 15,
  min_earnings_days: 7,
  require_advancing_21ema: true,
  require_advancing_10wma: true,
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

  // First EMA = SMA
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

  // SMA for first ATR
  let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // Smoothed ATR
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }

  return atr;
}

function analyzeStrict(ticker: string, bars: OHLCBar[]) {
  if (bars.length < 55) {
    return { ticker, error: 'Insufficient data' };
  }

  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  // Calculate 21EMA of closes
  const ema21Values = calculateEMA(closes, 21);
  const ema21 = ema21Values[ema21Values.length - 1];
  const ema21Prev = ema21Values[ema21Values.length - 2];

  // Calculate 50EMA of closes
  const ema50Values = calculateEMA(closes, 50);
  const ema50 = ema50Values[ema50Values.length - 1];

  // Calculate 10WMA (10-week = 50-day SMA approximation)
  const last50 = closes.slice(-50);
  const wma10 = last50.reduce((a, b) => a + b, 0) / 50;
  const prev50 = closes.slice(-51, -1);
  const wma10Prev = prev50.reduce((a, b) => a + b, 0) / 50;

  // ATR14
  const atr = calculateATR(bars, 14);

  // Latest bar
  const latest = bars[bars.length - 1];
  const close = latest.close;

  // Distance to EMAs in ATR
  const dist21 = atr > 0 ? (close - ema21) / atr : 0;
  const dist50 = atr > 0 ? (close - ema50) / atr : 0;

  // Close range % (position in daily range)
  const dailyRange = latest.high - latest.low;
  const closeRange = dailyRange > 0 ? ((close - latest.low) / dailyRange) * 100 : 50;

  // Weekly return (5 trading days)
  const weekAgoClose = bars[bars.length - 6]?.close || close;
  const weeklyReturn = ((close - weekAgoClose) / weekAgoClose) * 100;

  // Contraction: 5-day range < 20-day range * 0.8
  const last5 = bars.slice(-5);
  const range5 = Math.max(...last5.map(b => b.high)) - Math.min(...last5.map(b => b.low));
  const last20 = bars.slice(-20);
  const range20 = Math.max(...last20.map(b => b.high)) - Math.min(...last20.map(b => b.low));
  const isContracting = range5 < range20 * 0.8;

  // Advancing 21EMA
  const is21Advancing = ema21 > ema21Prev;

  // Advancing 10WMA
  const is10WMAAdvancing = wma10 > wma10Prev;

  // Check each filter
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
      required: 'true',
      passed: is21Advancing === STRICT_CRITERIA.require_advancing_21ema,
    },
    advancing_10wma: {
      value: is10WMAAdvancing,
      required: 'true',
      passed: is10WMAAdvancing === STRICT_CRITERIA.require_advancing_10wma,
    },
  };

  const allPassed = Object.values(filters).every(f => f.passed);

  return {
    ticker,
    close,
    ema21: Math.round(ema21 * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    atr: Math.round(atr * 100) / 100,
    filters,
    allPassed,
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('Strict "Liquid Leaders 21DMA Pullback" Scan Test');
  console.log('='.repeat(70));
  console.log('\nCriteria:');
  console.log('  - 0 to 1 x ATR from 21EMA');
  console.log('  - -0.5 to 4 x ATR from 50SMA');
  console.log('  - Daily closing range > 10%');
  console.log('  - Price contraction (5d < 80% of 20d)');
  console.log('  - Weekly return < 15%');
  console.log('  - Advancing 21EMA');
  console.log('  - Advancing 10WMA');
  console.log('  - Earnings 7+ days (not tested - needs earnings API)');
  console.log('\nTarget tickers:', TARGET_TICKERS.join(', '));
  console.log('');

  for (const ticker of TARGET_TICKERS) {
    console.log('-'.repeat(70));
    console.log(`\n${ticker}:`);

    const bars = await fetchOHLC(ticker);
    if (!bars) {
      console.log('  ERROR: Could not fetch data');
      continue;
    }

    const result = analyzeStrict(ticker, bars);

    if ('error' in result) {
      console.log(`  ERROR: ${result.error}`);
      continue;
    }

    console.log(`  Close: $${result.close.toFixed(2)} | 21EMA: $${result.ema21} | 50EMA: $${result.ema50} | ATR: $${result.atr}`);
    console.log('');
    console.log('  Filter Results:');

    for (const [name, filter] of Object.entries(result.filters)) {
      const status = filter.passed ? '✓ PASS' : '✗ FAIL';
      const value = typeof filter.value === 'boolean'
        ? (filter.value ? 'Yes' : 'No')
        : filter.value.toFixed(2);
      console.log(`    ${status} | ${name.padEnd(16)} | Value: ${value.toString().padStart(8)} | Required: ${filter.range || filter.required}`);
    }

    console.log('');
    console.log(`  >>> ${result.allPassed ? 'ALL FILTERS PASSED' : 'SOME FILTERS FAILED'} <<<`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
}

main().catch(console.error);
