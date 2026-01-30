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

### 4. Trade Not Showing in Portfolio After Execution (Fixed)

**Files:** `src/views/dashboard.tsx`, `src/lib/agent-pipeline.ts`

**Issue:** After executing a trade via the "Add Trade" modal, the new position did not appear in the Portfolio view or Trades Today view until a full page refresh.

**Root Cause:** Two issues:
1. **Stale closure bug** - The `refreshPortfolio` function captured `agentState` at creation time, not at execution time. When `setAgentState` was called, it used the stale reference.
2. **Incomplete refresh** - `refreshPortfolioOnly` only returned portfolio data, not the trades_today data needed for the Trades Today view.

**Fix:**
1. Changed `setAgentState` to use functional update pattern: `setAgentState(prevState => ({ ...prevState, portfolio }))`
2. Updated `refreshPortfolioOnly` to return both `portfolio` and `overview` data
3. Updated `refreshPortfolio` to update both `portfolio` and `overview` in the agent state

**Status:** Fixed - 2026-01-25

---

### 5. Liquid Leaders & Pullback Scan Empty on Initial Load (Fixed)

**Files:** `src/lib/agent-pipeline.ts`, `src/lib/supabase/queries.ts`, `src/lib/supabase/index.ts`

**Issue:** Liquid Leaders and Pullback Scan sections showed empty results on both localhost and production. Affected every fresh page load (no localStorage cache).

**Root Cause:** The pipeline's `skipDailyScan=true` path (used on every initial page load) fell through to `dailyScanResults = []` when no localStorage cache existed. There was no fallback to read from the Supabase `daily_scan_cache` table, even though the nightly cron job writes scan results there.

**Fix:** Added `getDailyScanCache()` Supabase query and wired it as a fallback in the `skipDailyScan` path. Flow is now: localStorage → Supabase `daily_scan_cache` → empty (with user prompt). Successfully loaded results are also persisted back to localStorage for instant subsequent loads.

**Status:** Fixed - 2026-01-28

---

### 6. Missing `portfolio_ner_exceeded` in WITHHOLD_DETAIL_TEMPLATES (Fixed)

**File:** `src/tasks/execution-plan.ts`, `src/lib/market-data/__tests__/test-task7.ts`

**Issue:** Pipeline crashed with `(0 , eh[i.withhold_reason]) is not a function` when a trade was withheld for `portfolio_ner_exceeded`.

**Root Cause:** `WITHHOLD_DETAIL_TEMPLATES` mapped 4 of 5 `WithholdReason` values to template functions, but `portfolio_ner_exceeded` was missing. The bracket lookup returned `undefined`, and calling it as a function threw a runtime error.

**Fix:** Added the missing `portfolio_ner_exceeded` entry to the template object in both the main code and the test file.

**Status:** Fixed - 2026-01-28

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

## Runtime Bug #7: Supabase Upsert Silently Skipped in Daily Scan

**File:** `src/app/api/daily-scan/route.ts:410-411`, `src/app/api/cron/nightly-scan/route.ts:16`

**Issue:** After a successful scan (75 leaders, 216s), the Supabase cache write was silently skipped. The `daily_scan_cache` table remained empty despite scans completing successfully.

**Root cause:** The code used `process.env.SUPABASE_SERVICE_ROLE_KEY` which was never set in `.env.local` or Vercel environment variables. The `if (sbUrl && sbKey)` guard evaluated to false, silently skipping the entire cache block with no warning logged.

**Fix:** Added fallback to `NEXT_PUBLIC_SUPABASE_ANON_KEY`:
```typescript
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```
Applied to both `daily-scan/route.ts` and `cron/nightly-scan/route.ts`.

**Date:** 2026-01-28

---

## Runtime Bug #8: External Cron Service Hitting Wrong URL (405 Method Not Allowed)

**File:** N/A (external service misconfiguration)

**Issue:** An external cron service (cron-job.org) was configured to hit `https://ai-trading-agent-lake.vercel.app/daily-scan` which does not exist. The correct API route is `/api/daily-scan` (POST) or `/api/cron/nightly-scan` (GET). The wrong URL returned 405 Method Not Allowed, causing 26 consecutive failures and automatic disabling of the cron job.

**Root cause:** The external cron-job.org service was set up with the wrong URL (`/daily-scan` instead of `/api/daily-scan`) and likely using GET instead of POST. Additionally, this external cron is redundant — Vercel Cron is already configured in `vercel.json` to call `/api/cron/nightly-scan` at `0 2 * * 1-5` (Mon-Fri 2 AM UTC), and it runs successfully.

**Fix:**
1. Disable the cron-job.org job (redundant with Vercel Cron)
2. Added cooldown guard to `/api/daily-scan` POST to prevent accidental rapid re-triggers (minimum 1 hour between scans)

**Impact:** No data loss. The Vercel Cron ran successfully at 02:41 UTC on 2026-01-30, so the nightly scan data was available. The external cron failures were harmless noise.

**Date:** 2026-01-30

---

*Last updated: 2026-01-30*
