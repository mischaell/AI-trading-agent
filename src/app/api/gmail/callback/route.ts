/**
 * Gmail OAuth Callback Endpoint
 *
 * GET /api/gmail/callback
 *
 * Handles the OAuth2 callback from Google after user consent.
 * Exchanges the authorization code for access tokens and stores them.
 */

import { NextResponse } from "next/server";
import { exchangeCodeForTokens, storeTokens } from "@/lib/gmail/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Check for error from Google
    const error = searchParams.get("error");
    if (error) {
      console.error("OAuth error from Google:", error);
      return NextResponse.redirect(
        new URL(`/import-reports?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    // Get authorization code
    const code = searchParams.get("code");
    if (!code) {
      return NextResponse.redirect(
        new URL("/import-reports?error=no_code", request.url)
      );
    }

    // Parse state parameter
    const stateParam = searchParams.get("state");
    let state = { userId: "default-user", returnUrl: "/import-reports" };

    if (stateParam) {
      try {
        state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
      } catch {
        console.warn("Failed to parse state parameter");
      }
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Store tokens in Supabase
    await storeTokens(state.userId, tokens);

    // Redirect back to the import page with success
    const returnUrl = new URL(state.returnUrl || "/import-reports", request.url);
    returnUrl.searchParams.set("connected", "true");

    return NextResponse.redirect(returnUrl);
  } catch (error) {
    console.error("Gmail callback error:", error);

    // Redirect with error
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.redirect(
      new URL(
        `/import-reports?error=${encodeURIComponent(errorMessage)}`,
        request.url
      )
    );
  }
}
