/**
 * Gmail API Client for Trading Report Import
 *
 * Uses Google Gmail API with OAuth2 for authentication.
 * Provides functions to search, retrieve, and parse trading reports.
 *
 * Prerequisites:
 * - GOOGLE_CLIENT_ID in .env.local
 * - GOOGLE_CLIENT_SECRET in .env.local
 * - GOOGLE_REDIRECT_URI in .env.local
 *
 * @see https://developers.google.com/gmail/api
 */

import { createClient } from "@supabase/supabase-js";

// =============================================================================
// Types
// =============================================================================

export interface GmailCredentials {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry_date: number;
  scope: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface EmailContent {
  id: string;
  subject: string;
  from: string;
  date: string;
  textBody: string;
  htmlBody: string;
  inlineImages: InlineImage[];
}

export interface InlineImage {
  contentId: string;
  mimeType: string;
  data: string; // base64 encoded
  filename?: string;
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  data?: string; // base64 encoded
}

export interface GmailTokenStore {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  scope: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Constants
// =============================================================================

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// Only use gmail.readonly - it includes search capability
// gmail.metadata does NOT support the 'q' (search query) parameter
const SCOPES = "https://www.googleapis.com/auth/gmail.readonly";

// Token storage key for localStorage (browser) or table name (Supabase)
const TOKEN_STORAGE_KEY = "gmail_oauth_tokens";

// =============================================================================
// Environment Variables
// =============================================================================

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

function getGoogleClientId(): string {
  return getEnvVar("GOOGLE_CLIENT_ID");
}

function getGoogleClientSecret(): string {
  return getEnvVar("GOOGLE_CLIENT_SECRET");
}

function getGoogleRedirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/gmail/callback";
}

// =============================================================================
// Token Storage (Supabase)
// =============================================================================

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(url, key);
}

/**
 * Store OAuth tokens in Supabase
 */
export async function storeTokens(
  userId: string,
  tokens: GmailCredentials
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from("gmail_tokens").upsert(
    {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`Failed to store tokens: ${error.message}`);
  }
}

/**
 * Retrieve stored OAuth tokens from Supabase
 */
export async function getStoredTokens(
  userId: string
): Promise<GmailCredentials | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: "Bearer",
    expiry_date: data.expiry_date,
    scope: data.scope,
  };
}

/**
 * Delete stored tokens (for logout/disconnect)
 */
export async function deleteStoredTokens(userId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("gmail_tokens")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to delete tokens: ${error.message}`);
  }
}

// =============================================================================
// OAuth2 Authentication
// =============================================================================

/**
 * Generate OAuth2 authorization URL for user consent
 */
export function getAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    ...(state && { state }),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access tokens
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<GmailCredentials> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<GmailCredentials> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: refreshToken, // Keep original refresh token
    token_type: data.token_type,
    expiry_date: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getValidAccessToken(
  userId: string
): Promise<string | null> {
  const tokens = await getStoredTokens(userId);

  if (!tokens) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  const isExpired = tokens.expiry_date < Date.now() + 5 * 60 * 1000;

  if (isExpired && tokens.refresh_token) {
    try {
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      await storeTokens(userId, newTokens);
      return newTokens.access_token;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      return null;
    }
  }

  return tokens.access_token;
}

// =============================================================================
// Gmail API Functions
// =============================================================================

/**
 * Make authenticated request to Gmail API
 */
async function gmailRequest<T>(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${GMAIL_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Search for emails matching a query
 *
 * @param accessToken - Valid OAuth access token
 * @param query - Gmail search query (e.g., "from:primereport subject:Prime Report")
 * @param maxResults - Maximum number of results (default 50)
 * @returns Array of email message metadata
 */
export async function searchEmails(
  accessToken: string,
  query: string,
  maxResults: number = 50
): Promise<EmailMessage[]> {
  interface ListResponse {
    messages?: { id: string; threadId: string }[];
    nextPageToken?: string;
  }

  const params = new URLSearchParams({
    q: query,
    maxResults: maxResults.toString(),
  });

  const listResult = await gmailRequest<ListResponse>(
    accessToken,
    `/messages?${params.toString()}`
  );

  if (!listResult.messages || listResult.messages.length === 0) {
    return [];
  }

  // Fetch metadata for each message
  const messages: EmailMessage[] = [];

  for (const msg of listResult.messages) {
    try {
      const details = await getEmailMetadata(accessToken, msg.id);
      messages.push(details);
    } catch (error) {
      console.warn(`Failed to fetch message ${msg.id}:`, error);
    }
  }

  return messages;
}

/**
 * Get email metadata (subject, from, date)
 */
async function getEmailMetadata(
  accessToken: string,
  messageId: string
): Promise<EmailMessage> {
  interface MessageResponse {
    id: string;
    threadId: string;
    snippet: string;
    payload: {
      headers: { name: string; value: string }[];
    };
  }

  const result = await gmailRequest<MessageResponse>(
    accessToken,
    `/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
  );

  const headers = result.payload.headers;
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  return {
    id: result.id,
    threadId: result.threadId,
    subject: getHeader("Subject"),
    from: getHeader("From"),
    date: getHeader("Date"),
    snippet: result.snippet,
  };
}

