/**
 * Diagnose Trade Matching
 *
 * Shows why each Discord trade matched or didn't match a recommendation.
 *
 * Run with: npx tsx src/lib/backtest/__tests__/diagnose-matching.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// NASDAQ 100 tickers (base universe)
const NASDAQ_100 = new Set([
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "GOOG", "TSLA", "AVGO", "COST",
  "NFLX", "ADBE", "AMD", "PEP", "CSCO", "TMUS", "INTC", "CMCSA", "INTU", "QCOM",
  "TXN", "AMGN", "AMAT", "ISRG", "HON", "BKNG", "SBUX", "VRTX", "LRCX", "ADI",
  "MU", "GILD", "MDLZ", "ADP", "PANW", "REGN", "KLAC", "SNPS", "CDNS", "MELI",
  "CRWD", "PYPL", "MAR", "ORLY", "ASML", "CTAS", "MNST", "ABNB", "MRVL", "FTNT",
  "KDP", "NXPI", "KHC", "PCAR", "AEP", "DXCM", "MCHP", "LULU", "EXC", "ROST",
  "ODFL", "IDXX", "PAYX", "FAST", "AZN", "EA", "CEG", "CPRT", "WDAY", "CTSH",
  "GEHC", "CSGP", "BKR", "VRSK", "XEL", "FANG", "DDOG", "TEAM", "ZS", "TTWO",
  "ILMN", "ON", "MRNA", "GFS", "ANSS", "CDW", "BIIB", "DLTR", "WBD", "SIRI",
  "LCID", "JD", "PDD", "BIDU", "NTES", "RIVN", "ZM", "ALGN", "ENPH", "SPLK",
]);

interface DiagnosticResult {
  ticker: string;
  tradeDate: string;
  action: string;

  // Filter results
  inNasdaq100: boolean;
  inExpandedUniverse: boolean;
  ohlcFetched: boolean;
  rsPercentile: number | null;
  passedRsFilter: boolean;
  distTo21EMA: number | null;
  passedAtrBounds: boolean;
  structureIntact: boolean | null;
  passedStructure: boolean;
  weeklyReturn: number | null;
  passedWeeklyReturn: boolean;

  // Final result
  candidateGenerated: boolean;
  matchedToRec: boolean;
  matchOffset: number | null;
  failReason: string;
}

async function fetchStockData(ticker: string, date: string) {
  try {
    const endDate = new Date(date);
    const startDate = new Date(date);
    startDate.setDate(startDate.getDate() - 60);

    const result = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    const quotes = result?.quotes || [];
    const bars = quotes
      .filter((q: any) => q.open && q.high && q.low && q.close && new Date(q.date).toISOString().split("T")[0] <= date)
      .map((q: any) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        open: q.open!,
        high: q.high!,
        low: q.low!,
        close: q.close!,
      }));

    if (bars.length < 21) return null;

    // Calculate 21 EMA structure
    const period = 21;
    const multiplier = 2 / (period + 1);

    let emaClose = bars.slice(0, period).reduce((s: number, b: any) => s + b.close, 0) / period;
    let emaLow = bars.slice(0, period).reduce((s: number, b: any) => s + b.low, 0) / period;

    for (let i = period; i < bars.length; i++) {
      emaClose = (bars[i].close - emaClose) * multiplier + emaClose;
      emaLow = (bars[i].low - emaLow) * multiplier + emaLow;
    }

    // Calculate ATR
    const trueRanges: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const tr = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close)
      );
      trueRanges.push(tr);
    }
    const atr = trueRanges.slice(-14).reduce((s, v) => s + v, 0) / 14;

    const latestClose = bars[bars.length - 1].close;
    const distTo21EMA = atr > 0 ? (latestClose - emaClose) / atr : 0;
    const structureIntact = latestClose >= emaLow;

    // Weekly return
    const weekAgoClose = bars.length >= 5 ? bars[bars.length - 5].close : latestClose;
    const weeklyReturn = ((latestClose - weekAgoClose) / weekAgoClose) * 100;

    // IBD-style RS calculation
    const getClose = (daysBack: number) => {
      const idx = bars.length - daysBack;
      return idx >= 0 ? bars[idx]?.close : bars[0]?.close;
    };

    const close3m = getClose(63);
    const close6m = getClose(126);
    const close9m = getClose(189);
    const close12m = getClose(252);

    // Calculate quarterly returns (IBD methodology)
    const returnQ1 = close3m ? ((latestClose - close3m) / close3m) * 100 : 0;
    const returnQ2 = close6m && close3m ? ((close3m - close6m) / close6m) * 100 : 0;
    const returnQ3 = close9m && close6m ? ((close6m - close9m) / close9m) * 100 : 0;
    const returnQ4 = close12m && close9m ? ((close9m - close12m) / close12m) * 100 : 0;

    // IBD weighting: 40% Q1, 20% Q2, 20% Q3, 20% Q4
    const weightedReturn = (returnQ1 * 0.40) + (returnQ2 * 0.20) + (returnQ3 * 0.20) + (returnQ4 * 0.20);

    return {
      latestClose,
      emaClose,
      emaLow,
      atr,
      distTo21EMA,
      structureIntact,
      weeklyReturn,
      weightedReturn,
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log("═".repeat(120));
  console.log("                              DISCORD TRADE MATCHING DIAGNOSIS");
  console.log("═".repeat(120));
  console.log();

  // Load Discord trades for December 2024
  const { data: trades } = await supabase
    .from("discord_trades")
    .select("*")
    .gte("trade_date", "2024-12-01")
    .lte("trade_date", "2024-12-31")
    .in("action", ["ENTRY", "ADD"])
    .order("trade_date", { ascending: true });

  if (!trades || trades.length === 0) {
    console.log("No trades found");
    return;
  }

  console.log(`Found ${trades.length} ENTRY/ADD trades in December 2024\n`);

  // Get unique tickers from Discord (for expanded universe)
  const discordTickers = new Set(trades.map((t: any) => t.ticker));
  const expandedUniverse = new Set([...NASDAQ_100, ...discordTickers]);

  // Calculate RS for all universe tickers (simplified - just use Discord tickers)
  const rsData = new Map<string, number>();

  console.log("Fetching stock data for RS calculation...\n");

  for (const ticker of discordTickers) {
    const data = await fetchStockData(ticker, "2024-12-15"); // mid-month date
    if (data) {
      rsData.set(ticker, data.weightedReturn);
    }
  }

  // Calculate RS percentiles
  const sortedByRS = [...rsData.entries()].sort((a, b) => b[1] - a[1]);
  const rsPercentiles = new Map<string, number>();
  for (let i = 0; i < sortedByRS.length; i++) {
    const percentile = Math.round(((sortedByRS.length - i) / sortedByRS.length) * 100);
    rsPercentiles.set(sortedByRS[i][0], percentile);
  }

  // Analyze each trade
  const results: DiagnosticResult[] = [];

  console.log("Analyzing each trade...\n");

  for (const trade of trades) {
    const ticker = trade.ticker;
    const tradeDate = trade.trade_date;
    const isDiscordTicker = discordTickers.has(ticker);

    const result: DiagnosticResult = {
      ticker,
      tradeDate,
      action: trade.action,
      inNasdaq100: NASDAQ_100.has(ticker),
      inExpandedUniverse: expandedUniverse.has(ticker),
      ohlcFetched: false,
      rsPercentile: null,
      passedRsFilter: false,
      distTo21EMA: null,
      passedAtrBounds: false,
      structureIntact: null,
      passedStructure: false,
      weeklyReturn: null,
      passedWeeklyReturn: false,
      candidateGenerated: false,
      matchedToRec: false,
      matchOffset: null,
      failReason: "",
    };

    // Fetch stock data for the trade date
    const stockData = await fetchStockData(ticker, tradeDate);

    if (!stockData) {
      result.failReason = "OHLC fetch failed";
      results.push(result);
      continue;
    }

    result.ohlcFetched = true;
    result.rsPercentile = rsPercentiles.get(ticker) || 0;
    result.distTo21EMA = stockData.distTo21EMA;
    result.structureIntact = stockData.structureIntact;
    result.weeklyReturn = stockData.weeklyReturn;

    // Check RS filter (relaxed for Discord tickers)
    // IBD RS Rating: 1-99 scale, where 99 = top 1%
    const rsThreshold = isDiscordTicker ? 25 : 70;
    result.passedRsFilter = (result.rsPercentile || 0) >= rsThreshold;

    // Check ATR bounds (relaxed for Discord tickers)
    const atrLower = isDiscordTicker ? -2.0 : -0.5;
    const atrUpper = isDiscordTicker ? 3.0 : 1.0;
    result.passedAtrBounds = stockData.distTo21EMA >= atrLower && stockData.distTo21EMA <= atrUpper;

    // Check structure (skipped for Discord tickers)
    result.passedStructure = isDiscordTicker || stockData.structureIntact;

    // Check weekly return (relaxed for Discord tickers)
    const maxWeekly = isDiscordTicker ? 25 : 12;
    result.passedWeeklyReturn = stockData.weeklyReturn <= maxWeekly;

    // Determine if candidate would be generated
    result.candidateGenerated =
      result.passedRsFilter &&
      result.passedAtrBounds &&
      result.passedStructure &&
      result.passedWeeklyReturn;

    // Determine failure reason
    if (!result.candidateGenerated) {
      const failures = [];
      if (!result.passedRsFilter) failures.push(`IBD RS ${result.rsPercentile} < ${rsThreshold}`);
      if (!result.passedAtrBounds) failures.push(`ATR dist ${result.distTo21EMA?.toFixed(2)} outside [${atrLower}, ${atrUpper}]`);
      if (!result.passedStructure) failures.push("Structure broken");
      if (!result.passedWeeklyReturn) failures.push(`Weekly ${result.weeklyReturn?.toFixed(1)}% > ${maxWeekly}%`);
      result.failReason = failures.join(", ");
    } else {
      result.matchedToRec = true; // Simplified - assume match if candidate generated
      result.matchOffset = 0;
      result.failReason = "MATCHED";
    }

    results.push(result);
  }

  // Print results table
  console.log("─".repeat(120));
  console.log(
    "TICKER".padEnd(8) +
    "DATE".padEnd(12) +
    "NDQ100".padEnd(8) +
    "IBD_RS".padEnd(7) +
    "RS_OK".padEnd(7) +
    "ATR_D".padEnd(8) +
    "ATR_OK".padEnd(8) +
    "STRUCT".padEnd(8) +
    "WEEK%".padEnd(8) +
    "WK_OK".padEnd(7) +
    "RESULT"
  );
  console.log("─".repeat(120));

  for (const r of results) {
    const row =
      r.ticker.padEnd(8) +
      r.tradeDate.padEnd(12) +
      (r.inNasdaq100 ? "Yes" : "No").padEnd(8) +
      (r.rsPercentile?.toString() || "N/A").padEnd(6) +
      (r.passedRsFilter ? "✓" : "✗").padEnd(7) +
      (r.distTo21EMA?.toFixed(2) || "N/A").padEnd(8) +
      (r.passedAtrBounds ? "✓" : "✗").padEnd(8) +
      (r.structureIntact ? "✓" : "✗").padEnd(8) +
      (r.weeklyReturn?.toFixed(1) || "N/A").padEnd(8) +
      (r.passedWeeklyReturn ? "✓" : "✗").padEnd(7) +
      r.failReason;

    console.log(row);
  }

  // Summary
  console.log("\n" + "═".repeat(120));
  console.log("SUMMARY");
  console.log("═".repeat(120));

  const matched = results.filter(r => r.matchedToRec);
  const failedRS = results.filter(r => !r.passedRsFilter && r.ohlcFetched);
  const failedATR = results.filter(r => r.passedRsFilter && !r.passedAtrBounds);
  const failedStructure = results.filter(r => r.passedRsFilter && r.passedAtrBounds && !r.passedStructure);
  const failedWeekly = results.filter(r => r.passedRsFilter && r.passedAtrBounds && r.passedStructure && !r.passedWeeklyReturn);
  const failedOHLC = results.filter(r => !r.ohlcFetched);

  console.log(`Total Trades:          ${results.length}`);
  console.log(`Matched (candidate):   ${matched.length}`);
  console.log(`Failed - OHLC fetch:   ${failedOHLC.length} (${failedOHLC.map(r => r.ticker).join(", ") || "none"})`);
  console.log(`Failed - RS filter:    ${failedRS.length}`);
  console.log(`Failed - ATR bounds:   ${failedATR.length}`);
  console.log(`Failed - Structure:    ${failedStructure.length}`);
  console.log(`Failed - Weekly ext:   ${failedWeekly.length}`);

  // Show failure breakdown by ticker
  console.log("\n" + "─".repeat(120));
  console.log("FAILURE REASONS BY TICKER");
  console.log("─".repeat(120));

  const byReason = new Map<string, string[]>();
  for (const r of results.filter(r => !r.matchedToRec)) {
    const reason = r.failReason || "Unknown";
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason)!.push(r.ticker);
  }

  for (const [reason, tickers] of byReason) {
    console.log(`${reason}:`);
    console.log(`  ${tickers.join(", ")}`);
  }
}

main().catch(console.error);
