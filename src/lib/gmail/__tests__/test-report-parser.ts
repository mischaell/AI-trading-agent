/**
 * Test Script for Report Parser
 *
 * Tests the regex-based extraction functions with sample email content.
 *
 * Run with: npx tsx src/lib/gmail/__tests__/test-report-parser.ts
 *
 * Prerequisites:
 * - None (uses mock data)
 */

import reportParser from "../report-parser";

// =============================================================================
// Sample Email Content (Mock)
// =============================================================================

const SAMPLE_EMAIL_TEXT = `
The Prime Report - January 20, 2026

MARKET ANALYSIS
===============
QQQE is trading above the 21EMA cloud structure. The structure slope is rising,
indicating a healthy uptrend. Current market action: test long setups.

BREADTH INDICATORS
==================
McClellan Summation Index (MCSI): 285
MCSI is above its 10DMA and the 10DMA slope is rising.
MCSI itself is turning up, confirming momentum.

McClellan Oscillator (MCO): -45
MCO is at approximately -1.5σ, approaching oversold territory.
MCO Status: neutral (approaching oversold)

TLMM SIGNAL
===========
Current Signal: PULLBACK since 01/15/2026
This signal suggests we should be looking for pullback entries.

MARKET INTERNALS
================
Credit Spreads: Stable, no stress signals
Bitcoin: Strong, trading above key levels

LIQUID LEADERS UNIVERSE
=======================
Today's top RS leaders (37 tickers):
NVDA, AVGO, META, MSFT, AAPL, GOOGL, AMZN, AMD, MU, MRVL,
CRWD, PANW, SNPS, CDNS, KLAC, LRCX, AMAT, ASML, ARM, NFLX,
COST, ISRG, LIN, CTAS, ODFL, ORLY, AZN, VRTX, REGN, GILD,
MELI, BKNG, ABNB, DDOG, MDB, TEAM, WDAY

PULLBACK CANDIDATES
===================
The following tickers are showing pullback setups:
CIEN, COHR, VRT, CVNA, CRDO, ON

These are our focus candidates for potential entries.
`;

const SAMPLE_EMAIL_TEXT_2 = `
The Prime Report - January 15, 2026

MARKET ANALYSIS
===============
QQQE is trading below the declining structure. We remain defensive.
Current market action: wait & see, reduce exposure if needed.

BREADTH
=======
MCSI: -150, below its 10DMA. The 10DMA is declining.
MCO: -120 (at -2σ, oversold)

TLMM: DOWNTREND since 01/10

No pullback candidates today - market not favorable.

Universe count: 25 liquid leaders remaining.
`;

// =============================================================================
// Test Functions
// =============================================================================

function testQqqeExtraction() {
  console.log("\n--- Testing QQQE Position Extraction ---");

  const tests = [
    { text: "QQQE is trading above the cloud", expected: "above" },
    { text: "QQQE is below the 21EMA cloud", expected: "below" },
    { text: "QQQE trading inside the structure", expected: "inside" },
    { text: "price is within cloud boundaries", expected: "inside" },
    { text: "no relevant content", expected: null },
  ];

  for (const test of tests) {
    const result = reportParser.extractQqqePosition(test.text);
    const pass = result === test.expected;
    console.log(
      `${pass ? "✓" : "✗"} "${test.text.substring(0, 40)}..." -> ${result} (expected: ${test.expected})`
    );
  }
}

function testStructureSlopeExtraction() {
  console.log("\n--- Testing Structure Slope Extraction ---");

  const tests = [
    { text: "structure slope is rising", expected: "rising" },
    { text: "the 21EMA is declining", expected: "declining" },
    { text: "structure remains flat", expected: "flat" },
    { text: "MA is sideways", expected: "flat" },
    { text: "no slope mentioned", expected: null },
  ];

  for (const test of tests) {
    const result = reportParser.extractStructureSlope(test.text);
    const pass = result === test.expected;
    console.log(
      `${pass ? "✓" : "✗"} "${test.text.substring(0, 40)}..." -> ${result} (expected: ${test.expected})`
    );
  }
}

