/**
 * Extract Breadth Data from Screenshot
 *
 * POST /api/extract-breadth
 *
 * Server-side API route that calls Anthropic to extract
 * MCO/MCSI data from McClellan Analysis screenshots.
 * Keeps API key secure on server.
 */

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: Request) {
  try {
    const { image, mediaType = 'image/png' } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: 'Missing image data' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
              data: image,
            },
          },
          {
            type: 'text',
            text: `Extract the Nasdaq 100 row data from this McClellan Analysis screenshot.
Return ONLY valid JSON with no markdown or explanation:
{
  "mcsi_z": number,
  "mco_z": number,
  "mcsi_10dma": number or null,
  "mcsi_1d_change": number,
  "mco_1d_change": number,
  "mcsi_signal": "Bullish" or "Bearish",
  "mco_signal": "Bullish" or "Bearish",
  "breadth_consensus": string from top right badge
}`,
          },
        ],
      }],
    });

    // Extract text response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      );
    }

    // Parse JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Could not parse JSON from response', raw: textContent.text },
        { status: 422 }
      );
    }

    const extracted = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ success: true, data: extracted });

  } catch (error) {
    console.error('[ExtractBreadth] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}
