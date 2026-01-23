/**
 * Discord Sync API Endpoint
 *
 * POST /api/discord/sync
 * Triggers a sync of Discord channels to import historical messages.
 *
 * Query params:
 * - channel: specific channel to sync (equity-trades, alex-journal, pf-update, all)
 * - limit: max messages to fetch (default 100)
 */

import { NextRequest, NextResponse } from "next/server";
import { createDiscordBot, DiscordBot } from "@/lib/discord/client";

// Singleton bot instance for API calls
let bot: DiscordBot | null = null;

async function getBot(): Promise<DiscordBot> {
  if (!bot) {
    bot = createDiscordBot();
    await bot.connect();
    // Wait for ready state
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (bot?.isConnected()) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }
  return bot;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel") || "all";
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    // Validate channel parameter
    const validChannels = ["equity-trades", "alex-journal", "pf-update", "all"];
    if (!validChannels.includes(channel)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid channel. Must be one of: ${validChannels.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Get channel IDs from environment
    const channelMap: Record<string, string | undefined> = {
      "equity-trades": process.env.DISCORD_CHANNEL_EQUITY_TRADES,
      "alex-journal": process.env.DISCORD_CHANNEL_ALEX_JOURNAL,
      "pf-update": process.env.DISCORD_CHANNEL_PF_UPDATE,
    };

    // Get or create bot instance
    const discordBot = await getBot();

    let results;
    if (channel === "all") {
      results = await discordBot.syncAllChannels({ limit });
    } else {
      const channelId = channelMap[channel];
      if (!channelId) {
        return NextResponse.json(
          {
            success: false,
            error: `Channel ${channel} not configured`,
          },
          { status: 400 }
        );
      }

      const result = await discordBot.syncChannel(channelId, { limit });
      results = [result];
    }

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => ({
        messagesProcessed: acc.messagesProcessed + r.messagesProcessed,
        newRecords: acc.newRecords + r.newRecords,
        errors: [...acc.errors, ...r.errors],
      }),
      { messagesProcessed: 0, newRecords: 0, errors: [] as string[] }
    );

    return NextResponse.json({
      success: true,
      results,
      totals,
    });
  } catch (error) {
    console.error("[Discord Sync API] Error:", error);

    // Clean up bot on error
    if (bot) {
      await bot.disconnect();
      bot = null;
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Return sync status
    if (bot && bot.isConnected()) {
      const status = bot.getStatus();
      return NextResponse.json({
        success: true,
        connected: true,
        status,
      });
    }

    return NextResponse.json({
      success: true,
      connected: false,
      status: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