function testMarketActionExtraction() {
  console.log("\n--- Testing Market Action Extraction ---");

  const tests = [
    { text: "wait & see for now", expected: "wait & see" },
    { text: "test long setups", expected: "test long" },
    { text: "add exposure cautiously", expected: "add exposure" },
    { text: "reduce risk here", expected: "reduce exposure" },
    { text: "stay defensive", expected: "defensive" },
  ];

  for (const test of tests) {
    const result = reportParser.extractMarketAction(test.text);
    const pass = result === test.expected;
    console.log(
      `${pass ? "✓" : "✗"} "${test.text.substring(0, 40)}..." -> ${result} (expected: ${test.expected})`
    );
  }
}

function testMcsiExtraction() {
  console.log("\n--- Testing MCSI Extraction ---");

  const tests = [
    { text: "MCSI: 285", expected: 285 },
    { text: "MCSI: -150", expected: -150 },
    { text: "McClellan Summation Index (MCSI): 100", expected: 100 },
    { text: "no mcsi here", expected: null },
  ];

  for (const test of tests) {
    const result = reportParser.extractMcsiReading(test.text);
    const pass = result === test.expected;
    console.log(
      `${pass ? "✓" : "✗"} "${test.text.substring(0, 40)}..." -> ${result} (expected: ${test.expected})`
    );
  }
}

function testMcoExtraction() {
  console.log("\n--- Testing MCO Extraction ---");

  const tests = [
    { text: "MCO: -45", expected: -45 },
    { text: "MCO: -120", expected: -120 },
    { text: "MCO: 50", expected: 50 },
  ];

  for (const test of tests) {
    const result = reportParser.extractMcoReading(test.text);
    const pass = result === test.expected;
    console.log(
      `${pass ? "✓" : "✗"} "${test.text.substring(0, 40)}..." -> ${result} (expected: ${test.expected})`
    );
  }
}

function testTickerExtraction() {
  console.log("\n--- Testing Ticker Extraction ---");

  const text = "Top tickers: NVDA, AVGO, META, MSFT, AAPL";
  const result = reportParser.extractTickers(text);

  console.log(`Extracted ${result.length} tickers: ${result.join(", ")}`);

  const expectedTickers = ["NVDA", "AVGO", "META", "MSFT", "AAPL"];
  const allFound = expectedTickers.every((t) => result.includes(t));
  console.log(`${allFound ? "✓" : "✗"} All expected tickers found`);
}

function testPullbackExtraction() {
  console.log("\n--- Testing Pullback Candidates Extraction ---");

  const text =
    "Pullback candidates: CIEN, COHR, VRT, CVNA, CRDO, ON are showing setups";
  const result = reportParser.extractPullbackCandidates(text);

  console.log(`Extracted ${result.length} pullback candidates: ${result.join(", ")}`);

  const expected = ["CIEN", "COHR", "VRT", "CVNA", "CRDO", "ON"];
  const allFound = expected.every((t) => result.includes(t));
  console.log(`${allFound ? "✓" : "✗"} All expected pullback candidates found`);
}

