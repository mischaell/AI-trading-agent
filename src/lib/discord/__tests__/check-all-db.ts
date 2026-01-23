/**
 * Check all Discord tables in database
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  // Check trades
  console.log("═".repeat(60));
  console.log("DISCORD TRADES");
  console.log("═".repeat(60));
  const { data: trades } = await supabase
    .from("discord_trades")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!trades || trades.length === 0) {
    console.log("  No trades found.\n");
  } else {
    for (const t of trades) {
      console.log(`  ${t.action} ${t.ticker} @ ${t.entry_price || t.exit_price}`);
      console.log(`    Date: ${t.trade_date}, SSL: ${t.ssl || "N/A"}`);
    }
    console.log();
  }

  // Check journal
  console.log("═".repeat(60));
  console.log("DISCORD JOURNAL");
  console.log("═".repeat(60));
  const { data: journal } = await supabase
    .from("discord_journal")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!journal || journal.length === 0) {
    console.log("  No journal entries found.\n");
  } else {
    for (const j of journal) {
      console.log(`  ${j.action} ${j.ticker || "(no ticker)"}`);
      console.log(`    Mode: ${j.mode || "N/A"}, Setup: ${j.setup_type || "N/A"}`);
      console.log(`    Reasoning: ${j.reasoning.slice(0, 60)}...`);
    }
    console.log();
  }

  // Check portfolio updates
  console.log("═".repeat(60));
  console.log("DISCORD PORTFOLIO UPDATES");
  console.log("═".repeat(60));
  const { data: updates } = await supabase
    .from("discord_portfolio_updates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!updates || updates.length === 0) {
    console.log("  No portfolio updates found.\n");
  } else {
    for (const u of updates) {
      console.log(`  Sentiment: ${u.sentiment} (${u.sentiment_score})`);
      console.log(`    Tickers: ${u.tickers_mentioned?.join(", ") || "none"}`);
      console.log(`    Commentary: ${u.commentary.slice(0, 60)}...`);
    }
    console.log();
  }
}

check();
