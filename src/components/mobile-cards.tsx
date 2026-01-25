"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/pill";
import { PortfolioPosition, TrimRecommendation } from "@/types/portfolio";
import { FocusListCandidate } from "@/types/focus-list";
import { SizingOutput } from "@/types/sizing";

/** Compact USD format: rounds to nearest $1000 and displays as "$14k" */
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const rounded = Math.round(abs / 1000);
    return `${n < 0 ? "-" : ""}$${rounded}k`;
  }
  return `${n < 0 ? "-" : ""}$${Math.round(abs)}`;
}

// =============================================================================
// PositionCard - For Portfolio View
// =============================================================================

interface PositionCardProps {
  position: PortfolioPosition;
  onTickerClick?: (ticker: string) => void;
  onSell?: (position: PortfolioPosition) => void;
}

export function PositionCard({
  position,
  onTickerClick,
  onSell,
}: PositionCardProps) {
  const rMultiple = position.total_r ?? 0;
  const entryPrice = position.avg_price ?? position.entry;
  const lastPrice = position.last_price ?? entryPrice;
  const heat = position.open_heat ?? 0;
  const value = position.value ?? 0;
  const shares = position.shares ?? 0;
  // P&L = (Last - Entry) × Shares
  const unrealizedPnl = (lastPrice - entryPrice) * shares;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Header Row: Ticker + Total Value (shares) + Sell */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onTickerClick?.(position.ticker)}
            className="text-lg font-bold text-zinc-900 hover:text-blue-600"
          >
            {position.ticker}
          </button>
          <span className="text-lg font-semibold text-zinc-700">
            {fmtCompact(value)} <span className="text-sm text-zinc-500">({shares})</span>
          </span>
        </div>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onSell?.(position)}
          className="h-9 px-3 text-sm"
        >
          Sell
        </Button>
      </div>

      {/* Key Metrics Row */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <div className="text-zinc-500">R</div>
          <Pill tone={rMultiple >= 2 ? "good" : rMultiple < 0 ? "warn" : "neutral"}>
            {rMultiple > 0.005 ? "+" : ""}{rMultiple.toFixed(1)}
          </Pill>
        </div>
        <div>
          <div className="text-zinc-500">Heat</div>
          <div className={`font-semibold ${heat >= 0 ? "text-green-600" : "text-red-600"}`}>
            {heat > 0.005 ? "+" : ""}{heat.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-zinc-500">Weight</div>
          <div className="font-semibold">{position.weight.toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-zinc-500">P&L</div>
          <div className={`font-semibold ${unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
            {unrealizedPnl >= 0 ? "+" : ""}{fmtCompact(unrealizedPnl)}
          </div>
        </div>
      </div>

      {/* Details Row */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="text-zinc-500">Entry</div>
          <div className="font-mono">${entryPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-zinc-500">Last</div>
          <div className="font-mono">${lastPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-zinc-500">SSL</div>
          <div className="font-mono text-red-600">${position.ssl.toFixed(2)}</div>
        </div>
      </div>

      {/* 2R Target if available */}
      {position.trim_available && (
        <div className="mt-2 flex justify-center">
          <Pill tone="good">2R Trim Ready @ ${(position.trim_2r_price ?? 0).toFixed(2)}</Pill>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// OrderTicketCard - For Suggested Trades (Order Tickets)
// =============================================================================

interface OrderTicketCardProps {
  sizing: SizingOutput;
  buttonState: { text: string; disabled: boolean; variant: "default" | "success" | "error" | "owned" };
  onExecute?: () => void;
  onTickerClick?: (ticker: string) => void;
}

export function OrderTicketCard({
  sizing,
  buttonState,
  onExecute,
  onTickerClick,
}: OrderTicketCardProps) {
  const isPassed = sizing.gate === "PASS";
  const isOwned = buttonState.variant === "owned";
  const distAtr = sizing.dist_21ema_atr ?? 0;
  const totalValue = sizing.entry * sizing.shares;

  const buttonClassName = buttonState.variant === "owned"
    ? "bg-emerald-600"
    : buttonState.variant === "success"
    ? "bg-green-600 hover:bg-green-700"
    : buttonState.variant === "error"
    ? "bg-red-600 hover:bg-red-700"
    : "bg-blue-600 hover:bg-blue-700";

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        isOwned ? "border-emerald-300 bg-emerald-50" : !isPassed ? "border-zinc-200 opacity-60" : "border-blue-200"
      }`}
    >
      {/* Header: Ticker + Gate + Grade */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onTickerClick?.(sizing.ticker)}
          className="text-lg font-bold text-zinc-900 hover:text-blue-600"
        >
          {sizing.ticker}
        </button>
        <div className="flex items-center gap-2">
          <Pill tone={isPassed ? "good" : "warn"}>
            {isPassed ? "PASS" : sizing.withhold_reason?.replace(/_/g, " ") ?? "HOLD"}
          </Pill>
          <Pill
            tone={
              sizing.grade === "A" ? "good" : sizing.grade === "B" ? "neutral" : "warn"
            }
          >
            {sizing.grade ?? "—"}
          </Pill>
        </div>
      </div>

      {/* Score + Mode */}
      <div className="mt-2 flex items-center gap-3">
        <span className="text-2xl font-bold text-zinc-900">
          {sizing.score?.toFixed(0) ?? "—"}
        </span>
        <Pill tone={sizing.mode === "MODE2" ? "good" : "neutral"}>
          {sizing.mode === "MODE2" ? "M2" : "M1"}
        </Pill>
        {sizing.is_contracting && (
          <span className="text-sm text-emerald-600">Contracting</span>
        )}
      </div>

      {/* Key Metrics Grid */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="text-zinc-500">Total</div>
          <div className="font-mono font-medium">{fmtCompact(totalValue)} ({sizing.shares})</div>
        </div>
        <div>
          <div className="text-zinc-500">Entry</div>
          <div className="font-mono font-medium">${sizing.entry.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-zinc-500">SSL</div>
          <div className="font-mono font-medium text-red-600">${sizing.ssl.toFixed(2)}</div>
        </div>
      </div>

      {/* Distance + Range Row */}
      <div className="mt-2 flex items-center justify-center gap-4 text-xs">
        <span>
          <span className="text-zinc-500">Dist 21:</span>{" "}
          <Pill
            tone={
              Math.abs(distAtr) <= 0.3 ? "good" : Math.abs(distAtr) <= 0.7 ? "neutral" : "warn"
            }
          >
            {distAtr >= 0 ? "+" : ""}
            {distAtr.toFixed(2)}
          </Pill>
        </span>
        <span>
          <span className="text-zinc-500">Range:</span> {sizing.close_range_pct?.toFixed(0) ?? "—"}%
        </span>
        <span>
          <span className="text-zinc-500">RS:</span> {sizing.rs ?? "—"}
        </span>
      </div>

      {/* Execute Button */}
      {isPassed && (
        <button
          onClick={onExecute}
          disabled={buttonState.disabled}
          className={`mt-4 w-full rounded-lg py-3 text-base font-semibold text-white transition-colors ${buttonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {buttonState.text}
        </button>
      )}
    </div>
  );
}

// =============================================================================
// TrimCard - For Suggested Trades (Trim Recommendations)
// =============================================================================

interface TrimCardProps {
  trim: TrimRecommendation;
  buttonState: { text: string; disabled: boolean; variant: "default" | "success" | "error" };
  onExecute?: () => void;
  onTickerClick?: (ticker: string) => void;
}

export function TrimCard({
  trim,
  buttonState,
  onExecute,
  onTickerClick,
}: TrimCardProps) {
  const buttonClassName = buttonState.variant === "success"
    ? "bg-green-600 hover:bg-green-700"
    : buttonState.variant === "error"
    ? "bg-red-600 hover:bg-red-700"
    : "bg-amber-600 hover:bg-amber-700";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onTickerClick?.(trim.ticker)}
          className="text-lg font-bold text-zinc-900 hover:text-blue-600"
        >
          {trim.ticker}
        </button>
        <Pill tone="good">+{trim.current_r.toFixed(2)}R</Pill>
      </div>

      {/* Trim Details */}
      <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
        <div>
          <div className="text-zinc-600">Entry</div>
          <div className="font-mono font-medium">${trim.entry_price.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-zinc-600">Current</div>
          <div className="font-mono font-medium">${trim.current_price.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-zinc-600">Shares</div>
          <div className="font-mono font-medium">
            {trim.shares_to_sell} / {trim.current_shares}
          </div>
        </div>
      </div>

      <div className="mt-2 text-center">
        <Pill tone="good">Est. P&L: +{fmtCompact(trim.potential_pnl)}</Pill>
      </div>

      {/* Trim Button */}
      <button
        onClick={onExecute}
        disabled={buttonState.disabled}
        className={`mt-4 w-full rounded-lg py-3 text-base font-semibold text-white transition-colors ${buttonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {buttonState.text}
      </button>
    </div>
  );
}

// =============================================================================
// FocusCandidateCard - For Focus List View
// =============================================================================

interface FocusCandidateCardProps {
  candidate: FocusListCandidate;
  onTickerClick?: (ticker: string) => void;
}

export function FocusCandidateCard({
  candidate,
  onTickerClick,
}: FocusCandidateCardProps) {
  const gradeTone =
    candidate.reclaim_backtest_grade === "A"
      ? "good"
      : candidate.reclaim_backtest_grade === "B"
      ? "neutral"
      : "warn";
  const modeTone = candidate.mode === "MODE2" ? "good" : "neutral";
  const distTone =
    Math.abs(candidate.dist_to_21ema_atr) <= 0.3
      ? "good"
      : Math.abs(candidate.dist_to_21ema_atr) <= 0.7
      ? "neutral"
      : "warn";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      {/* Header: Rank + Ticker + Grade + Mode */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-600">
            {candidate.rank}
          </span>
          <button
            onClick={() => onTickerClick?.(candidate.ticker)}
            className="text-lg font-bold text-zinc-900 hover:text-blue-600"
          >
            {candidate.ticker}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={gradeTone}>{candidate.reclaim_backtest_grade}</Pill>
          <Pill tone={modeTone}>{candidate.mode === "MODE2" ? "M2" : "M1"}</Pill>
        </div>
      </div>

      {/* Theme */}
      {candidate.theme && (
        <div className="mt-1 text-xs text-zinc-500">{candidate.theme}</div>
      )}

      {/* Score (prominent) */}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-2xl font-bold text-zinc-900">
          {candidate.score?.toFixed(0) ?? "—"}
        </span>
        <span className="text-xs text-zinc-500">score</span>
      </div>

      {/* Key Metrics Grid */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <div className="text-zinc-500">RS</div>
          <div className="font-mono font-medium">{candidate.rs ?? "—"}</div>
        </div>
        <div>
          <div className="text-zinc-500">Price</div>
          <div className="font-mono font-medium">
            ${candidate.price?.toFixed(2) ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-zinc-500">Dist 21</div>
          <Pill tone={distTone}>{candidate.dist_to_21ema_atr.toFixed(2)}</Pill>
        </div>
        <div>
          <div className="text-zinc-500">Range</div>
          <div className="font-mono font-medium">
            {candidate.close_range_pct?.toFixed(0) ?? "—"}%
          </div>
        </div>
      </div>

      {/* Bottom Row: Contraction + Earnings + Approx */}
      <div className="mt-2 flex items-center justify-center gap-4 text-xs">
        {candidate.is_contracting && (
          <span className="font-medium text-emerald-600">Contracting</span>
        )}
        <span>
          <span className="text-zinc-500">Earn:</span>{" "}
          <Pill tone={candidate.earnings_unknown ? "neutral" : candidate.earnings_days <= 7 ? "warn" : "neutral"}>
            {candidate.earnings_unknown ? "unknown" : `${candidate.earnings_days}d`}
          </Pill>
        </span>
        {candidate.is_approximated && (
          <span className="text-amber-600 font-medium">(approx.)</span>
        )}
      </div>
    </div>
  );
}
