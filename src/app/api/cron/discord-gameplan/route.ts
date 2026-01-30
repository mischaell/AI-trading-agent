/**
 * Cron: Discord Gameplan Sync
 *
 * Fetches latest gameplan-focuslist messages via Discord REST API.
 * Runs at 4:30 AM UTC (11:30 PM ET) — after Alex posts evening gameplan.
 *
 * Schedule: "30 4 * * 2-6" (Tue-Sat for Mon-Fri posts)
 */

import { NextResponse } from "next/server";
import { syncGameplanChannel } from "@/lib/discord/rest-client";

export async function GET(request: Request) {
  const startTime = Date.now();

  // Verify cron authorization
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron Discord Gameplan] Starting sync...");
    const result = await syncGameplanChannel({ limit: 5 });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `[Cron Discord Gameplan] Done in ${elapsed}s: ${result.saved} saved, top ideas: ${result.topIdeas.join(", ")}`
    );

    return NextResponse.json({
      success: true,
      elapsed: `${elapsed}s`,
      ...result,
    });
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("[Cron Discord Gameplan] Error:", error);

    return NextResponse.json(
      {
        success: false,
        elapsed: `${elapsed}s`,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
