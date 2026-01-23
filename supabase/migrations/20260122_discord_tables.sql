-- Discord Integration Tables Migration
-- Created: 2026-01-22
-- Purpose: Store data imported from Discord channels

-- =============================================================================
-- discord_trades table (#equity-trades channel)
-- =============================================================================
-- Stores parsed trade executions from Discord
CREATE TABLE IF NOT EXISTS discord_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Message metadata
    discord_message_id TEXT NOT NULL UNIQUE,
    discord_channel_id TEXT NOT NULL,
    discord_author_id TEXT,
    message_timestamp TIMESTAMPTZ NOT NULL,

    -- Trade date (may differ from message timestamp for retrospective posts)
    trade_date DATE NOT NULL,

    -- Trade details
    action TEXT NOT NULL CHECK (action IN ('ENTRY', 'ADD', 'TRIM', 'CLOSE', 'STOP_OUT')),
    side TEXT NOT NULL DEFAULT 'Long' CHECK (side IN ('Long', 'Short')),
    ticker TEXT NOT NULL,

    -- Entry details (for ENTRY/ADD)
    entry_price DECIMAL(12, 4),
    position_pct DECIMAL(5, 2),
    ssl DECIMAL(12, 4),
    ec_risk_pct DECIMAL(5, 2),
    trim_fraction TEXT,
    trim_target_r DECIMAL(5, 2),
    trim_target_price DECIMAL(12, 4),

    -- Exit details (for TRIM/CLOSE/STOP_OUT)
    exit_price DECIMAL(12, 4),
    gain_pct DECIMAL(8, 4),
    r_multiple DECIMAL(5, 2),

    -- Parsing metadata
    raw_message TEXT NOT NULL,
    parse_confidence DECIMAL(3, 2) DEFAULT 0.95,

    -- Linking
    suggested_trade_id UUID REFERENCES suggested_trades(id),
    journal_entry_id UUID,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for discord_trades
CREATE INDEX IF NOT EXISTS idx_discord_trades_ticker ON discord_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_discord_trades_trade_date ON discord_trades(trade_date);
CREATE INDEX IF NOT EXISTS idx_discord_trades_action ON discord_trades(action);
CREATE INDEX IF NOT EXISTS idx_discord_trades_message_ts ON discord_trades(message_timestamp);

-- =============================================================================
-- discord_journal table (#alex-journal channel)
-- =============================================================================
-- Stores trading journal/reasoning entries
CREATE TABLE IF NOT EXISTS discord_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Message metadata
    discord_message_id TEXT NOT NULL UNIQUE,
    discord_channel_id TEXT NOT NULL,
    discord_author_id TEXT,
    message_timestamp TIMESTAMPTZ NOT NULL,

    -- Journal entry
    entry_date DATE NOT NULL,
    ticker TEXT,
    action TEXT NOT NULL CHECK (action IN ('ENTRY', 'EXIT', 'ADD', 'TRIM', 'OBSERVATION', 'ALERT')),

    -- Setup analysis
    setup_type TEXT,
    mode TEXT CHECK (mode IN ('MODE1', 'MODE2', NULL)),
    reasoning TEXT NOT NULL,

    -- Additional context
    trigger_text TEXT,
    target_text TEXT,
    risk_note TEXT,
    chart_mentioned BOOLEAN DEFAULT FALSE,

    -- Parsing metadata
    raw_message TEXT NOT NULL,
    parse_confidence DECIMAL(3, 2) DEFAULT 0.75,

    -- Linking
    linked_trade_id UUID REFERENCES discord_trades(id),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for discord_journal
CREATE INDEX IF NOT EXISTS idx_discord_journal_ticker ON discord_journal(ticker);
CREATE INDEX IF NOT EXISTS idx_discord_journal_entry_date ON discord_journal(entry_date);
CREATE INDEX IF NOT EXISTS idx_discord_journal_mode ON discord_journal(mode);
CREATE INDEX IF NOT EXISTS idx_discord_journal_setup ON discord_journal(setup_type);

-- =============================================================================
-- discord_portfolio_updates table (#pf-update channel)
-- =============================================================================
-- Stores portfolio commentary and market analysis
CREATE TABLE IF NOT EXISTS discord_portfolio_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Message metadata
    discord_message_id TEXT NOT NULL UNIQUE,
    discord_channel_id TEXT NOT NULL,
    discord_author_id TEXT,
    message_timestamp TIMESTAMPTZ NOT NULL,

    -- Update details
    update_date DATE NOT NULL,
    commentary TEXT NOT NULL,

    -- Sentiment analysis
    sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral', 'cautious', 'mixed')),
    sentiment_score DECIMAL(4, 2) DEFAULT 0,

    -- Extracted content (stored as JSONB for flexibility)
    tickers_mentioned TEXT[] DEFAULT '{}',
    key_points TEXT[] DEFAULT '{}',
    performance_mentions JSONB DEFAULT '[]',
    lessons TEXT[] DEFAULT '{}',
    decisions TEXT[] DEFAULT '{}',

    -- Market context
    market_state_mentioned TEXT,
    exposure_mentioned DECIMAL(5, 2),

    -- Parsing metadata
    raw_message TEXT NOT NULL,
    parse_confidence DECIMAL(3, 2) DEFAULT 0.65,
    word_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for discord_portfolio_updates
CREATE INDEX IF NOT EXISTS idx_discord_pf_update_date ON discord_portfolio_updates(update_date);
CREATE INDEX IF NOT EXISTS idx_discord_pf_sentiment ON discord_portfolio_updates(sentiment);
CREATE INDEX IF NOT EXISTS idx_discord_pf_market_state ON discord_portfolio_updates(market_state_mentioned);

-- =============================================================================
-- discord_sync_state table (tracks sync progress)
-- =============================================================================
-- Tracks the last synced message per channel
CREATE TABLE IF NOT EXISTS discord_sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id TEXT NOT NULL UNIQUE,
    channel_name TEXT NOT NULL,
    last_message_id TEXT,
    last_sync_at TIMESTAMPTZ,
    messages_synced INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Update triggers
-- =============================================================================

-- Updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_discord_trades_updated_at ON discord_trades;
CREATE TRIGGER update_discord_trades_updated_at
    BEFORE UPDATE ON discord_trades
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_discord_journal_updated_at ON discord_journal;
CREATE TRIGGER update_discord_journal_updated_at
    BEFORE UPDATE ON discord_journal
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_discord_pf_updated_at ON discord_portfolio_updates;
CREATE TRIGGER update_discord_pf_updated_at
    BEFORE UPDATE ON discord_portfolio_updates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_discord_sync_updated_at ON discord_sync_state;
CREATE TRIGGER update_discord_sync_updated_at
    BEFORE UPDATE ON discord_sync_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE discord_trades IS 'Trade executions imported from Discord #equity-trades channel';
COMMENT ON TABLE discord_journal IS 'Trading journal entries imported from Discord #alex-journal channel';
COMMENT ON TABLE discord_portfolio_updates IS 'Portfolio commentary imported from Discord #pf-update channel';
COMMENT ON TABLE discord_sync_state IS 'Tracks Discord sync progress per channel';
