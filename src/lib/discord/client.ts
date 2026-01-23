/**
 * Discord Bot Client
 *
 * Connects to Discord and monitors trading channels for:
 * - #equity-trades: Trade executions
 * - #alex-journal: Trading journal/reasoning
 * - #pf-update: Portfolio commentary
 *
 * Features:
 * - Real-time message monitoring
 * - Historical message backfill
 * - Automatic parsing and database storage
 *
 * @module discord/client
 */

import {
  Client,
  GatewayIntentBits,
  Partials,
  Message,
  TextChannel,
  Collection,
  ChannelType,
} from "discord.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { parseEquityTrade, ParsedEquityTrade } from "./parsers/equity-trades";
import { parseJournalEntry, ParsedJournalEntry } from "./parsers/alex-journal";
import {
  parsePortfolioUpdate,
  ParsedPortfolioUpdate,
} from "./parsers/pf-update";

// =============================================================================
// Types
// =============================================================================

export interface DiscordConfig {
  botToken: string;
  guildId: string;
  channels: {
    equityTrades: string;
    alexJournal: string;
    pfUpdate: string;
  };
}

export interface SyncResult {
  channel: string;
  messagesProcessed: number;
  newRecords: number;
  errors: string[];
}

export interface ChannelConfig {
  id: string;
  name: string;
  parser: "equity-trades" | "alex-journal" | "pf-update";
}

// =============================================================================
// Supabase Client
// =============================================================================

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(url, key);
}

// =============================================================================
// Discord Bot Class
// =============================================================================

export class DiscordBot {
  private client: Client;
  private supabase: SupabaseClient;
  private config: DiscordConfig;
  private channels: Map<string, ChannelConfig> = new Map();
  private isReady: boolean = false;

