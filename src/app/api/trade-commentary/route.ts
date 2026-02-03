/**
 * AI Trade Commentary & Trading Plan
 *
 * POST /api/trade-commentary
 *
 * Generates Claude AI commentary and a trading plan table
 * for a given ticker's sizing data.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Cache with two windows per day: 14:45 GMT (market open) and 20:30 GMT (pre-close)
// Returns a cache slot like "2026-01-31_AM" or "2026-01-31_PM"
function getCacheSlot(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hhmm = now.getUTCHours() * 100 + now.getUTCMinutes();
  // Before 14:45 GMT = stale from previous day's PM slot
  // 14:45–20:29 GMT = AM slot (market open refresh)
  // 20:30+ GMT = PM slot (pre-close refresh)
  if (hhmm < 1445) return `${date}_PREMARKET`;
  if (hhmm < 2030) return `${date}_AM`;
  return `${date}_PM`;
}

const cache = new Map<string, { data: CommentaryResponse; slot: string }>();

interface CommentaryResponse {
  commentary: string[];
  tradingPlan: { action: string; price: number; gain_pct: number }[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      ticker,
      entry,
      ssl,
      trim_2r_price,
      grade,
      mode,
      rs,
      score,
      dist_21ema_atr,
      close_range_pct,
      is_contracting,
      structure_position,
    } = body;

    if (!ticker || !entry || !ssl) {
      return NextResponse.json({ error: 'Missing required fields: ticker, entry, ssl' }, { status: 400 });
    }

    // Check cache (refreshes at 14:45 GMT and 20:30 GMT)
    const slot = getCacheSlot();
    const cacheKey = `${ticker}_${slot}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.slot === slot) {
      return NextResponse.json(cached.data);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    // Fetch 52-week high for runner target
    let fiftyTwoWeekHigh: number | null = null;
    try {
      const yahooFinance = (await import('yahoo-finance2')).default;
      const quote = await yahooFinance.quote(ticker) as Record<string, unknown>;
      fiftyTwoWeekHigh = typeof quote.fiftyTwoWeekHigh === 'number' ? quote.fiftyTwoWeekHigh : null;
    } catch {
      // If yahoo fails, we'll estimate runner as ~4R
    }

    const rPerShare = entry - ssl;
    const trim1Price = trim_2r_price || entry + 2 * rPerShare;
    const trim2Price = entry + 3 * rPerShare;
    const runnerPrice = fiftyTwoWeekHigh && fiftyTwoWeekHigh > trim2Price ? fiftyTwoWeekHigh : entry + 5 * rPerShare;

    const gainPct = (price: number) => +((((price - entry) / entry) * 100).toFixed(1));

    // Build trading plan without AI (deterministic)
    const tradingPlan = [
      { action: 'Stop-Loss', price: +ssl.toFixed(2), gain_pct: gainPct(ssl) },
      { action: 'Trim 1 (2R)', price: +trim1Price.toFixed(2), gain_pct: gainPct(trim1Price) },
      { action: 'Trim 2 (~3R)', price: +trim2Price.toFixed(2), gain_pct: gainPct(trim2Price) },
      { action: `Runner (${fiftyTwoWeekHigh ? '52wk High' : '~5R'})`, price: +runnerPrice.toFixed(2), gain_pct: gainPct(runnerPrice) },
    ];

    // Generate AI commentary
    const client = new Anthropic({ apiKey });

    const prompt = `You are a concise trading analyst. Given this trade setup, write exactly 2-3 bullet points (each 1 sentence) explaining why this is a good or cautious trade. Focus on structure, momentum, and setup quality. Be direct, no fluff.

Ticker: ${ticker}
Entry: $${entry}
Stop-Loss: $${ssl} (R per share: $${rPerShare.toFixed(2)})
Grade: ${grade || 'N/A'}
Mode: ${mode || 'N/A'}
RS Rating: ${rs ?? 'N/A'}
Score: ${score ?? 'N/A'}
Distance to 21EMA: ${dist_21ema_atr != null ? dist_21ema_atr.toFixed(2) + ' ATR' : 'N/A'}
Close Range: ${close_range_pct != null ? close_range_pct.toFixed(0) + '%' : 'N/A'}
Contracting: ${is_contracting ?? 'N/A'}
Structure: ${structure_position || 'N/A'}
52wk High: ${fiftyTwoWeekHigh ? '$' + fiftyTwoWeekHigh.toFixed(2) : 'N/A'}

Return ONLY a JSON array of 2-3 strings, each a bullet point. Example: ["Point 1.", "Point 2."]`;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    let commentary: string[] = [];
    try {
      const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
      commentary = JSON.parse(text);
      if (!Array.isArray(commentary)) commentary = [text];
    } catch {
      // If parsing fails, use raw text as single bullet
      const text = msg.content[0].type === 'text' ? msg.content[0].text : 'No commentary available.';
      commentary = [text];
    }

    const result: CommentaryResponse = { commentary, tradingPlan };

    // Cache it
    cache.set(cacheKey, { data: result, slot });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[trade-commentary] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
