# Bugs & Fixes Documentation

This document captures bugs encountered during development and their solutions, organized by category. Reference this before writing new code to avoid known pitfalls.

---

## TypeScript / Type Errors

### BUG-TS-001: DataTransferItemList Iteration Error

**Bug**: TypeScript error when iterating over `DataTransferItemList` or `FileList`:
```
Type 'DataTransferItemList' can only be iterated through when using '--downlevelIteration' flag or '--target' of 'es2015' or higher.
```

**Cause**: These DOM collection types don't implement standard array iteration protocols in TypeScript's default configuration.

**Fix**: Convert to array first:
```typescript
// ❌ WRONG - causes TypeScript error
for (const item of e.clipboardData.items) { ... }

// ✅ CORRECT - convert to array first
const items = Array.from(e.clipboardData.items);
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  ...
}
```

**Prevention**: Always use `Array.from()` when iterating over DOM collections like:
- `DataTransferItemList`
- `FileList`
- `HTMLCollection`
- `NodeList`

---

### BUG-TS-002: File Read Before Edit

**Bug**: Error when trying to edit a file not recently read:
```
File has not been read yet. Read it first before writing to it.
```

**Cause**: Claude Code requires reading a file before editing to ensure context.

**Fix**: Always read file before editing:
```typescript
// 1. Read first
const content = await readFile(path);
// 2. Then edit
await editFile(path, oldString, newString);
```

**Prevention**: In development workflow, always read files before making changes.

---

## API Integration Issues

### BUG-API-001: Anthropic SDK Cache Corruption

**Bug**: After installing `@anthropic-ai/sdk`, dev server crashes with:
```
Cannot find module './vendor-chunks/@anthropic-ai.js'
Require stack: .next/server/webpack-runtime.js
```

**Cause**: Next.js webpack cache becomes corrupted when new packages are installed, especially packages with complex dependencies.

**Fix**:
```bash
# Kill dev server (Ctrl+C)
rm -rf .next
npm run dev
```

**Prevention**: After running `npm install <package>`, always restart the dev server. If issues persist, clear the `.next` cache directory.

---

### BUG-API-002: Blob URL Not Persisting Across Refresh

**Bug**: Uploaded image displays correctly but disappears after page refresh.

**Cause**: Blob URLs (e.g., `blob:http://localhost:3000/abc-123`) are temporary and tied to the browser session. They cannot be stored in localStorage.

**Fix**: Convert to base64 data URL before storing:
```typescript
// ❌ WRONG - blob URL doesn't persist
const previewUrl = URL.createObjectURL(file);
localStorage.setItem('image', previewUrl);

// ✅ CORRECT - base64 data URL persists
const reader = new FileReader();
reader.onload = () => {
  const dataUrl = reader.result as string; // "data:image/png;base64,..."
  localStorage.setItem('image', dataUrl);
};
reader.readAsDataURL(file);
```

**Prevention**: When storing images in localStorage or state that needs to persist:
1. Use base64 data URLs, not blob URLs
2. Be aware of localStorage size limits (~5MB)
3. Consider IndexedDB for larger files

---

### BUG-API-003: Yahoo Finance Response Format

**Bug**: Yahoo Finance API calls return unexpected structure, causing undefined errors.

**Cause**: The `yahoo-finance2` package returns different structures for different methods. The `chart()` method returns `{ quotes: [...] }` not a direct array.

**Fix**:
```typescript
// ❌ WRONG - incorrect destructuring
const result = await yahooFinance.chart(ticker, options);
const bars = result; // Error: result is an object

// ✅ CORRECT - access quotes property
const result = await yahooFinance.chart(ticker, options);
const quotes = result?.quotes || [];
```

**Prevention**:
1. Always check the yahoo-finance2 documentation for response format
2. Use optional chaining (`?.`) and nullish coalescing (`||`)
3. Add type annotations to catch issues early

---

### BUG-API-004: Supabase Connection in Development

**Bug**: Supabase queries fail silently or return empty results.

**Cause**: Missing or incorrect environment variables for Supabase connection.

**Fix**:
1. Check `.env.local` has correct values:
```
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```
2. Run connection test:
```bash
npx tsx src/lib/supabase/test-connection.ts
```

**Prevention**:
1. Always run connection test after setting up Supabase
2. Use environment variable validation at startup
3. Check Supabase dashboard for RLS policy issues

---

### BUG-API-005: Yahoo Finance Earnings Date Format

**Bug**: Earnings date returned as array instead of single value, causing undefined errors.

**Cause**: Yahoo Finance `quoteSummary` returns `earningsDate` as an array of possible dates (confirmed and unconfirmed).

