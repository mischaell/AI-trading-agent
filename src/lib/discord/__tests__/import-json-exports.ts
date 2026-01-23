/**
 * Import Discord JSON Exports
 *
 * Parses exported JSON files from DiscordChatExporter and imports to database.
 *
 * Run with: npx tsx src/lib/discord/__tests__/import-json-exports.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseEquityTrade } from "../parsers/equity-trades";
import { parseJournalEntry } from "../parsers/alex-journal";
import { parsePortfolioUpdate } from "../parsers/pf-update";

// =============================================================================
// Types
// =============================================================================

interface DiscordExport {
  guild: { id: string; name: string };
  channel: { id: string; name: string };
  messages: DiscordMessage[];
}

interface DiscordMessage {
  id: string;
  type: string;
  timestamp: string;
  content: string;
  author: {
    id: string;
    name: string;
    isBot: boolean;
  };
}

interface ImportResult {
  file: string;
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

// =============================================================================
// Supabase Client
// =============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// =============================================================================
// Import Functions
// =============================================================================

async function importEquityTrades(filePath: string): Promise<ImportResult> {
  const result: ImportResult = {
    file: path.basename(filePath),
    total: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  const data: DiscordExport = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const channelId = data.channel.id;

  for (const msg of data.messages) {
    if (msg.author.isBot || !msg.content.trim()) continue;
    result.total++;

    // Clean content (remove @everyone, etc.)
    const content = msg.content
      .replace(/@everyone/g, "")
      .replace(/@here/g, "")
      .trim();

    const parseResult = parseEquityTrade(content);
    if (!parseResult.success || !parseResult.trade) {
      result.skipped++;
      continue;
    }

    const trade = parseResult.trade;
    const tradeDate = trade.trade_date || msg.timestamp.split("T")[0];

    const record = {
      discord_message_id: msg.id,
      discord_channel_id: channelId,
      discord_author_id: msg.author.id,
      message_timestamp: msg.timestamp,
      trade_date: tradeDate,
      action: trade.action,
      side: trade.side,
      ticker: trade.ticker,
      entry_price: trade.entry_price || null,
      position_pct: trade.position_pct || null,
      ssl: trade.ssl || null,
      ec_risk_pct: trade.ec_risk_pct || null,
      trim_fraction: trade.trim_fraction || null,
      trim_target_r: trade.trim_target_r || null,
      trim_target_price: trade.trim_target_price || null,
      exit_price: trade.exit_price || null,
      gain_pct: trade.gain_pct || null,
      r_multiple: trade.r_multiple || null,
      raw_message: content,
      parse_confidence: trade.confidence,
    };

    const { error } = await supabase
      .from("discord_trades")
      .upsert(record, { onConflict: "discord_message_id" });

    if (error) {
      result.errors.push(`${msg.id}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return result;
}

async function importJournalEntries(filePath: string): Promise<ImportResult> {
  const result: ImportResult = {
    file: path.basename(filePath),
    total: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  const data: DiscordExport = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const channelId = data.channel.id;

  for (const msg of data.messages) {
    if (msg.author.isBot || !msg.content.trim()) continue;
    result.total++;

    const content = msg.content
      .replace(/@everyone/g, "")
      .replace(/@here/g, "")
      .trim();

    // Skip very short messages
    if (content.length < 10) {
      result.skipped++;
      continue;
    }

    const parseResult = parseJournalEntry(content);
    if (!parseResult.success || !parseResult.entry) {
      result.skipped++;
      continue;
    }

    const entry = parseResult.entry;
    const entryDate = msg.timestamp.split("T")[0];

    const record = {
      discord_message_id: msg.id,
      discord_channel_id: channelId,
      discord_author_id: msg.author.id,
      message_timestamp: msg.timestamp,
      entry_date: entryDate,
      ticker: entry.ticker,
      action: entry.action,
      setup_type: entry.setup_type || null,
      mode: entry.mode || null,
      reasoning: entry.reasoning,
      trigger_text: entry.trigger || null,
      risk_note: entry.risk_note || null,
      chart_mentioned: entry.chart_mentioned,
      raw_message: content,
      parse_confidence: entry.confidence,
    };

    const { error } = await supabase
      .from("discord_journal")
      .upsert(record, { onConflict: "discord_message_id" });

    if (error) {
      result.errors.push(`${msg.id}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return result;
}

async function importPortfolioUpdates(filePath: string): Promise<ImportResult> {
  const result: ImportResult = {
    file: path.basename(filePath),
    total: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  const data: DiscordExport = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const channelId = data.channel.id;

  for (const msg of data.messages) {
    if (msg.author.isBot || !msg.content.trim()) continue;
    result.total++;

    const content = msg.content
      .replace(/@everyone/g, "")
      .replace(/@here/g, "")
      .trim();

    // Skip very short messages
    if (content.length < 20) {
      result.skipped++;
      continue;
    }

    const messageDate = new Date(msg.timestamp);
    const parseResult = parsePortfolioUpdate(content, messageDate);
    if (!parseResult.success || !parseResult.update) {
      result.skipped++;
      continue;
    }

    const update = parseResult.update;

    const record = {
      discord_message_id: msg.id,
      discord_channel_id: channelId,
      discord_author_id: msg.author.id,
      message_timestamp: msg.timestamp,
      update_date: update.update_date,
      commentary: update.commentary,
      sentiment: update.sentiment,
      sentiment_score: update.sentiment_score,
      tickers_mentioned: update.tickers_mentioned,
      key_points: update.key_points,
      performance_mentions: update.performance_mentions,
      lessons: update.lessons,
      decisions: update.decisions,
      market_state_mentioned: update.market_state_mentioned || null,
      exposure_mentioned: update.exposure_mentioned || null,
      raw_message: content,
      parse_confidence: update.confidence,
      word_count: update.word_count,
    };

    const { error } = await supabase
      .from("discord_portfolio_updates")
      .upsert(record, { onConflict: "discord_message_id" });

    if (error) {
      result.errors.push(`${msg.id}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return result;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║              DISCORD JSON EXPORT IMPORTER                      ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log();

  const exportDir = path.join(process.cwd(), "data/discord-exports");

  if (!fs.existsSync(exportDir)) {
    console.error("Export directory not found:", exportDir);
    process.exit(1);
  }

  const results: ImportResult[] = [];

  // Import equity trades
  const equityFile = path.join(exportDir, "equity-trades.json");
  if (fs.existsSync(equityFile)) {
    console.log("Importing equity-trades.json...");
    const result = await importEquityTrades(equityFile);
    results.push(result);
    console.log(`  ✓ ${result.imported}/${result.total} imported (${result.skipped} skipped)`);
  }

  // Import journal entries
  const journalFile = path.join(exportDir, "alex-journal.json");
  if (fs.existsSync(journalFile)) {
    console.log("Importing alex-journal.json...");
    const result = await importJournalEntries(journalFile);
    results.push(result);
    console.log(`  ✓ ${result.imported}/${result.total} imported (${result.skipped} skipped)`);
  }

  // Import portfolio updates
  const pfFile = path.join(exportDir, "pf-update.json");
  if (fs.existsSync(pfFile)) {
    console.log("Importing pf-update.json...");
    const result = await importPortfolioUpdates(pfFile);
    results.push(result);
    console.log(`  ✓ ${result.imported}/${result.total} imported (${result.skipped} skipped)`);
  }

  // Summary
  console.log();
  console.log("═".repeat(65));
  console.log("IMPORT SUMMARY");
  console.log("═".repeat(65));

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const r of results) {
    console.log(`\n${r.file}:`);
    console.log(`  Total messages: ${r.total}`);
    console.log(`  Imported:       ${r.imported}`);
    console.log(`  Skipped:        ${r.skipped}`);
    console.log(`  Errors:         ${r.errors.length}`);

    totalImported += r.imported;
    totalSkipped += r.skipped;
    totalErrors += r.errors.length;

    if (r.errors.length > 0 && r.errors.length <= 5) {
      console.log("  Error details:");
      for (const err of r.errors) {
        console.log(`    - ${err}`);
      }
    }
  }

  console.log();
  console.log("─".repeat(65));
  console.log(`TOTAL: ${totalImported} imported, ${totalSkipped} skipped, ${totalErrors} errors`);
  console.log("─".repeat(65));
}

main().catch(console.error);
