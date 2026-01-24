# Known Bugs and Issues

This document tracks known bugs, TypeScript errors, and technical debt in the codebase.

---

## TypeScript Compilation Errors

### 1. Iterator Downlevel Errors (Multiple Files)

**Error:** `Type 'MapIterator<...>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.`

**Affected Files:**
- `src/lib/backtest/alex-states.ts` (lines 617, 646)
- `src/lib/backtest/data-loader.ts` (lines 731, 883, 897)
- `src/lib/backtest/performance-analyzer.ts` (lines 181, 554)
- `src/lib/backtest/replay-engine.ts` (line 628)
- `src/lib/discord/client.ts` (lines 408, 447)
- `src/lib/discord/parsers/pf-update.ts` (lines 530, 531)
- `src/lib/gmail/client.ts` (line 581)
- `src/lib/market-data/__tests__/*.ts` (multiple files)
- `src/lib/backtest/__tests__/*.ts` (multiple files)

**Cause:** Code uses `for...of` loops on Map iterators (`.values()`, `.entries()`) which requires ES2015+ target or `downlevelIteration` flag.

**Fix Options:**
1. Update `tsconfig.json` to set `"target": "es2015"` or higher
2. Add `"downlevelIteration": true` to compiler options
3. Refactor to use `Array.from()` before iterating: `Array.from(map.values())`

---

### 2. Implicit 'any' Type Errors

**Error:** `Parameter 'X' implicitly has an 'any' type.`

**Affected Files:**
- `src/lib/backtest/alex-states.ts` (line 647)
- `src/lib/backtest/replay-engine.ts` (line 629)

**Fix:** Add explicit type annotations to callback parameters.

---

### 3. Module Export Conflicts

**Error:** `Module "X" has already exported a member named 'testParser'.`

**Affected File:** `src/lib/discord/parsers/index.ts` (lines 10-11)

**Cause:** Multiple modules export the same name and the barrel file re-exports without disambiguation.

**Fix:** Use explicit re-exports with aliases:
```typescript
export { testParser as equityTradesTestParser } from './equity-trades';
export { testParser as otherTestParser } from './other-module';
```

---

### 4. Type 'undefined' Not Assignable Errors

**Error:** `Type 'string | undefined' is not assignable to type 'string | null'.`

**Affected File:** `src/lib/discord/parsers/alex-journal.ts` (line 232)

**Fix:** Add null coalescing: `value ?? null`

---

### 5. Duplicate Declarations in Test Files

**Error:** `Cannot redeclare block-scoped variable 'X'.`

**Affected Files:**
- `src/lib/market-data/__tests__/test-task2.ts`
- `src/lib/market-data/__tests__/test-task3.ts`
- `src/lib/market-data/__tests__/test-task4.ts`
- `src/lib/market-data/__tests__/test-task5.ts`

**Cause:** Test files declare the same constants (NASDAQ_100_TICKERS, CHINA_ADRS, etc.) that are already declared in included modules.

**Fix:** Import these constants from the source modules instead of redeclaring.

---

### 6. Missing Properties in Test Mocks

**Error:** `Property 'X' does not exist on type 'Y'.`

**Affected Files:**
- `src/lib/backtest/detailed-analysis.ts` (line 434) - `ma_value` property
- `src/lib/market-data/__tests__/test-task3.ts` (lines 520-521) - `min_dist_21_atr`, `max_dist_21_atr`, `max_weekly_return_pct`
- `src/lib/market-data/__tests__/test-task4.ts` (line 701) - Missing DetailedReadinessResult properties

**Cause:** Type definitions have been updated but test mocks haven't been updated to match.

**Fix:** Update test mocks to include all required properties.

---

### 7. Pipeline Test Type Errors

**Error:** Various type mismatches in `src/tasks/__tests__/pipeline-test.ts`

**Issues:**
- Line 245: ReadinessTickerData type mismatch
- Lines 459, 467, 531, 636-638: Possibly undefined properties not handled
- Line 627: `number | undefined` not assignable to `number`
- Line 725: `UniverseLeader[] | undefined` not assignable to `UniverseLeader[]`
- Line 760: `MarketPermissions | undefined` not assignable to `MarketPermissions`

**Fix:** Add proper null checks and update mock data to match current type definitions.

---

### 8. Re-export Type Issues

**Error:** `Re-exporting a type when 'isolatedModules' is enabled requires using 'export type'.`

**Affected File:** `src/lib/backtest/daily-ideas.ts` (lines 773-775)

**Fix:** Change re-exports to use `export type`:
```typescript
export type { SomeType } from './module';
```

---

## Functional Bugs

### 1. MCO Yesterday Lookup (Fixed)

**File:** `src/lib/backtest/detailed-analysis.ts`

**Issue:** MCO Yesterday was showing N/A because the exact date lookup wasn't finding matches when the date wasn't in the breadth cache.

**Status:** Fixed - Now uses loop to find most recent date <= target date.

---

### 2. Duplicate Trim Buttons in Portfolio View (Fixed)

**File:** `src/views/dashboard.tsx`

**Issue:** Positions at 2R profit (e.g., AMD, GOOGL) displayed Trim buttons in TWO places:
1. "Trim Recommendations (2R Targets)" section in Suggested Trades view
2. Actions column in Portfolio view

This was redundant and confusing for users.

**Root Cause:** The Portfolio view had its own trim button logic (`canTrim = rMultiple >= 2 && p.trimmed < 33`) that duplicated the Trim Recommendations section.

**Fix:** Removed the Trim button from Portfolio view. Trims are now only accessible via the "Trim Recommendations" section in Suggested Trades view, keeping the Sell button in Portfolio for custom sells.

**Additional Issue:** Initial fix missed a reference to `canTrim` in the Trim% column display (showing "Ready" status). Changed to use `p.trim_available` instead.

**Status:** Fixed - 2026-01-24

---

### 3. R and Heat Displaying as "-0.0" (Fixed)

**File:** `src/views/dashboard.tsx`

**Issue:** R multiple and Heat percentage displayed as "-0.0R" and "-0.0%" due to floating-point negative zero. The '+' sign was being added incorrectly when value was exactly 0 or negative zero.

**Root Cause:** The condition `rMultiple >= 0` is true for -0.0, but `toFixed(1)` renders it as "-0.0", creating confusing output.

**Fix:** Changed condition from `>= 0` to `> 0.005` to only add '+' when value is actually positive.

**Status:** Fixed - 2026-01-24

---

## Technical Debt

### 1. Hardcoded Mock Data

**Location:** `src/lib/agent-pipeline.ts` (previously lines 920-926)

**Issue:** Breadth data was hardcoded with mock values instead of being calculated.

**Status:** Fixed - Now calculates real MCO/MCSI from Nasdaq-100 stocks.

---

### 2. Inconsistent Type Naming

**Issue:** `TradeActionType` exists in both `trades.ts` and was added to `sizing.ts` with different values.

**Resolution:** Renamed sizing version to `SizingActionType` to avoid conflicts:
- `TradeActionType` in trades.ts: `'ENTRY' | 'ADD' | 'TRIM' | 'EXIT'`
- `SizingActionType` in sizing.ts: `'NEW_ENTRY' | 'ADD'`

---

### 3. Test Files Need Isolation

**Issue:** Multiple test files in `src/lib/market-data/__tests__/` redeclare the same constants and functions, causing compilation conflicts.

**Recommendation:** Refactor to use a shared test utilities module.

---

## Configuration Recommendations

### tsconfig.json Updates

Consider adding these compiler options to fix iterator issues:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "downlevelIteration": true
  }
}
```

---

*Last updated: 2026-01-24*