**Fix**:
```typescript
// ❌ WRONG - earningsDate is an array
const earningsDate = result.calendarEvents.earnings.earningsDate;

// ✅ CORRECT - take first element from array
const earnings = result?.calendarEvents?.earnings;
if (earnings?.earningsDate && Array.isArray(earnings.earningsDate)) {
  const earningsDate = earnings.earningsDate[0]; // First date
}
```

**Prevention**:
1. Always check Yahoo Finance response types
2. Use optional chaining and array checks
3. Handle missing/null earnings data gracefully (return -1 for "unknown")

---

## React / UI Issues

### BUG-UI-001: Image Not Filling Container

**Bug**: Uploaded screenshot doesn't fill the full width/height of its container.

**Cause**: Fixed height constraints or missing flex properties.

**Fix**:
```typescript
// ❌ WRONG - fixed height constrains image
<div className="h-[520px]">
  <img src={url} className="w-full" />
</div>

// ✅ CORRECT - dynamic height for images
<div className={screenshotUrl ? "h-auto" : "h-[520px]"}>
  <img src={url} className="w-full" />
</div>
```

**Prevention**: When displaying user-uploaded images:
1. Use `h-auto` to let image determine height
2. Use `w-full` for full width
3. Use `object-contain` to maintain aspect ratio

---

### BUG-UI-002: Fast Refresh Full Reload

**Bug**: Development shows warning:
```
⚠ Fast Refresh had to perform a full reload
```

**Cause**: Various reasons including:
- Exporting non-components from component files
- Syntax errors during save
- State initialization issues
- Module resolution problems

**Fix**: Usually resolves on its own. If persistent:
1. Save file again
2. Clear `.next` cache: `rm -rf .next && npm run dev`
3. Check for circular imports

**Prevention**:
1. Keep component files focused (one component per file)
2. Export types from separate files
3. Avoid side effects at module level

---

### BUG-UI-003: useState Not Persisting Across Navigation

**Bug**: Component state resets when navigating away and back.

**Cause**: React state is tied to component lifecycle; navigation unmounts/remounts components.

**Fix**: Use persistent storage:
```typescript
// For session persistence
useEffect(() => {
  const saved = localStorage.getItem('key');
  if (saved) setState(JSON.parse(saved));
}, []);

useEffect(() => {
  localStorage.setItem('key', JSON.stringify(state));
}, [state]);
```

**Prevention**: Decide upfront what state needs to persist:
- Session state → localStorage
- Global state → React Context or Zustand
- Server state → Supabase + SWR/React Query

---

## Data Flow Issues

### BUG-DATA-001: Import Error After File Deletion

**Bug**: After deleting a module file, build fails with:
```
Error: Failed to read source code from /path/to/deleted-file.ts
Import trace: ./other-file.ts
```

**Cause**: Index file or other modules still export/import the deleted file.

**Fix**:
1. Search for all imports of the deleted file:
```bash
grep -r "deleted-file" src/
```
2. Remove all export statements from index files
3. Remove all import statements from consuming files

**Prevention**:
1. Before deleting a file, grep for its usage
2. Update index.ts exports first
3. Run `npm run build` to catch broken imports

---

### BUG-DATA-002: Decimal.js Precision Loss

**Bug**: Financial calculations show unexpected results due to floating point arithmetic.

**Cause**: Mixing regular JavaScript numbers with Decimal.js operations.

**Fix**:
```typescript
// ❌ WRONG - mixing number and Decimal
const result = price * 0.02; // floating point
const decimal = new Decimal(result); // precision already lost

// ✅ CORRECT - use Decimal throughout
const price = new Decimal(100);
const result = price.times(0.02); // Decimal arithmetic
```

**Prevention**:
1. Import Decimal.js in all financial calculation modules
2. Convert to Decimal at data ingress points
3. Only use `.toNumber()` or `.toFixed()` for final display
4. Use helper function: `toDecimal(value)`

---

## Calculation Errors

### BUG-CALC-001: EMA Calculation with Insufficient Data

**Bug**: EMA calculation returns NaN or incorrect values.

**Cause**: Not enough data points for the EMA period.

**Fix**:
```typescript
function calculateEMA(values: number[], period: number): number[] {
  // ✅ Check for sufficient data
  if (values.length < period) {
    console.warn(`EMA requires ${period} values, got ${values.length}`);
    return [];
  }
  // ... calculation
}
```

**Prevention**:
1. Always validate data length before calculations
2. Fetch extra buffer data (e.g., request 35 days for 21 EMA)
3. Handle empty array returns gracefully

---

### BUG-CALC-002: ATR Division by Zero

**Bug**: ATR calculation fails when previous close is 0.

