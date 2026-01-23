/**
 * Image Analyzer for Prime Report Newsletter Images
 *
 * Uses Claude's vision capabilities to extract structured data from
 * trading charts and dashboards embedded in the newsletter.
 *
 * Key images to analyze:
 * - McClellan Analysis Dashboard (MCSI/MCO tables)
 * - TLMM Dashboard (breadth snapshot)
 * - Sectors & Themes (ranked lists)
 * - Price Charts (QQQE, Credit Spreads, BTC)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { InlineImage } from "./client";

// =============================================================================
// Types
// =============================================================================

export interface McClellanData {
  mcsi: {
    nasdaq100: { zscore: number; change1d: number; trend: string; signal: string };
    sp500: { zscore: number; change1d: number; trend: string; signal: string };
    nyse: { zscore: number; change1d: number; trend: string; signal: string };
    russell2000: { zscore: number; change1d: number; trend: string; signal: string };
  };
  mco: {
    nasdaq100: { zscore: number; change1d: number; trend: string; signal: string };
    sp500: { zscore: number; change1d: number; trend: string; signal: string };
    nyse: { zscore: number; change1d: number; trend: string; signal: string };
    russell2000: { zscore: number; change1d: number; trend: string; signal: string };
  };
  breadthConsensus: string;
}

export interface SectorThemeData {
  topThemes: {
    rank: number;
    name: string;
    leaders: string[];
    settingUp: string[];
  }[];
  topSectors: {
    rank: number;
    name: string;
    leaders: string[];
    settingUp: string[];
  }[];
}

export interface ChartAnalysis {
  instrument: string;
  position: "above" | "below" | "inside" | "at";
  structure: "rising" | "flat" | "declining";
  keyLevels?: string;
  pattern?: string;
}

export interface ImageAnalysisResult {
  mcclellan?: McClellanData;
  sectors?: SectorThemeData;
  charts?: ChartAnalysis[];
  rawExtraction?: string;
  confidence: number;
  imageType: "mcclellan" | "tlmm" | "sectors" | "chart" | "heatmap" | "unknown";
}

// =============================================================================
// Image Type Detection
// =============================================================================

/**
 * Detect the type of image based on visual content
 */
async function detectImageType(
  anthropic: Anthropic,
  imageData: string,
  mimeType: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageData,
            },
          },
          {
            type: "text",
            text: `Classify this trading newsletter image into ONE of these categories:
- "mcclellan" - McClellan Analysis dashboard with MCSI/MCO tables
- "tlmm" - TLMM Dashboard with breadth snapshot tables
- "sectors" - Sectors & Themes with ranked lists and radar charts
- "chart" - Price chart (QQQE, BTC, Credit Spreads, etc.)
- "heatmap" - RS Heat Map with stock data table
- "screener" - Stock screener with multiple small charts
- "promo" - Promotional banner or advertisement
- "unknown" - Cannot determine

Reply with ONLY the category name, nothing else.`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type === "text") {
    return content.text.trim().toLowerCase();
  }
  return "unknown";
}

// =============================================================================
// McClellan Dashboard Extraction
// =============================================================================

/**
 * Extract McClellan Analysis data from dashboard image
 */
async function extractMcClellanData(
  anthropic: Anthropic,
  imageData: string,
  mimeType: string
): Promise<McClellanData | null> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageData,
            },
          },
          {
            type: "text",
            text: `Extract the McClellan Analysis data from this dashboard image.

Look for two tables:
1. McClellan Summation Index (MCSI) - with columns: Market, Z-Score, 1D Change, Trend, Signal
2. McClellan Oscillator (MCO) - with same columns

Extract data for: Nasdaq 100, S&P 500, NYSE, Russell 2000

Also look for "Breadth Consensus" text at the top right.

Return ONLY valid JSON in this exact format:
{
  "mcsi": {
    "nasdaq100": { "zscore": -0.72, "change1d": -0.08, "trend": "down", "signal": "Bearish" },
    "sp500": { "zscore": 0.0, "change1d": 0.0, "trend": "up", "signal": "Improving" },
    "nyse": { "zscore": 0.0, "change1d": 0.0, "trend": "up", "signal": "Bullish" },
    "russell2000": { "zscore": 0.0, "change1d": 0.0, "trend": "up", "signal": "Bullish" }
  },
  "mco": {
    "nasdaq100": { "zscore": -0.71, "change1d": -0.05, "trend": "down", "signal": "Bearish" },
    "sp500": { "zscore": 0.0, "change1d": 0.0, "trend": "down", "signal": "Weakening" },
    "nyse": { "zscore": 0.0, "change1d": 0.0, "trend": "down", "signal": "Weakening" },
    "russell2000": { "zscore": 0.0, "change1d": 0.0, "trend": "down", "signal": "Weakening" }
  },
  "breadthConsensus": "Mostly Bullish"
}

Use actual values from the image. For trend: "up" or "down". Return ONLY the JSON.`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return null;

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as McClellanData;
  } catch (error) {
    console.error("[ImageAnalyzer] Failed to parse McClellan data:", error);
    return null;
  }
}

// =============================================================================
// Sectors & Themes Extraction
// =============================================================================

/**
 * Extract Sectors & Themes data from dashboard image
 */
