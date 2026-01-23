# Testing Documentation

This document captures all test patterns, locations, and practices for the Trading Agent project.

---

## Test Files Overview

| Test File | Purpose | Command |
|-----------|---------|---------|
| `src/tasks/__tests__/pipeline-test.ts` | Full 9-task pipeline with mock data | `npx tsx src/tasks/__tests__/pipeline-test.ts` |
| `src/lib/market-data/__tests__/test-task2.ts` | Universe scan with real Yahoo Finance + RS | `npx tsx src/lib/market-data/__tests__/test-task2.ts` |
| `src/lib/market-data/__tests__/test-task3.ts` | Pullback scan with real data | `npx tsx src/lib/market-data/__tests__/test-task3.ts` |
| `src/lib/market-data/__tests__/test-task4.ts` | Entry readiness with real earnings data | `npx tsx src/lib/market-data/__tests__/test-task4.ts` |
| `src/lib/market-data/__tests__/test-task5.ts` | Focus list ranking with scoring breakdown | `npx tsx src/lib/market-data/__tests__/test-task5.ts` |
| `src/lib/market-data/__tests__/test-task6.ts` | Position sizing & risk gate with Decimal.js | `npx tsx src/lib/market-data/__tests__/test-task6.ts` |
| `src/lib/market-data/__tests__/test-task7.ts` | Execution plan with advisory order tickets | `npx tsx src/lib/market-data/__tests__/test-task7.ts` |
| `src/lib/market-data/__tests__/test-full-pipeline.ts` | Full pipeline (Tasks 1-7) end-to-end | `npx tsx src/lib/market-data/__tests__/test-full-pipeline.ts` |
| `src/lib/supabase/test-connection.ts` | Supabase connection validation | `npx tsx src/lib/supabase/test-connection.ts` |
| `src/lib/market-data/test-yahoo.ts` | Yahoo Finance API validation | `npx tsx src/lib/market-data/test-yahoo.ts` |

---

## Test Patterns by Type

### 1. Pipeline Integration Test (Mock Data)

**Purpose**: Validates all 9 tasks work together end-to-end with mock data.

**Location**: `src/tasks/__tests__/pipeline-test.ts`

**Command**:
```bash
npx tsx src/tasks/__tests__/pipeline-test.ts
```

**Expected Output**:
```
═══════════════════════════════════════════════════════════════
           TRADING AGENT PIPELINE INTEGRATION TEST
═══════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────┐
│ Task 1: Market Analysis (QQQE + Breadth)                    │
└─────────────────────────────────────────────────────────────┘
  ✓ Task 1 output validated
  State: GREEN
  ...

╔══════════════════════════════════════════════════════════════╗
║              PIPELINE FUNNEL SUMMARY                         ║
╠══════════════════════════════════════════════════════════════╣
...
═══════════════════════════════════════════════════════════════
  ✓ PIPELINE TEST COMPLETED SUCCESSFULLY
═══════════════════════════════════════════════════════════════
```

**Validations Performed**:
- Each task returns correct `task` field
- Arrays are properly typed
- Counts match array lengths
- Required fields are present

---

### 2. Real Data Integration Test (Yahoo Finance)

**Purpose**: Validates Task 2 (Universe Scan) with real market data and RS calculation.

**Location**: `src/lib/market-data/__tests__/test-task2.ts`

**Prerequisites**:
- Dev server running: `npm run dev`
- Network access to Yahoo Finance

**Command**:
```bash
npx tsx src/lib/market-data/__tests__/test-task2.ts
```

**Expected Output**:
```
======================================================================
Task 2 Universe Scan Test - Real Yahoo Finance Data + Real RS
======================================================================

Step 1: Calculating RS for 104 tickers...
RS calculation complete in 4.2s (103 tickers)

Top 10 by Relative Strength:
----------------------------------------------------------------------
Ticker  RS   3M%       6M%       12M%      Weighted
----------------------------------------------------------------------
MU      99   +79.1     +217.1    +251.5    +210.0
...

======================================================================
VALIDATION
======================================================================
✓ Count >= 25 (reasonable minimum)
✓ Count <= 40 (maximum)
✓ Has leaders array
✓ Leaders have required fields
✓ Sorted by RS descending
✓ No China ADRs
✓ All RS >= 70

✓ ALL VALIDATIONS PASSED
```

