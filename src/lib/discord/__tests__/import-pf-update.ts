/**
 * Import Portfolio Updates from JSON Export
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { parsePortfolioUpdate } from "../parsers/pf-update";

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
  const filePath = path.join(process.cwd(), "data/discord-exports/pf-update.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const channelId = data.channel.id;

  let imported = 0;
  let skipped = 0;
  let total = 0;

  console.log("Importing pf-update.json...");

  for (const msg of data.messages as DiscordMessage[]) {
    if (msg.author.isBot || !msg.content.trim()) continue;
    total++;

    const content = msg.content.replace(/@everyone/g, "").replace(/@here/g, "").trim();
    if (content.length < 20) {
      skipped++;
      continue;
    }

    const messageDate = new Date(msg.timestamp);
    const parseResult = parsePortfolioUpdate(content, messageDate);
    if (!parseResult.success || !parseResult.update) {
      skipped++;
      continue;
    }

    const update = parseResult.update;

    const { error } = await supabase.from("discord_portfolio_updates").upsert({
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
