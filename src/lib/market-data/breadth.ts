/**
 * Breadth Data Management
 *
 * Handles McClellan Oscillator (MCO) and McClellan Summation Index (MCSI)
 * data from Supabase. Supports manual input until automated data feed is available.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// =============================================================================
// Types
// =============================================================================

export interface BreadthData {
  date: string; // YYYY-MM-DD
  mco: number;
  mcsi: number;
  mco_z?: number;
  mcsi_z?: number;
  source: 'manual' | 'automated';
}

export interface BreadthRow {
  id: string;
  date: string;
  mco: number;
  mcsi: number;
  mco_z: number | null;
  mcsi_z: number | null;
  source: string;
  created_at: string;
}

// =============================================================================
// Mock Data (fallback)
// =============================================================================

const MOCK_BREADTH: BreadthData = {
  date: new Date().toISOString().split('T')[0],
  mco: 45.5,
  mcsi: 1250.0,
  mco_z: 1.2,
  mcsi_z: 0.8,
  source: 'manual',
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Get the latest breadth data from Supabase
 * Falls back to mock data if no entry exists or Supabase is unavailable
 * @returns Latest breadth data
 */
export async function getBreadthData(): Promise<BreadthData> {
  if (!isSupabaseConfigured()) {
    console.log('[Breadth] Supabase not configured, using mock data');
    return MOCK_BREADTH;
  }

  try {
    const { data, error } = await supabase
      .from('breadth_data')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        console.log('[Breadth] No breadth data found, using mock data');
        return MOCK_BREADTH;
      }
      throw error;
    }

    const row = data as BreadthRow;
    console.log(`[Breadth] Loaded breadth data for ${row.date}`);

    return {
      date: row.date,
      mco: Number(row.mco),
      mcsi: Number(row.mcsi),
      mco_z: row.mco_z ? Number(row.mco_z) : undefined,
      mcsi_z: row.mcsi_z ? Number(row.mcsi_z) : undefined,
      source: row.source as 'manual' | 'automated',
    };
  } catch (error) {
    console.error('[Breadth] Failed to fetch breadth data:', error);
    return MOCK_BREADTH;
  }
}

/**
 * Get breadth data for a specific date
 * @param date - Date string (YYYY-MM-DD)
 * @returns Breadth data for the date, or null if not found
 */
export async function getBreadthDataByDate(date: string): Promise<BreadthData | null> {
  if (!isSupabaseConfigured()) {
    console.log('[Breadth] Supabase not configured');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('breadth_data')
      .select('*')
      .eq('date', date)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    const row = data as BreadthRow;
    return {
      date: row.date,
      mco: Number(row.mco),
      mcsi: Number(row.mcsi),
      mco_z: row.mco_z ? Number(row.mco_z) : undefined,
      mcsi_z: row.mcsi_z ? Number(row.mcsi_z) : undefined,
      source: row.source as 'manual' | 'automated',
    };
  } catch (error) {
    console.error('[Breadth] Failed to fetch breadth data:', error);
    return null;
  }
}

/**
 * Save breadth data (manual input)
 * Uses upsert to update existing entry for the same date
 * @param mco - McClellan Oscillator value
 * @param mcsi - McClellan Summation Index value
 * @param mco_z - MCO Z-score (optional)
 * @param mcsi_z - MCSI Z-score (optional)
 * @param date - Date string (YYYY-MM-DD), defaults to today
 * @returns Saved breadth data, or null if save failed
 */
export async function saveBreadthData(
  mco: number,
  mcsi: number,
  mco_z?: number,
  mcsi_z?: number,
  date?: string
): Promise<BreadthData | null> {
  if (!isSupabaseConfigured()) {
    console.warn('[Breadth] Supabase not configured, breadth data not saved');
    return null;
  }

  const targetDate = date ?? new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await supabase
      .from('breadth_data')
      .upsert(
        {
          date: targetDate,
          mco,
          mcsi,
          mco_z: mco_z ?? null,
          mcsi_z: mcsi_z ?? null,
          source: 'manual',
        },
        { onConflict: 'date' }
      )
      .select()
      .single();

    if (error) throw error;

    const row = data as BreadthRow;
    console.log(`[Breadth] Saved breadth data for ${targetDate}: MCO=${mco}, MCSI=${mcsi}`);

    return {
      date: row.date,
      mco: Number(row.mco),
      mcsi: Number(row.mcsi),
      mco_z: row.mco_z ? Number(row.mco_z) : undefined,
      mcsi_z: row.mcsi_z ? Number(row.mcsi_z) : undefined,
      source: row.source as 'manual' | 'automated',
    };
  } catch (error) {
    console.error('[Breadth] Failed to save breadth data:', error);
    return null;
  }
}

/**
 * Get breadth data history (for charting)
 * @param days - Number of days to fetch (default 30)
 * @returns Array of breadth data, newest first
 */
export async function getBreadthHistory(days = 30): Promise<BreadthData[]> {
  if (!isSupabaseConfigured()) {
    console.log('[Breadth] Supabase not configured');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('breadth_data')
      .select('*')
      .order('date', { ascending: false })
      .limit(days);

    if (error) throw error;

    return (data as BreadthRow[]).map((row) => ({
      date: row.date,
      mco: Number(row.mco),
      mcsi: Number(row.mcsi),
      mco_z: row.mco_z ? Number(row.mco_z) : undefined,
      mcsi_z: row.mcsi_z ? Number(row.mcsi_z) : undefined,
      source: row.source as 'manual' | 'automated',
    }));
  } catch (error) {
    console.error('[Breadth] Failed to fetch breadth history:', error);
    return [];
  }
}

/**
 * Check if breadth data exists for today
 * @returns True if today's breadth data exists
 */
export async function hasTodayBreadthData(): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const data = await getBreadthDataByDate(today);
  return data !== null;
}
