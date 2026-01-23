/**
 * Gmail Connection Status Endpoint
 *
 * GET /api/gmail/status
 *
 * Returns the current Gmail connection status including:
 * - Whether connected
 * - Connected email address
 * - Token expiry time
 */

import { NextResponse } from "next/server";
import { getGmailStatus, deleteStoredTokens } from "@/lib/gmail/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default-user";

    const status = await getGmailStatus(userId);

    return NextResponse.json(status);
  } catch (error) {
    console.error("Gmail status error:", error);
    return NextResponse.json(
      {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/gmail/status
 *
 * Disconnects Gmail by deleting stored tokens.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "default-user";

    await deleteStoredTokens(userId);

    return NextResponse.json({ success: true, message: "Gmail disconnected" });
  } catch (error) {
    console.error("Gmail disconnect error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
