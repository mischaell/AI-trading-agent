# Pipeline Diagnostics & Dependencies

## Pipeline Dependency Graph

```
Task 1: Market Analysis
  Input:  QQQE OHLC (Yahoo Finance, 35 bars)
          Breadth data (Supabase breadth table via getBreadthData())
  Output: MarketStateOutput (state, permissions, MCO/MCSI Z-scores)
  Deps:   None (runs first)

Task 2: Universe Scan (Liquid Leaders)
  Input:  Daily scan cache
          Lookup order: localStorage (24h) → Supabase daily_scan_cache → live /api/daily-scan
  Output: UniverseScanOutput (tickers[], leaders[], count)
  Deps:   None (independent of Task 1)

Task 3: Pullback Scan
  Input:  Task 2 leaders[] + live 60-day OHLC (Yahoo Finance)
  Output: PullbackScanOutput (candidates[] with structure analysis)
  Deps:   Task 2

Task 4: Entry Readiness
  Input:  Task 3 candidates[] + earnings data (financial APIs)
  Output: ReadinessOutput (rows[] with ready/not-ready, grade A/B/C)
  Deps:   Task 3

Task 5: Focus List Ranking
  Input:  Task 4 rows[] (or Supabase focus_list_cache fallback)
  Output: FocusListOutput (top5[], candidates[], manual_promotion)
  Deps:   Task 4

Task 6: Position Sizing & Risk Gate
  Input:  Task 1 permissions + Task 5 candidates[] + portfolio equity
  Output: SizingBatchOutput (sizing[] with PASS/WITHHOLD gate)
  Deps:   Task 1, Task 5

Task 7: Execution Plan
  Input:  Task 6 sizing[]
  Output: FullExecutionPlanOutput (passed[], withheld[])
  Deps:   Task 6

Task 8: Portfolio
  Input:  Supabase positions + trades tables + live prices
  Output: PortfolioOutput (positions[], total_pnl)
  Deps:   Supabase (independent of Tasks 1-7)

Task 9: Overview / Trades Today
  Input:  Supabase trades (last 24h)
  Output: OverviewOutput (trades_today[])
  Deps:   Supabase (independent of Tasks 1-7)
```

---

## Cache Layer Hierarchy

| Layer | TTL | Location | Key / Table |
|-------|-----|----------|-------------|
| In-memory | 1h | JS variables | `pipelineCache.rsData`, `.universeData`, `.structureData`, `.earningsData` |
| localStorage | 24h | Browser | `pipeline_daily_scan_cache` |
| Supabase | Persistent | PostgreSQL | `daily_scan_cache`, `universe_cache`, `focus_list_cache`, `market_snapshots` |

### Cache Lookup Order (Task 2 - Universe Scan)

```
1. In-memory pipelineCache.dailyScan  (TTL: 24h)
2. localStorage "pipeline_daily_scan_cache"  (TTL: 24h)
3. Supabase daily_scan_cache table  (persistent, written by cron + daily-scan API)
4. Live /api/daily-scan endpoint  (only if skipDailyScan=false)
5. Nasdaq-100 hardcoded fallback  (if live scan fails)
6. Empty array []  (if skipDailyScan=true and all caches empty)
```

### Cache Clear Functions

| Function | Clears | Keeps | Used By |
|----------|--------|-------|---------|
| `clearPipelineCache()` | All in-memory + localStorage | Supabase | EOD Refresh |
| `clearQuickCache()` | Structure + earnings + RS | Daily scan cache | Quick Refresh |

---

## Scan Modes

| Mode | Trigger | skipDailyScan | forceRefresh | Behavior | Time |
|------|---------|--------------|-------------|----------|------|
| Initial Load | Page mount | `true` | - | Cache only (localStorage → Supabase → empty) | <30s |
| EOD Refresh | Manual button | `false` | `true` | Clear all caches, run full /api/daily-scan | 3-5 min |
| Quick Refresh | Manual button | `true` | `false` | Keep daily scan cache, refresh Tasks 3-9 | 15-30s |

---

## Fallback Defaults

