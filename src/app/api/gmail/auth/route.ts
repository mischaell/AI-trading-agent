/**
 * Gmail OAuth Start Endpoint
 *
 * GET /api/gmail/auth
 *
 * Initiates the OAuth2 flow by redirecting to Google's consent screen.
 * After user consents, Google redirects to /api/gmail/callback.
 */

import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/gmail/client";

export async function GET(request: Request) {
  try {
    // Get user ID from query params or generate a temporary one
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default-user";

    // Generate state parameter for CSRF protection
    const state = Buffer.from(
      JSON.stringify({
        userId,
        timestamp: Date.now(),
        returnUrl: searchParams.get("returnUrl") || "/import-reports",
      })
    ).toString("base64url");

    // Get the OAuth authorization URL
    const authUrl = getAuthUrl(state);

    // Redirect to Google's consent screen
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Gmail auth error:", error);
    return NextResponse.json(
      {
        error: "Failed to initiate OAuth flow",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
