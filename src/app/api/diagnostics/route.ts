/**
 * Pipeline Diagnostics API
 *
 * GET /api/diagnostics
 *
 * Returns health status of every pipeline component:
 * - Supabase connectivity
 * - Cache states (daily scan, universe, focus list, market snapshots)
 * - Cron job status
 * - Portfolio/trades summary
 * - Active fallbacks
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  getDailyScanCache,
  getUniverseCache,
  getFocusListCache,
  getLatestMarketSnapshot,
  getPositions,
  getRecentTrades,
} from '@/lib/supabase';

// 26 hours = allows for weekends without false alarms
const STALE_THRESHOLD_MS = 26 * 60 * 60 * 1000;

function ageHours(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
}

function isStale(dateStr: string | null | undefined): boolean {
  if (!dateStr) return true;
  return Date.now() - new Date(dateStr).getTime() > STALE_THRESHOLD_MS;
}

interface CacheStatus {
  last_date: string | null;
  age_hours: number | null;
  stale: boolean;
  [key: string]: unknown;
}

export async function GET() {
  const start = Date.now();
  const fallbacks: string[] = [];

  // ── Supabase connectivity ──────────────────────────────────────────────
  let supabaseStatus: { connected: boolean; latency_ms: number | null; error?: string } = {
    connected: false,
    latency_ms: null,
  };

  if (!isSupabaseConfigured()) {
    supabaseStatus.error = 'Not configured (missing env vars)';
    fallbacks.push('Supabase not configured — portfolio, trades, and all caches unavailable');
  } else {
    const sbStart = Date.now();
    try {
      // Simple connectivity test via positions query
      await getPositions();
      supabaseStatus = { connected: true, latency_ms: Date.now() - sbStart };
    } catch (err) {
      supabaseStatus = { connected: false, latency_ms: Date.now() - sbStart, error: String(err) };
      fallbacks.push('Supabase connection failed — all DB-backed features degraded');
    }
  }

  // ── Cache states ───────────────────────────────────────────────────────
  let dailyScan: CacheStatus = { last_date: null, age_hours: null, stale: true, leader_count: 0 };
  let universe: CacheStatus = { last_date: null, age_hours: null, stale: true, ticker_count: 0 };
  let focusList: CacheStatus = { last_date: null, age_hours: null, stale: true, top5: [], candidate_count: 0 };
  let marketSnapshot: CacheStatus = { last_date: null, age_hours: null, stale: true, state: null };

  if (supabaseStatus.connected) {
    // Daily scan cache
    try {
      const ds = await getDailyScanCache();
      if (ds) {
        dailyScan = {
          last_date: ds.scan_date,
          age_hours: ageHours(ds.scan_timestamp || ds.scan_date),
          stale: isStale(ds.scan_timestamp || ds.scan_date),
          leader_count: ds.liquid_leaders?.length ?? 0,
          elapsed: ds.elapsed,
        };
      }
    } catch { /* keep defaults */ }

    if (dailyScan.stale) {
      fallbacks.push(
        dailyScan.last_date
          ? `Task 2: daily_scan_cache is ${dailyScan.age_hours}h old — may use stale data`
          : 'Task 2: no daily_scan_cache — will use Nasdaq-100 fallback'
      );
    }

    // Universe cache
    try {
      const uc = await getUniverseCache();
      if (uc) {
        universe = {
          last_date: uc.cache_date,
          age_hours: ageHours(uc.cache_date),
          stale: isStale(uc.cache_date),
          ticker_count: uc.tickers?.length ?? 0,
        };
      }
    } catch { /* keep defaults */ }

    if (universe.stale) {
      fallbacks.push(
        universe.last_date
          ? `Task 2: universe_cache is ${universe.age_hours}h old`
          : 'Task 2: no universe_cache'
      );
    }

    // Focus list cache
    try {
      const fl = await getFocusListCache();
      if (fl) {
        focusList = {
          last_date: fl.cache_date,
          age_hours: ageHours(fl.cache_date),
          stale: isStale(fl.cache_date),
          top5: fl.top5 ?? [],
          candidate_count: fl.candidates?.length ?? 0,
        };
      }
    } catch { /* keep defaults */ }

    if (focusList.stale) {
      fallbacks.push(
        focusList.last_date
          ? `Task 5: focus_list_cache is ${focusList.age_hours}h old`
          : 'Task 5: no focus_list_cache — focus list will be empty on initial load'
      );
    }

    // Market snapshot
    try {
      const ms = await getLatestMarketSnapshot();
      if (ms) {
        marketSnapshot = {
          last_date: ms.snapshot_date,
          age_hours: ageHours(ms.snapshot_date),
          stale: isStale(ms.snapshot_date),
          state: ms.market_state ?? null,
          mco_z: ms.mco_z_score ?? null,
          mcsi_z: ms.mcsi_z_score ?? null,
        };
      }
    } catch { /* keep defaults */ }

    if (marketSnapshot.stale) {
      fallbacks.push(
        'Task 1/6: no recent market snapshot — will use default permissions (new_entries=YES, adds=true, pressing=false)'
      );
    }
  }

  // ── Pipeline data ──────────────────────────────────────────────────────
  let positionsCount = 0;
  let positionTickers: string[] = [];
  let recentTradesCount = 0;
  let lastTradeAt: string | null = null;

  if (supabaseStatus.connected) {
    try {
      const positions = await getPositions();
      positionsCount = positions.length;
      positionTickers = positions.map(p => p.ticker);
    } catch { /* keep defaults */ }

    try {
      const trades = await getRecentTrades(24);
      recentTradesCount = trades.length;
      if (trades.length > 0) {
        lastTradeAt = trades[0].executed_at ?? null;
      }
    } catch { /* keep defaults */ }
  }

  // ── Cron status ────────────────────────────────────────────────────────
  const cronSchedule = '0 2 * * 1-5 UTC (9 PM ET weekdays)';
  let nextExpected: string | null = null;

  if (dailyScan.last_date) {
    // Compute next expected weekday scan
    const last = new Date(dailyScan.last_date as string);
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    // Skip to next weekday
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
    next.setUTCHours(2, 0, 0, 0);
    nextExpected = next.toISOString();
  }

  // ── Overall status ─────────────────────────────────────────────────────
  let overall: 'healthy' | 'degraded' | 'down' = 'healthy';
  if (!supabaseStatus.connected) {
    overall = 'down';
  } else if (fallbacks.length > 0) {
    overall = 'degraded';
  }

  const elapsed = Date.now() - start;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    overall,
    elapsed_ms: elapsed,
    supabase: supabaseStatus,
    caches: {
      daily_scan: dailyScan,
      universe,
      focus_list: focusList,
      market_snapshot: marketSnapshot,
    },
    cron: {
      last_scan_date: dailyScan.last_date,
      schedule: cronSchedule,
      next_expected: nextExpected,
    },
    pipeline: {
      positions_count: positionsCount,
      position_tickers: positionTickers,
      recent_trades_count: recentTradesCount,
      last_trade_at: lastTradeAt,
    },
    fallbacks_active: fallbacks,
  });
}