**Success Criteria**:
- Fetches data for 100+ tickers
- RS calculation completes
- 25-40 liquid leaders identified
- No China ADRs in output
- All RS values >= 70
- Results sorted by RS descending

---

### 3. Pullback Scan Test (Real Data)

**Purpose**: Validates Task 3 (Pullback Scan) with real structure analysis.

**Location**: `src/lib/market-data/__tests__/test-task3.ts`

**Prerequisites**:
- Dev server running: `npm run dev`

**Command**:
```bash
npx tsx src/lib/market-data/__tests__/test-task3.ts
```

**Expected Output**:
```
======================================================================
Task 3 Pullback Scan Test - Real Yahoo Finance Data
======================================================================

Step 1: Running Task 2 (Universe Scan) to get liquid leaders...
Liquid leaders (RS >= 70): 30 tickers

Step 2: Analyzing 21EMA structure for each leader...
Tickers analyzed: 30/30

Structure Summary:
------------------------------------------------------------------------------------------
Ticker  Close     MA21L     MA21C     MA21H     ATR     Dist21  Position
------------------------------------------------------------------------------------------
...

======================================================================
PULLBACK CANDIDATES OUTPUT
======================================================================

Final count: 4 (target: 5-10)

Pullback Candidates (sorted by grade, then RS):
----------------------------------------------------------------------------------------------------
Rank  Ticker  Grade  RS   Price     Dist21  WkRet%  Close%  Contr  Theme
----------------------------------------------------------------------------------------------------
1     AZN     A      79   $94.39    +0.71   -0.3%   75%     YES    Pharma
...

======================================================================
VALIDATION
======================================================================
✓ Has candidates array
✓ Count matches candidates length
✓ Candidates have required fields
✓ All grades are A/B/C
✓ Sorted by grade (A first)
✓ All dist_21 in range [-0.5, 1.0]

✓ ALL VALIDATIONS PASSED
```

**Success Criteria**:
- Structure analysis completes for all tickers
- Distance to 21EMA calculated
- Candidates have valid grades (A/B/C)
- Sorted by grade, then RS
- All dist_21 values within [-0.5, 1.0] range

---

### 4. Entry Readiness Test (Real Data)

**Purpose**: Validates Task 4 (Entry Readiness) with real earnings data from Yahoo Finance.

**Location**: `src/lib/market-data/__tests__/test-task4.ts`

**Prerequisites**:
- Dev server running: `npm run dev`

**Command**:
```bash
npx tsx src/lib/market-data/__tests__/test-task4.ts
```

**Expected Output**:
```
======================================================================
Task 4 Entry Readiness Test - Real Yahoo Finance Data
======================================================================

Step 1: Running Task 2 (Universe Scan) to get liquid leaders...
RS calculation complete in 4.2s (103 tickers)
Liquid leaders (RS >= 70): 30 tickers

Step 2: Running Task 3 (Pullback Scan) to get candidates...
Structure analysis complete in 6.1s
Task 3 output: 4 pullback candidates
Tickers: AZN, EA, ILMN, IDXX

Step 3: Fetching real earnings data from Yahoo Finance...
Earnings data fetched in 0.9s

Earnings Data:
------------------------------------------------------------
Ticker    Earnings Date  Days Until  Source
------------------------------------------------------------
AZN       2026-02-10     22          yahoo
...

Step 4: Evaluating entry readiness for each candidate...

======================================================================
READINESS EVALUATION RESULTS
======================================================================

AZN (READY)
--------------------------------------------------
  Price:     $94.39
  ATR Check: ✓ PASS (0.71 in [-0.5, 1])
  Structure: ✓ PASS (close $94.39 >= MALow $92.37)
  Earnings:  ✓ PASS (22 days, min 7)
  Bar Color: bullish
  Position:  above
  Mode:      MODE2
  Setup:     2) Reclaim & Backtest -> Higher Low
  Trigger:   Strength reclaim (R2G / 21 high reclaim)
...

======================================================================
SUMMARY
======================================================================

Candidates received from Task 3: 4
Ready for entry:                 4
Not ready:                       0

======================================================================
VALIDATION
======================================================================
✓ Output has task field
✓ Has rows array
✓ Rows have required fields
✓ ready_count matches
✓ not_ready_count matches
✓ All modes are MODE1/MODE2
✓ All dist_to_21ema_atr are numbers
✓ Ready candidates have passing checks

✓ ALL VALIDATIONS PASSED
```

