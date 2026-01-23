/**
 * Supabase Seed Data Script
 *
 * Populates the database with sample positions and trades for testing.
 *
 * Run with: npx tsx src/lib/supabase/seed-data.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Sample positions matching the database schema
const samplePositions = [
  {
    ticker: 'NVDA',
    shares: 10,
    avg_price: 450.00,
    ssl: 435.00,
    trim_2r_price: 480.00,
    entry_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'CORE' as const,
    mode: 'MODE1' as const,
    trimmed_pct: 33.33,
    secured_pnl: 150.00,
    theme: 'AI Compute',
    notes: 'Strong AI demand, holding above 21EMA',
  },
  {
    ticker: 'META',
    shares: 8,
    avg_price: 380.00,
    ssl: 365.00,
    trim_2r_price: 410.00,
    entry_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'CORE' as const,
    mode: 'MODE1' as const,
    trimmed_pct: 33.33,
    secured_pnl: 120.00,
    theme: 'Ads/AI',
    notes: 'Reels monetization improving',
  },
  {
    ticker: 'GOOGL',
    shares: 20,
    avg_price: 145.00,
    ssl: 140.00,
    trim_2r_price: 155.00,
    entry_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'STARTER' as const,
    mode: 'MODE2' as const,
    trimmed_pct: 0,
    secured_pnl: 0,
    theme: 'Search/AI',
    notes: 'Cloud growth accelerating',
  },
  {
    ticker: 'AMD',
    shares: 25,
    avg_price: 165.00,
    ssl: 158.00,
    trim_2r_price: 179.00,
    entry_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'STARTER' as const,
    mode: 'MODE2' as const,
    trimmed_pct: 0,
    secured_pnl: 0,
    theme: 'AI Compute',
    notes: 'MI300 ramp beginning',
  },
];

// Sample trades from last 24 hours
const now = Date.now();
const sampleTrades = [
  {
    ticker: 'ANET',
    side: 'BUY' as const,
    action_type: 'ENTRY' as const,
    shares: 15,
    price: 285.50,
    mode: 'MODE1',
    notes: 'Clean pullback to 21EMA',
    executed_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    ticker: 'NVDA',
    side: 'SELL' as const,
    action_type: 'TRIM' as const,
    shares: 5,
    price: 480.00,
    r_multiple: 2.0,
    notes: '2R trim, locking in profits',
    executed_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    ticker: 'META',
    side: 'SELL' as const,
    action_type: 'TRIM' as const,
    shares: 4,
    price: 410.00,
    r_multiple: 2.0,
    notes: '2R trim reached',
    executed_at: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
  },
  {
    ticker: 'AMD',
    side: 'BUY' as const,
    action_type: 'ENTRY' as const,
    shares: 25,
    price: 165.00,
    mode: 'MODE2',
    notes: 'Base breakout entry',
    executed_at: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
  },
  {
    ticker: 'CRWD',
    side: 'BUY' as const,
    action_type: 'ADD' as const,
    shares: 5,
    price: 312.00,
    r_multiple: 1.5,
    notes: 'Adding on strength at 1.5R',
    executed_at: new Date(now - 10 * 60 * 60 * 1000).toISOString(),
  },
];

async function seedDatabase() {
  console.log('=== Seeding Supabase Database ===\n');

  // Clear existing data first
  console.log('1. Clearing existing data...');

  const { error: deleteTradesError } = await supabase
    .from('trades')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

  if (deleteTradesError) {
    console.error('   Warning: Could not clear trades:', deleteTradesError.message);
  } else {
    console.log('   Cleared trades table');
  }

  const { error: deletePositionsError } = await supabase
    .from('positions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

  if (deletePositionsError) {
    console.error('   Warning: Could not clear positions:', deletePositionsError.message);
  } else {
    console.log('   Cleared positions table');
  }

  // Insert positions
  console.log('\n2. Inserting sample positions...');

  for (const position of samplePositions) {
    const { data, error } = await supabase
      .from('positions')
      .insert(position)
      .select()
      .single();

    if (error) {
      console.error(`   Error inserting ${position.ticker}:`, error.message);
    } else {
      console.log(`   Inserted position: ${position.ticker} (${position.shares} shares @ $${position.avg_price})`);
    }
  }

  // Insert trades
  console.log('\n3. Inserting sample trades...');

  for (const trade of sampleTrades) {
    const { data, error } = await supabase
      .from('trades')
      .insert(trade)
      .select()
      .single();

    if (error) {
      console.error(`   Error inserting ${trade.ticker} trade:`, error.message);
    } else {
      console.log(`   Inserted trade: ${trade.side} ${trade.shares} ${trade.ticker} @ $${trade.price} (${trade.action_type})`);
    }
  }

  // Verify data
  console.log('\n4. Verifying inserted data...');

  const { data: positions, error: posError } = await supabase
    .from('positions')
    .select('*');

  if (posError) {
    console.error('   Error fetching positions:', posError.message);
  } else {
    console.log(`   Positions in database: ${positions?.length ?? 0}`);
  }

  const { data: trades, error: tradeError } = await supabase
    .from('trades')
    .select('*')
    .order('executed_at', { ascending: false });

  if (tradeError) {
    console.error('   Error fetching trades:', tradeError.message);
  } else {
    console.log(`   Trades in database: ${trades?.length ?? 0}`);
  }

  console.log('\n=== Seeding Complete ===\n');
}

seedDatabase().catch(console.error);
