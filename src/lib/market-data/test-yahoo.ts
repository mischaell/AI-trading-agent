/**
 * Yahoo Finance Test Script
 *
 * Run with: npx tsx src/lib/market-data/test-yahoo.ts
 */

import { fetchQQQE, fetchQuote, fetchBatchQuotes, clearCache } from './client';
import { calculate21EMAStructure } from './calculations';

async function testYahooFinance() {
  console.log('=== Yahoo Finance Test ===\n');

  // Clear cache to ensure fresh data
  clearCache();

  // Test 1: Fetch QQQE OHLC data
  console.log('1. Fetching QQQE OHLC data...');
  const qqqeData = await fetchQQQE();
  if (qqqeData.length > 0) {
    console.log(`   Fetched ${qqqeData.length} bars`);
    console.log(`   Date range: ${qqqeData[0].date} to ${qqqeData[qqqeData.length - 1].date}`);
    console.log(`   Latest close: $${qqqeData[qqqeData.length - 1].close.toFixed(2)}`);
  } else {
    console.log('   ERROR: No data returned');
  }

  // Test 2: Calculate 21EMA structure
  console.log('\n2. Calculating 21EMA structure...');
  const structure = calculate21EMAStructure(qqqeData);
  if (structure) {
    console.log(`   MA High: $${structure.maHigh.toFixed(2)}`);
    console.log(`   MA Close: $${structure.maClose.toFixed(2)}`);
    console.log(`   MA Low: $${structure.maLow.toFixed(2)}`);
    console.log(`   Current Close: $${structure.currentClose.toFixed(2)}`);
    console.log(`   Position: ${structure.position}`);
    console.log(`   Slope: ${structure.slope}`);
  } else {
    console.log('   ERROR: Could not calculate structure');
  }

  // Test 3: Fetch single quote
  console.log('\n3. Fetching single quote (AAPL)...');
  const appleQuote = await fetchQuote('AAPL');
  if (appleQuote) {
    console.log(`   Price: $${appleQuote.price.toFixed(2)}`);
    console.log(`   Change: ${appleQuote.changePercent.toFixed(2)}%`);
    console.log(`   Volume: ${appleQuote.volume.toLocaleString()}`);
  } else {
    console.log('   ERROR: No quote returned');
  }

  // Test 4: Fetch batch quotes
  console.log('\n4. Fetching batch quotes (NVDA, META, GOOGL)...');
  const batchQuotes = await fetchBatchQuotes(['NVDA', 'META', 'GOOGL']);
  batchQuotes.forEach((quote, ticker) => {
    console.log(`   ${ticker}: $${quote.price.toFixed(2)} (${quote.changePercent.toFixed(2)}%)`);
  });

  console.log('\n=== Test Complete ===');
}

testYahooFinance().catch(console.error);