**Success Criteria**:
- Chains Task 2 → Task 3 → Task 4 successfully
- Fetches real earnings data from Yahoo Finance
- Evaluates ATR bounds correctly (-0.5 to +1.0)
- Evaluates structure intact (close >= MALow)
- Evaluates earnings (>= 7 days or unknown passes)
- Assigns correct entry mode (MODE1/MODE2)
- Determines bar color (bullish/bearish/neutral)
- Ready count matches rows with ready=true

---

### 5. Focus List Ranking Test (Real Data)

**Purpose**: Validates Task 5 (Focus List Ranking) with scoring breakdown.

**Location**: `src/lib/market-data/__tests__/test-task5.ts`

**Prerequisites**:
- Dev server running: `npm run dev`

**Command**:
```bash
npx tsx src/lib/market-data/__tests__/test-task5.ts
```

**Expected Output**:
```
======================================================================
Task 5 Focus List Ranking Test - Real Yahoo Finance Data
======================================================================

Step 1: Running Task 2 (Universe Scan)...
Step 2: Running Task 3 (Pullback Scan)...
Step 3: Running Task 4 (Entry Readiness)...
Step 4: Running Task 5 (Focus List Ranking)...

======================================================================
SCORING BREAKDOWN
======================================================================

Scoring Weights:
  Grade (A/B/C):     30 pts (A=30, B=20, C=10)
  Distance to 21EMA: 25 pts (0 ATR=25, 0.5=15, 1.0=5)
  Entry Mode:        15 pts (MODE2=15, MODE1=10)
  Contraction:       10 pts (Yes=10, No=0)
  Close Range:       10 pts (scaled 0-100%)
  Relative Strength: 10 pts (≥90=10, ≥80=7, ≥70=4)
  MAX TOTAL:         100 pts

1. EA (Total: 74 pts)
--------------------------------------------------
   Grade:       A     -> 30/30 pts
   Distance:    +0.40 ATR -> 15/25 pts
   ...

======================================================================
FOCUS LIST OUTPUT (TOP 5)
======================================================================

Final Ranking:
----------------------------------------------------------------------
Rank  Ticker  Score   Grade  Mode   Theme
----------------------------------------------------------------------
1     EA      74      A      MODE1  Gaming
2     AZN     72      A      MODE2  Pharma
...

======================================================================
VALIDATION
======================================================================
✓ Output has task field
✓ Has top5 array
✓ Top5 length <= 5
✓ Candidates sorted by rank
✓ All scores > 0
✓ Sorted by score descending

✓ ALL VALIDATIONS PASSED
```

**Scoring Formula**:
- Grade: A=30, B=20, C=10
- Distance: 0 ATR=25, ±0.5=15, ±1.0=5
- Mode: MODE2=15, MODE1=10
- Contraction: Yes=10, No=0
- Close Range: Scaled 0-10 (percent)
- RS: ≥90=10, ≥80=7, ≥70=4

**Success Criteria**:
- Chains Tasks 2-5 successfully
- Scores all READY candidates
- Ranking sorted by total score descending
- Top 5 returned (or fewer if less available)
- Manual promotion support (not used by default)
- All candidates have valid scores > 0

---

### 6. Position Sizing & Risk Gate Test (Real Data)

**Purpose**: Validates Task 6 (Position Sizing & Risk Gate) with Decimal.js calculations.

**Location**: `src/lib/market-data/__tests__/test-task6.ts`

**Prerequisites**:
- Dev server running: `npm run dev`

**Command**:
```bash
npx tsx src/lib/market-data/__tests__/test-task6.ts
```