**Cause**: True Range calculation divides by previous close.

**Fix**:
```typescript
// ✅ Guard against division by zero
function calculateTR(high: number, low: number, prevClose: number): number {
  if (prevClose === 0) return high - low; // Fallback to simple range
  // ... normal calculation
}
```

**Prevention**: Always add guards for division operations.

---

## Quick Reference: Common Fixes

| Issue | Quick Fix |
|-------|-----------|
| Module not found after npm install | `rm -rf .next && npm run dev` |
| TypeScript iteration error | Use `Array.from()` |
| Image not persisting | Use base64 data URL, not blob URL |
| File edit fails | Read file first |
| Supabase query empty | Check .env.local and run test-connection.ts |
| EMA returns NaN | Check data length >= period |
| Financial precision | Use Decimal.js throughout |
| Earnings date undefined | Check if array, take first element |

---

## Pipeline / Real Data Issues

### BUG-PIPELINE-001: Delisted Ticker Errors (ANSS)

**Bug**: Yahoo Finance API throws error for ANSS ticker:
```
Error: No data found, symbol may be delisted
```

**Cause**: ANSS (Ansys Inc) may have been recently delisted or ticker symbol changed due to acquisition.

**Impact**: Non-critical - pipeline continues with remaining 103/104 tickers.

**Fix**: Remove ANSS from NASDAQ_100_TICKERS array in agent-pipeline.ts:
```typescript
// In NASDAQ_100_TICKERS array, remove 'ANSS'
```

**Prevention**:
1. Periodically validate ticker list against actual Nasdaq-100 composition
2. Add try/catch around individual ticker fetches (already implemented)
3. Log but don't fail when individual tickers are unavailable

---

### BUG-PIPELINE-002: Map Iteration TypeScript Error

**Bug**: TypeScript error when iterating over Map directly:
```
Type 'Map<string, T>' can only be iterated through when using '--downlevelIteration' flag
```

**Cause**: TypeScript's default configuration doesn't support direct Map iteration.

**Fix**: Use `Array.from()` to convert Map to iterable array:
```typescript
// ❌ WRONG - TypeScript error
for (const [key, value] of myMap) { ... }

// ✅ CORRECT - convert to array first
const entries = Array.from(myMap.entries());
for (const [key, value] of entries) { ... }
```

**Prevention**: Always use `Array.from()` when iterating over Maps in TypeScript.

---

---

## Discord Integration Issues

### BUG-DISCORD-001: "Used disallowed intents" Error

**Bug**: Discord bot fails to connect with error:
```
Error: Used disallowed intents
    at WebSocketShard.onClose
```

**Cause**: Discord bots require "Privileged Gateway Intents" to be manually enabled in the Discord Developer Portal. The `MessageContent` intent is privileged and disabled by default.

**Fix**:
1. Go to https://discord.com/developers/applications
2. Select your bot application → "Bot" tab
3. Scroll to "Privileged Gateway Intents"
4. Enable **"Message Content Intent"**
5. Save changes

**Files affected:**
- `src/lib/discord/client.ts` (uses `GatewayIntentBits.MessageContent`)

**Prevention**: When setting up a new Discord bot:
1. Always enable Message Content Intent if reading message text
2. Document required intents in README/setup instructions

---

### BUG-API-006: Yahoo Finance v3 API Change

**Bug**: Yahoo Finance API calls fail with:
```
Error: Call `const yahooFinance = new YahooFinance()` first.
Upgrading from v2? See https://github.com/gadicc/yahoo-finance2/blob/dev/docs/UPGRADING.md
```

**Cause**: `yahoo-finance2` v3 changed from a default export function to requiring class instantiation.

**Fix**:
```typescript
// ❌ WRONG - v2 style (deprecated)
import yahooFinance from "yahoo-finance2";
yahooFinance.chart(ticker, options);

// ✅ CORRECT - v3 style
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance();
yahooFinance.chart(ticker, options);
```

**Files affected:**
- `src/lib/backtest/data-loader.ts`

**Prevention**:
1. Check package changelogs after major version updates
2. Pin package versions in package.json if stability is critical

---

### BUG-DB-001: Missing Database Column Error

**Bug**: Gmail import fails with:
```
Could not find the 'images_analyzed' column of 'daily_reports' in the schema cache
```

**Cause**: Database migration had not been run after adding new columns.

**Fix**: Run the migration in Supabase SQL editor:
```sql
-- From supabase/migrations/20260121_add_image_data_columns.sql
```

**Prevention**:
1. Always run migrations after pulling code changes
2. Add migration status check to startup
3. Document required migrations in deployment checklist

---

*Last updated: January 2026*