| Condition | Fallback Value | File:Line |
|-----------|----------------|-----------|
| No market snapshot | `{ new_entries: 'YES', adds: true, pressing: false, trims: true }` | agent-pipeline.ts:1811 |
| Daily scan API fails | Nasdaq-100 hardcoded list, top 40 by RS | agent-pipeline.ts:1349-1394 |
| skipDailyScan + no Supabase cache | `dailyScanResults = []` → empty universe → empty downstream | agent-pipeline.ts:1333 |
| Structure data missing | `ema21_low = price * 0.98` | agent-pipeline.ts:1800 |
| ATR missing | `atr14 = price * 0.02` | agent-pipeline.ts:1801 |
| Earnings data missing | `earningsDays = 30` | agent-pipeline.ts:1642 |
| RS data missing | `rs = 50` | agent-pipeline.ts:1726 |
| Supabase not configured | `positions = [], trades = []` | agent-pipeline.ts:1073,1103,1121 |
| Pipeline equity not set | `$100,000` | agent-pipeline.ts:189 |
| Pipeline cash not set | `$50,000` | agent-pipeline.ts:190 |
| EMA high missing | `price` (current) | agent-pipeline.ts:1662 |
| EMA close missing | `price * 0.99` | agent-pipeline.ts:1663 |
| EMA low missing | `price * 0.98` | agent-pipeline.ts:1664 |

---

## API Endpoints

| Endpoint | Method | Purpose | Max Duration | Auth |
|----------|--------|---------|-------------|------|
| `/api/daily-scan` | POST | Full Nasdaq+NYSE universe scan | 300s | None |
| `/api/trigger-scan` | POST | Fire-and-forget scan trigger | 10s | None |
| `/api/cron/nightly-scan` | GET | Vercel Cron handler (scans + caches to Supabase) | 300s | `CRON_SECRET` |
| `/api/diagnostics` | GET | Pipeline health check | 10s | None |

### Cron Schedule

- **Schedule:** `0 2 * * 1-5` (2 AM UTC = 9 PM ET, Mon-Fri)
- **Configured in:** `vercel.json` → `crons[]`
- **Requires:** Vercel Pro plan for automatic scheduling; free plan uses external cron (cron-job.org)
- **External cron target:** `POST /api/trigger-scan`

---

## Supabase Tables

| Table | Purpose | Primary Key | Written By | Read By |
|-------|---------|-------------|-----------|---------|
| `daily_scan_cache` | Nightly scan results | `scan_date` | cron route, daily-scan API | Pipeline Task 2 |
| `universe_cache` | Filtered universe leaders | `cache_date` | Pipeline Task 2 | Dashboard display |
| `focus_list_cache` | Ranked focus list | `cache_date` | Pipeline Task 5 | Pipeline Task 5 (fallback) |
| `market_snapshots` | Historical market state | `snapshot_date` | Pipeline Task 1 | Dashboard history |
| `positions` | Open trading positions | `id` | Trade execution | Pipeline Task 8 |
| `trades` | Trade execution log | `id` | Trade execution | Pipeline Tasks 8-9 |
| `breadth` | MCO/MCSI Z-scores | `date` | External import | Pipeline Task 1 |

---

## Troubleshooting

### Empty Focus List / Liquid Leaders
1. Hit `/api/diagnostics` — check `caches.daily_scan.stale`
2. If stale/empty → Run EOD Refresh (button in dashboard)
3. If EOD Refresh fails → Check `/api/daily-scan` POST response directly

### Cron Not Running
1. Check Vercel dashboard → Cron Jobs tab
2. Verify `CRON_SECRET` env var is set in Vercel
3. For free plan: check cron-job.org → verify POST to `/api/trigger-scan`

### All Candidates WITHHELD
1. Check `/api/diagnostics` → `caches.market_snapshot.state`
2. If BREAKDOWN or WASHOUT → regime forbids new entries (correct behavior)
3. If state looks wrong → check breadth data freshness

### "No cached data" on Initial Load
1. Normal on first deploy — run EOD Refresh once to seed caches
2. After that, Supabase cache persists across deploys/devices

### Pipeline Runs But Returns Empty
1. Check `/api/diagnostics` → `fallbacks_active` array
2. Each active fallback explains what data is missing and why
3. Most common fix: run EOD Refresh to populate all caches

---

*Last updated: 2026-01-28*
