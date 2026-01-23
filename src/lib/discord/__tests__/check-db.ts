/**
 * Check Discord trades in database
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
  console.log("Checking discord_trades table...\n");

  const { data, error } = await supabase
    .from("discord_trades")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.log("Error:", error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No trades found in database yet.");
    console.log("\nThe bot needs to be running when you post messages.");
    console.log("Run: npx tsx src/lib/discord/__tests__/run-bot.ts listen");
    return;
  }

  console.log("Recent trades in database:");
  console.log("-".repeat(50));
  for (const trade of data) {
    const price = trade.entry_price || trade.exit_price;
    console.log(`${trade.action} ${trade.ticker} @ ${price} (${trade.trade_date})`);
    console.log(`  SSL: ${trade.ssl || "N/A"}, Risk: ${trade.ec_risk_pct || "N/A"}%`);
    console.log(`  Message ID: ${trade.discord_message_id}`);
    console.log();
  }
}

check();
