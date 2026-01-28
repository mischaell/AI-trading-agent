/**
 * Nightly Scan Cron Job
 *
 * Runs automatically at 2 AM UTC (9 PM ET) on weekdays via Vercel Cron.
 * Triggers the daily universe scan and caches results to Supabase.
 *
 * Schedule: "0 2 * * 1-5" (Mon-Fri at 2:00 AM UTC)
 */

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-initialize Supabase client (avoids module load errors if env vars missing)
function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('[Cron] Missing Supabase credentials');
    return null;
  }
  return createClient(url, key);
}

interface ScanResult {
  success: boolean;
  timestamp: string;
  elapsed: string;
  stats: {
    nasdaqTotal: number;
    nyseTotal: number;
    combinedTotal: number;
    preFiltered: number;
    afterNameFilter: number;
    withData: number;
    passedFilters: number;
    liquidLeaders: number;
  };
  liquidLeaders: Array<{
    ticker: string;
    name: string;
    rs: number;
    price: number;
    liquidityM: number;
    volumeM: number;
    marketCapB: number;
    adrPct: number;
    is21EmaAdvancing: boolean;
    is10WmaAdvancing: boolean;
  }>;
  allPassed: Array<{
    ticker: string;
    name: string;
    rs: number;
    price: number;
    liquidityM: number;
    volumeM: number;
    marketCapB: number;
    adrPct: number;
    is21EmaAdvancing: boolean;
    is10WmaAdvancing: boolean;
  }>;
}

/**
 * GET /api/cron/nightly-scan
 *
 * This endpoint is called by Vercel Cron.
 * It triggers the daily scan and saves results to Supabase.
 */
export async function GET(request: Request) {
  const startTime = Date.now();

  // Verify this is a legitimate cron request from Vercel
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without auth
    if (process.env.NODE_ENV === 'production') {
      console.log('[Cron] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  console.log('[Cron] Starting nightly scan...');

  try {
    // Step 1: Trigger the daily scan API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const scanResponse = await fetch(`${baseUrl}/api/daily-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!scanResponse.ok) {
      throw new Error(`Daily scan failed with status ${scanResponse.status}`);
    }

    const scanResult: ScanResult = await scanResponse.json();

    if (!scanResult.success) {
      throw new Error('Daily scan returned success=false');
    }

    console.log(`[Cron] Scan complete: ${scanResult.stats.liquidLeaders} liquid leaders`);

    // Step 2: Cache results to Supabase
    const cacheData = {
      scan_date: new Date().toISOString().split('T')[0],
      scan_timestamp: scanResult.timestamp,
      stats: scanResult.stats,
      liquid_leaders: scanResult.liquidLeaders,
      all_passed: scanResult.allPassed,
      elapsed: scanResult.elapsed,
    };

    // Upsert to cache table (create if not exists)
    const supabase = getSupabaseClient();
    let upsertError = null;

    if (supabase) {
      const result = await supabase
        .from('daily_scan_cache')
        .upsert(cacheData, { onConflict: 'scan_date' });
      upsertError = result.error;
    }

    if (!supabase) {
      console.warn('[Cron] Supabase not configured - skipping cache');
    } else if (upsertError) {
      console.error('[Cron] Failed to cache results:', upsertError);
    } else {
      console.log('[Cron] Results cached to Supabase');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Cron] Complete in ${elapsed}s`);

    return NextResponse.json({
      success: true,
      message: 'Nightly scan completed',
      elapsed: `${elapsed}s`,
      stats: scanResult.stats,
      cached: !upsertError,
    });
  } catch (error) {
    console.error('[Cron] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      },
      { status: 500 }
    );
  }
}
