/**
 * Seed Breadth Data Script
 *
 * Adds sample breadth data to Supabase for testing.
 *
 * Run with: npx tsx src/lib/market-data/seed-breadth.ts
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

// Sample breadth data - adjust these values based on current market conditions
const today = new Date().toISOString().split('T')[0];

const breadthData = {
  date: today,
  mco: 35.5,      // McClellan Oscillator (typically -100 to +100)
  mcsi: 1150.0,   // McClellan Summation Index (typically -2000 to +2000)
  mco_z: 0.8,     // MCO Z-score (standardized, typically -3 to +3)
  mcsi_z: 0.5,    // MCSI Z-score (standardized, typically -3 to +3)
  source: 'manual',
};

async function seedBreadthData() {
  console.log('=== Seeding Breadth Data ===\n');

  console.log('Inserting breadth data for:', today);
  console.log('  MCO:', breadthData.mco);
  console.log('  MCSI:', breadthData.mcsi);
  console.log('  MCO Z-score:', breadthData.mco_z);
  console.log('  MCSI Z-score:', breadthData.mcsi_z);

  const { data, error } = await supabase
    .from('breadth_data')
    .upsert(breadthData, { onConflict: 'date' })
    .select()
    .single();

  if (error) {
    console.error('\nError:', error.message);
  } else {
    console.log('\nSuccess! Breadth data saved.');
    console.log('ID:', data.id);
  }

  // Verify
  console.log('\nVerifying...');
  const { data: verify, error: verifyError } = await supabase
    .from('breadth_data')
    .select('*')
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (verifyError) {
    console.error('Verification error:', verifyError.message);
  } else {
    console.log('Latest breadth data:', verify);
  }

  console.log('\n=== Done ===');
}

seedBreadthData().catch(console.error);
