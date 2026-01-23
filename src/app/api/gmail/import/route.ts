/**
 * Gmail Report Import Endpoint
 *
 * POST /api/gmail/import
 *
 * Imports and parses trading reports from Gmail.
 *
 * Request body:
 * {
 *   userId: string,
 *   days?: number (default 7),
 *   senderEmail?: string,
 *   subjectFilter?: string
 * }
 *
 * Returns imported reports with parsing results.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getValidAccessToken,
  listRecentReports,
  getEmailContent,
  extractReportDate,
} from "@/lib/gmail/client";
import { parseReport, validateReport } from "@/lib/gmail/report-parser";
import { analyzeEmailImages } from "@/lib/gmail/image-analyzer";
import type { DailyReportInsert } from "@/types/daily-report";

// =============================================================================
// Types
// =============================================================================

interface ImportRequest {
  userId?: string;
  days?: number;
  senderEmail?: string;
  subjectFilter?: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  failed: number;
  reports: {
    date: string;
    status: "imported" | "skipped" | "failed";
    reason?: string;
  }[];
}

// =============================================================================
// Supabase Client
// =============================================================================

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(url, key);
}

// =============================================================================
// API Route
// =============================================================================

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body: ImportRequest = await request.json();
    const userId = body.userId || "default-user";
    const days = body.days || 7;
    // Don't default senderEmail - let user control the search
    const senderEmail = body.senderEmail;
    const subjectFilter = body.subjectFilter || "The Prime Report";

    // Get valid access token
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Gmail not connected. Please connect your Gmail account first." },
        { status: 401 }
      );
    }

    // Initialize result tracking
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      failed: 0,
      reports: [],
    };

    // List recent reports from Gmail
    console.log(`[Gmail Import] Searching for reports from last ${days} days...`);
    const emails = await listRecentReports(accessToken, days, senderEmail, subjectFilter);
    console.log(`[Gmail Import] Found ${emails.length} emails`);

    if (emails.length === 0) {
      const searchDesc = senderEmail
        ? `from: ${senderEmail}, subject: "${subjectFilter}"`
        : `subject: "${subjectFilter}"`;
      return NextResponse.json({
        ...result,
        message: `No emails found matching criteria (last ${days} days, ${searchDesc}). Try adjusting the search filters.`,
      });
    }

    // Get Supabase client
    const supabase = getSupabaseClient();

    // Check which reports already exist
    const reportDates = emails.map((email) => {
      const date = extractReportDate(email.subject, email.date);
      return date.toISOString().split("T")[0];
    });

    const { data: existingReports } = await supabase
      .from("daily_reports")
      .select("report_date")
      .in("report_date", reportDates);

    const existingDates = new Set(
      existingReports?.map((r) => r.report_date) || []
    );

    // Process each email
    for (const email of emails) {
      const reportDate = extractReportDate(email.subject, email.date)
        .toISOString()
        .split("T")[0];

      // Skip if already exists
      if (existingDates.has(reportDate)) {
        result.skipped++;
        result.reports.push({
          date: reportDate,
          status: "skipped",
          reason: "Already imported",
        });
        continue;
      }

      try {
        // Fetch full email content
        console.log(`[Gmail Import] Fetching content for ${reportDate}...`);
        const content = await getEmailContent(accessToken, email.id);

        // Parse the report text
        console.log(`[Gmail Import] Parsing report for ${reportDate}...`);
        const parsed = await parseReport(content, reportDate);

        // Analyze images if present
        let imageAnalysis = null;
        const imageNotes: string[] = [];
        if (content.inlineImages && content.inlineImages.length > 0) {
          console.log(`[Gmail Import] Analyzing ${content.inlineImages.length} images for ${reportDate}...`);
          try {
            imageAnalysis = await analyzeEmailImages(content.inlineImages);
            imageNotes.push(`Analyzed ${imageAnalysis.analyzedCount}/${imageAnalysis.totalImages} images`);
            if (imageAnalysis.mcclellan) {
              imageNotes.push("Extracted McClellan data from image");
            }
            if (imageAnalysis.sectors) {
              imageNotes.push("Extracted Sectors/Themes from image");
            }
          } catch (imgError) {
            console.warn(`[Gmail Import] Image analysis failed for ${reportDate}:`, imgError);
            imageNotes.push(`Image analysis error: ${imgError instanceof Error ? imgError.message : "Unknown"}`);
          }
        }

        // Validate the parsed report
        const validation = validateReport(parsed);
        if (!validation.isValid) {
          console.warn(`[Gmail Import] Validation warnings for ${reportDate}:`, validation.errors);
        }

        // Prepare insert data
        const insertData: DailyReportInsert = {
          report_date: reportDate,
          email_id: email.id,
          raw_content: parsed.raw_content,

          qqqe_position: parsed.market_analysis.qqqe_position,
          qqqe_structure_slope: parsed.market_analysis.qqqe_structure_slope,
          market_action: parsed.market_analysis.market_action,
          market_analysis_text: parsed.market_analysis.market_analysis_text,
          price_qqqe_text: parsed.market_analysis.price_qqqe_text,

          mcsi_reading: parsed.breadth_data.mcsi_reading,
          mcsi_vs_10dma: parsed.breadth_data.mcsi_vs_10dma,
          mcsi_10dma_slope: parsed.breadth_data.mcsi_10dma_slope,
          mcsi_slope: parsed.breadth_data.mcsi_slope,
          mco_reading: parsed.breadth_data.mco_reading,
          mco_zscore: parsed.breadth_data.mco_zscore,
          mco_status: parsed.breadth_data.mco_status,
          breadth_text: parsed.breadth_data.breadth_text,

          tlmm_signal: parsed.tlmm_signal.signal,
          tlmm_since_date: parsed.tlmm_signal.since_date,
          market_view_text: parsed.tlmm_signal.market_view_text,

          credit_spreads_signal: parsed.market_internals.credit_spreads_signal,
          credit_spreads_text: parsed.market_internals.credit_spreads_text,
          btc_signal: parsed.market_internals.btc_signal,
          btc_text: parsed.market_internals.btc_text,

          universe_tickers: parsed.liquid_leaders.universe_tickers,
          universe_count: parsed.liquid_leaders.universe_count,
          pullback_candidates: parsed.liquid_leaders.pullback_candidates,
          pullback_count: parsed.liquid_leaders.pullback_count,

          // Image-extracted data
          ...(imageAnalysis?.mcclellan && {
            mcsi_nasdaq_zscore: imageAnalysis.mcclellan.mcsi.nasdaq100.zscore,
            mcsi_sp500_zscore: imageAnalysis.mcclellan.mcsi.sp500.zscore,
            mcsi_nyse_zscore: imageAnalysis.mcclellan.mcsi.nyse.zscore,
            mcsi_russell_zscore: imageAnalysis.mcclellan.mcsi.russell2000.zscore,
            mco_nasdaq_zscore: imageAnalysis.mcclellan.mco.nasdaq100.zscore,
            mco_sp500_zscore: imageAnalysis.mcclellan.mco.sp500.zscore,
            mco_nyse_zscore: imageAnalysis.mcclellan.mco.nyse.zscore,
            mco_russell_zscore: imageAnalysis.mcclellan.mco.russell2000.zscore,
            breadth_consensus: imageAnalysis.mcclellan.breadthConsensus,
            mcclellan_data: imageAnalysis.mcclellan as unknown as Record<string, unknown>,
          }),
          ...(imageAnalysis?.sectors && {
            top_themes: imageAnalysis.sectors.topThemes as unknown as Record<string, unknown>[],
            top_sectors: imageAnalysis.sectors.topSectors as unknown as Record<string, unknown>[],
          }),
          ...(imageAnalysis?.charts && imageAnalysis.charts.length > 0 && {
            chart_analysis: imageAnalysis.charts as unknown as Record<string, unknown>[],
          }),
          images_analyzed: imageAnalysis?.analyzedCount || 0,
          image_analysis_notes: imageNotes.length > 0 ? imageNotes : undefined,

          parsing_confidence: parsed.parsing_confidence,
          parsing_notes: [...(parsed.parsing_notes || []), ...imageNotes],
        };

        // Insert into Supabase
        const { error: insertError } = await supabase
          .from("daily_reports")
          .insert(insertData);

        if (insertError) {
          throw new Error(`Database insert failed: ${insertError.message}`);
        }

        result.imported++;
        result.reports.push({
          date: reportDate,
          status: "imported",
        });

        console.log(`[Gmail Import] Successfully imported ${reportDate}`);
      } catch (error) {
        console.error(`[Gmail Import] Failed to import ${reportDate}:`, error);
        result.failed++;
        result.reports.push({
          date: reportDate,
          status: "failed",
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Calculate timing
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[Gmail Import] Complete: ${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed in ${duration}s`
    );

    return NextResponse.json({
      ...result,
      duration: `${duration}s`,
    });
  } catch (error) {
    console.error("[Gmail Import] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gmail/import
 *
 * Returns list of imported reports from database.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const supabase = getSupabaseClient();

    const { data, error, count } = await supabase
      .from("daily_reports")
      .select(
        `
        id,
        report_date,
        qqqe_position,
        qqqe_structure_slope,
        market_action,
        market_analysis_text,
        price_qqqe_text,
        mcsi_reading,
        mco_reading,
        mco_zscore,
        mco_status,
        breadth_text,
        tlmm_signal,
        market_view_text,
        credit_spreads_text,
        btc_text,
        universe_tickers,
        universe_count,
        pullback_count,
        pullback_candidates,
        mcsi_nasdaq_zscore,
        mcsi_sp500_zscore,
        mco_nasdaq_zscore,
        mco_sp500_zscore,
        breadth_consensus,
        top_themes,
        top_sectors,
        images_analyzed,
        parsing_confidence,
        created_at
      `,
        { count: "exact" }
      )
      .order("report_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Database query failed: ${error.message}`);
    }

    return NextResponse.json({
      reports: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Gmail Import] GET error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
