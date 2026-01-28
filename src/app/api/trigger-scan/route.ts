/**
 * Trigger Scan API - Fire and Forget
 *
 * Returns immediately (< 1 second) while triggering the daily scan
 * in the background. Designed for external cron services with short timeouts.
 *
 * POST /api/trigger-scan
 */

import { NextResponse } from 'next/server';

export async function POST() {
  const timestamp = new Date().toISOString();

  // Fire and forget - trigger scan without waiting
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ai-trading-agent-lake.vercel.app';

  fetch(`${baseUrl}/api/daily-scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).catch(err => {
    console.error('[TriggerScan] Background scan error:', err);
  });

  console.log(`[TriggerScan] Scan triggered at ${timestamp}`);

  // Return immediately
  return NextResponse.json({
    success: true,
    message: 'Daily scan triggered in background',
    triggered_at: timestamp,
    note: 'Scan runs for ~5 minutes. Check /api/daily-scan for results.',
  });
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Use POST to trigger a background daily scan',
    endpoint: '/api/trigger-scan',
  });
}