  constructor(config: DiscordConfig) {
    this.config = config;
    this.supabase = getSupabaseClient();

    // Initialize Discord client with necessary intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Message, Partials.Channel],
    });

    // Set up channel mappings
    this.channels.set(config.channels.equityTrades, {
      id: config.channels.equityTrades,
      name: "equity-trades",
      parser: "equity-trades",
    });
    this.channels.set(config.channels.alexJournal, {
      id: config.channels.alexJournal,
      name: "alex-journal",
      parser: "alex-journal",
    });
    this.channels.set(config.channels.pfUpdate, {
      id: config.channels.pfUpdate,
      name: "pf-update",
      parser: "pf-update",
    });

    // Set up event handlers
    this.setupEventHandlers();
  }

  // ===========================================================================
  // Event Handlers
  // ===========================================================================

  private setupEventHandlers(): void {
    this.client.once("ready", () => {
      console.log(`[Discord] Bot logged in as ${this.client.user?.tag}`);
      this.isReady = true;
    });

    this.client.on("messageCreate", async (message) => {
      await this.handleMessage(message);
    });

    this.client.on("error", (error) => {
      console.error("[Discord] Client error:", error);
    });

    this.client.on("disconnect", () => {
      console.warn("[Discord] Client disconnected");
      this.isReady = false;
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if message is from a monitored channel
    const channelConfig = this.channels.get(message.channelId);
    if (!channelConfig) return;

    console.log(
      `[Discord] New message in #${channelConfig.name}: ${message.content.slice(0, 50)}...`
    );

    try {
      await this.processMessage(message, channelConfig);
    } catch (error) {
      console.error(`[Discord] Error processing message: ${error}`);
    }
  }

  // ===========================================================================
  // Message Processing
  // ===========================================================================

  private async processMessage(
    message: Message,
    channelConfig: ChannelConfig
  ): Promise<boolean> {
    const messageData = {
      discord_message_id: message.id,
      discord_channel_id: message.channelId,
      discord_author_id: message.author.id,
      message_timestamp: message.createdAt.toISOString(),
      raw_message: message.content,
    };

    switch (channelConfig.parser) {
      case "equity-trades":
        return await this.processEquityTrade(message.content, messageData);
      case "alex-journal":
        return await this.processJournalEntry(message.content, messageData);
      case "pf-update":
        return await this.processPortfolioUpdate(
          message.content,
          message.createdAt,
          messageData
        );
      default:
        return false;
    }
  }

  private async processEquityTrade(
    content: string,
    metadata: Record<string, string>
  ): Promise<boolean> {
    const result = parseEquityTrade(content);
    if (!result.success || !result.trade) {
      console.log(
        `[Discord] Could not parse equity trade: ${result.error || "Unknown"}`
      );
      return false;
    }

    const trade = result.trade;
    const tradeDate =
      trade.trade_date || metadata.message_timestamp.split("T")[0];

    const record = {
      ...metadata,
      trade_date: tradeDate,
      action: trade.action,
      side: trade.side,
      ticker: trade.ticker,
      entry_price: trade.entry_price || null,
      position_pct: trade.position_pct || null,
      ssl: trade.ssl || null,
      ec_risk_pct: trade.ec_risk_pct || null,
      trim_fraction: trade.trim_fraction || null,
      trim_target_r: trade.trim_target_r || null,
      trim_target_price: trade.trim_target_price || null,
      exit_price: trade.exit_price || null,
      gain_pct: trade.gain_pct || null,
      r_multiple: trade.r_multiple || null,
      parse_confidence: trade.confidence,
    };

    const { error } = await this.supabase
      .from("discord_trades")
      .upsert(record, { onConflict: "discord_message_id" });

    if (error) {
      console.error(`[Discord] Error saving equity trade: ${error.message}`);
      return false;
    }

    console.log(
      `[Discord] Saved equity trade: ${trade.action} ${trade.ticker}`
    );
    return true;
  }

  private async processJournalEntry(
    content: string,
    metadata: Record<string, string>
  ): Promise<boolean> {
    const result = parseJournalEntry(content);
    if (!result.success || !result.entry) {
      console.log(
        `[Discord] Could not parse journal entry: ${result.error || "Unknown"}`
      );
      return false;
    }

    const entry = result.entry;
    const entryDate = metadata.message_timestamp.split("T")[0];

    const record = {
      ...metadata,
      entry_date: entryDate,
      ticker: entry.ticker,
      action: entry.action,
      setup_type: entry.setup_type || null,
      mode: entry.mode || null,
      reasoning: entry.reasoning,
      trigger_text: entry.trigger || null,
      risk_note: entry.risk_note || null,
      chart_mentioned: entry.chart_mentioned,
      parse_confidence: entry.confidence,
    };

    const { error } = await this.supabase
      .from("discord_journal")
      .upsert(record, { onConflict: "discord_message_id" });

    if (error) {
      console.error(`[Discord] Error saving journal entry: ${error.message}`);
      return false;
    }

    console.log(
      `[Discord] Saved journal entry: ${entry.action} ${entry.ticker || "(no ticker)"}`
    );
    return true;
  }

  private async processPortfolioUpdate(
    content: string,
    messageDate: Date,
    metadata: Record<string, string>
  ): Promise<boolean> {
    const result = parsePortfolioUpdate(content, messageDate);
    if (!result.success || !result.update) {
      console.log(
        `[Discord] Could not parse portfolio update: ${result.error || "Unknown"}`
      );
      return false;
    }

    const update = result.update;

    const record = {
      ...metadata,
      update_date: update.update_date,
      commentary: update.commentary,
      sentiment: update.sentiment,
      sentiment_score: update.sentiment_score,
      tickers_mentioned: update.tickers_mentioned,
      key_points: update.key_points,
      performance_mentions: update.performance_mentions,
      lessons: update.lessons,
      decisions: update.decisions,
      market_state_mentioned: update.market_state_mentioned || null,
      exposure_mentioned: update.exposure_mentioned || null,
      parse_confidence: update.confidence,
      word_count: update.word_count,
    };

    const { error } = await this.supabase
      .from("discord_portfolio_updates")
      .upsert(record, { onConflict: "discord_message_id" });

    if (error) {
      console.error(
        `[Discord] Error saving portfolio update: ${error.message}`
      );
      return false;
    }

    console.log(`[Discord] Saved portfolio update: ${update.sentiment}`);
    return true;
  }

  // ===========================================================================
  // Historical Sync
  // ===========================================================================

  /**
   * Sync historical messages from a channel
   */
  async syncChannel(
    channelId: string,
    options: {
      limit?: number;
      before?: string;
      after?: string;
    } = {}
  ): Promise<SyncResult> {
    const channelConfig = this.channels.get(channelId);
    if (!channelConfig) {
      return {
        channel: channelId,
        messagesProcessed: 0,
        newRecords: 0,
        errors: [`Unknown channel: ${channelId}`],
      };
    }

    const channel = await this.client.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return {
        channel: channelConfig.name,
        messagesProcessed: 0,
        newRecords: 0,
        errors: ["Channel not found or not a text channel"],
      };
    }

    const textChannel = channel as TextChannel;
    const result: SyncResult = {
      channel: channelConfig.name,
      messagesProcessed: 0,
      newRecords: 0,
      errors: [],
    };

    const limit = options.limit || 100;
    let lastMessageId = options.before;
    let hasMore = true;

    console.log(`[Discord] Starting sync for #${channelConfig.name}...`);

    while (hasMore && result.messagesProcessed < limit) {
      const fetchOptions: { limit: number; before?: string; after?: string } = {
        limit: Math.min(100, limit - result.messagesProcessed),
      };

      if (lastMessageId) {
        fetchOptions.before = lastMessageId;
      }
      if (options.after) {
        fetchOptions.after = options.after;
      }

      const messages = await textChannel.messages.fetch(fetchOptions);

      if (messages.size === 0) {
        hasMore = false;
        break;
      }

      for (const message of messages.values()) {
        if (message.author.bot) continue;

        result.messagesProcessed++;

        try {
          const success = await this.processMessage(message, channelConfig);
          if (success) {
            result.newRecords++;
          }
        } catch (error) {
          result.errors.push(`Message ${message.id}: ${error}`);
        }

        lastMessageId = message.id;
      }

      // Rate limiting - wait 1 second between fetches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Update sync state
    await this.updateSyncState(channelId, channelConfig.name, lastMessageId);

    console.log(
      `[Discord] Sync complete for #${channelConfig.name}: ${result.newRecords}/${result.messagesProcessed} saved`
    );

    return result;
  }

  /**
   * Sync all monitored channels
   */
  async syncAllChannels(
    options: { limit?: number } = {}
  ): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const [channelId, config] of this.channels) {
      // Get last synced message ID
      const { data: syncState } = await this.supabase
        .from("discord_sync_state")
        .select("last_message_id")
        .eq("channel_id", channelId)
        .single();

      const result = await this.syncChannel(channelId, {
        limit: options.limit || 500,
        after: syncState?.last_message_id || undefined,
      });

      results.push(result);
    }

    return results;
  }

  private async updateSyncState(
    channelId: string,
    channelName: string,
    lastMessageId?: string
  ): Promise<void> {
    const { error } = await this.supabase.from("discord_sync_state").upsert(
      {
        channel_id: channelId,
        channel_name: channelName,
        last_message_id: lastMessageId,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "channel_id" }
    );

    if (error) {
      console.error(`[Discord] Error updating sync state: ${error.message}`);
    }
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * Connect to Discord
   */
  async connect(): Promise<void> {
    console.log("[Discord] Connecting to Discord...");
    await this.client.login(this.config.botToken);
  }

  /**
   * Disconnect from Discord
   */
  async disconnect(): Promise<void> {
    console.log("[Discord] Disconnecting from Discord...");
    this.client.destroy();
    this.isReady = false;
  }

  /**
   * Check if bot is connected and ready
   */
  isConnected(): boolean {
    return this.isReady;
  }

  /**
   * Get bot status
   */
  getStatus(): {
    connected: boolean;
    username: string | null;
    channels: string[];
  } {
    return {
      connected: this.isReady,
      username: this.client.user?.tag || null,
      channels: Array.from(this.channels.values()).map((c) => c.name),
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Discord bot instance from environment variables
 */
export function createDiscordBot(): DiscordBot {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const equityTradesChannel = process.env.DISCORD_CHANNEL_EQUITY_TRADES;
  const alexJournalChannel = process.env.DISCORD_CHANNEL_ALEX_JOURNAL;
  const pfUpdateChannel = process.env.DISCORD_CHANNEL_PF_UPDATE;

  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN not configured");
  }
  if (!guildId) {
    throw new Error("DISCORD_GUILD_ID not configured");
  }
  if (!equityTradesChannel || !alexJournalChannel || !pfUpdateChannel) {
    throw new Error("Discord channel IDs not fully configured");
  }

  return new DiscordBot({
    botToken,
    guildId,
    channels: {
      equityTrades: equityTradesChannel,
      alexJournal: alexJournalChannel,
      pfUpdate: pfUpdateChannel,
    },
  });
}

// =============================================================================
// Standalone Runner (for testing)
// =============================================================================

/**
 * Run the bot standalone (for testing or as a separate process)
 */
export async function runBot(): Promise<void> {
  const bot = createDiscordBot();

  // Handle shutdown gracefully
  process.on("SIGINT", async () => {
    console.log("\n[Discord] Shutting down...");
    await bot.disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n[Discord] Shutting down...");
    await bot.disconnect();
    process.exit(0);
  });

  await bot.connect();

  // Keep the process running
  console.log("[Discord] Bot is running. Press Ctrl+C to stop.");
}

// =============================================================================
// Exports
// =============================================================================

export default {
  DiscordBot,
  createDiscordBot,
  runBot,
};
