# Portfolio Calculations Test Results

**Date:** 2026-01-26
**Status:** All 25 tests PASSED

## Test Summary

| Category | Tests | Status |
|----------|-------|--------|
| Entry Price Calculation | 1 | PASS |
| Position Value | 1 | PASS |
| Cost Basis | 1 | PASS |
| Unrealized P&L | 2 | PASS |
| R-Multiple | 1 | PASS |
| Cash Calculation | 1 | PASS |
| Full Portfolio Calculation | 12 | PASS |
| Multiple Positions | 3 | PASS |
| ADD Trade Weighted Average | 3 | PASS |

## Verified Calculations

### 1. Entry Price
```
Entry Price = Amount / Shares
Example: $7,000 / 50 shares = $140.00
```

### 2. Position Value
```
Position Value = Shares × Last Price
Example: 50 × $145 = $7,250
```

### 3. Cost Basis
```
Cost Basis = Shares × Entry Price
Example: 50 × $140 = $7,000
```

### 4. Unrealized P&L
```
Unrealized P&L = Current Value - Cost Basis
Example: $7,250 - $7,000 = $250

Unrealized P&L % = (P&L / Cost Basis) × 100
Example: ($250 / $7,000) × 100 = 3.57%
```

### 5. R-Multiple
```
R per Share = Entry Price - SSL
Example: $140 - $135 = $5

Profit per Share = Last Price - Entry Price
Example: $145 - $140 = $5

R-Multiple = Profit / R
Example: $5 / $5 = 1.0R
```

### 6. Cash Calculation
```
Cash = Equity - Total Position Value
Example: $100,000 - $7,250 = $92,750
```

### 7. Portfolio Weight
```
Weight = (Position Value / Equity) × 100
Example: ($7,250 / $100,000) × 100 = 7.25%
```

### 8. Multiple Positions Aggregation
```
Position 1: 50 shares × $145 = $7,250
Position 2: 30 shares × $185 = $5,550
Total Value: $12,800

Cash = $100,000 - $12,800 = $87,200
Gross Exposure = 12.8%
```

### 9. ADD Trade Weighted Average
```
Original: 50 shares @ $140 = $7,000
ADD: 25 shares @ $150 = $3,750
Total: 75 shares, $10,750

New Avg Price = $10,750 / 75 = $143.33
```

## Test Output

```
========================================
Portfolio Calculations Tests
========================================

1. Entry Price Calculation
  PASS: Entry price = amount/shares = 7000/50 = $140.00

2. Position Value
  PASS: Position value = shares * last_price = 50 * 145 = $7,250

3. Cost Basis
  PASS: Cost basis = shares * entry = 50 * 140 = $7,000

4. Unrealized P&L
  PASS: Unrealized P&L = 7250 - 7000 = $250
  PASS: Unrealized P&L % = 250/7000 * 100 = 3.57%

5. R-Multiple
  PASS: R-Multiple = profit/R = 5/5 = 1.0R

6. Cash Calculation
  PASS: Cash = equity - position value = 100000 - 7250 = $92,750

7. Full Portfolio Calculation (using calculatePortfolio)
  PASS: Should have 1 position
  PASS: Ticker should be NVDA
  PASS: Shares should be 50
  PASS: Entry should be 140
  PASS: Last price should be 145
  PASS: Position value should be 7250
  PASS: Weight should be ~7.25%
  PASS: R-Multiple should be ~1.0
  PASS: Position count should be 1
  PASS: Equity should be 100000
  PASS: Cash should be ~92750
  PASS: Gross exposure should be ~7.25%

8. Multiple Positions
  PASS: Should have 2 positions
  PASS: Cash should be ~87200
  PASS: Gross exposure should be ~12.8%

9. ADD Trade - Weighted Average Price
  PASS: Total shares = 50 + 25 = 75
  PASS: Total cost = 7000 + 3750 = 10750
  PASS: New avg price = 10750/75 = $143.33

========================================
Results: 25 passed, 0 failed
========================================

All tests PASSED! Portfolio calculations are correct.
```

## Test File Location

`src/tasks/__tests__/portfolio-calculations.test.ts`

## How to Run

```bash
npx tsx src/tasks/__tests__/portfolio-calculations.test.ts
```
