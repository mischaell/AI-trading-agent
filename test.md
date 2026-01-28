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

---

# Filter Criteria Unit Tests

**Date:** 2026-01-27
**Status:** All 33 tests PASSED

## Purpose

Tests the Liquid Leaders filter logic WITHOUT requiring full API scans. Uses mock data to validate filter behavior for both DEFAULT and AGGRESSIVE criteria.

## Test Summary

| Category | Tests | Status |
|----------|-------|--------|
| Default Criteria | 8 | PASS |
| Aggressive Criteria | 15 | PASS |
| Exchange Coverage | 10 | PASS |

## Filter Criteria Definitions

### DEFAULT Criteria (Conservative)
```
minLiquidityM: 250      # $250M daily liquidity
minVolumeM: 1.0         # 1M shares/day
minMarketCapB: 1.0      # $1B market cap
minAdrPct: 2.5          # 2.5% ADR minimum
maxAdrPct: 10.0         # 10% ADR maximum
minPrice: 10            # $10 minimum price
excludeChina: true      # Exclude China ADRs
excludeSectors: true    # Exclude biotech, energy, utilities, financials, etc.
```

### AGGRESSIVE Criteria (Broad - includes all sectors)
```
minLiquidityM: 100      # $100M daily liquidity
minVolumeM: 0.5         # 500K shares/day
minMarketCapB: 0.5      # $500M market cap
minAdrPct: 2.0          # 2.0% ADR minimum
maxAdrPct: 20.0         # 20% ADR maximum (includes crypto miners)
minPrice: 5             # $5 minimum price
excludeChina: true      # Still exclude China ADRs
excludeSectors: false   # NO sector exclusions
```

## Stocks Included with Aggressive (not in Default)

| Ticker | Exchange | Sector | Why Excluded from Default |
|--------|----------|--------|---------------------------|
| WULF | NASDAQ | Crypto Mining | High ADR |
| APLD | NASDAQ | Crypto Mining | High ADR |
| IREN | NASDAQ | Crypto Mining | High ADR |
| HUT | NASDAQ | Crypto Mining | High ADR |
| CIFR | NASDAQ | Crypto Mining | High ADR |
| NOC | NYSE | Aerospace & Defense | Sector exclusion |
| LMT | NYSE | Aerospace & Defense | Sector exclusion |
| GS | NYSE | Financial Services | Sector exclusion |
| IBKR | NASDAQ | Financial Services | Sector exclusion |
| CAT | NYSE | Machinery | Sector exclusion |
| VRT | NYSE | Industrial Equipment | Not on NASDAQ |

## NYSE vs NASDAQ Coverage

The daily scan now fetches both exchanges:
- **NASDAQ:** ~1,407 stocks after pre-filter
- **NYSE:** ~1,706 stocks after pre-filter
- **Combined:** ~3,113 stocks

### Expected Tickers by Exchange

**On NASDAQ (30):**
```
WULF, APLD, IREN, HUT, AMD, AMAT, RKLB, CIFR, KLAC, MU, IBKR, TER, STX,
ASML, FTAI, ADI, MCHP, SATS, LRCX, MDB, ON, MTSI, ASTS, NBIS, WDC, KTOS,
ENTG, LITE, SNDK, EOSE
```

**On NYSE (19):**
```
CLS, PL, VRT, COMP, NOC, LHX, W, CIEN, BE, LMT, GEV, JBL, APH, CVNA, GLW,
HWM, COHR, CAT, GS
```

## Test Files

| File | Purpose |
|------|---------|
| `filter-criteria.test.ts` | Unit tests with mock data (no API calls) |
| `check-expected-tickers.ts` | Validates expected tickers pass filters |
| `check-nasdaq-coverage.ts` | Shows which tickers need NYSE scan |

## How to Run

```bash
# Full filter criteria unit tests (no API needed)
npx tsx src/tasks/__tests__/filter-criteria.test.ts

# Check if expected tickers pass filters (requires local server)
npx tsx src/tasks/__tests__/check-expected-tickers.ts

# Check which expected tickers are on NASDAQ vs NYSE
npx tsx src/tasks/__tests__/check-nasdaq-coverage.ts
```