async function testFullParsing() {
  console.log("\n--- Testing Full Report Parsing ---");
  console.log("(Note: Claude API fallback disabled for this test)\n");

  // Create a mock email content object
  const mockEmail = {
    id: "test-123",
    subject: "The Prime Report - January 20, 2026",
    from: "newsletter@primereport.com",
    date: "Mon, 20 Jan 2026 08:00:00 -0500",
    textBody: SAMPLE_EMAIL_TEXT,
    htmlBody: "",
  };

  try {
    // Note: This will attempt Claude API if regex fails
    // For pure unit testing, we just test the regex extractors
    console.log("Testing regex extractors on sample content:\n");

    const qqqe = reportParser.extractQqqePosition(SAMPLE_EMAIL_TEXT);
    const slope = reportParser.extractStructureSlope(SAMPLE_EMAIL_TEXT);
    const action = reportParser.extractMarketAction(SAMPLE_EMAIL_TEXT);
    const mcsi = reportParser.extractMcsiReading(SAMPLE_EMAIL_TEXT);
    const mco = reportParser.extractMcoReading(SAMPLE_EMAIL_TEXT);
    const tickers = reportParser.extractTickers(SAMPLE_EMAIL_TEXT);
    const pullbacks = reportParser.extractPullbackCandidates(SAMPLE_EMAIL_TEXT);

    console.log(`QQQE Position: ${qqqe}`);
    console.log(`Structure Slope: ${slope}`);
    console.log(`Market Action: ${action}`);
    console.log(`MCSI Reading: ${mcsi}`);
    console.log(`MCO Reading: ${mco}`);
    console.log(`Universe Tickers: ${tickers.length}`);
    console.log(`Pullback Candidates: ${pullbacks.join(", ")}`);

    console.log("\n--- Validation ---");

    const validations = [
      { name: "QQQE position extracted", pass: qqqe === "above" },
      { name: "Structure slope extracted", pass: slope === "rising" },
      { name: "Market action extracted", pass: action === "test long" },
      { name: "MCSI reading extracted", pass: mcsi === 285 },
      { name: "MCO reading extracted", pass: mco === -45 },
      { name: "Universe has tickers", pass: tickers.length > 0 },
      { name: "Pullback candidates found", pass: pullbacks.length >= 4 },
    ];

    for (const v of validations) {
      console.log(`${v.pass ? "✓" : "✗"} ${v.name}`);
    }

    const allPassed = validations.every((v) => v.pass);
    console.log(`\n${allPassed ? "✓ ALL VALIDATIONS PASSED" : "✗ SOME VALIDATIONS FAILED"}`);
  } catch (error) {
    console.error("Full parsing test failed:", error);
  }
}

async function testDefensiveContent() {
  console.log("\n--- Testing Defensive Market Content ---");

  const qqqe = reportParser.extractQqqePosition(SAMPLE_EMAIL_TEXT_2);
  const slope = reportParser.extractStructureSlope(SAMPLE_EMAIL_TEXT_2);
  const action = reportParser.extractMarketAction(SAMPLE_EMAIL_TEXT_2);
  const mcsi = reportParser.extractMcsiReading(SAMPLE_EMAIL_TEXT_2);
  const mco = reportParser.extractMcoReading(SAMPLE_EMAIL_TEXT_2);

  console.log(`QQQE Position: ${qqqe}`);
  console.log(`Structure Slope: ${slope}`);
  console.log(`Market Action: ${action}`);
  console.log(`MCSI Reading: ${mcsi}`);
  console.log(`MCO Reading: ${mco}`);

  console.log("\n--- Validation ---");

  const validations = [
    { name: "QQQE below detected", pass: qqqe === "below" },
    { name: "Declining slope detected", pass: slope === "declining" },
    { name: "Defensive action detected", pass: action.includes("wait") || action.includes("reduce") },
    { name: "Negative MCSI detected", pass: mcsi !== null && mcsi < 0 },
    { name: "Oversold MCO detected", pass: mco !== null && mco < -100 },
  ];

  for (const v of validations) {
    console.log(`${v.pass ? "✓" : "✗"} ${v.name}`);
  }
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function runAllTests() {
  console.log("=".repeat(70));
  console.log("Report Parser Unit Tests");
  console.log("=".repeat(70));

  testQqqeExtraction();
  testStructureSlopeExtraction();
  testMarketActionExtraction();
  testMcsiExtraction();
  testMcoExtraction();
  testTickerExtraction();
  testPullbackExtraction();

  await testFullParsing();
  await testDefensiveContent();

  console.log("\n" + "=".repeat(70));
  console.log("Tests Complete");
  console.log("=".repeat(70));
}

// Run tests
runAllTests().catch(console.error);
