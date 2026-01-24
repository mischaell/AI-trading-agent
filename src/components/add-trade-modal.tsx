"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import { PortfolioPosition } from "@/types";
import { TradeInput } from "@/lib/agent-pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  // Form state
  const [tradeType, setTradeType] = useState<TradeType>("ENTRY");
  const [ticker, setTicker] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState<number>(0);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [ssl, setSsl] = useState<number>(0);
  const [mode, setMode] = useState<Mode>("MODE1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const tickerInputRef = useRef<HTMLInputElement>(null);

  // Check if ticker exists in portfolio
  const existingPosition = useMemo(() => {
    return existingPositions.find(
      (p) => p.ticker.toUpperCase() === ticker.toUpperCase()
    );
  }, [existingPositions, ticker]);

  // Auto-calculated values
  const calculated = useMemo(() => {
    if (entryPrice <= 0 || amount <= 0) {
      return { shares: 0, riskPerShare: 0, trim2r: 0, positionPct: 0 };
    }

    const shares = Math.floor(amount / entryPrice);
    const riskPerShare = ssl > 0 ? entryPrice - ssl : 0;
    const trim2r = riskPerShare > 0 ? entryPrice + 2 * riskPerShare : 0;
    const positionPct = equity > 0 ? (amount / equity) * 100 : 0;

    return { shares, riskPerShare, trim2r, positionPct };
  }, [amount, entryPrice, ssl, equity]);

  // Reset form when modal opens and lock body scroll
  useEffect(() => {
    if (isOpen) {
      // Lock body scroll
      document.body.style.overflow = "hidden";

      setTradeType("ENTRY");
      setTicker("");
      setDate(new Date().toISOString().split("T")[0]);
      setAmount(0);
      setEntryPrice(0);
      setSsl(0);
      setMode("MODE1");
      setIsSubmitting(false);
      setError(null);
      setTimeout(() => tickerInputRef.current?.focus(), 100);
    }

    return () => {
      // Restore body scroll on unmount
      document.body.style.overflow = "";
    };
  }, [isOpen]);

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
    if (amount <= 0) return "Amount must be positive";
    if (entryPrice <= 0) return "Entry price must be positive";
    if (ssl <= 0) return "SSL (stop loss) is required";
    if (ssl >= entryPrice) return "SSL must be below entry price";
    if (calculated.shares <= 0) return "Amount too small for even 1 share";

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
        shares: calculated.shares,
        price: entryPrice,
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
            </label>
            {tradeType === "ADD" ? (
              <select
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
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
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g., NVDA"
                  className="h-7 text-xs font-mono uppercase"
                />
                {ticker && existingPosition && (
                  <p className="mt-0.5 text-[10px] text-amber-600">
                    Position exists - consider using ADD
                  </p>
                )}
              </>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Date
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-7 text-xs font-mono"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Amount ($)
            </label>
            <Input
              type="number"
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              placeholder="e.g., 10000"
              className="h-7 text-xs font-mono"
            />
          </div>

          {/* Entry Price */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Entry Price ($)
            </label>
            <Input
              type="number"
              step="0.01"
              value={entryPrice || ""}
              onChange={(e) => setEntryPrice(Math.max(0, Number(e.target.value)))}
              placeholder="e.g., 140.50"
              className="h-7 text-xs font-mono"
            />
          </div>

          {/* SSL (Stop Loss) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              SSL (Stop Loss) ($)
            </label>
            <Input
              type="number"
              step="0.01"
              value={ssl || ""}
              onChange={(e) => setSsl(Math.max(0, Number(e.target.value)))}
              placeholder="e.g., 135.00"
              className="h-7 text-xs font-mono"
            />
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
          {calculated.shares > 0 && (
            <div className="rounded-lg bg-zinc-50 p-2 space-y-1">
              <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                Calculated
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Shares:</span>
                  <span className="font-mono font-medium text-zinc-900">
                    {calculated.shares}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Risk/Share:</span>
                  <span className="font-mono font-medium text-zinc-900">
                    ${calculated.riskPerShare.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">2R Target:</span>
                  <span className="font-mono font-medium text-green-600">
                    ${calculated.trim2r.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Position %:</span>
                  <span className="font-mono font-medium text-zinc-900">
                    {calculated.positionPct.toFixed(1)}%
                  </span>
                </div>
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
            disabled={isSubmitting || calculated.shares <= 0}
            className="h-7 text-xs"
          >
            {isSubmitting
              ? "Adding..."
              : `Add ${tradeType} (${calculated.shares} shares)`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AddTradeModal;