/**
 * Get full email content (text, HTML body, and inline images)
 *
 * @param accessToken - Valid OAuth access token
 * @param messageId - Gmail message ID
 * @returns Email content with text, HTML body, and inline images
 */
export async function getEmailContent(
  accessToken: string,
  messageId: string
): Promise<EmailContent> {
  interface Part {
    mimeType: string;
    filename?: string;
    body: { data?: string; size: number; attachmentId?: string };
    headers?: { name: string; value: string }[];
    parts?: Part[];
  }

  interface MessageResponse {
    id: string;
    snippet: string;
    payload: {
      mimeType: string;
      headers: { name: string; value: string }[];
      body: { data?: string; size: number };
      parts?: Part[];
    };
  }

  interface AttachmentResponse {
    data: string;
    size: number;
  }

  const result = await gmailRequest<MessageResponse>(
    accessToken,
    `/messages/${messageId}?format=full`
  );

  const headers = result.payload.headers;
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

  // Extract body content and inline images from parts
  let textBody = "";
  let htmlBody = "";
  const inlineImages: InlineImage[] = [];
  const imagesToFetch: { contentId: string; attachmentId: string; mimeType: string; filename?: string }[] = [];

  function extractParts(parts: Part[] | undefined) {
    if (!parts) return;

    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body.data) {
        textBody = decodeBase64Url(part.body.data);
      } else if (part.mimeType === "text/html" && part.body.data) {
        htmlBody = decodeBase64Url(part.body.data);
      } else if (part.mimeType.startsWith("image/")) {
        // Get Content-ID header for inline images
        const contentIdHeader = part.headers?.find(
          (h) => h.name.toLowerCase() === "content-id"
        );
        const contentId = contentIdHeader?.value?.replace(/[<>]/g, "") || `image-${inlineImages.length}`;

        if (part.body.data) {
          // Image data is inline
          inlineImages.push({
            contentId,
            mimeType: part.mimeType,
            data: part.body.data,
            filename: part.filename,
          });
        } else if (part.body.attachmentId) {
          // Need to fetch attachment data separately
          imagesToFetch.push({
            contentId,
            attachmentId: part.body.attachmentId,
            mimeType: part.mimeType,
            filename: part.filename,
          });
        }
      }

      if (part.parts) {
        extractParts(part.parts);
      }
    }
  }

  // Handle single-part messages
  if (result.payload.body.data) {
    if (result.payload.mimeType === "text/plain") {
      textBody = decodeBase64Url(result.payload.body.data);
    } else if (result.payload.mimeType === "text/html") {
      htmlBody = decodeBase64Url(result.payload.body.data);
    }
  }

  // Handle multi-part messages
  if (result.payload.parts) {
    extractParts(result.payload.parts);
  }

  // Fetch any images that need separate attachment requests
  for (const img of imagesToFetch) {
    try {
      const attachmentData = await gmailRequest<AttachmentResponse>(
        accessToken,
        `/messages/${messageId}/attachments/${img.attachmentId}`
      );
      inlineImages.push({
        contentId: img.contentId,
        mimeType: img.mimeType,
        data: attachmentData.data,
        filename: img.filename,
      });
    } catch (error) {
      console.warn(`Failed to fetch inline image ${img.contentId}:`, error);
    }
  }

  // Also extract images from HTML URLs (for newsletters with external images)
  if (htmlBody && inlineImages.length === 0) {
    const htmlImages = await extractImagesFromHtml(htmlBody);
    inlineImages.push(...htmlImages);
  }

  console.log(`[Gmail] Extracted ${inlineImages.length} inline images from email`);

  return {
    id: result.id,
    subject: getHeader("Subject"),
    from: getHeader("From"),
    date: getHeader("Date"),
    textBody,
    htmlBody,
    inlineImages,
  };
}