## Test Output

```
======================================================================
FILTER CRITERIA UNIT TESTS
======================================================================

📋 DEFAULT CRITERIA TESTS

  ✓ AMD passes default criteria
  ✓ NVDA passes default criteria
  ✓ MDB passes default criteria
  ✓ BABA fails default criteria (China ADR)
  ✓ GS fails default criteria (financial services)
  ✓ IBKR fails default criteria (financial services)
  ✓ TINY fails default criteria (low liquidity)
  ✓ PNNY fails default criteria (low price)

📋 AGGRESSIVE CRITERIA TESTS

  ✓ WULF passes aggressive criteria (crypto miner)
  ✓ APLD passes aggressive criteria (crypto miner)
  ✓ IREN passes aggressive criteria (crypto miner)
  ✓ HUT passes aggressive criteria (crypto miner)
  ✓ NOC passes aggressive criteria (defense - no sector exclusion)
  ✓ LMT passes aggressive criteria (defense)
  ✓ GS passes aggressive criteria (financial - no sector exclusion)
  ✓ IBKR passes aggressive criteria (financial)
  ✓ CAT passes aggressive criteria (industrial)
  ✓ VRT passes aggressive criteria (industrial)
  ✓ RKLB passes aggressive criteria (high ADR ok)
  ✓ BABA fails aggressive criteria (China ADR still excluded)
  ✓ WILD fails aggressive criteria (ADR > 20%)
  ✓ TINY fails aggressive criteria (liquidity < $100M)
  ✓ BORE fails aggressive criteria (ADR < 2%)

📋 EXCHANGE COVERAGE TESTS

  ✓ NASDAQ stocks in mock data: 20
  ✓ NYSE stocks in mock data: 8
  ✓ NASDAQ stocks passing aggressive: 16/20
  ✓ NYSE stocks passing aggressive: 6/8
  ✓ NOC (NYSE) passes aggressive filters
  ✓ LMT (NYSE) passes aggressive filters
  ✓ LHX (NYSE) passes aggressive filters
  ✓ GS (NYSE) passes aggressive filters
  ✓ CAT (NYSE) passes aggressive filters
  ✓ VRT (NYSE) passes aggressive filters

======================================================================
RESULTS: 33/33 tests passed
======================================================================

✅ All tests passed!
```

---

# Pipeline Diagnostics Tests

**Date:** 2026-01-28
**Status:** NEW

## Purpose

Validates every pipeline task's output quality, detects empty arrays, bad data, and tracks which fallback defaults are in effect. Also provides a live `/api/diagnostics` endpoint for checking system health.

## Test Summary

| Category | What it checks |
|----------|---------------|
| Task 1: Market Analysis | market_state defined, permissions defined, MCO Z-score in range |
| Task 2: Universe Scan | count > 0, no duplicates, RS 1-99, positive prices, ADR in range |
| Task 3: Pullback Scan | candidates array populated, no NaN dist_21_atr |
| Task 4: Entry Readiness | rows array, at least some READY, earnings_days not default |
| Task 5: Focus List | top5 populated, candidates not empty |
| Task 6: Position Sizing | sizing array, PASS count > 0, shares > 0, NER in range |
| Task 7: Execution Plan | suggested_trades and withheld_trades defined |
| Task 8: Portfolio | positions array, valid prices/shares/PnL |
| Task 9: Overview | trades_today defined |
| Fallback tracking | Logs every default value used during the run |

## How to Run

```bash
# Pipeline diagnostics test (mock data)
npx tsx src/tasks/__tests__/pipeline-diagnostics.ts

# Live system health check
curl http://localhost:3000/api/diagnostics | jq .

# Production health check
curl https://ai-trading-agent-lake.vercel.app/api/diagnostics | jq .
```

## Test Files

| File | Purpose |
|------|---------|
| `src/tasks/__tests__/pipeline-diagnostics.ts` | Mock data quality validation for all 9 tasks |
| `src/app/api/diagnostics/route.ts` | Live health check endpoint (Supabase caches, cron, fallbacks) |
| `docs/PIPELINE-DIAGNOSTICS.md` | Full documentation of dependencies, caches, fallbacks |
