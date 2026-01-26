"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { PortfolioPosition } from "@/types";
import { TradeInput } from "@/lib/agent-pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchOHLC } from "@/lib/market-data/client";

// =============================================================================
// Types
// =============================================================================

interface AddTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (trade: TradeInput) => Promise<void>;
  existingPositions: PortfolioPosition[];
  equity: number;
}

type TradeType = "ENTRY" | "ADD";
type Mode = "MODE1" | "MODE2";

// =============================================================================
// Main Component
// =============================================================================

export function AddTradeModal({
  isOpen,
  onClose,
  onConfirm,
  existingPositions,
  equity,
}: AddTradeModalProps) {
  // GBP to USD exchange rate (fetched from API, updated every 24h)
  const [gbpToUsd, setGbpToUsd] = useState<number>(1.27);
  const [rateLoading, setRateLoading] = useState(false);

  // Form state
  const [tradeType, setTradeType] = useState<TradeType>("ENTRY");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState<number>(0);
  const [amount, setAmount] = useState<number>(0);
  const [amountGBP, setAmountGBP] = useState<number>(0);
  const [ssl, setSsl] = useState<number>(0);
  const [mode, setMode] = useState<Mode>("MODE1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [suggestedSsl, setSuggestedSsl] = useState<number>(0);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const tickerInputRef = useRef<HTMLInputElement>(null);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if ticker exists in portfolio
  const existingPosition = useMemo(() => {
    return existingPositions.find(
      (p) => p.ticker.toUpperCase() === ticker.toUpperCase()
    );
  }, [existingPositions, ticker]);

  // Auto-calculated values
  const calculated = useMemo(() => {
    if (shares <= 0 || amount <= 0) {
      return { entryPrice: 0, riskPerShare: 0, trim2r: 0, positionPct: 0, totalRisk: 0, gainLoss: 0, gainLossPct: 0 };
    }

    const entryPrice = amount / shares;
    // SSL must be below entry price for valid risk calculation
    const riskPerShare = ssl > 0 && ssl < entryPrice ? entryPrice - ssl : 0;
    const trim2r = riskPerShare > 0 ? entryPrice + 2 * riskPerShare : 0;
    const positionPct = equity > 0 ? (amount / equity) * 100 : 0;
    const totalRisk = riskPerShare * shares;

    // Calculate gain/loss vs current price
    const gainLoss = currentPrice > 0 ? (currentPrice - entryPrice) * shares : 0;
    const gainLossPct = currentPrice > 0 && entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

    return { entryPrice, riskPerShare, trim2r, positionPct, totalRisk, gainLoss, gainLossPct };
  }, [shares, amount, ssl, equity, currentPrice]);

  // Calculate EMA from array of values
  const calculateEMA = useCallback((values: number[], period: number): number => {
    if (values.length < period) return 0;
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period; // SMA for first period
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }, []);

  // Fetch current price and EMA21 when ticker changes (with debounce)
  const fetchCurrentPrice = useCallback(async (tickerSymbol: string) => {
    if (!tickerSymbol || tickerSymbol.length < 1) return;

    setIsFetchingPrice(true);
    setCurrentPrice(0);
    setSuggestedSsl(0);

    try {
      // Fetch 35 days for EMA21 calculation
      const ohlcData = await fetchOHLC(tickerSymbol.toUpperCase(), 35);
      if (ohlcData && ohlcData.length > 0) {
        const lastDay = ohlcData[ohlcData.length - 1];
        setCurrentPrice(lastDay.close);

        // Calculate EMA21 of lows (losing this = losing structure)
        if (ohlcData.length >= 21) {
          const lows = ohlcData.map(d => d.low);
          const ema21Low = calculateEMA(lows, 21);
          setSuggestedSsl(ema21Low);
        }
      }
    } catch (err) {
      console.error("Failed to fetch price:", err);
    } finally {
      setIsFetchingPrice(false);
    }
  }, [calculateEMA]);

  // Debounced ticker change handler
  const handleTickerChange = useCallback((newTicker: string) => {
    const upperTicker = newTicker.toUpperCase();
    setTicker(upperTicker);

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    if (upperTicker.length >= 1) {
      fetchTimeoutRef.current = setTimeout(() => {
        fetchCurrentPrice(upperTicker);
      }, 500);
    }
  }, [fetchCurrentPrice]);

  // Fetch forex rate
  const fetchForexRate = useCallback(async () => {
    setRateLoading(true);
    try {
      const res = await fetch("/api/forex");
      const data = await res.json();
      if (data.rate) {
        setGbpToUsd(data.rate);
      }
    } catch (err) {
      console.error("Failed to fetch forex rate:", err);
    } finally {
      setRateLoading(false);
    }
  }, []);

  // Reset form when modal opens and lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";

      setTradeType("ENTRY");
      setTicker("");
      setShares(0);
      setAmount(0);
      setAmountGBP(0);
      setSsl(0);
      setMode("MODE1");
      setIsSubmitting(false);
      setError(null);
      setCurrentPrice(0);
      setSuggestedSsl(0);
      setIsFetchingPrice(false);
      fetchForexRate();
      setTimeout(() => tickerInputRef.current?.focus(), 100);
    }

    return () => {
      document.body.style.overflow = "";
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [isOpen, fetchForexRate]);

  // Keyboard support (ESC to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside to close - only on direct backdrop clicks
  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on the backdrop (not bubbled from children)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Validation
  const validate = (): string | null => {
    if (!ticker.trim()) return "Ticker is required";
    if (shares <= 0) return "Shares must be positive";
    if (amount <= 0) return "Amount must be positive";
    if (calculated.entryPrice <= 0) return "Could not calculate entry price";
    if (ssl <= 0) return "SSL (stop loss) is required";
    if (ssl >= calculated.entryPrice) return "SSL must be below entry price";

    if (tradeType === "ADD" && !existingPosition) {
      return `No existing position for ${ticker.toUpperCase()}. Use ENTRY instead.`;
    }

    if (tradeType === "ENTRY" && existingPosition) {
      return `Position already exists for ${ticker.toUpperCase()}. Use ADD instead.`;
    }

    return null;
  };

  // Handle confirm
  const handleConfirm = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const trade: TradeInput = {
        ticker: ticker.toUpperCase(),
        side: "BUY",
        action_type: tradeType,
        shares: shares,
        price: calculated.entryPrice,
        ssl: ssl,
        trim_2r_price: calculated.trim2r,
        mode: mode,
        notes: `Manual ${tradeType} via Add Trade modal. Amount: $${amount.toLocaleString()}`,
      };

      await onConfirm(trade);
      onClose();
    } catch (err) {
      console.error("Failed to execute trade:", err);
      setError(err instanceof Error ? err.message : "Failed to execute trade");
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto p-2"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-[380px] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5">
          <div className="text-sm font-bold text-zinc-900">Add Trade</div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-2.5 px-4 py-3">
          {/* Trade Type Toggle */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Trade Type
            </label>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant={tradeType === "ENTRY" ? "default" : "outline"}
                size="sm"
                onClick={() => { setTradeType("ENTRY"); setTicker(""); }}
                className="flex-1 h-7 text-xs"
              >
                ENTRY (new)
              </Button>
              <Button
                type="button"
                variant={tradeType === "ADD" ? "default" : "outline"}
                size="sm"
                onClick={() => { setTradeType("ADD"); setTicker(""); }}
                className="flex-1 h-7 text-xs"
              >
                ADD (existing)
              </Button>
            </div>
          </div>

          {/* Ticker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Ticker
              {currentPrice > 0 && (
                <span className="ml-2 font-normal text-green-600">
                  Current: ${currentPrice.toFixed(2)}
                </span>
              )}
            </label>
            {tradeType === "ADD" ? (
              <select
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value);
                  if (e.target.value) fetchCurrentPrice(e.target.value);
                }}
                className="flex h-7 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Select position...</option>
                {existingPositions.map((p) => (
                  <option key={p.ticker} value={p.ticker}>
                    {p.ticker} ({p.shares} shares @ ${p.entry.toFixed(2)})
                  </option>
                ))}
              </select>
            ) : (
              <>
                <Input
                  ref={tickerInputRef}
                  type="text"
                  value={ticker}
                  onChange={(e) => handleTickerChange(e.target.value)}
                  placeholder="e.g., NVDA"
                  className="h-7 text-xs font-mono uppercase"
                />
                {isFetchingPrice && (
                  <p className="mt-0.5 text-[10px] text-blue-600">
                    Fetching current price...
                  </p>
                )}
                {ticker && existingPosition && (
                  <p className="mt-0.5 text-[10px] text-amber-600">
                    Position exists - consider using ADD
                  </p>
                )}
              </>
            )}
          </div>

          {/* Shares */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Shares
            </label>
            <Input
              type="number"
              value={shares || ""}
              onChange={(e) => setShares(Math.max(0, Math.floor(Number(e.target.value))))}
              placeholder="e.g., 100"
              className="h-7 text-xs font-mono"
            />
          </div>

          {/* Amount (USD + GBP) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Amount
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
                  <Input
                    type="number"
                    value={amount || ""}
                    onChange={(e) => {
                      const usd = Math.max(0, Number(e.target.value));
                      setAmount(usd);
                      setAmountGBP(usd > 0 ? Math.round(usd / gbpToUsd) : 0);
                    }}
                    placeholder="10000"
                    className="h-7 text-xs font-mono pl-5"
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">£</span>
                  <Input
                    type="number"
                    value={amountGBP || ""}
                    onChange={(e) => {
                      const gbp = Math.max(0, Number(e.target.value));
                      setAmountGBP(gbp);
                      setAmount(Math.round(gbp * gbpToUsd));
                    }}
                    placeholder="7874"
                    className="h-7 text-xs font-mono pl-5"
                  />
                </div>
              </div>
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-400">
              {rateLoading ? "Loading rate..." : `Live rate: £1 = $${gbpToUsd.toFixed(4)}`}
            </p>
          </div>

          {/* SSL (Stop Loss) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              SSL (Stop Loss Price)
              {calculated.entryPrice > 0 && (
                <span className="ml-2 font-normal text-zinc-400">
                  Entry: ${calculated.entryPrice.toFixed(2)}
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                value={ssl || ""}
                onChange={(e) => setSsl(Math.max(0, Number(e.target.value)))}
                placeholder={suggestedSsl > 0 ? suggestedSsl.toFixed(2) : "e.g., 175.00"}
                className="h-7 text-xs font-mono flex-1"
              />
              {suggestedSsl > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSsl(Math.round(suggestedSsl * 100) / 100)}
                  className="h-7 text-[10px] px-2 whitespace-nowrap"
                >
                  Use EMA21: ${suggestedSsl.toFixed(2)}
                </Button>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-400">
              {suggestedSsl > 0
                ? "EMA21 low = losing current structure"
                : "Price per share where you'd exit (must be below entry)"}
            </p>
            {ssl > 0 && calculated.entryPrice > 0 && ssl >= calculated.entryPrice && (
              <p className="mt-0.5 text-[10px] text-red-500 font-medium">
                SSL must be below entry price (${calculated.entryPrice.toFixed(2)})
              </p>
            )}
          </div>

          {/* Mode (ENTRY only) */}
          {tradeType === "ENTRY" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Mode
              </label>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant={mode === "MODE1" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("MODE1")}
                  className="flex-1 h-7 text-[10px] px-1.5"
                >
                  Weakness into structure
                </Button>
                <Button
                  type="button"
                  variant={mode === "MODE2" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("MODE2")}
                  className="flex-1 h-7 text-[10px] px-1.5"
                >
                  Reclaim from inside
                </Button>
              </div>
            </div>
          )}

          {/* Calculated Values */}
          {calculated.entryPrice > 0 && (
            <div className="rounded-lg bg-zinc-50 p-2 space-y-1">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                Calculated
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Entry Price:</span>
                  <span className="font-mono font-medium text-zinc-900">
                    ${calculated.entryPrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Position %:</span>
                  <span className="font-mono font-medium text-zinc-900">
                    {calculated.positionPct.toFixed(1)}%
                  </span>
                </div>
                {currentPrice > 0 && (
                  <>
                    <div className="flex justify-between col-span-2 pt-1 border-t border-zinc-200">
                      <span className="text-zinc-500">Current vs Entry:</span>
                      <span className={`font-mono font-medium ${calculated.gainLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {calculated.gainLoss >= 0 ? "+" : ""}${calculated.gainLoss.toFixed(0)} ({calculated.gainLossPct >= 0 ? "+" : ""}{calculated.gainLossPct.toFixed(1)}%)
                      </span>
                    </div>
                  </>
                )}
                {calculated.riskPerShare > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Risk/Share:</span>
                    <span className="font-mono font-medium text-red-600">
                      ${calculated.riskPerShare.toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Risk/Share:</span>
                    <span className="font-mono text-zinc-400">Set SSL</span>
                  </div>
                )}
                {calculated.riskPerShare > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Total Risk:</span>
                    <span className="font-mono font-medium text-red-600">
                      ${calculated.totalRisk.toFixed(0)}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Total Risk:</span>
                    <span className="font-mono text-zinc-400">-</span>
                  </div>
                )}
                {calculated.trim2r > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">2R Target:</span>
                    <span className="font-mono font-medium text-green-600">
                      ${calculated.trim2r.toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">2R Target:</span>
                    <span className="font-mono text-zinc-400">-</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting} className="h-7 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={isSubmitting || shares <= 0 || amount <= 0}
            className="h-7 text-xs"
          >
            {isSubmitting
              ? "Adding..."
              : `Add ${tradeType} (${shares} @ $${calculated.entryPrice.toFixed(2)})`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AddTradeModal;