/**
 * Extract images from HTML by fetching external URLs
 * Filters for likely chart/dashboard images (not icons, logos, etc.)
 */
async function extractImagesFromHtml(html: string): Promise<InlineImage[]> {
  const images: InlineImage[] = [];

  // Match img tags with src attributes
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const matches = [...html.matchAll(imgRegex)];

  // Filter URLs - keep only substantial images (charts, dashboards)
  const imageUrls: string[] = [];
  for (const match of matches) {
    const url = match[1];

    // Skip tiny images, tracking pixels, icons, logos
    if (
      url.includes('tracking') ||
      url.includes('pixel') ||
      url.includes('logo') ||
      url.includes('icon') ||
      url.includes('avatar') ||
      url.includes('emoji') ||
      url.includes('badge') ||
      url.includes('button') ||
      url.includes('spacer') ||
      url.includes('1x1') ||
      url.includes('transparent') ||
      url.length < 20
    ) {
      continue;
    }

    // Keep Substack images and other CDN images likely to be content
    if (
      url.includes('substack') ||
      url.includes('substackcdn') ||
      url.includes('tradingview') ||
      url.includes('chart') ||
      url.includes('screenshot') ||
      url.includes('image') ||
      url.includes('cdn')
    ) {
      imageUrls.push(url);
    }
  }

  console.log(`[Gmail] Found ${imageUrls.length} potential content images in HTML`);

  // Fetch up to 5 images (to avoid rate limits and excessive API calls)
  const maxImages = 5;
  for (let i = 0; i < Math.min(imageUrls.length, maxImages); i++) {
    const url = imageUrls[i];
    try {
      console.log(`[Gmail] Fetching image ${i + 1}: ${url.substring(0, 80)}...`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradingAgent/1.0)',
        },
      });

      if (!response.ok) {
        console.warn(`[Gmail] Failed to fetch image: ${response.status}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || 'image/png';
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      // Skip small images (likely icons/spacers)
      if (arrayBuffer.byteLength < 5000) {
        console.log(`[Gmail] Skipping small image (${arrayBuffer.byteLength} bytes)`);
        continue;
      }

      images.push({
        contentId: `html-image-${i}`,
        mimeType: contentType.split(';')[0],
        data: base64,
        filename: `image-${i}.${contentType.includes('png') ? 'png' : 'jpg'}`,
      });

      console.log(`[Gmail] Fetched image: ${arrayBuffer.byteLength} bytes, ${contentType}`);
    } catch (error) {
      console.warn(`[Gmail] Error fetching image ${url}:`, error);
    }
  }

  return images;
}

/**
 * Get email attachments (image files)
 *
 * @param accessToken - Valid OAuth access token
 * @param messageId - Gmail message ID
 * @returns Array of attachment metadata and data
 */
export async function getEmailAttachments(
  accessToken: string,
  messageId: string
): Promise<EmailAttachment[]> {
  interface Part {
    mimeType: string;
    filename: string;
    body: { attachmentId?: string; size: number; data?: string };
    parts?: Part[];
  }

  interface MessageResponse {
    payload: {
      parts?: Part[];
    };
  }

  interface AttachmentResponse {
    data: string;
    size: number;
  }

  const result = await gmailRequest<MessageResponse>(
    accessToken,
    `/messages/${messageId}?format=full`
  );

  const attachments: EmailAttachment[] = [];

  function extractAttachments(parts: Part[] | undefined) {
    if (!parts) return;

    for (const part of parts) {
      // Check if this is an image attachment
      if (
        part.mimeType.startsWith("image/") &&
        part.body.attachmentId &&
        part.filename
      ) {
        attachments.push({
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body.size,
          attachmentId: part.body.attachmentId,
        });
      }

      if (part.parts) {
        extractAttachments(part.parts);
      }
    }
  }

  extractAttachments(result.payload.parts);

  // Fetch attachment data for each
  for (const attachment of attachments) {
    try {
      const attachmentData = await gmailRequest<AttachmentResponse>(
        accessToken,
        `/messages/${messageId}/attachments/${attachment.attachmentId}`
      );
      attachment.data = attachmentData.data;
    } catch (error) {
      console.warn(`Failed to fetch attachment ${attachment.filename}:`, error);
    }
  }

  return attachments;
}

/**
 * List recent trading reports from the last N days
 *
 * @param accessToken - Valid OAuth access token
 * @param days - Number of days to look back (default 7)
 * @param senderEmail - Email address to filter by (optional - if empty, searches all senders)
 * @param subjectContains - Subject line filter (e.g., "Prime Report")
 * @returns Array of email messages matching criteria
 */
export async function listRecentReports(
  accessToken: string,
  days: number = 7,
  senderEmail?: string,
  subjectContains: string = "Prime Report"
): Promise<EmailMessage[]> {
  // Calculate date N days ago
  const afterDate = new Date();
  afterDate.setDate(afterDate.getDate() - days);
  const afterDateStr = afterDate.toISOString().split("T")[0].replace(/-/g, "/");

  // Build Gmail search query - make from: optional
  const queryParts: string[] = [];
  if (senderEmail && senderEmail.trim()) {
    queryParts.push(`from:${senderEmail}`);
  }
  if (subjectContains && subjectContains.trim()) {
    queryParts.push(`subject:"${subjectContains}"`);
  }
  queryParts.push(`after:${afterDateStr}`);

  const query = queryParts.join(" ");
  console.log(`[Gmail] Search query: ${query}`);

  return searchEmails(accessToken, query, 100);
}

/**
 * Check if Gmail is connected for a user
 */
export async function isGmailConnected(userId: string): Promise<boolean> {
  const token = await getValidAccessToken(userId);
  return token !== null;
}

/**
 * Get Gmail connection status with details
 */
export async function getGmailStatus(userId: string): Promise<{
  connected: boolean;
  email?: string;
  expiresAt?: string;
}> {
  const tokens = await getStoredTokens(userId);

  if (!tokens) {
    return { connected: false };
  }

  // Try to get user's email
  try {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      return { connected: false };
    }

    interface ProfileResponse {
      emailAddress: string;
    }

    const profile = await gmailRequest<ProfileResponse>(
      accessToken,
      "/profile"
    );

    return {
      connected: true,
      email: profile.emailAddress,
      expiresAt: new Date(tokens.expiry_date).toISOString(),
    };
  } catch (error) {
    return { connected: false };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Decode base64url encoded string (Gmail uses URL-safe base64)
 */
function decodeBase64Url(data: string): string {
  // Replace URL-safe characters
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");

  // Decode
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Parse email date string to Date object
 */
export function parseEmailDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Extract report date from email subject or date
 * e.g., "The Prime Report - January 20, 2026" -> Date
 */
export function extractReportDate(subject: string, emailDate: string): Date {
  // Try to extract date from subject first
  const datePatterns = [
    /(\w+)\s+(\d{1,2}),?\s+(\d{4})/i, // "January 20, 2026"
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,   // "01/20/2026"
    /(\d{4})-(\d{2})-(\d{2})/,         // "2026-01-20"
  ];

  for (const pattern of datePatterns) {
    const match = subject.match(pattern);
    if (match) {
      try {
        return new Date(match[0]);
      } catch {
        // Continue to next pattern
      }
    }
  }

  // Fallback to email date
  return parseEmailDate(emailDate);
}

// =============================================================================
// Exports
// =============================================================================

export default {
  // Auth
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  isGmailConnected,
  getGmailStatus,

  // Token storage
  storeTokens,
  getStoredTokens,
  deleteStoredTokens,

  // Gmail API
  searchEmails,
  getEmailContent,
  getEmailAttachments,
  listRecentReports,

  // Utilities
  parseEmailDate,
  extractReportDate,
};
