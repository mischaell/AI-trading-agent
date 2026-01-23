/**
 * Discord Integration Module
 *
 * Provides Discord bot functionality for importing trading data:
 * - Real-time message monitoring
 * - Historical message sync
 * - Message parsing for trades, journal entries, and portfolio updates
 *
 * @module discord
 */

export * from "./client";
export * from "./parsers";

export { DiscordBot, createDiscordBot, runBot } from "./client";
export {
  parseEquityTrade,
  parseEquityTrades,
  validateParsedTrade,
  parseJournalEntry,
  parseJournalEntries,
  matchJournalToTrade,
  parsePortfolioUpdate,
  parsePortfolioUpdates,
  summarizeUpdates,
} from "./parsers";
