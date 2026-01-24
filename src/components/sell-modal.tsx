"use client";

import React, { useEffect, useState, useRef } from "react";
import { PortfolioPosition } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// =============================================================================
// Types
// =============================================================================

interface SellModalProps {
  position: PortfolioPosition | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (shares: number) => Promise<void>;
}

// =============================================================================
// Main Component
// =============================================================================

export function SellModal({ position, isOpen, onClose, onConfirm }: SellModalProps) {
  const [shares, setShares] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxShares = position?.shares ?? 0;

  // Quick select presets
  const presets = [
    { label: "1/3", value: Math.floor(maxShares / 3) },
    { label: "1/2", value: Math.floor(maxShares / 2) },
    { label: "All", value: maxShares },
  ];

  // Reset shares when modal opens with new position
  useEffect(() => {
    if (isOpen && position) {
      setShares(Math.floor((position.shares ?? 0) / 3)); // Default to 1/3
      setIsSubmitting(false);
      // Focus input after brief delay
      setTimeout(() => inputRef.current?.select(), 100);
    }
  }, [isOpen, position]);

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

  // Click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  // Handle confirm
  const handleConfirm = async () => {
    if (shares <= 0 || shares > maxShares || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onConfirm(shares);
      onClose();
    } catch (err) {
      console.error("Failed to execute sell:", err);
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !position) return null;

  const currentPrice = position.last_price ?? position.entry;
  const estimatedProceeds = currentPrice * shares;
  const estimatedPnl = (currentPrice - position.entry) * shares;
  const isFullExit = shares >= maxShares;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-[400px] max-w-[95vw] rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="text-xl font-bold text-zinc-900">
              Sell {position.ticker}
            </div>
            <div
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                (position.total_r ?? 0) >= 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {(position.total_r ?? 0) >= 0 ? "+" : ""}
              {(position.total_r ?? 0).toFixed(2)}R
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <div className="space-y-4 px-6 py-4">
          {/* Position Summary */}
          <div className="flex items-center justify-between text-sm">
            <div className="text-zinc-500">
              Holding: <span className="font-medium text-zinc-900">{maxShares} shares</span>
            </div>
            <div className="text-zinc-500">
              @ <span className="font-medium text-zinc-900">${currentPrice.toFixed(2)}</span>
            </div>
          </div>

          {/* Shares Input */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              Shares to sell
            </label>
            <Input
              ref={inputRef}
              type="number"
              value={shares}
              onChange={(e) => setShares(Math.min(maxShares, Math.max(0, Number(e.target.value))))}
              max={maxShares}
              min={0}
              className="font-mono"
            />
          </div>

          {/* Quick Select Buttons */}
          <div className="flex gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant={shares === preset.value ? "default" : "outline"}
                size="sm"
                onClick={() => setShares(preset.value)}
                className="flex-1"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-zinc-50 p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Est. proceeds:</span>
              <span className="font-mono font-medium text-zinc-900">
                ${estimatedProceeds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Est. P&L:</span>
              <span
                className={`font-mono font-medium ${
                  estimatedPnl >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {estimatedPnl >= 0 ? "+" : ""}
                ${estimatedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {isFullExit && (
              <div className="pt-1 text-xs text-amber-600">
                This will close the entire position
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={shares <= 0 || shares > maxShares || isSubmitting}
          >
            {isSubmitting ? "Selling..." : isFullExit ? "Sell All" : `Sell ${shares} shares`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SellModal;