**Expected Output**:
```
================================================================================
Task 6 Position Sizing & Risk Gate Test - Real Yahoo Finance Data
================================================================================

Step 1: Running Task 1 (Market State - Simulated)...
Market State: CONFIRMED_UPTREND
New Entries: YES

Step 2: Running Task 2 (Universe Scan)...
Step 3: Running Task 3 (Pullback Scan)...
Step 4: Running Task 4 (Entry Readiness)...
Step 5: Running Task 5 (Focus List Ranking)...
Step 6: Running Task 6 (Position Sizing & Risk Gate)...

================================================================================
POSITION SIZING OUTPUT
================================================================================

Portfolio Equity: $100,000
Market State: CONFIRMED_UPTREND (new_entries=YES)

Position Sizing Parameters:
  MODE1: 10-12% position, max NER 0.25%
  MODE2: 12-15% position, max NER 0.5%
  Min Earnings Days: 7

--------------------------------------------------------------------------------
Ticker  Mode       Entry      SSL   Pos%      Pos$  Shares  R/shr  2R Trim    EC%      Gate
--------------------------------------------------------------------------------
EA      MODE1    $204.25  $203.93  11.0%    $11000      53  $0.32  $204.89  0.02%      PASS
AZN     MODE2     $94.39   $92.37  13.5%    $13500     143  $2.02   $98.43  0.29%      PASS
ILMN    MODE1    $141.65  $137.15  11.0%    $11000      77  $4.50  $150.65  0.35%  WITHHOLD
...

================================================================================
DETAILED BREAKDOWN
================================================================================

EA (MODE1)
--------------------------------------------------
  Entry Price:      $204.25
  SSL (21EMA Low):  $92.37
  Position %:       11.0%
  Position $:       $11000.00
  Shares:           53
  R per Share:      $0.32
  Total R ($):      $16.96
  EC Risk %:        0.02%
  NER %:            0.02% (max: 0.25%)
  2R Trim Price:    $204.89
  Earnings Days:    -1
  Gate:             PASS
...

================================================================================
SUMMARY
================================================================================

Total Candidates:    4
Passed:              3
Withheld:            1

Total Position $:    $38000.00 (38.0% of equity)
Total NER %:         0.66%

Withheld Reasons:
  ILMN: NER 0.35% exceeds MODE1 limit of 0.25%

================================================================================
VALIDATION
================================================================================
✓ All calculations use Decimal.js
✓ SSL < Entry for all candidates
✓ R per share = Entry - SSL
✓ 2R trim = Entry + 2*R
✓ EC risk = (R * shares) / equity * 100
✓ MODE1 position 10-12%
✓ MODE2 position 12-15%
✓ NER within limits for PASS trades
✓ Gate correctly withholds NER violations
✓ Gate correctly withholds earnings < 7 days

✓ ALL VALIDATIONS PASSED
```

**Position Sizing Formula** (per agent_skeleton Section 6):
- MODE1: 10-12% position, max NER 0.25%
- MODE2: 12-15% position, max NER 0.50%
- SSL = 21EMA Low (MALow band)
- R per share = Entry - SSL
- EC Risk % = (R * shares) / equity * 100
- 2R Trim = Entry + 2*R

**Risk Gate Checks**:
1. Market regime forbids entries → WITHHOLD
2. Earnings < 7 days → WITHHOLD
3. NER exceeds mode limit → WITHHOLD

**Success Criteria**:
- Chains Tasks 1-6 successfully
- All calculations use Decimal.js (no floating point errors)
- SSL correctly derived from 21EMA Low
- R per share and 2R trim calculated correctly
- EC risk percentage accurate
- Position sizing within mode ranges
- Risk gate correctly withholds NER violations
- Risk gate correctly withholds earnings < 7 days
- Summary totals accurate for passed trades

---

### 7. Execution Plan Test (Real Data)

**Purpose**: Validates Task 7 (Execution Plan) with advisory order tickets.

**Location**: `src/lib/market-data/__tests__/test-task7.ts`

**Prerequisites**:
- Dev server running: `npm run dev`

**Command**:
```bash
npx tsx src/lib/market-data/__tests__/test-task7.ts
```

