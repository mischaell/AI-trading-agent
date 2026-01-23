/**
 * Import Journal Entries from JSON Export
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { parseJournalEntry } from "../parsers/alex-journal";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface DiscordMessage {
  id: string;
  timestamp: string;
  content: string;
  author: { id: string; name: string; isBot: boolean };
}

async function main() {
  const filePath = path.join(process.cwd(), "data/discord-exports/alex-journal.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const channelId = data.channel.id;

  let imported = 0;
  let skipped = 0;
  let total = 0;

  console.log("Importing alex-journal.json...");

  for (const msg of data.messages as DiscordMessage[]) {
    if (msg.author.isBot || !msg.content.trim()) continue;
    total++;

    const content = msg.content.replace(/@everyone/g, "").replace(/@here/g, "").trim();
    if (content.length < 10) {
      skipped++;
      continue;
    }

    const parseResult = parseJournalEntry(content);
    if (!parseResult.success || !parseResult.entry) {
      skipped++;
      continue;
    }

    const entry = parseResult.entry;
    const entryDate = msg.timestamp.split("T")[0];

    const { error } = await supabase.from("discord_journal").upsert({
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
    }, { onConflict: "discord_message_id" });

    if (error) {
      console.error(`Error: ${msg.id}: ${error.message}`);
    } else {
      imported++;
    }
  }

  console.log(`Done! ${imported}/${total} imported (${skipped} skipped)`);
}

main().catch(console.error);
