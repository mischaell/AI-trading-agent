import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string
);

async function main() {
  const { data: stats } = await supabase
    .from("discord_trades")
    .select("trade_date, action")
    .order("trade_date", { ascending: true });

  if (!stats) return;

  const dates = stats.map(s => s.trade_date);
  const entries = stats.filter(s => s.action === "ENTRY" || s.action === "ADD");

  console.log("Total trades:", stats.length);
  console.log("ENTRY/ADD trades:", entries.length);
  console.log("Date range:", dates[0], "to", dates[dates.length - 1]);

  const byMonth = new Map<string, number>();
  for (const t of entries) {
    const month = t.trade_date.substring(0, 7);
    byMonth.set(month, (byMonth.get(month) || 0) + 1);
  }

  console.log("\nMonthly ENTRY/ADD breakdown:");
  for (const [month, count] of [...byMonth.entries()].sort()) {
    console.log(`  ${month}: ${count} trades`);
  }
}

main().catch(console.error);