**Expected Output**:
```
════════════════════════════════════════════════════════════════════════════════
EXECUTION PLAN - 2026-01-19
════════════════════════════════════════════════════════════════════════════════

Portfolio: $100,000 | Market: CONFIRMED_UPTREND | New Entries: YES

ORDER TICKETS (PASSED)
────────────────────────────────────────────────────────────────────────────────
#1 EA (MODE1)
   ENTRY:  BUY 53 shares @ MARKET (DAY)
   TRIM:   SELL 17 shares @ $204.89 LIMIT (GTC) [2R]
   STOP:   Daily close < $203.93 → exit at close
   Risk:   0.02% NER | $11,000 position

#2 AZN (MODE2)
   ENTRY:  BUY 143 shares @ MARKET (DAY)
   TRIM:   SELL 47 shares @ $98.43 LIMIT (GTC) [2R]
   STOP:   Daily close < $92.37 → exit at close
   Risk:   0.29% NER | $13,500 position
...

WITHHELD TRADES
────────────────────────────────────────────────────────────────────────────────
ILMN - MODE1 - NER exceeds limit (0.35% > 0.25%)

SUMMARY
────────────────────────────────────────────────────────────────────────────────
Orders: 3 | Planned: $38,000 | NER: 0.66% | Withheld: 1

════════════════════════════════════════════════════════════════════════════════
VALIDATION
════════════════════════════════════════════════════════════════════════════════
✓ Output has task field
✓ Has passed array
✓ Has withheld array
✓ Has totals object
✓ Passed trades have entry orders
✓ Passed trades have trim orders
✓ Passed trades have stop instructions
✓ Trim shares = floor(entry shares / 3)
✓ 2R price > entry price
✓ SSL < entry price
✓ Withheld trades have reasons
✓ Totals match passed trades
✓ Total dollars accurate
✓ Total NER accurate

✓ ALL VALIDATIONS PASSED
```

**Order Ticket Structure**:
- Entry: `BUY [shares] @ MARKET (DAY)`
- 2R Trim: `SELL [1/3 shares] @ [2R price] LIMIT (GTC)`
- Stop: `Daily close < [SSL] → exit at close`

**Success Criteria**:
- Chains Tasks 1-7 successfully
- Entry orders have correct shares, order type, TIF
- Trim orders = floor(entry shares / 3)
- 2R price > entry price
- SSL < entry price
- Withheld trades have reasons and detail messages
- Summary totals accurate

---

### 8. Full Pipeline Test (Real Data - Tasks 1-7)

**Purpose**: Validates the complete trading agent pipeline end-to-end with real data.

**Location**: `src/lib/market-data/__tests__/test-full-pipeline.ts`

**Prerequisites**:
- Dev server running: `npm run dev`

**Command**:
```bash
npx tsx src/lib/market-data/__tests__/test-full-pipeline.ts
```

**Expected Output**:
```
╔══════════════════════════════════════════════════════════════════════════════╗
║  TRADING AGENT FULL PIPELINE TEST - Tasks 1-7 with Real Data                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

Date: 2026-01-19 | Equity: $100,000

┌─ Task 1: Market Analysis ────────────────────────────────────────────────────┐
│  State: CONFIRMED_UPTREND                                                    │
│  New Entries: YES | Adds: true | Pressing: true                              │
└──────────────────────────────────────────────────────────────────────────────┘

... (Tasks 2-7 execute sequentially) ...

╔══════════════════════════════════════════════════════════════════════════════╗
║                           PIPELINE FUNNEL SUMMARY                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Task 1: Market State      │ CONFIRMED_UPTREND                               ║
║  Task 2: Universe Scan     │  103 scanned →  30 liquid leaders               ║
║  Task 3: Pullback Scan     │   30 leaders  →   4 pullback candidates         ║
║  Task 4: Entry Readiness   │    4 pullback →   4 READY                       ║
║  Task 5: Focus List        │    4 ready    →   4 top 5                       ║
║  Task 6: Position Sizing   │    4 top 5    →   3 PASS, 1 WITHHOLD            ║
║  Task 7: Execution Plan    │    3 orders   → $38,000 planned                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─ ORDER TICKETS ──────────────────────────────────────────────────────────────┐
│  EA (MODE1)                                                                  │
│    ENTRY: BUY 53 @ MARKET (DAY)                                              │
│    TRIM:  SELL 17 @ $204.89 LIMIT (GTC) [2R]                                 │
│    STOP:  Daily close < $203.93 → exit at close                              │
│    Risk:  0.02% NER | $11,000 position                                       │
...
└──────────────────────────────────────────────────────────────────────────────┘

┌─ VALIDATION ─────────────────────────────────────────────────────────────────┐
│  ✓ Task 1 returns valid state                                                │
│  ✓ Task 2 scans 100+ tickers                                                 │
│  ✓ Task 2 filters to 20-50 leaders                                           │
│  ✓ Task 3 produces pullback candidates                                       │
│  ✓ Task 4 evaluates all pullbacks                                            │
│  ✓ Task 5 ranks up to 5 candidates                                           │
│  ✓ Task 5 sorted by score descending                                         │
│  ✓ Task 6 sizes all top 5                                                    │
│  ✓ Task 6 uses Decimal.js (SSL < entry)                                      │
│  ✓ Task 7 passed + withheld = total                                          │
│  ✓ Task 7 trim shares = floor(shares/3)                                      │
│  ✓ Data flows correctly through pipeline                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  ✓ ALL VALIDATIONS PASSED                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Pipeline Flow**:
```
Task 1 (Market)     → CONFIRMED_UPTREND (permissions)
         ↓
