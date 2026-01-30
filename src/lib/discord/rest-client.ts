/**
 * Discord REST Client
 *
 * Fetches messages from Discord channels using the HTTP REST API.
 * Works on Vercel serverless (no WebSocket needed).
 *
 * @module discord/rest-client
 */

import { createClient } from "@supabase/supabase-js";
import { parseGameplan, ParsedGameplan } from "./parsers/gameplan";

const DISCORD_API = "https://discord.com/api/v10";

interface DiscordMessage {
  id: string;
  channel_id: string;
  author: { id: string; bot?: boolean };
  content: string;
  timestamp: string;
}

/**
 * Fetch recent messages from a Discord channel via REST API.
 * Uses user token (no prefix) or bot token (`Bot ` prefix).
 */
async function fetchChannelMessages(
  channelId: string,
  token: string,
  isUserToken: boolean,
  limit: number = 10
): Promise<DiscordMessage[]> {
  const auth = isUserToken ? token : `Bot ${token}`;
  const res = await fetch(
    `${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`,
    {
      headers: { Authorization: auth },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API ${res.status}: ${body}`);
  }

  return res.json();
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

export interface GameplanSyncResult {
  messagesScanned: number;
  gameplansParsed: number;
  saved: number;
  errors: string[];
  topIdeas: string[];
}

/**
 * Fetch and sync gameplan-focuslist channel via REST API.
 * Works on Vercel serverless.
 */
export async function syncGameplanChannel(
  options: { limit?: number } = {}
): Promise<GameplanSyncResult> {
  const userToken = process.env.DISCORD_USER_TOKEN;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_GAMEPLAN;

  const token = userToken || botToken;
  if (!token) throw new Error("DISCORD_USER_TOKEN or DISCORD_BOT_TOKEN not configured");
  if (!channelId) throw new Error("DISCORD_CHANNEL_GAMEPLAN not configured");

  const supabase = getSupabase();
  const result: GameplanSyncResult = {
    messagesScanned: 0,
    gameplansParsed: 0,
    saved: 0,
    errors: [],
    topIdeas: [],
  };

  const messages = await fetchChannelMessages(
    channelId,
    token,
    !!userToken,
    options.limit || 10
  );

  for (const msg of messages) {
    if (msg.author.bot) continue;
    result.messagesScanned++;

    const parsed = parseGameplan(msg.content, new Date(msg.timestamp));
    if (!parsed.success || !parsed.gameplan) continue;

    result.gameplansParsed++;
    result.topIdeas = parsed.gameplan.top_ideas;

    const record = {
      discord_message_id: msg.id,
      discord_channel_id: msg.channel_id,
      discord_author_id: msg.author.id,
      message_timestamp: msg.timestamp,
      raw_message: msg.content,
      post_date: parsed.gameplan.post_date,
      situational_awareness: parsed.gameplan.situational_awareness,
      gameplan: parsed.gameplan.gameplan,
      top_ideas: parsed.gameplan.top_ideas,
      top_ideas_count: parsed.gameplan.top_ideas.length,
      parse_confidence: parsed.gameplan.confidence,
    };

    const { error } = await supabase
      .from("discord_gameplan")
      .upsert(record, { onConflict: "discord_message_id" });

    if (error) {
      result.errors.push(`Message ${msg.id}: ${error.message}`);
    } else {
      result.saved++;
    }
  }

  // Update sync state
  if (messages.length > 0) {
    await supabase.from("discord_sync_state").upsert(
      {
        channel_id: channelId,
        channel_name: "gameplan-focuslist",
        last_message_id: messages[0].id,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "channel_id" }
    );
  }

  return result;
}

/**
 * Get the latest Top Ideas from Supabase
 */
export async function getLatestTopIdeas(): Promise<{
  top_ideas: string[];
  post_date: string;
  situational_awareness: string;
  gameplan: string;
} | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("discord_gameplan")
    .select("top_ideas, post_date, situational_awareness, gameplan")
    .not("top_ideas", "is", null)
    .order("post_date", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}
