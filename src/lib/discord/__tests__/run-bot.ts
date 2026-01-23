/**
 * Discord Bot Runner
 *
 * Run with: npx tsx src/lib/discord/__tests__/run-bot.ts [command]
 *
 * Commands:
 *   listen   - Start the bot and listen for new messages (default)
 *   sync     - Sync historical messages and exit
 *   test     - Test parsing with sample messages
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createDiscordBot } from "../client";
import { testParser as testEquityParser } from "../parsers/equity-trades";
import { testParser as testJournalParser } from "../parsers/alex-journal";
import { testParser as testPortfolioParser } from "../parsers/pf-update";

// =============================================================================
// Commands
// =============================================================================

async function commandListen(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║                    DISCORD BOT - LISTEN MODE                   ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log();

  const bot = createDiscordBot();

  // Handle shutdown
  process.on("SIGINT", async () => {
    console.log("\n[Bot] Shutting down...");
    await bot.disconnect();
    process.exit(0);
  });

  await bot.connect();

  // Wait for ready
  await new Promise<void>((resolve) => {
    const check = () => {
      if (bot.isConnected()) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });

  const status = bot.getStatus();
  console.log();
  console.log("Bot Status:");
  console.log(`  Connected: ${status.connected}`);
  console.log(`  Username:  ${status.username}`);
  console.log(`  Channels:  ${status.channels.join(", ")}`);
  console.log();
  console.log("Listening for new messages... (Press Ctrl+C to stop)");
  console.log("─".repeat(65));
}

async function commandSync(): Promise<void> {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║                    DISCORD BOT - SYNC MODE                     ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log();

  const limit = parseInt(process.argv[3] || "500", 10);
  console.log(`Syncing up to ${limit} messages per channel...`);
  console.log();

  const bot = createDiscordBot();
  await bot.connect();

  // Wait for ready
  await new Promise<void>((resolve) => {
    const check = () => {
      if (bot.isConnected()) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });

  console.log(`Connected as ${bot.getStatus().username}`);
  console.log();

  try {
    const results = await bot.syncAllChannels({ limit });

    console.log();
    console.log("─".repeat(65));
    console.log("SYNC RESULTS");
    console.log("─".repeat(65));

    let totalProcessed = 0;
    let totalSaved = 0;
    let totalErrors = 0;

    for (const result of results) {
      console.log(`\n#${result.channel}:`);
      console.log(`  Processed: ${result.messagesProcessed}`);
      console.log(`  Saved:     ${result.newRecords}`);
      console.log(`  Errors:    ${result.errors.length}`);

      totalProcessed += result.messagesProcessed;
      totalSaved += result.newRecords;
      totalErrors += result.errors.length;

      if (result.errors.length > 0) {
        console.log(`  Error details:`);
        for (const err of result.errors.slice(0, 5)) {
          console.log(`    - ${err}`);
        }
        if (result.errors.length > 5) {
          console.log(`    ... and ${result.errors.length - 5} more`);
        }
      }
    }

    console.log();
    console.log("─".repeat(65));
    console.log("TOTALS");
    console.log("─".repeat(65));
    console.log(`  Total Processed: ${totalProcessed}`);
    console.log(`  Total Saved:     ${totalSaved}`);
    console.log(`  Total Errors:    ${totalErrors}`);
  } finally {
    await bot.disconnect();
  }
}

function commandTest(): void {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║                    DISCORD PARSERS - TEST                      ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log();

  console.log("Testing Equity Trades Parser...");
  console.log();
  testEquityParser();

  console.log();
  console.log("Testing Journal Parser...");
  console.log();
  testJournalParser();

  console.log();
  console.log("Testing Portfolio Update Parser...");
  console.log();
  testPortfolioParser();
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const command = process.argv[2] || "listen";

  // Check required environment variables
  const requiredEnvVars = [
    "DISCORD_BOT_TOKEN",
    "DISCORD_GUILD_ID",
    "DISCORD_CHANNEL_EQUITY_TRADES",
    "DISCORD_CHANNEL_ALEX_JOURNAL",
    "DISCORD_CHANNEL_PF_UPDATE",
  ];

  if (command !== "test") {
    const missing = requiredEnvVars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      console.error("Missing required environment variables:");
      for (const v of missing) {
        console.error(`  - ${v}`);
      }
      console.error();
      console.error("Add these to your .env.local file:");
      console.error();
      console.error("  DISCORD_BOT_TOKEN=your_bot_token");
      console.error("  DISCORD_GUILD_ID=your_server_id");
      console.error("  DISCORD_CHANNEL_EQUITY_TRADES=channel_id");
      console.error("  DISCORD_CHANNEL_ALEX_JOURNAL=channel_id");
      console.error("  DISCORD_CHANNEL_PF_UPDATE=channel_id");
      process.exit(1);
    }
  }

  switch (command) {
    case "listen":
      await commandListen();
      break;
    case "sync":
      await commandSync();
      break;
    case "test":
      commandTest();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error();
      console.error("Usage: npx tsx src/lib/discord/__tests__/run-bot.ts [command]");
      console.error();
      console.error("Commands:");
      console.error("  listen   - Start the bot and listen for new messages (default)");
      console.error("  sync     - Sync historical messages and exit");
      console.error("  test     - Test parsing with sample messages");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