Task 2 (Universe)   → 103 tickers scanned → 30 liquid leaders (RS ≥ 70)
         ↓
Task 3 (Pullback)   → 30 leaders → 4 pullback candidates (structure + distance)
         ↓
Task 4 (Readiness)  → 4 pullbacks → 4 READY (earnings + ATR check)
         ↓
Task 5 (Ranking)    → 4 ready → Top 5 ranked by score (100 pts max)
         ↓
Task 6 (Sizing)     → Top 5 → 3 PASS, 1 WITHHOLD (NER/earnings gate)
         ↓
Task 7 (Execution)  → 3 orders → $38,000 planned, 0.66% NER
```

**Validations Performed**:
1. Task 1 returns valid market state
2. Task 2 scans 100+ tickers, filters to 20-50 leaders
3. Task 3 produces pullback candidates
4. Task 4 evaluates all pullbacks
5. Task 5 ranks up to 5 candidates, sorted by score
6. Task 6 sizes all top 5, uses Decimal.js
7. Task 7 passed + withheld = total, trim shares correct
8. Data flows correctly through entire pipeline

**Success Criteria**:
- All 7 tasks execute without errors
- Data flows correctly between tasks
- 12 validations pass
- Execution plan generated with order tickets

---

### 9. API Connection Tests

#### Supabase Connection Test

**Purpose**: Validates Supabase connection and table access.

**Location**: `src/lib/supabase/test-connection.ts`

**Command**:
```bash
npx tsx src/lib/supabase/test-connection.ts
```

**Expected Output**:
```
=== Supabase Connection Test ===

1. Checking environment variables...
   ✓ Environment variables loaded
   URL: https://xxx.supabase.co

2. Creating Supabase client...
   ✓ Client created

3. Testing positions table...
   ✓ Query successful

4. Testing trades table...
   ✓ Query successful

5. Testing market_snapshots table...
   ✓ Query successful

6. Testing insert to trades table...
   ✓ Insert successful

7. Cleaning up test data...
   ✓ Test data cleaned up

=== Connection Test Complete ===
All tables are accessible and working!
```

#### Yahoo Finance Test

**Purpose**: Validates Yahoo Finance API access and calculations.

**Location**: `src/lib/market-data/test-yahoo.ts`

**Command**:
```bash
npx tsx src/lib/market-data/test-yahoo.ts
```

**Expected Output**:
```
=== Yahoo Finance Test ===

1. Fetching QQQE OHLC data...
   Fetched 35 bars
   Date range: 2024-12-01 to 2025-01-19
   Latest close: $98.50

2. Calculating 21EMA structure...
   MA High: $97.25
   MA Close: $96.80
   MA Low: $96.35
   Current Close: $98.50
   Position: above
   Slope: rising

