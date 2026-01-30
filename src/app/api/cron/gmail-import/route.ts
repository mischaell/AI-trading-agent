/**
 * Gmail Import Cron Job
 *
 * Runs at 4 AM UTC (11 PM ET) Tue-Sat to import Alex's newsletter
 * after it's sent ~10 PM ET (3 AM UTC).
 *
 * Schedule: "0 4 * * 2-6" (Tue-Sat at 4:00 AM UTC)
 */

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const startTime = Date.now();

  // Verify cron auth
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  console.log('[Cron] Starting Gmail import...');

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/gmail/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 1 }),
    });

    if (!response.ok) {
      throw new Error(`Gmail import failed with status ${response.status}`);
    }

    const result = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Cron] Gmail import complete in ${elapsed}s: imported=${result.imported}, skipped=${result.skipped}`);

    return NextResponse.json({
      success: true,
      message: 'Gmail import completed',
      elapsed: `${elapsed}s`,
      imported: result.imported,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error('[Cron] Gmail import error:', error);
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
