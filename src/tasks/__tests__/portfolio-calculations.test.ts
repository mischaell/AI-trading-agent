/**
 * Portfolio Calculations Test
 *
 * Tests that added trades are correctly reflected in portfolio calculations:
 * - Entry price calculation (amount / shares)
 * - Position value calculation (shares * current price)
 * - Unrealized P&L calculation (current value - cost basis)
 * - Cash calculation (equity - total position value)
 * - Portfolio summary aggregates
 *
 * Run with: npx ts-node src/tasks/__tests__/portfolio-calculations.test.ts
 */

import { calculatePortfolio } from '../portfolio';
import type { RawPosition, AccountContext } from '../portfolio';

// =============================================================================
// Test Helpers
// =============================================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
  }
}

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  PASS: ${message} (got ${actual}, expected ${expected})`);
    passed++;
  } else {
    console.log(`  FAIL: ${message} (got ${actual}, expected ${expected}, diff ${diff})`);
    failed++;
  }
}

// =============================================================================
// Test Data
// =============================================================================

// Simulate a trade added via Add Trade modal
const mockAddedTrade = {
  ticker: 'NVDA',
  shares: 50,
  amount: 7000, // User enters this
  // Entry price = 7000 / 50 = $140.00
  ssl: 135,
};

// Create position as it would be stored in database
const mockRawPosition: RawPosition = {
  ticker: 'NVDA',
  shares: 50,
  avg_price: 140.00, // Calculated: amount / shares
  last_price: 145.00, // Current market price (fetched)
  ssl: 135.00,
  trim_2r_price: 150.00, // entry + 2R = 140 + 2*(140-135) = 150
  trimmed_pct: 0,
  status: 'STARTER',
  mode: 'MODE1',
};

const mockAccount: AccountContext = {
  equity: 100000,
  cash: 93000,
};

// =============================================================================
// Tests
// =============================================================================

console.log('\n========================================');
console.log('Portfolio Calculations Tests');
console.log('========================================\n');

// Test 1: Entry Price Calculation
console.log('1. Entry Price Calculation');
{
  const entryPrice = mockAddedTrade.amount / mockAddedTrade.shares;
  assert(entryPrice === 140.00, `Entry price = amount/shares = 7000/50 = $140.00`);
}

// Test 2: Position Value
console.log('\n2. Position Value');
{
  const positionValue = mockRawPosition.shares * mockRawPosition.last_price;
  assert(positionValue === 7250, `Position value = shares * last_price = 50 * 145 = $7,250`);
}

// Test 3: Cost Basis
console.log('\n3. Cost Basis');
{
  const costBasis = mockRawPosition.shares * mockRawPosition.avg_price;
  assert(costBasis === 7000, `Cost basis = shares * entry = 50 * 140 = $7,000`);
}

// Test 4: Unrealized P&L
console.log('\n4. Unrealized P&L');
{
  const currentValue = mockRawPosition.shares * mockRawPosition.last_price;
  const costBasis = mockRawPosition.shares * mockRawPosition.avg_price;
  const unrealizedPnl = currentValue - costBasis;
  assert(unrealizedPnl === 250, `Unrealized P&L = 7250 - 7000 = $250`);

  const unrealizedPnlPct = (unrealizedPnl / costBasis) * 100;
  assertClose(unrealizedPnlPct, 3.57, 0.01, `Unrealized P&L % = 250/7000 * 100 = 3.57%`);
}

// Test 5: R-Multiple
console.log('\n5. R-Multiple');
{
  const rPerShare = mockRawPosition.avg_price - mockRawPosition.ssl; // 140 - 135 = 5
  const profit = mockRawPosition.last_price - mockRawPosition.avg_price; // 145 - 140 = 5
  const rMultiple = profit / rPerShare;
  assert(rMultiple === 1.0, `R-Multiple = profit/R = 5/5 = 1.0R`);
}

// Test 6: Cash Calculation
console.log('\n6. Cash Calculation');
{
  const positionValue = mockRawPosition.shares * mockRawPosition.last_price;
  const calculatedCash = mockAccount.equity - positionValue;
  assert(calculatedCash === 92750, `Cash = equity - position value = 100000 - 7250 = $92,750`);
}

// Test 7: Full Portfolio Calculation
console.log('\n7. Full Portfolio Calculation (using calculatePortfolio)');
{
  try {
    const result = calculatePortfolio([mockRawPosition], [], mockAccount);

    assert(result.positions.length === 1, `Should have 1 position`);

    const position = result.positions[0];
    assert(position.ticker === 'NVDA', `Ticker should be NVDA`);
    assert(position.shares === 50, `Shares should be 50`);
    assert(position.entry === 140, `Entry should be 140`);
    assert(position.last_price === 145, `Last price should be 145`);
    assert(position.value === 7250, `Position value should be 7250`);
    assertClose(position.weight, 7.25, 0.1, `Weight should be ~7.25%`);
    assertClose(position.total_r ?? 0, 1.0, 0.1, `R-Multiple should be ~1.0`);

    assert(result.summary.position_count === 1, `Position count should be 1`);
    assert(result.summary.equity === 100000, `Equity should be 100000`);
    assertClose(result.summary.cash ?? 0, 92750, 1, `Cash should be ~92750`);
    assertClose(result.summary.gross_exposure, 7.25, 0.1, `Gross exposure should be ~7.25%`);
  } catch (e) {
    console.log(`  ERROR: ${e}`);
    failed++;
  }
}

// Test 8: Multiple Positions
console.log('\n8. Multiple Positions');
{
  const position2: RawPosition = {
    ticker: 'AAPL',
    shares: 30,
    avg_price: 180.00,
    last_price: 185.00,
    ssl: 175.00,
    trim_2r_price: 190.00,
    trimmed_pct: 0,
    status: 'STARTER',
    mode: 'MODE1',
  };

  try {
    const result = calculatePortfolio([mockRawPosition, position2], [], mockAccount);

    // Position 1: 50 * 145 = 7250
    // Position 2: 30 * 185 = 5550
    // Total value: 12800
    // Cash: 100000 - 12800 = 87200

    assert(result.summary.position_count === 2, `Should have 2 positions`);
    assertClose(result.summary.cash ?? 0, 87200, 1, `Cash should be ~87200`);
    assertClose(result.summary.gross_exposure, 12.8, 0.1, `Gross exposure should be ~12.8%`);
  } catch (e) {
    console.log(`  ERROR: ${e}`);
    failed++;
  }
}

// Test 9: ADD Trade Weighted Average
console.log('\n9. ADD Trade - Weighted Average Price');
{
  // Original position: 50 shares @ $140 = $7000
  // ADD: 25 shares @ $150 = $3750
  // Total: 75 shares, total cost $10750
  // New avg price: 10750 / 75 = $143.33

  const originalShares = 50;
  const originalPrice = 140;
  const addShares = 25;
  const addPrice = 150;

  const totalShares = originalShares + addShares;
  const totalCost = (originalShares * originalPrice) + (addShares * addPrice);
  const newAvgPrice = totalCost / totalShares;

  assert(totalShares === 75, `Total shares = 50 + 25 = 75`);
  assert(totalCost === 10750, `Total cost = 7000 + 3750 = 10750`);
  assertClose(newAvgPrice, 143.33, 0.01, `New avg price = 10750/75 = $143.33`);
}

// =============================================================================
// Summary
// =============================================================================

console.log('\n========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
  console.log('Some tests FAILED. Please review the calculations.\n');
  process.exit(1);
} else {
  console.log('All tests PASSED! Portfolio calculations are correct.\n');
  process.exit(0);
}