=== Test Complete ===
```

---

## Test Checklist

### Adding a New Task

1. [ ] Create task module in `src/tasks/`
2. [ ] Add TypeScript interface in `src/types/`
3. [ ] Add validation function in pipeline-test.ts:
```typescript
function validateTaskN(output: TaskNOutput): void {
  assert(output.task === 'task_n', 'Task N: task field');
  assert(Array.isArray(output.items), 'Task N: items array');
  // ... more assertions
  console.log('  ✓ Task N output validated');
}
```
4. [ ] Add mock data generator in pipeline-test.ts
5. [ ] Add to pipeline sequence
6. [ ] Run pipeline test: `npx tsx src/tasks/__tests__/pipeline-test.ts`

### Adding a New API Integration

1. [ ] Create test file: `src/lib/<module>/test-<api>.ts`
2. [ ] Test connection/authentication
3. [ ] Test basic query
4. [ ] Test error handling
5. [ ] Document in this file
6. [ ] Add to CI/CD (if applicable)

### Adding a New UI Component

1. [ ] Component accepts correct props from task output
2. [ ] Handles loading state
3. [ ] Handles error state
4. [ ] Handles empty data state
5. [ ] Test with dev server: `npm run dev`
6. [ ] Visual inspection in browser

### Modifying Calculations

1. [ ] Identify affected tests
2. [ ] Update calculation module
3. [ ] Run pipeline test with mock data
4. [ ] Run real data test (Task 2/3)
5. [ ] Compare results with expected values
6. [ ] Document any behavior changes

---

## Writing New Tests

### Test File Template

```typescript
/**
 * Test Script for [Feature Name]
 *
 * Run with: npx tsx src/path/to/test.ts
 *
 * Prerequisites:
 * - [List prerequisites]
 */

// =============================================================================
// Types
// =============================================================================

interface TestResult {
  // Define expected output structure
}

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = 'http://localhost:3000';

// =============================================================================
// Test Utilities
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Main Test
// =============================================================================

async function runTest() {
  console.log('='.repeat(60));
  console.log('Test Name');
  console.log('='.repeat(60));
  console.log();

  // Step 1: Setup
  console.log('Step 1: Setting up...');
  // ...

  // Step 2: Execute
  console.log('Step 2: Executing...');
  // ...

  // Step 3: Validate
  console.log('='.repeat(60));
  console.log('VALIDATION');
  console.log('='.repeat(60));

  const validations = [
    { name: 'Validation 1', pass: true },
    { name: 'Validation 2', pass: true },
  ];

  for (const v of validations) {
    console.log(`${v.pass ? '✓' : '✗'} ${v.name}`);
  }

  const allPassed = validations.every(v => v.pass);
  console.log();
  console.log(allPassed ? '✓ ALL VALIDATIONS PASSED' : '✗ SOME VALIDATIONS FAILED');
}

// Run the test
runTest().catch(console.error);
```

### Validation Pattern

```typescript
const validations = [
  {
    name: 'Descriptive name',
    pass: someCondition,
  },
  {
    name: 'Array has items',
    pass: output.items.length > 0,
  },
  {
    name: 'All values positive',
    pass: output.items.every(i => i.value > 0),
  },
  {
    name: 'Sorted correctly',
    pass: output.items.every((item, i, arr) =>
      i === 0 || arr[i-1].score >= item.score
    ),
  },
];

// Print results
for (const v of validations) {
  console.log(`${v.pass ? '✓' : '✗'} ${v.name}`);
}

const allPassed = validations.every(v => v.pass);
process.exit(allPassed ? 0 : 1);
```

---

## Running All Tests

```bash
# 1. Start dev server (in terminal 1)
npm run dev

# 2. Run tests (in terminal 2)

# Pipeline test (mock data, no server needed)
npx tsx src/tasks/__tests__/pipeline-test.ts

# Real data tests (requires dev server)
npx tsx src/lib/market-data/__tests__/test-task2.ts
npx tsx src/lib/market-data/__tests__/test-task3.ts
npx tsx src/lib/market-data/__tests__/test-task4.ts
npx tsx src/lib/market-data/__tests__/test-task5.ts
npx tsx src/lib/market-data/__tests__/test-task6.ts
npx tsx src/lib/market-data/__tests__/test-task7.ts

# Full pipeline test (all tasks 1-7)
npx tsx src/lib/market-data/__tests__/test-full-pipeline.ts

# Connection tests
npx tsx src/lib/supabase/test-connection.ts
npx tsx src/lib/market-data/test-yahoo.ts
```

---

## CI/CD Integration (Future)

When setting up CI/CD, consider:

1. **Unit tests**: Run without server
2. **Integration tests**: Mock external APIs
3. **E2E tests**: Use test environment with real APIs
4. **Rate limiting**: Add delays for Yahoo Finance
5. **Environment variables**: Use CI secrets

---

*Last updated: January 2026*