async function extractSectorThemeData(
  anthropic: Anthropic,
  imageData: string,
  mimeType: string
): Promise<SectorThemeData | null> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageData,
            },
          },
          {
            type: "text",
            text: `Extract the Sectors & Themes rankings from this dashboard image.

Look for cards showing:
- Theme/Sector name with rank number
- "Leaders" stock tickers
- "Setting Up" stock tickers

Return ONLY valid JSON in this format:
{
  "topThemes": [
    { "rank": 1, "name": "Auto Manufacturers", "leaders": ["TSLA", "RIVN"], "settingUp": ["LCID"] },
    { "rank": 2, "name": "Wind", "leaders": ["GE", "FSLR"], "settingUp": [] }
  ],
  "topSectors": [
    { "rank": 1, "name": "Industrial", "leaders": ["CAT", "DE"], "settingUp": ["MMM"] },
    { "rank": 2, "name": "Basic Materials", "leaders": ["FCX", "NEM"], "settingUp": [] }
  ]
}

Extract up to 10 themes and 10 sectors if visible. Return ONLY the JSON.`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return null;

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as SectorThemeData;
  } catch (error) {
    console.error("[ImageAnalyzer] Failed to parse sector/theme data:", error);
    return null;
  }
}

// =============================================================================
// Chart Analysis
// =============================================================================

/**
 * Analyze a price chart image
 */
async function analyzeChart(
  anthropic: Anthropic,
  imageData: string,
  mimeType: string
): Promise<ChartAnalysis | null> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageData,
            },
          },
          {
            type: "text",
            text: `Analyze this trading chart. Look for:
1. What instrument is shown (QQQE, BTC, SHY/HYG, etc.)
2. Is price ABOVE, BELOW, INSIDE, or AT the cloud/structure (gray area)?
3. Is the 21dma structure RISING, FLAT, or DECLINING?
4. Any notable patterns or key levels?

Return ONLY valid JSON:
{
  "instrument": "QQQE",
  "position": "above",
  "structure": "rising",
  "keyLevels": "Support at 21dma around 85",
  "pattern": "Higher low forming"
}

Use actual observations from the chart. Return ONLY the JSON.`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") return null;

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as ChartAnalysis;
  } catch (error) {
    console.error("[ImageAnalyzer] Failed to parse chart analysis:", error);
    return null;
  }
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyze a single image and extract relevant data
 */
export async function analyzeImage(
  image: InlineImage
): Promise<ImageAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const anthropic = new Anthropic({ apiKey });

  // Convert base64url to standard base64 if needed
  const imageData = image.data.replace(/-/g, "+").replace(/_/g, "/");
  const mimeType = image.mimeType;

  // First, detect the image type
  console.log(`[ImageAnalyzer] Detecting type for image ${image.contentId}...`);
  const imageType = await detectImageType(anthropic, imageData, mimeType);
  console.log(`[ImageAnalyzer] Detected type: ${imageType}`);

  const result: ImageAnalysisResult = {
    confidence: 0.5,
    imageType: imageType as ImageAnalysisResult["imageType"],
  };

  // Extract data based on image type
  switch (imageType) {
    case "mcclellan":
      console.log("[ImageAnalyzer] Extracting McClellan data...");
      const mcclellanData = await extractMcClellanData(anthropic, imageData, mimeType);
      if (mcclellanData) {
        result.mcclellan = mcclellanData;
        result.confidence = 0.9;
      }
      break;

    case "sectors":
      console.log("[ImageAnalyzer] Extracting Sectors & Themes data...");
      const sectorData = await extractSectorThemeData(anthropic, imageData, mimeType);
      if (sectorData) {
        result.sectors = sectorData;
        result.confidence = 0.85;
      }
      break;

    case "chart":
      console.log("[ImageAnalyzer] Analyzing chart...");
      const chartAnalysis = await analyzeChart(anthropic, imageData, mimeType);
      if (chartAnalysis) {
        result.charts = [chartAnalysis];
        result.confidence = 0.8;
      }
      break;

    case "promo":
    case "screener":
    case "heatmap":
      // Skip these for now
      result.confidence = 0.3;
      break;

    default:
      result.confidence = 0.2;
  }

  return result;
}

/**
 * Analyze all images from an email and combine results
 */
export async function analyzeEmailImages(
  images: InlineImage[]
): Promise<{
  mcclellan?: McClellanData;
  sectors?: SectorThemeData;
  charts: ChartAnalysis[];
  analyzedCount: number;
  totalImages: number;
}> {
  console.log(`[ImageAnalyzer] Analyzing ${images.length} images...`);

  const result = {
    mcclellan: undefined as McClellanData | undefined,
    sectors: undefined as SectorThemeData | undefined,
    charts: [] as ChartAnalysis[],
    analyzedCount: 0,
    totalImages: images.length,
  };

  // Filter out very small images (likely icons/spacers)
  const significantImages = images.filter((img) => {
    // Base64 length roughly indicates image size
    // Skip images smaller than ~5KB
    return img.data.length > 5000;
  });

  console.log(`[ImageAnalyzer] ${significantImages.length} significant images to analyze`);

  for (const image of significantImages) {
    try {
      const analysis = await analyzeImage(image);
      result.analyzedCount++;

      if (analysis.mcclellan && !result.mcclellan) {
        result.mcclellan = analysis.mcclellan;
        console.log("[ImageAnalyzer] Found McClellan data");
      }

      if (analysis.sectors && !result.sectors) {
        result.sectors = analysis.sectors;
        console.log("[ImageAnalyzer] Found Sectors data");
      }

      if (analysis.charts) {
        result.charts.push(...analysis.charts);
      }

      // Early exit if we have the key data
      if (result.mcclellan && result.sectors) {
        console.log("[ImageAnalyzer] Found all key data, stopping early");
        break;
      }
    } catch (error) {
      console.error(`[ImageAnalyzer] Error analyzing image ${image.contentId}:`, error);
    }
  }

  console.log(`[ImageAnalyzer] Analysis complete: ${result.analyzedCount}/${significantImages.length} images analyzed`);
  return result;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  analyzeImage,
  analyzeEmailImages,
  detectImageType,
  extractMcClellanData,
  extractSectorThemeData,
  analyzeChart,
};
