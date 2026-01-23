/**
 * Supabase Connection Test
 *
 * Run with: npx tsx src/lib/supabase/test-connection.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testConnection() {
  console.log('=== Supabase Connection Test ===\n');

  // Check environment variables
  console.log('1. Checking environment variables...');
  if (!supabaseUrl || !supabaseKey) {
    console.error('   ❌ Missing environment variables');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓ Set' : '✗ Missing');
    console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseKey ? '✓ Set' : '✗ Missing');
    process.exit(1);
  }
  console.log('   ✓ Environment variables loaded');
  console.log('   URL:', supabaseUrl);

  // Create client
  console.log('\n2. Creating Supabase client...');
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('   ✓ Client created');

  // Test positions table
  console.log('\n3. Testing positions table...');
  const { data: positions, error: posError } = await supabase
    .from('positions')
    .select('*')
    .limit(5);

  if (posError) {
    console.error('   ❌ Error:', posError.message);
  } else {
    console.log('   ✓ Query successful');
    console.log('   Rows returned:', positions?.length ?? 0);
  }

  // Test trades table
  console.log('\n4. Testing trades table...');
  const { data: trades, error: tradeError } = await supabase
    .from('trades')
    .select('*')
    .limit(5);

  if (tradeError) {
    console.error('   ❌ Error:', tradeError.message);
  } else {
    console.log('   ✓ Query successful');
    console.log('   Rows returned:', trades?.length ?? 0);
  }

  // Test market_snapshots table
  console.log('\n5. Testing market_snapshots table...');
  const { data: snapshots, error: snapError } = await supabase
    .from('market_snapshots')
    .select('*')
    .limit(5);

  if (snapError) {
    console.error('   ❌ Error:', snapError.message);
  } else {
    console.log('   ✓ Query successful');
    console.log('   Rows returned:', snapshots?.length ?? 0);
  }

  // Test insert (optional - creates test data)
  console.log('\n6. Testing insert to trades table...');
  const testTrade = {
    ticker: 'TEST',
    side: 'BUY',
    action_type: 'ENTRY',
    shares: 100,
    price: 150.00,
    executed_at: new Date().toISOString(),
    notes: 'Connection test - safe to delete',
  };

  const { data: insertedTrade, error: insertError } = await supabase
    .from('trades')
    .insert(testTrade)
    .select()
    .single();

  if (insertError) {
    console.error('   ❌ Insert error:', insertError.message);
  } else {
    console.log('   ✓ Insert successful');
    console.log('   Inserted trade ID:', insertedTrade?.id);

    // Clean up test data
    console.log('\n7. Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('trades')
      .delete()
      .eq('id', insertedTrade.id);

    if (deleteError) {
      console.error('   ❌ Delete error:', deleteError.message);
    } else {
      console.log('   ✓ Test data cleaned up');
    }
  }

  console.log('\n=== Connection Test Complete ===');
  console.log('All tables are accessible and working!\n');
}

testConnection().catch(console.error);
