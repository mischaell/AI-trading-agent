import { NextResponse } from "next/server";

// Cache the rate for 24 hours
let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET() {
  try {
    // Return cached rate if still valid
    if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_DURATION_MS) {
      return NextResponse.json({
        rate: cachedRate.rate,
        cached: true,
        updatedAt: new Date(cachedRate.timestamp).toISOString(),
      });
    }

    // Fetch from open.er-api.com (free, no API key needed, reliable)
    const response = await fetch("https://open.er-api.com/v6/latest/GBP", {
      cache: "no-store", // Always fetch fresh
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.result !== "success" || !data.rates?.USD) {
      throw new Error("Invalid API response");
    }

    const rate = data.rates.USD;
    cachedRate = { rate, timestamp: Date.now() };

    return NextResponse.json({
      rate,
      cached: false,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Forex API error:", error);

    // Return cached rate if available, even if expired
    if (cachedRate) {
      return NextResponse.json({
        rate: cachedRate.rate,
        cached: true,
        stale: true,
        updatedAt: new Date(cachedRate.timestamp).toISOString(),
      });
    }

    // Fallback to a reasonable default
    return NextResponse.json({
      rate: 1.36,
      cached: false,
      fallback: true,
      error: "Using fallback rate",
    });
  }
}
