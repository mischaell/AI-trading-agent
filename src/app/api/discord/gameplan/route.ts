/**
 * Discord Gameplan Sync API
 *
 * POST /api/discord/gameplan - Fetch & parse latest gameplan-focuslist messages
 * GET  /api/discord/gameplan - Get latest Top Ideas from DB
 *
 * Uses REST API (no WebSocket) — works on Vercel.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncGameplanChannel, getLatestTopIdeas } from "@/lib/discord/rest-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 10;

    console.log(`[Discord Gameplan] Syncing last ${limit} messages...`);
    const result = await syncGameplanChannel({ limit });

    console.log(
      `[Discord Gameplan] Done: ${result.gameplansParsed} parsed, ${result.saved} saved, top ideas: ${result.topIdeas.join(", ")}`
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Discord Gameplan] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const data = await getLatestTopIdeas();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Discord Gameplan] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
