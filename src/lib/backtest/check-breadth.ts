import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

// Potential symbols for breadth indicators
const symbols = [
  "^NYAD",      // NYSE Advance/Decline Line
  "^NYADV",     // NYSE Advancing Issues
  "^NYDEC",     // NYSE Declining Issues
  "$NYMO",      // McClellan Oscillator (StockCharts symbol)
  "$NAMO",      // NASDAQ McClellan Oscillator
  "$NYSI",      // NYSE Summation Index
  "$NASI",      // NASDAQ Summation Index
  "^VIX",       // VIX (for reference - should work)
  "^MMFI",      // MMFI
  "^MMTH",      // Stocks above 200dma
  "MMTW",       // % stocks above 200dma
  "MMFI",       // Fear index
];

async function checkSymbols() {
  console.log("Checking Yahoo Finance for breadth indicators...\n");

  for (const symbol of symbols) {
    try {
      const result = await yahooFinance.quote(symbol);
      const name = result.shortName || result.longName || "Found";
      const price = result.regularMarketPrice;
      console.log("✅ " + symbol + ": " + name + " - " + price);
    } catch (e: any) {
      console.log("❌ " + symbol + ": Not available - " + (e.message || "").substring(0, 50));
    }
  }

  // Also try to get historical for ^VIX to confirm API works
  console.log("\n\nTrying historical data for ^VIX...");
  try {
    const result = await yahooFinance.chart("^VIX", {
      period1: new Date("2026-01-01"),
      period2: new Date("2026-01-23"),
      interval: "1d"
    });
    console.log("✅ ^VIX historical: " + result.quotes.length + " bars");
  } catch (e: any) {
    console.log("❌ ^VIX historical failed: " + e.message);
  }
}

checkSymbols();
