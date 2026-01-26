"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Pill } from "@/components/pill";
import { MiniBarTile, BarTone } from "@/components/mini-bar-tile";
import { MarketStateStrip, MarketPermissions } from "@/components/market-state-strip";
import { TopNav, NavItem } from "@/components/top-nav";
import { TickerChartModal } from "@/components/ticker-chart-modal";
import { SellModal } from "@/components/sell-modal";
import { AddTradeModal } from "@/components/add-trade-modal";
import { Button } from "@/components/ui/button";
import { PortfolioPosition, TrimRecommendation } from "@/types";
import { PositionCard, OrderTicketCard, TrimCard, FocusCandidateCard } from "@/components/mobile-cards";

// Pipeline imports
import { runAgentPipeline, AgentState, saveTradeToDatabase, TradeInput, PipelineProgress, clearPipelineCache, clearQuickCache, refreshPortfolioOnly } from "@/lib/agent-pipeline";
import { calculateTradeStats } from "@/tasks/overview";

// =============================================================================
// Types
// =============================================================================

type OHLC = { o: number; h: number; l: number; c: number };

// =============================================================================
// Helper Functions
// =============================================================================

function fmtPct(v: number, dp = 1) {
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(dp)}%`;
}

function fmtUsd(n: number) {
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${n < 0 ? "-" : ""}$${s}`;
}

/** Compact USD format: rounds to nearest $1000 and displays as "$14k" */
function fmtUsdCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const rounded = Math.round(abs / 1000);
    return `${n < 0 ? "-" : ""}$${rounded}k`;
  }
  return `${n < 0 ? "-" : ""}$${Math.round(abs)}`;
}

function toneForReady(r: "A" | "B" | "C") {
  if (r === "A") return "good" as const;
  if (r === "B") return "neutral" as const;
  return "warn" as const;
}

function toneForPnl(n: number) {
  if (n > 0) return "good" as const;
  if (n < 0) return "warn" as const;
  return "neutral" as const;
}

function toneForDist21(x: number) {
  if (x < -0.5 || x > 1.0) return "warn" as const;
  return "neutral" as const;
}

function toneForEarnings(d: number) {
  return d <= 7 ? ("warn" as const) : ("neutral" as const);
}

// =============================================================================
// Clickable Ticker Component
// =============================================================================

function ClickableTicker({
  ticker,
  onClick,
  className = "",
}: {
  ticker: string;
  onClick: (ticker: string) => void;
  className?: string;
}) {
  return (
    <button
      onClick={() => onClick(ticker)}
      className={`cursor-pointer font-semibold text-zinc-900 hover:text-blue-600 hover:underline ${className}`}
    >
      {ticker}
    </button>
  );
}

// =============================================================================
// Chart Components (Market State specific)
// =============================================================================

function ChartPlaceholder({
  title,
  children,
  heightClass = "h-[320px]",
  footerNote,
}: {
  title: string;
  children?: React.ReactNode;
  heightClass?: string;
  footerNote?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <div className="flex items-center gap-2">
          <Pill>Daily</Pill>
          <Pill>21EMA Structure</Pill>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div
          className={`${heightClass} overflow-hidden rounded-xl border border-zinc-200 bg-white`}
        >
          {children ?? (
            <div className="h-full w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50" />
          )}
        </div>
        {footerNote && (
          <div className="mt-2 text-xs text-zinc-500">
            {footerNote}
          </div>
        )}
      </div>
    </div>
  );
}

function mcPoints(
  series: number[],
  w: number,
  h: number,
  minY: number,
  maxY: number
) {
  const clamp = (v: number) => Math.max(minY, Math.min(maxY, v));
  const step = series.length === 1 ? 0 : w / (series.length - 1);
  return series
    .map((v, i) => {
      const x = i * step;
      const vv = clamp(v);
      const y = h - ((vv - minY) / (maxY - minY)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function SigmaRail({
  w,
  h,
  minY,
  maxY,
}: {
  w: number;
  h: number;
  minY: number;
  maxY: number;
}) {
  const yFor = (v: number) => h - ((v - minY) / (maxY - minY)) * h;
  const levels = [2, 1, 0, -1, -2];
  return (
    <>
      {levels.map((lv) => {
        const y = yFor(lv);
        const dashed = lv === 1 || lv === -1;
        const solid = lv === 2 || lv === -2;
        return (
          <line
            key={lv}
            x1={0}
            y1={y}
            x2={w}
            y2={y}
            stroke="#e4e4e7"
            strokeWidth={solid ? 1.25 : 1}
            strokeDasharray={dashed ? "4 4" : undefined}
          />
        );
      })}
    </>
  );
}

function SigmaLabels({
  w,
  h,
  minY,
  maxY,
}: {
  w: number;
  h: number;
  minY: number;
  maxY: number;
}) {
  const yFor = (v: number) => h - ((v - minY) / (maxY - minY)) * h;
  const pill = (text: string, y: number, tone: "red" | "teal") => (
    <g key={text}>
      <rect
        x={w - 36}
        y={y - 10}
        width={34}
        height={18}
        rx={4}
        fill={tone === "red" ? "#ef4444" : "#0ea5a4"}
        opacity={0.9}
      />
      <text
        x={w - 19}
        y={y + 3}
        textAnchor="middle"
        fontSize={10}
        fontFamily="ui-sans-serif, system-ui"
        fill="#ffffff"
      >
        {text}
      </text>
    </g>
  );

  return (
    <>
      {pill("2σ", yFor(2), "red")}
      {pill("1σ", yFor(1), "red")}
      {pill("-1σ", yFor(-1), "teal")}
      {pill("-2σ", yFor(-2), "teal")}
    </>
  );
}

function McClellanChart({
  title,
  series,
  maSeries,
  rightTag,
  rightTagValue,
}: {
  title: string;
  series: number[];
  maSeries?: number[];
  rightTag: string;
  rightTagValue: string;
}) {
  const w = 620;
  const h = 140;
  const minY = -2.5;
  const maxY = 2.5;
  // Reserve space for legend labels on the right
  const chartWidth = w - 45;

  const points = mcPoints(series, chartWidth, h, minY, maxY);
  const maPoints = maSeries ? mcPoints(maSeries, chartWidth, h, minY, maxY) : null;

  // Unique ID for clip path
  const clipId = `chart-clip-${title.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-zinc-800">{title}</div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-700">
            {rightTag}
          </span>
          <span className="rounded-md bg-red-500/90 px-2 py-1 text-[10px] font-semibold text-white">
            {rightTagValue}
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="h-[120px] w-full">
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={chartWidth} height={h} />
          </clipPath>
        </defs>
        <rect x="0" y="0" width={w} height={h} fill="#ffffff" />
        <SigmaRail w={w} h={h} minY={minY} maxY={maxY} />
        <g clipPath={`url(#${clipId})`}>
          {maPoints && (
            <polyline
              fill="none"
              stroke="#a1a1aa"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              points={maPoints}
            />
          )}
          <polyline
            fill="none"
            stroke="#ef4444"
            strokeWidth={2.2}
            points={points}
          />
        </g>
        <SigmaLabels w={w} h={h} minY={minY} maxY={maxY} />
      </svg>
    </div>
  );
}

function McClellanPanel({
  mcoZ,
  mcsiZ,
  mcoValue,
  mcsiValue,
  mcoChange,
  breadthDirection,
  breadthMultiplier,
  breadthDate,
  screenshotUrl,
  consensus,
}: {
  mcoZ: number;
  mcsiZ: number;
  mcoValue?: number;
  mcsiValue?: number;
  mcoChange?: number;
  breadthDirection?: string;
  breadthMultiplier?: number;
  breadthDate?: string;
  screenshotUrl?: string | null;
  consensus?: string;
}) {
  // If we have a screenshot, show it instead of calculated data
  if (screenshotUrl) {
    return (
      <div className="w-full bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-900">
            Normalized McClellan Analysis
          </div>
          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
            consensus?.toLowerCase().includes('bullish')
              ? 'border-zinc-200 bg-emerald-50 text-emerald-700'
              : consensus?.toLowerCase().includes('bearish')
              ? 'border-zinc-200 bg-red-50 text-red-700'
              : 'border-zinc-200 bg-zinc-50 text-zinc-700'
          }`}>
            Breadth Consensus: {consensus || 'Unknown'}
          </span>
        </div>
        <img
          src={screenshotUrl}
          alt="McClellan Analysis"
          className="w-full rounded-lg"
        />
      </div>
    );
  }

  // Show calculated breadth data
  const directionEmoji: Record<string, string> = {
    'HOOK_UP': '↑',
    'EXPANDING': '↗',
    'FLAT': '→',
    'CONTRACTING': '↘',
    'HOOK_DOWN': '↓',
  };

  const directionColor: Record<string, string> = {
    'HOOK_UP': 'text-emerald-600 bg-emerald-50',
    'EXPANDING': 'text-emerald-500 bg-emerald-50',
    'FLAT': 'text-zinc-600 bg-zinc-100',
    'CONTRACTING': 'text-red-500 bg-red-50',
    'HOOK_DOWN': 'text-red-600 bg-red-50',
  };

  const hasCalculatedData = mcoValue !== undefined || mcsiValue !== undefined;

  return (
    <div className="h-full w-full bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-900">
          Nasdaq-100 Breadth Indicators
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
          hasCalculatedData
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-zinc-200 bg-zinc-100 text-zinc-600'
        }`}>
          {hasCalculatedData ? 'Calculated from 100 stocks' : 'Z-scores only'}
        </span>
      </div>

      {/* Breadth Direction Banner */}
      {breadthDirection && (
        <div className={`mb-4 rounded-lg p-4 ${directionColor[breadthDirection] || 'bg-zinc-100'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide opacity-70">Breadth Direction {breadthDate && <span className="opacity-50">({breadthDate})</span>}</div>
              <div className="text-2xl font-bold">
                {breadthDirection.replace('_', ' ')} {directionEmoji[breadthDirection] || ''}
              </div>
            </div>
            {breadthMultiplier !== undefined && (
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide opacity-70">Size Multiplier</div>
                <div className="text-2xl font-bold">{breadthMultiplier.toFixed(2)}x</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MCO and MCSI Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* MCO Card */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            McClellan Oscillator (MCO)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            {mcoValue !== undefined ? (
              <>
                <span className="text-3xl font-bold text-zinc-900">{mcoValue.toFixed(1)}</span>
                <span className="text-sm text-zinc-500">raw</span>
              </>
            ) : (
              <span className="text-3xl font-bold text-zinc-900">{mcoZ.toFixed(2)}σ</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="text-zinc-500">Z-score: <span className="font-mono font-medium text-zinc-700">{mcoZ.toFixed(2)}σ</span></span>
            {mcoChange !== undefined && (
              <span className={`font-mono font-medium ${mcoChange > 0 ? 'text-emerald-600' : mcoChange < 0 ? 'text-red-600' : 'text-zinc-600'}`}>
                {mcoChange > 0 ? '+' : ''}{mcoChange.toFixed(2)} d/d
              </span>
            )}
          </div>
        </div>

        {/* MCSI Card */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            McClellan Summation Index (MCSI)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            {mcsiValue !== undefined ? (
              <>
                <span className="text-3xl font-bold text-zinc-900">{mcsiValue.toFixed(0)}</span>
                <span className="text-sm text-zinc-500">raw</span>
              </>
            ) : (
              <span className="text-3xl font-bold text-zinc-900">{mcsiZ.toFixed(2)}σ</span>
            )}
          </div>
          <div className="mt-2 text-sm">
            <span className="text-zinc-500">Z-score: <span className="font-mono font-medium text-zinc-700">{mcsiZ.toFixed(2)}σ</span></span>
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="mt-4 text-xs text-zinc-400">
        MCO = 19-day EMA(Net Advances) - 39-day EMA(Net Advances). MCSI = Cumulative MCO.
        Direction based on day-over-day MCO change.
      </div>
    </div>
  );
}

function ema(values: number[], length: number) {
  const k = 2 / (length + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function QQQEPanel() {
  const [bars, setBars] = useState<OHLC[]>([]);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);

  // Fetch real QQQE data on mount (6 months = ~130 trading days)
  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/market-data?ticker=QQQE&days=130');
        const json = await response.json();
        if (json.data && json.data.length > 0) {
          const ohlcBars: OHLC[] = json.data.map((d: { open: number; high: number; low: number; close: number }) => ({
            o: d.open,
            h: d.high,
            l: d.low,
            c: d.close,
          }));
          setBars(ohlcBars);
          setDates(json.data.map((d: { date: string }) => d.date));
        }
      } catch (error) {
        console.error('[QQQEPanel] Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white p-3">
        <div className="text-sm text-zinc-500">Loading QQQE data...</div>
      </div>
    );
  }

  // Show empty state if no data
  if (bars.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white p-3">
        <div className="text-sm text-zinc-500">No QQQE data available</div>
      </div>
    );
  }

  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const closes = bars.map((b) => b.c);

  const len = 21;
  const emaHigh = ema(highs, len);
  const emaLow = ema(lows, len);
  const emaClose = ema(closes, len);

  // Chart dimensions with margins for axes
  const margin = { top: 10, right: 50, bottom: 25, left: 10 };
  const totalW = 700;
  const totalH = 300;
  const chartW = totalW - margin.left - margin.right;
  const chartH = totalH - margin.top - margin.bottom;

  const minP = Math.min(...lows) - 0.5;
  const maxP = Math.max(...highs) + 0.5;
  const yFor = (p: number) => margin.top + chartH - ((p - minP) / (maxP - minP)) * chartH;

  const xStep = bars.length === 1 ? 0 : chartW / (bars.length - 1);
  const xFor = (i: number) => margin.left + i * xStep;

  const pathLine = (arr: number[]) =>
    arr
      .map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`)
      .join(" ");

  const cloudPath = () => {
    const top = emaHigh
      .map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`)
      .join(" ");
    const bot = [...emaLow]
      .reverse()
      .map((v, i) => {
        const idx = emaLow.length - 1 - i;
        return `${xFor(idx).toFixed(1)},${yFor(v).toFixed(1)}`;
      })
      .join(" ");
    return `M ${top.replace(/ /g, " L ")} L ${bot.replace(/ /g, " L ")} Z`;
  };

  // Bar color (TradingView style - no gray, use candle direction for inside cloud)
  const barColor = (i: number) => {
    const close = closes[i];
    const open = bars[i].o;
    const GREEN = "#22c55e";
    const RED = "#ef4444";

    // Above cloud - price above all EMAs
    if (close > emaHigh[i] && close > emaClose[i] && close > emaLow[i]) {
      return GREEN;
    }

    // Below cloud - price below all EMAs
    if (close < emaLow[i] && close < emaClose[i] && close < emaHigh[i]) {
      return RED;
    }

    // Inside cloud - use candle direction (no gray)
    return close >= open ? GREEN : RED;
  };

  // Generate price ticks (5 levels)
  const priceRange = maxP - minP;
  const priceStep = priceRange / 4;
  const priceTicks = Array.from({ length: 5 }, (_, i) => minP + i * priceStep);

  // Generate month labels from dates
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabels: { idx: number; label: string }[] = [];
  let lastMonth = '';
  dates.forEach((d, i) => {
    const month = d.substring(5, 7);
    const year = d.substring(2, 4);
    const label = `${monthNames[parseInt(month, 10) - 1]} '${year}`;
    if (month !== lastMonth) {
      monthLabels.push({ idx: i, label });
      lastMonth = month;
    }
  });

  // Get last close and date
  const lastClose = closes[closes.length - 1];
  const lastDate = dates[dates.length - 1];
  const formattedDate = lastDate ? new Date(lastDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }) : '';

  return (
    <div className="relative h-full w-full bg-white p-3">
      {/* Last close value - top right corner */}
      <div className="absolute right-4 top-2 z-10 text-right">
        <div className="text-2xl font-bold text-zinc-900">${lastClose.toFixed(2)}</div>
        <div className="text-xs text-zinc-500">{formattedDate}</div>
      </div>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} className="h-full w-full">
        {/* Price grid lines */}
        {priceTicks.map((p) => (
          <line
            key={p}
            x1={margin.left}
            y1={yFor(p)}
            x2={margin.left + chartW}
            y2={yFor(p)}
            stroke="#e4e4e7"
            strokeWidth={1}
          />
        ))}

        {/* Chart content */}
        <path d={cloudPath()} fill="#a1a1aa" opacity={0.25} />
        <polyline
          fill="none"
          stroke="#d4d4d8"
          strokeWidth={1.25}
          points={pathLine(emaHigh)}
        />
        <polyline
          fill="none"
          stroke="#d4d4d8"
          strokeWidth={1.25}
          points={pathLine(emaLow)}
        />
        <polyline
          fill="none"
          stroke="#a1a1aa"
          strokeWidth={1.4}
          points={pathLine(emaClose)}
        />

        {/* OHLC Bars (TradingView style - thinner, cleaner) */}
        {bars.map((b, i) => {
          const x = xFor(i);
          const yH = yFor(b.h);
          const yL = yFor(b.l);
          const yO = yFor(b.o);
          const yC = yFor(b.c);
          const col = barColor(i);
          return (
            <g key={i}>
              <line x1={x} y1={yH} x2={x} y2={yL} stroke={col} strokeWidth={1.5} />
              <line x1={x - 3} y1={yO} x2={x} y2={yO} stroke={col} strokeWidth={1.5} />
              <line x1={x} y1={yC} x2={x + 3} y2={yC} stroke={col} strokeWidth={1.5} />
            </g>
          );
        })}

        {/* Y-axis price labels (right side) */}
        {priceTicks.map((p) => (
          <text
            key={p}
            x={margin.left + chartW + 5}
            y={yFor(p) + 4}
            fontSize={11}
            fontFamily="ui-monospace, monospace"
            fill="#71717a"
          >
            ${p.toFixed(0)}
          </text>
        ))}

        {/* X-axis month labels (bottom) */}
        {monthLabels.map(({ idx, label }) => (
          <g key={idx}>
            <line
              x1={xFor(idx)}
              y1={margin.top + chartH}
              x2={xFor(idx)}
              y2={margin.top + chartH + 5}
              stroke="#a1a1aa"
              strokeWidth={1}
            />
            <text
              x={xFor(idx)}
              y={margin.top + chartH + 18}
              fontSize={10}
              fontFamily="ui-sans-serif, system-ui"
              fill="#71717a"
              textAnchor="middle"
            >
              {label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// =============================================================================
// Breadth Upload Component
// =============================================================================

interface ExtractedBreadthData {
  mcsi_z: number;
  mco_z: number;
  mcsi_10dma: number;
  mcsi_1d_change: number;
  mco_1d_change: number;
  mcsi_signal: string;
  mco_signal: string;
  breadth_consensus: string;
}

function BreadthUpload({
  onSaved,
  onDataExtracted,
}: {
  onSaved?: () => void;
  onDataExtracted?: (imageUrl: string, data: ExtractedBreadthData) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedBreadthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fileToBase64 = (file: File): Promise<{ base64: string; dataUrl: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Remove data URL prefix for API call
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, dataUrl });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const extractFromImage = async (imageBase64: string, mediaType: string) => {
    const response = await fetch('/api/extract-breadth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, mediaType }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Extraction failed');
    }

    return result.data as ExtractedBreadthData;
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    setError(null);
    setExtractedData(null);
    setSuccess(null);

    try {
      // Convert to base64 and get data URL
      setIsExtracting(true);
      const { base64, dataUrl } = await fileToBase64(file);

      // Show preview using data URL (persists across refreshes)
      setImagePreview(dataUrl);

      // Extract data from image
      const data = await extractFromImage(base64, file.type);
      setExtractedData(data);

      // Notify parent with the data URL (not blob URL) and extracted data
      if (onDataExtracted) {
        onDataExtracted(dataUrl, data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
      setImagePreview(null);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!extractedData) return;

    setIsSaving(true);
    setError(null);

    try {
      // Import saveBreadthData dynamically to avoid circular deps
      const { saveBreadthData } = await import('@/lib/market-data/breadth');

      // Convert z-scores to approximate raw values for storage
      const mco = extractedData.mco_z * 30; // Approximate conversion
      const mcsi = extractedData.mcsi_z * 500; // Approximate conversion

      const result = await saveBreadthData(
        mco,
        mcsi,
        extractedData.mco_z,
        extractedData.mcsi_z
      );

      if (result) {
        setSuccess(`Breadth data saved for ${result.date}`);
        if (onSaved) {
          setTimeout(onSaved, 500);
        }
      } else {
        setError('Failed to save to database');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          handleFile(file);
          return;
        }
      }
    }
  };

  const resetUpload = () => {
    setImagePreview(null);
    setExtractedData(null);
    setError(null);
    setSuccess(null);
  };

  const formatZ = (z: number) => {
    const sign = z >= 0 ? '+' : '';
    return `${sign}${z.toFixed(2)}σ`;
  };

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
        isDragging ? 'border-blue-400 bg-blue-50' : 'border-zinc-200 bg-zinc-50'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {/* Initial State - Drop Zone */}
      {!imagePreview && !isExtracting && (
        <div className="text-center">
          <div className="mb-2 text-sm text-zinc-600">
            Drop McClellan screenshot here or paste (Ctrl+V)
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Choose File
          </button>
          <div className="mt-2 text-xs text-zinc-400">PNG, JPG</div>
        </div>
      )}

      {/* Extracting State */}
      {isExtracting && (
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
          <span className="text-sm text-zinc-600">Extracting data with AI...</span>
        </div>
      )}

      {/* Preview & Results */}
      {imagePreview && !isExtracting && (
        <div className="space-y-3">
          {/* Image Preview */}
          <div className="relative">
            <img
              src={imagePreview}
              alt="McClellan screenshot"
              className="w-full rounded-lg border border-zinc-200"
              style={{ maxHeight: '150px', objectFit: 'contain' }}
            />
            <button
              onClick={resetUpload}
              className="absolute -right-2 -top-2 rounded-full bg-zinc-900 p-1 text-white hover:bg-zinc-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Extracted Data Table */}
          {extractedData && (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="py-1 text-left text-xs font-medium text-zinc-500">Field</th>
                    <th className="py-1 text-right text-xs font-medium text-zinc-500">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-zinc-100">
                    <td className="py-1 text-zinc-700">MCSI Z-Score</td>
                    <td className="py-1 text-right font-mono">{formatZ(extractedData.mcsi_z)}</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-1 text-zinc-700">MCO Z-Score</td>
                    <td className="py-1 text-right font-mono">{formatZ(extractedData.mco_z)}</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-1 text-zinc-700">MCSI 10 SMA</td>
                    <td className="py-1 text-right font-mono">
                      {extractedData.mcsi_10dma != null ? formatZ(extractedData.mcsi_10dma) : '—'}
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-1 text-zinc-700">MCSI Signal</td>
                    <td className="py-1 text-right">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        extractedData.mcsi_signal === 'Bullish'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {extractedData.mcsi_signal}
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-1 text-zinc-700">MCO Signal</td>
                    <td className="py-1 text-right">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        extractedData.mco_signal === 'Bullish'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {extractedData.mco_signal}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-zinc-700">Consensus</td>
                    <td className="py-1 text-right font-medium">{extractedData.breadth_consensus}</td>
                  </tr>
                </tbody>
              </table>

              {/* Save Button */}
              {!success && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-400"
                >
                  {isSaving ? 'Saving...' : 'Save to Database'}
                </button>
              )}

              {/* Success Message */}
              {success && (
                <div className="rounded bg-green-100 px-3 py-2 text-sm text-green-700">
                  {success}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Loading Spinner with Progress
// =============================================================================

const LOADING_MESSAGES = [
  { headline: "Identifying State of the Market", subheadline: "To trade or not to trade?" },
  { headline: "Finding the Leading Stocks", subheadline: "What should I trade?" },
  { headline: "Looking at Risk versus Return", subheadline: "Where should I enter today?" },
  { headline: "Suggesting the 5 Best Trades", subheadline: "Which ones should go into my portfolio?" },
  { headline: "Updating my Current Portfolio", subheadline: "Am I turning a profit?" },
];

function LoadingSpinner({ progress }: { progress: PipelineProgress | null }) {
  const [elapsed, setElapsed] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Cycle through messages every 4 seconds
  useEffect(() => {
    const messageTimer = setInterval(() => {
      setMessageIndex(i => (i + 1) % LOADING_MESSAGES.length);
    }, 4000);
    return () => clearInterval(messageTimer);
  }, []);

  const progressPct = progress?.progress ?? 0;
  const currentMessage = LOADING_MESSAGES[messageIndex];

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-4 w-[400px]">
        {/* Spinner */}
        <div className="relative h-16 w-16">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-semibold text-zinc-700">{progressPct}%</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-zinc-900 transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Rotating messages */}
        <div className="text-center h-16">
          <div className="text-xl font-bold text-zinc-900">{currentMessage.headline}</div>
          <div className="text-base text-zinc-500 mt-1">{currentMessage.subheadline}</div>
        </div>

        {/* Elapsed time */}
        <div className="text-xs text-zinc-400 mt-2">
          Elapsed: {elapsed}s
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// View Components
// =============================================================================

function ViewMarketState({ state }: { state: AgentState }) {
  const t = state.marketState;

  // State for uploaded screenshot - persist to localStorage
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [extractedBreadth, setExtractedBreadth] = useState<ExtractedBreadthData | null>(null);

  // Load screenshot from localStorage on mount
  useEffect(() => {
    const savedScreenshot = localStorage.getItem('breadth_screenshot');
    const savedBreadth = localStorage.getItem('breadth_extracted');
    if (savedScreenshot) {
      setScreenshotUrl(savedScreenshot);
    }
    if (savedBreadth) {
      try {
        setExtractedBreadth(JSON.parse(savedBreadth));
      } catch (e) {
        console.error('Failed to parse saved breadth data:', e);
      }
    }
  }, []);

  const handleBreadthExtracted = (imageUrl: string, data: ExtractedBreadthData) => {
    setScreenshotUrl(imageUrl);
    setExtractedBreadth(data);
    // Persist to localStorage
    localStorage.setItem('breadth_screenshot', imageUrl);
    localStorage.setItem('breadth_extracted', JSON.stringify(data));
  };

  const clearScreenshot = () => {
    setScreenshotUrl(null);
    setExtractedBreadth(null);
    localStorage.removeItem('breadth_screenshot');
    localStorage.removeItem('breadth_extracted');
  };

  const rows = useMemo(
    () => {
      const baseRows = [
        { k: "QQQE vs 21EMA structure", v: t.qqqe_structure_position.replace("_", " ") },
        { k: "21EMA structure slope", v: t.qqqe_structure_slope },
        { k: "MCO (z)", v: `${t.mco_z.toFixed(2)}σ` },
        { k: "MCSI (z)", v: `${t.mcsi_z.toFixed(2)}σ` },
        { k: "MCSI slope", v: t.mcsi_slope.replace("_", " ") },
        { k: "MCSI vs 10DMA", v: t.mcsi_vs_10dma },
      ];

      // Add calculated breadth fields if available
      if (t.mco_value !== undefined) {
        baseRows.push({ k: "MCO (raw)", v: t.mco_value.toFixed(2) });
      }
      if (t.mcsi_value !== undefined) {
        baseRows.push({ k: "MCSI (raw)", v: t.mcsi_value.toFixed(0) });
      }
      if (t.mco_change !== undefined) {
        const changeStr = t.mco_change > 0 ? `+${t.mco_change.toFixed(2)}` : t.mco_change.toFixed(2);
        baseRows.push({ k: "MCO Change (d/d)", v: changeStr });
      }
      if (t.breadth_direction) {
        const directionEmoji = {
          'HOOK_UP': '↑',
          'EXPANDING': '↗',
          'FLAT': '→',
          'CONTRACTING': '↘',
          'HOOK_DOWN': '↓',
        }[t.breadth_direction] || '';
        baseRows.push({ k: "Breadth Direction", v: `${t.breadth_direction} ${directionEmoji}` });
      }
      if (t.breadth_multiplier !== undefined) {
        baseRows.push({ k: "Breadth Multiplier", v: `${t.breadth_multiplier.toFixed(2)}x` });
      }

      return baseRows;
    },
    [t]
  );

  const permissions = t.permissions ?? {
    new_entries: 'NO',
    adds: false,
    pressing: false,
    trims: true,
  };

  // Determine state color
  const stateColors: Record<string, string> = {
    'CONFIRMED_UPTREND': 'bg-emerald-600',
    'EARLY_CONFIRMATION': 'bg-emerald-600',
    'PARTICIPATION_FADE': 'bg-orange-500',
    'BREAKDOWN': 'bg-red-600',
    'WASHOUT': 'bg-red-700',
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* Market State Banner - Top */}
      <div className={`mb-4 rounded-xl ${stateColors[t.state] || 'bg-zinc-600'} p-4 text-white shadow-lg`}>
        {/* Desktop: Horizontal layout */}
        <div className="hidden md:flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-80">Current Market State</div>
            <div className="text-3xl font-bold">{t.state.replace(/_/g, ' ')}</div>
          </div>
          <div className="flex gap-3">
            <div className={`rounded-lg px-3 py-2 ${permissions.new_entries === 'YES' ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className="text-xs opacity-80">New Entries</div>
              <div className="font-bold">{permissions.new_entries}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${permissions.adds ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className="text-xs opacity-80">Adds</div>
              <div className="font-bold">{permissions.adds ? 'YES' : 'NO'}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${permissions.pressing ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className="text-xs opacity-80">Pressing</div>
              <div className="font-bold">{permissions.pressing ? 'YES' : 'NO'}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${permissions.trims ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className="text-xs opacity-80">Trims</div>
              <div className="font-bold">{permissions.trims ? 'YES' : 'NO'}</div>
            </div>
          </div>
        </div>
        {/* Mobile: Stacked layout with 2x2 permissions grid */}
        <div className="md:hidden">
          <div className="text-xs uppercase tracking-wide opacity-80">Current Market State</div>
          <div className="text-2xl font-bold">{t.state.replace(/_/g, ' ')}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className={`rounded-lg px-3 py-2 text-center ${permissions.new_entries === 'YES' ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className="text-xs opacity-80">New Entries</div>
              <div className="font-bold">{permissions.new_entries}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 text-center ${permissions.adds ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className="text-xs opacity-80">Adds</div>
              <div className="font-bold">{permissions.adds ? 'YES' : 'NO'}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 text-center ${permissions.pressing ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className="text-xs opacity-80">Pressing</div>
              <div className="font-bold">{permissions.pressing ? 'YES' : 'NO'}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 text-center ${permissions.trims ? 'bg-white/20' : 'bg-black/20'}`}>
              <div className="text-xs opacity-80">Trims</div>
              <div className="font-bold">{permissions.trims ? 'YES' : 'NO'}</div>
            </div>
          </div>
        </div>
        {/* QQQE Structure Info */}
        <div className="mt-3 flex flex-wrap gap-2 md:gap-4 text-xs md:text-sm opacity-90">
          <span>QQQE: <strong>{t.qqqe_structure_position.replace(/_/g, ' ')}</strong></span>
          <span>Slope: <strong>{t.qqqe_structure_slope}</strong></span>
          {t.breadth_direction && (
            <span>Breadth: <strong>{t.breadth_direction.replace('_', ' ')}</strong></span>
          )}
        </div>
      </div>

      {/* QQQE Chart - Full Width */}
      <ChartPlaceholder
        title="QQQE — Daily (21EMA Structure Cloud)"
        heightClass="h-[280px] md:h-[400px]"
        footerNote="Real-time data via Yahoo Finance. 6 months of daily OHLC."
      >
        <QQQEPanel />
      </ChartPlaceholder>

      {/* Breadth Indicators - Below */}
      <div className="mt-4">
        <ChartPlaceholder
          title="Nasdaq-100 — Breadth Indicators (MCO + MCSI)"
          heightClass={screenshotUrl ? "h-auto" : "h-auto"}
          footerNote={t.mco_value !== undefined ? "Calculated from Nasdaq-100 constituent stocks" : "Upload screenshot or run pipeline for live data"}
        >
          <McClellanPanel
            mcoZ={extractedBreadth?.mco_z ?? t.mco_z}
            mcsiZ={extractedBreadth?.mcsi_z ?? t.mcsi_z}
            mcoValue={t.mco_value}
            mcsiValue={t.mcsi_value}
            mcoChange={t.mco_change}
            breadthDirection={t.breadth_direction}
            breadthMultiplier={t.breadth_multiplier}
            breadthDate={t.breadth_date}
            screenshotUrl={screenshotUrl}
            consensus={extractedBreadth?.breadth_consensus}
          />
        </ChartPlaceholder>
      </div>

      {/* Breadth Import & Market Analysis - Side by Side */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Breadth Screenshot Upload - Hidden on mobile */}
        <Card className="hidden md:block rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Import Breadth Data</CardTitle>
          </CardHeader>
          <CardContent>
            <BreadthUpload onDataExtracted={handleBreadthExtracted} />
            <div className="mt-3 text-xs text-zinc-500">
              Upload a screenshot from the Normalized McClellan Analysis tool.
              AI will extract MCSI/MCO z-scores automatically.
            </div>
            {/* Clear Screenshot Button - show when screenshot is present */}
            {screenshotUrl && (
              <button
                onClick={clearScreenshot}
                className="mt-3 w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
              >
                Clear Screenshot (Show Calculated Data)
              </button>
            )}
            {/* Show status of calculated vs screenshot data */}
            <div className="mt-2 text-xs">
              {screenshotUrl ? (
                <span className="text-amber-600">Using screenshot data</span>
              ) : t.mco_value !== undefined ? (
                <span className="text-emerald-600">Using calculated data from Supabase</span>
              ) : (
                <span className="text-zinc-500">No breadth data loaded</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Market Analysis - Takes 2 columns */}
        <Card className="rounded-2xl shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Market Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              <Pill tone={t.state === 'CONFIRMED_UPTREND' ? 'good' : 'warn'}>
                Current State: {t.state.replace(/_/g, ' ')}
              </Pill>
              <Pill>{t.market} | {t.breadth_universe}</Pill>
              {t.breadth_direction && (
                <Pill tone={
                  t.breadth_direction === 'HOOK_UP' || t.breadth_direction === 'EXPANDING' ? 'good' :
                  t.breadth_direction === 'CONTRACTING' || t.breadth_direction === 'HOOK_DOWN' ? 'warn' :
                  'neutral'
                }>
                  Breadth: {t.breadth_direction.replace(/_/g, ' ')}
                </Pill>
              )}
            </div>

            {/* Desktop: Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.k}>
                      <TableCell className="text-zinc-700">{r.k}</TableCell>
                      <TableCell className="text-right font-medium text-zinc-900">{r.v}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Mobile: Key-value list */}
            <div className="md:hidden space-y-2">
              {rows.map((r) => (
                <div key={r.k} className="flex justify-between border-b border-zinc-100 py-2">
                  <span className="text-xs text-zinc-600">{r.k}</span>
                  <span className="text-sm font-medium text-zinc-900">{r.v}</span>
                </div>
              ))}
            </div>

            {/* Desktop only - permissions already shown in banner on mobile */}
            <div className="mt-4 hidden md:flex flex-wrap gap-2">
              <Pill tone={permissions.new_entries === 'YES' ? "good" : "warn"}>
                New Entries: {permissions.new_entries}
              </Pill>
              <Pill tone={permissions.adds ? "good" : "warn"}>
                Adds: {permissions.adds ? "YES" : "NO"}
              </Pill>
              <Pill tone={permissions.pressing ? "good" : "warn"}>
                Pressing: {permissions.pressing ? "YES" : "NO"}
              </Pill>
              <Pill tone={permissions.trims ? "good" : "neutral"}>
                Trims: {permissions.trims ? "YES" : "NO"}
              </Pill>
            </div>

            <div className="mt-3 hidden md:block text-xs text-zinc-500">
              Contract note: Market state governs portfolio permissions. Agent must not
              recommend actions that violate permissions.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ViewLiquidLeaders({ state, onTickerClick }: { state: AgentState; onTickerClick?: (ticker: string) => void }) {
  const universe = state.universe;
  const leaders = universe.leaders ?? [];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="text-sm font-semibold text-zinc-900">
            Liquid Leaders
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Liquid Leaders ({universe.count})</Pill>
              <Pill>Universe: Ex-China / Ex-Defensives</Pill>
            </div>
            <Pill tone="neutral">Refresh: {universe.refresh}</Pill>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead className="text-center">Mode</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">RS</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Δ21</TableHead>
                <TableHead className="text-right">Range%</TableHead>
                <TableHead className="text-center">Contr</TableHead>
                <TableHead>Setup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaders.slice(0, 20).map((r) => {
                const gradeTone = r.grade === 'A' ? 'good' : r.grade === 'B' ? 'neutral' : 'warn';
                const modeTone = r.mode === 'MODE2' ? 'good' : 'neutral';
                const distTone = toneForDist21(r.dist_21ema_atr);
                return (
                  <TableRow key={r.ticker}>
                    <TableCell className="text-zinc-500">{r.rank}</TableCell>
                    <TableCell>
                      {onTickerClick ? (
                        <ClickableTicker ticker={r.ticker} onClick={onTickerClick} />
                      ) : (
                        <span className="font-semibold text-zinc-900">{r.ticker}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Pill tone={gradeTone}>{r.grade ?? '—'}</Pill>
                    </TableCell>
                    <TableCell className="text-center">
                      <Pill tone={modeTone}>{r.mode === 'MODE2' ? 'M2' : 'M1'}</Pill>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{r.score ?? '—'}</TableCell>
                    <TableCell className="text-right">{r.rs}</TableCell>
                    <TableCell className="text-right">{r.price?.toFixed(2) ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Pill tone={distTone}>{r.dist_21ema_atr?.toFixed(2) ?? '—'}</Pill>
                    </TableCell>
                    <TableCell className="text-right">{r.close_range_pct?.toFixed(0) ?? '—'}%</TableCell>
                    <TableCell className="text-center">
                      {r.is_contracting ? <span className="text-emerald-600">✓</span> : <span className="text-zinc-300">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-600">{r.setup_type ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Sorted by Score (Grade + Distance + Mode + Contraction + RS). Grade A: ≤0.3 ATR + contraction + 60%+ range.
            M2 = reclaim & backtest. Showing top 20 of {universe.count}.
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewPullbackScan({ state, onTickerClick }: { state: AgentState; onTickerClick?: (ticker: string) => void }) {
  const pullbacks = state.pullbacks;
  const marketState = state.marketState;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="text-sm font-semibold text-zinc-900">
            Pullback Scan
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Candidates: {pullbacks.count}</Pill>
              <Pill tone="neutral">Refresh: {pullbacks.refresh}</Pill>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={marketState.state === 'CONFIRMED_UPTREND' ? 'good' : 'warn'}>
                Market: {marketState.state.replace(/_/g, ' ')}
              </Pill>
            </div>
          </div>

          {pullbacks.rules && (
            <div className="mb-4 flex flex-wrap gap-2">
              <Pill>{pullbacks.rules.dist_21_atr}</Pill>
              <Pill>{pullbacks.rules.dist_50_atr}</Pill>
              <Pill>{pullbacks.rules.close_in_upper_range}</Pill>
              <Pill>{pullbacks.rules.contraction}</Pill>
              <Pill>{pullbacks.rules.weekly_return}</Pill>
              <Pill>{pullbacks.rules.earnings}</Pill>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead className="text-center">Grade</TableHead>
                <TableHead className="text-center">Mode</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">RS</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Δ21</TableHead>
                <TableHead className="text-right">Range%</TableHead>
                <TableHead className="text-center">Contr</TableHead>
                <TableHead className="text-right">Earn</TableHead>
                <TableHead>Setup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pullbacks.candidates.map((r) => {
                const gradeTone = r.grade === 'A' ? 'good' : r.grade === 'B' ? 'neutral' : 'warn';
                const modeTone = r.mode === 'MODE2' ? 'good' : 'neutral';
                const distTone = toneForDist21(r.dist_21_atr);
                const earnTone = r.earnings_days <= 7 ? "warn" : "neutral";
                return (
                  <TableRow key={r.ticker}>
                    <TableCell className="text-zinc-500">{r.rank}</TableCell>
                    <TableCell>
                      {onTickerClick ? (
                        <ClickableTicker ticker={r.ticker} onClick={onTickerClick} />
                      ) : (
                        <span className="font-semibold text-zinc-900">{r.ticker}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Pill tone={gradeTone}>{r.grade ?? '—'}</Pill>
                    </TableCell>
                    <TableCell className="text-center">
                      <Pill tone={modeTone}>{r.mode === 'MODE2' ? 'M2' : 'M1'}</Pill>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{r.score ?? '—'}</TableCell>
                    <TableCell className="text-right">{r.rs}</TableCell>
                    <TableCell className="text-right">{r.price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Pill tone={distTone}>{r.dist_21_atr.toFixed(2)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">{r.close_pct.toFixed(0)}%</TableCell>
                    <TableCell className="text-center">
                      {r.contraction ? <span className="text-emerald-600">✓</span> : <span className="text-zinc-300">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={earnTone}>{r.earnings_days}d</Pill>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-600">{r.setup_type ?? '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Contract note: Task 3 is a scan only. It does not place trades. The next
            view (Focus List) ranks A/B/C and prepares entry plans.
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewFocusList({ state, onTickerClick }: { state: AgentState; onTickerClick?: (ticker: string) => void }) {
  const focusList = state.focusList;
  const marketState = state.marketState;

  // Show all candidates (up to 10 from focus list ranking)
  const candidates = focusList.candidates ?? [];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Focus List — Top 5 Candidates</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Top {candidates.length}</Pill>
              <Pill tone={marketState.state === 'CONFIRMED_UPTREND' || marketState.state === 'EARLY_CONFIRMATION' ? 'good' : 'warn'}>
                Market: {marketState.state.replace(/_/g, ' ')}
              </Pill>
            </div>
          </div>

          {/* Desktop: Table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead className="text-center">Mode</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">RS</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Δ21</TableHead>
                  <TableHead className="text-right">Range%</TableHead>
                  <TableHead className="text-center">Contr</TableHead>
                  <TableHead className="text-right">Earn</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {candidates.map((c) => {
                  const gradeTone = c.reclaim_backtest_grade === 'A' ? 'good' : c.reclaim_backtest_grade === 'B' ? 'neutral' : 'warn';
                  const modeTone = c.mode === 'MODE2' ? 'good' : 'neutral';
                  const distTone = toneForDist21(c.dist_to_21ema_atr);
                  const earnTone = c.earnings_unknown ? "neutral" : c.earnings_days <= 7 ? "warn" : "neutral";
                  return (
                    <TableRow key={c.ticker}>
                      <TableCell className="text-zinc-500">{c.rank}</TableCell>
                      <TableCell>
                        <div>
                          {onTickerClick ? (
                            <ClickableTicker ticker={c.ticker} onClick={onTickerClick} />
                          ) : (
                            <span className="font-semibold text-zinc-900">{c.ticker}</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500">{c.theme}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Pill tone={gradeTone}>{c.reclaim_backtest_grade}</Pill>
                      </TableCell>
                      <TableCell className="text-center">
                        <Pill tone={modeTone}>{c.mode === 'MODE2' ? 'M2' : 'M1'}</Pill>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">{c.score?.toFixed(0) ?? '—'}</TableCell>
                      <TableCell className="text-right">{c.rs ?? '—'}</TableCell>
                      <TableCell className="text-right">{c.price?.toFixed(2) ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <Pill tone={distTone}>{c.dist_to_21ema_atr.toFixed(2)}</Pill>
                      </TableCell>
                      <TableCell className="text-right">{c.close_range_pct?.toFixed(0) ?? '—'}%</TableCell>
                      <TableCell className="text-center">
                        {c.is_contracting ? <span className="text-emerald-600">✓</span> : <span className="text-zinc-300">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Pill tone={earnTone}>{c.earnings_unknown ? "unknown" : `${c.earnings_days}d`}</Pill>
                        {c.is_approximated && <span className="ml-1 text-amber-600 text-[10px]">(approx.)</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: Cards */}
          <div className="md:hidden space-y-3">
            {candidates.map((c) => (
              <FocusCandidateCard
                key={c.ticker}
                candidate={c}
                onTickerClick={onTickerClick}
              />
            ))}
          </div>

          <div className="mt-3 text-xs text-zinc-500 hidden md:block">
            Top 5 candidates sorted by score. Grade A: ≤0.3 ATR + contraction + 60%+ range. M2 = reclaim & backtest.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ViewSuggestedTrades({
  state,
  onTickerClick,
  onTrim,
  onTradeExecuted,
}: {
  state: AgentState;
  onTickerClick?: (ticker: string) => void;
  onTrim?: (rec: TrimRecommendation) => Promise<void>;
  onTradeExecuted?: () => void;
}) {
  const plan = state.executionPlan;
  const marketState = state.marketState;
  const { passed, withheld, totals } = plan;
  const trimRecommendations = state.portfolio?.trim_recommendations ?? [];
  // Get all sizing candidates - ONLY show PASS candidates (no withheld)
  const rawCandidates = state.sizing?.sizing ?? [];
  const allCandidates = useMemo(() => {
    // Only show PASS candidates - no withheld ones at all
    const passedCandidates = rawCandidates.filter(c => c.gate === 'PASS');
    // Sort by score descending
    const sortByScore = (a: typeof rawCandidates[0], b: typeof rawCandidates[0]) => (b.score ?? 0) - (a.score ?? 0);
    passedCandidates.sort(sortByScore);
    // Return up to 5 PASS candidates only
    return passedCandidates.slice(0, 5);
  }, [rawCandidates]);

  // Track executed trades by ticker
  const [executedTrades, setExecutedTrades] = useState<Record<string, 'executing' | 'success' | 'error'>>({});
  const [executedTrims, setExecutedTrims] = useState<Record<string, 'executing' | 'success' | 'error'>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Ref for immediate click blocking (state updates are async)
  const executingRef = useRef<Set<string>>(new Set());
  const trimExecutingRef = useRef<Set<string>>(new Set());

  // Get tickers already in portfolio to prevent double-buying
  const ownedTickers = useMemo(() => {
    const positions = state.portfolio?.positions ?? [];
    return new Set(positions.map(p => p.ticker));
  }, [state.portfolio?.positions]);

  const handleExecuteTrade = async (order: typeof passed[0]) => {
    // Prevent double execution - use ref for immediate blocking
    if (executingRef.current.has(order.ticker) || executedTrades[order.ticker]) return;

    // Immediately mark as executing in ref
    executingRef.current.add(order.ticker);
    setExecutedTrades(prev => ({ ...prev, [order.ticker]: 'executing' }));
    setErrorMessage(null);

    const trade: TradeInput = {
      ticker: order.ticker,
      side: 'BUY',
      action_type: 'ENTRY',
      shares: order.entry.shares,
      price: order.entry_price,
      mode: order.mode,
      ssl: order.stop.ssl,
      trim_2r_price: order.profit.trim_2r.price,
      notes: `Entry via dashboard. SSL: $${order.stop.ssl.toFixed(2)}, 2R: $${order.profit.trim_2r.price.toFixed(2)}`,
    };

    try {
      const result = await saveTradeToDatabase(trade);
      if (result) {
        setExecutedTrades(prev => ({ ...prev, [order.ticker]: 'success' }));
        // Trigger refresh to update portfolio
        onTradeExecuted?.();
      } else {
        setExecutedTrades(prev => ({ ...prev, [order.ticker]: 'error' }));
        setErrorMessage(`Failed to save ${order.ticker} trade. Check console for details.`);
      }
    } catch (error) {
      setExecutedTrades(prev => ({ ...prev, [order.ticker]: 'error' }));
      setErrorMessage(`Error executing ${order.ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getButtonState = (ticker: string) => {
    // Check if already in portfolio first
    if (ownedTickers.has(ticker)) {
      return { text: 'In Portfolio', disabled: true, className: 'bg-emerald-600' };
    }
    const status = executedTrades[ticker];
    if (status === 'executing') return { text: 'Saving...', disabled: true, className: 'bg-zinc-400' };
    if (status === 'success') return { text: 'Executed', disabled: true, className: 'bg-green-600' };
    if (status === 'error') return { text: 'Retry', disabled: false, className: 'bg-red-600 hover:bg-red-700' };
    return { text: 'Execute', disabled: false, className: 'bg-blue-600 hover:bg-blue-700' };
  };

  const getTrimButtonState = (ticker: string) => {
    const status = executedTrims[ticker];
    if (status === 'executing') return { text: 'Trimming...', disabled: true, className: 'bg-zinc-400' };
    if (status === 'success') return { text: 'Trimmed', disabled: true, className: 'bg-green-600' };
    if (status === 'error') return { text: 'Retry', disabled: false, className: 'bg-red-600 hover:bg-red-700' };
    return { text: 'Trim 1/3', disabled: false, className: 'bg-amber-600 hover:bg-amber-700' };
  };

  const handleExecuteTrim = async (rec: TrimRecommendation) => {
    // Prevent double execution
    if (trimExecutingRef.current.has(rec.ticker) || executedTrims[rec.ticker]) return;

    trimExecutingRef.current.add(rec.ticker);
    setExecutedTrims(prev => ({ ...prev, [rec.ticker]: 'executing' }));
    setErrorMessage(null);

    try {
      if (onTrim) {
        await onTrim(rec);
        setExecutedTrims(prev => ({ ...prev, [rec.ticker]: 'success' }));
      }
    } catch (error) {
      setExecutedTrims(prev => ({ ...prev, [rec.ticker]: 'error' }));
      setErrorMessage(`Error trimming ${rec.ticker}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-4">
      {/* Error Alert */}
      {errorMessage && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {errorMessage}
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Strip */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="py-3">
          {/* Mobile: 3-col grid for numbers, full-width for market state */}
          <div className="md:hidden">
            <div className="grid grid-cols-3 gap-2 text-sm text-center">
              <div>
                <div className="text-xs text-zinc-500">Orders</div>
                <div className="font-mono font-semibold">{totals.order_count}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Total $</div>
                <div className="font-mono">{fmtUsd(totals.total_dollars)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">NER</div>
                <div className="font-mono">{totals.total_ner_pct.toFixed(2)}%</div>
              </div>
            </div>
            <div className="mt-2 flex justify-center">
              <Pill tone={marketState.state === 'CONFIRMED_UPTREND' || marketState.state === 'EARLY_CONFIRMATION' ? 'good' : 'warn'}>
                {marketState.state.replace(/_/g, ' ')}
              </Pill>
            </div>
          </div>
          {/* Desktop: Horizontal flex */}
          <div className="hidden md:flex items-center gap-6 overflow-x-auto whitespace-nowrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">Orders</span>
              <span className="font-mono font-semibold">{totals.order_count}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">Total $</span>
              <span className="font-mono">{fmtUsd(totals.total_dollars)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">Total NER</span>
              <span className="font-mono">{totals.total_ner_pct.toFixed(2)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">Withheld</span>
              <Pill tone={totals.withheld_count > 0 ? "warn" : "neutral"}>
                {totals.withheld_count}
              </Pill>
            </div>
            <div className="ml-auto">
              <Pill tone={marketState.state === 'CONFIRMED_UPTREND' ? 'good' : 'warn'}>
                Market: {marketState.state.replace(/_/g, ' ')}
              </Pill>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Tickets */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Order Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {allCandidates.length === 0 ? (
            <div className="text-sm text-zinc-500">No candidates to display.</div>
          ) : (
            <>
              {/* Desktop: Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gate</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead className="text-right">RS</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Δ21</TableHead>
                      <TableHead className="text-right">Range%</TableHead>
                      <TableHead className="text-center">Contr</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">SSL</TableHead>
                      <TableHead className="text-right">NER %</TableHead>
                      <TableHead className="text-center">Record</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allCandidates.map((sizing) => {
                      const isPassed = sizing.gate === 'PASS';
                      const passedOrder = passed.find(p => p.ticker === sizing.ticker);
                      const btnState = getButtonState(sizing.ticker);
                      const gradeTone = sizing.grade === 'A' ? 'good' : sizing.grade === 'B' ? 'neutral' : 'warn';
                      const modeTone = sizing.mode === 'MODE2' ? 'good' : 'neutral';
                      const distAtr = sizing.dist_21ema_atr ?? 0;
                      const distTone = Math.abs(distAtr) <= 0.3 ? 'good' : Math.abs(distAtr) <= 0.7 ? 'neutral' : 'warn';
                      const gateLabel = isPassed ? 'PASS' : sizing.withhold_reason?.replace(/_/g, ' ') ?? 'WITHHOLD';
                      return (
                        <TableRow key={sizing.ticker} className={!isPassed ? 'opacity-60' : ''}>
                          <TableCell>
                            <Pill tone={isPassed ? 'good' : 'warn'}>{gateLabel}</Pill>
                          </TableCell>
                          <TableCell>
                            <Pill tone={gradeTone}>{sizing.grade ?? '—'}</Pill>
                          </TableCell>
                          <TableCell>
                            <Pill tone={modeTone}>{sizing.mode}</Pill>
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {sizing.score?.toFixed(0) ?? '—'}
                          </TableCell>
                          <TableCell className="font-mono">
                            {onTickerClick ? (
                              <ClickableTicker ticker={sizing.ticker} onClick={onTickerClick} />
                            ) : (
                              <span className="font-semibold">{sizing.ticker}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {sizing.rs ?? '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${sizing.entry.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <Pill tone={distTone}>{distAtr >= 0 ? '+' : ''}{distAtr.toFixed(2)}</Pill>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {sizing.close_range_pct?.toFixed(0) ?? '—'}%
                          </TableCell>
                          <TableCell className="text-center">
                            {sizing.is_contracting ? '✓' : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmtUsdCompact(sizing.entry * sizing.shares)} ({sizing.shares})
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-600">
                            ${sizing.ssl.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {sizing.ec_risk_percent.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-center">
                            {isPassed && passedOrder ? (
                              <button
                                onClick={() => handleExecuteTrade(passedOrder)}
                                disabled={btnState.disabled}
                                className={`px-3 py-1 text-xs font-medium text-white rounded transition-colors ${btnState.className} disabled:cursor-not-allowed`}
                              >
                                {btnState.text}
                              </button>
                            ) : (
                              <span className="text-zinc-400 text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-3">
                {allCandidates.map((sizing) => {
                  const passedOrder = passed.find(p => p.ticker === sizing.ticker);
                  const btnState = getButtonState(sizing.ticker);
                  const variant = btnState.className.includes('emerald') ? 'owned'
                    : btnState.className.includes('green') ? 'success'
                    : btnState.className.includes('red') ? 'error'
                    : 'default';
                  return (
                    <OrderTicketCard
                      key={sizing.ticker}
                      sizing={sizing}
                      buttonState={{
                        text: btnState.text,
                        disabled: btnState.disabled,
                        variant,
                      }}
                      onExecute={passedOrder ? () => handleExecuteTrade(passedOrder) : undefined}
                      onTickerClick={onTickerClick}
                    />
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stop Instructions - Desktop */}
      {passed.length > 0 && (
        <Card className="hidden md:block rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Stop Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {passed.map((order) => (
                <div key={order.ticker} className="flex items-center gap-3 text-sm">
                  <span className="w-16 font-mono">
                    {onTickerClick ? (
                      <ClickableTicker ticker={order.ticker} onClick={onTickerClick} />
                    ) : (
                      <span className="font-semibold">{order.ticker}</span>
                    )}
                  </span>
                  <span className="text-zinc-600">{order.stop_instruction}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Stops are close-based vs 21EMA low band (SSL). Exit at close if triggered.
            </div>
          </CardContent>
        </Card>
      )}
      {/* Stop Instructions - Mobile: Collapsible */}
      {passed.length > 0 && (
        <details className="md:hidden rounded-2xl border bg-white shadow-sm">
          <summary className="px-4 py-3 text-sm font-semibold cursor-pointer">
            Stop Instructions ({passed.length})
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {passed.map((order) => (
              <div key={order.ticker} className="flex items-start gap-2 text-sm">
                <span className="font-mono font-semibold w-14">{order.ticker}</span>
                <span className="text-zinc-600">{order.stop_instruction}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Trim Recommendations */}
      {trimRecommendations.length > 0 && (
        <Card className="rounded-2xl shadow-sm border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              Trim Ready
              <Pill tone="good">{trimRecommendations.length}</Pill>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Desktop: Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Current R</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">2R Target</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Est. P&L</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trimRecommendations.map((rec) => {
                    const btnState = getTrimButtonState(rec.ticker);
                    return (
                      <TableRow key={rec.ticker}>
                        <TableCell className="font-mono">
                          {onTickerClick ? (
                            <ClickableTicker ticker={rec.ticker} onClick={onTickerClick} />
                          ) : (
                            <span className="font-semibold">{rec.ticker}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Pill tone="good">+{rec.current_r.toFixed(2)}R</Pill>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${rec.entry_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${rec.current_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          ${rec.trim_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {rec.shares_to_sell} / {rec.current_shares}
                        </TableCell>
                        <TableCell className="text-right">
                          <Pill tone="good">+${rec.potential_pnl.toFixed(0)}</Pill>
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={() => handleExecuteTrim(rec)}
                            disabled={btnState.disabled}
                            className={`px-3 py-1 text-xs font-medium text-white rounded transition-colors ${btnState.className} disabled:cursor-not-allowed`}
                          >
                            {btnState.text}
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {/* Mobile: Cards */}
            <div className="md:hidden space-y-3">
              {trimRecommendations.map((rec) => {
                const btnState = getTrimButtonState(rec.ticker);
                return (
                  <TrimCard
                    key={rec.ticker}
                    trim={rec}
                    buttonState={{
                      text: btnState.text,
                      disabled: btnState.disabled,
                      variant: btnState.className.includes('green') ? 'success' : btnState.className.includes('red') ? 'error' : 'default',
                    }}
                    onExecute={() => handleExecuteTrim(rec)}
                    onTickerClick={onTickerClick}
                  />
                );
              })}
            </div>
            <div className="mt-3 text-xs text-zinc-500 hidden md:block">
              Trim 1/3 at 2R profit target to lock in gains. Remaining position becomes runner.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Withheld Trades - Desktop only */}
      <Card className="hidden md:block rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Withheld Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {withheld.length === 0 ? (
            <div className="text-sm text-zinc-500">No trades withheld.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withheld.map((item) => (
                  <TableRow key={item.ticker}>
                    <TableCell className="font-mono font-semibold">{item.ticker}</TableCell>
                    <TableCell>
                      <Pill tone="neutral">{item.mode}</Pill>
                    </TableCell>
                    <TableCell>
                      <Pill tone="bad">{item.reason.replace(/_/g, ' ')}</Pill>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600">
                      {item.detail}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-3 text-xs text-zinc-500">
            Contract note: Withheld trades failed risk gate checks. Re-evaluate when conditions change.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ViewTradesToday({ state, onTickerClick }: { state: AgentState; onTickerClick?: (ticker: string) => void }) {
  const overview = state.overview;
  const trades = overview.trades_today;

  const stats = useMemo(() => {
    return calculateTradeStats(trades);
  }, [trades]);

  const totalVolume = useMemo(() => {
    return trades.reduce((acc, t) => acc + t.shares * t.price, 0);
  }, [trades]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Trades Today (Last 24h)</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Trades: {stats.total}</Pill>
              <Pill tone="good">Buys: {stats.buys}</Pill>
              <Pill tone="warn">Sells: {stats.sells}</Pill>
              <Pill>Volume: {fmtUsd(totalVolume)}</Pill>
            </div>
            <Pill>Audit log (read-only)</Pill>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px]">Time</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-zinc-500 py-8">
                    No trades in the last 24 hours
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((t, i) => {
                  const value = t.shares * t.price;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-zinc-500">{t.time_utc}</TableCell>
                      <TableCell>
                        {onTickerClick ? (
                          <ClickableTicker ticker={t.ticker} onClick={onTickerClick} />
                        ) : (
                          <span className="font-semibold text-zinc-900">{t.ticker}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Pill tone={t.action === 'BUY' ? 'good' : 'warn'}>{t.action}</Pill>
                      </TableCell>
                      <TableCell>
                        <Pill tone={
                          t.action_type === 'ENTRY' ? 'good' :
                          t.action_type === 'ADD' ? 'good' :
                          t.action_type === 'TRIM' ? 'neutral' :
                          t.action_type === 'EXIT' ? 'warn' : 'neutral'
                        }>
                          {t.action_type ?? '—'}
                        </Pill>
                      </TableCell>
                      <TableCell>
                        {t.mode ? (
                          <Pill tone={t.mode === 'MODE2' ? 'good' : 'neutral'}>{t.mode}</Pill>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{t.shares}</TableCell>
                      <TableCell className="text-right font-mono">${t.price.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtUsd(value)}</TableCell>
                      <TableCell className="text-right">
                        {t.r_multiple !== undefined ? (
                          <Pill tone={t.r_multiple >= 2 ? 'good' : t.r_multiple < 0 ? 'warn' : 'neutral'}>
                            {t.r_multiple >= 0 ? '+' : ''}{t.r_multiple.toFixed(1)}R
                          </Pill>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-600 max-w-[200px] truncate">{t.notes ?? "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Contract note: Trades Today is an immutable execution log. No planning logic here.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ViewPortfolio({
  state,
  onTickerClick,
  onSellPosition,
  onAddTrade,
  accountEquity,
  isEditingEquity,
  equityInput,
  onEquityInputChange,
  onEquitySave,
  onEquityEdit,
}: {
  state: AgentState;
  onTickerClick?: (ticker: string) => void;
  onSellPosition?: (position: PortfolioPosition) => void;
  onAddTrade?: () => void;
  accountEquity: number;
  isEditingEquity: boolean;
  equityInput: string;
  onEquityInputChange: (value: string) => void;
  onEquitySave: () => void;
  onEquityEdit: () => void;
}) {
  const portfolio = state.portfolio;
  const { summary, positions } = portfolio;

  const totals = useMemo(() => {
    const invested = positions.reduce((acc, p) => acc + (p.value ?? 0), 0);
    const equity = accountEquity;

    // Calculate unrealized P&L per position (current value - cost basis)
    const unrealizedByPosition = positions.map(p => {
      const shares = p.shares ?? 0;
      const lastPrice = p.last_price ?? p.entry;
      const costBasis = shares * p.entry;
      const currentValue = shares * lastPrice;
      return {
        ticker: p.ticker,
        unrealized: currentValue - costBasis,
      };
    });
    const totalUnrealized = unrealizedByPosition.reduce((acc, p) => acc + p.unrealized, 0);

    // Calculate realized P&L per position (from secured_pnl as % of equity)
    const realizedByPosition = positions.map(p => {
      const realizedPct = p.secured_pnl ?? 0;
      return {
        ticker: p.ticker,
        realized: (realizedPct / 100) * equity,
      };
    });
    const totalRealized = realizedByPosition.reduce((acc, p) => acc + p.realized, 0);

    const totalPnl = totalUnrealized + totalRealized;

    return {
      invested,
      unrealizedByPosition,
      realizedByPosition,
      totalUnrealized,
      totalRealized,
      totalPnl,
    };
  }, [positions, summary]);

  // Display when price data is from (important if Yahoo data is delayed)
  const priceAsOfDisplay = portfolio.price_as_of ?? 'N/A';
  const asOfDisplay = portfolio.as_of
    ? new Date(portfolio.as_of).toLocaleTimeString()
    : 'N/A';

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* Snapshot ribbon - Mobile */}
      <Card className="rounded-2xl shadow-sm md:hidden">
        <CardContent className="py-3">
          {/* Cash position - prominent at top */}
          <div className="mb-3 text-center border-b border-zinc-100 pb-3">
            <div className="text-xs text-zinc-500">Cash Available</div>
            <div className="text-2xl font-bold text-zinc-900">{fmtUsd(accountEquity - totals.invested)}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Equity</span>
              <span className="font-bold">{fmtUsd(accountEquity)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Invested</span>
              <span className="font-bold">{fmtUsd(totals.invested)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Positions</span>
              <span className="font-bold">{positions.length}</span>
            </div>
            <div className="flex justify-between">
              <span className={`${totals.totalUnrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Open Heat
              </span>
              <span className={`font-bold ${totals.totalUnrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totals.totalUnrealized >= 0 ? '+' : ''}{((totals.totalUnrealized / accountEquity) * 100).toFixed(2)}%
              </span>
            </div>
          </div>
          <a
            href="/simulator"
            className="mt-3 block w-full rounded-lg bg-blue-600 py-2 text-center text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Open Simulator &rarr;
          </a>
        </CardContent>
      </Card>

      {/* Snapshot ribbon - Desktop */}
      <Card className="hidden md:block rounded-2xl shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Pill tone={priceAsOfDisplay === 'N/A' ? 'warn' : 'neutral'}>
              Prices: {priceAsOfDisplay}
            </Pill>
            <Pill>
              Equity{' '}
              {isEditingEquity ? (
                <input
                  type="number"
                  value={equityInput}
                  onChange={(e) => onEquityInputChange(e.target.value)}
                  onBlur={onEquitySave}
                  onKeyDown={(e) => e.key === 'Enter' && onEquitySave()}
                  className="w-20 bg-transparent font-bold text-right border-b border-zinc-400 outline-none"
                  autoFocus
                />
              ) : (
                <span
                  className="font-bold cursor-pointer hover:underline"
                  onClick={onEquityEdit}
                  title="Click to edit"
                >
                  {fmtUsd(accountEquity)}
                </span>
              )}
            </Pill>
            <Pill>Cash <span className="font-bold">{fmtUsd(accountEquity - totals.invested)}</span></Pill>
            <Pill>Invested <span className="font-bold">{fmtUsd(totals.invested)}</span></Pill>
            <Pill>Gross Exposure <span className="font-bold">{((totals.invested / accountEquity) * 100).toFixed(1)}%</span></Pill>
            <Pill>NER <span className="font-bold">{((totals.totalUnrealized / accountEquity) * 100).toFixed(2)}%</span></Pill>
            <Pill>Positions <span className="font-bold">{positions.length}</span></Pill>
            <Pill tone={toneForPnl(totals.totalUnrealized)}>
              Open Heat <span className="font-bold">{totals.totalUnrealized >= 0 ? '+' : ''}{((totals.totalUnrealized / accountEquity) * 100).toFixed(2)}%</span>
            </Pill>
            <Pill tone={toneForPnl(totals.totalRealized)}>
              Secured <span className="font-bold">{totals.totalRealized >= 0 ? '+' : ''}{((totals.totalRealized / accountEquity) * 100).toFixed(2)}%</span>
            </Pill>
            <a
              href="/simulator"
              className="ml-auto flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Simulator &rarr;
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Positions table */}
      <Card className="mt-4 rounded-2xl shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Open Positions</CardTitle>
          <div className="flex gap-2">
            <Link href="/simulator">
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Simulator
              </Button>
            </Link>
            {onAddTrade && (
              <Button size="sm" onClick={onAddTrade} className="h-7 text-xs">
                + Add Trade
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Desktop: Table */}
          <div className="hidden md:block">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Ticker</TableHead>
                  <TableHead className="text-xs text-right">R</TableHead>
                  <TableHead className="text-xs text-right">Heat</TableHead>
                  <TableHead className="text-xs text-right">Shrs</TableHead>
                  <TableHead className="text-xs text-right">Entry</TableHead>
                  <TableHead className="text-xs text-right">Last</TableHead>
                  <TableHead className="text-xs text-right">SSL</TableHead>
                  <TableHead className="text-xs text-right">SSL%</TableHead>
                  <TableHead className="text-xs text-right">2R</TableHead>
                  <TableHead className="text-xs text-right">Trim</TableHead>
                  <TableHead className="text-xs text-right">Wt%</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">UR P&L</TableHead>
                  <TableHead className="text-xs text-right">R P&L</TableHead>
                  <TableHead className="text-xs text-right">E(d)</TableHead>
                  <TableHead className="text-xs text-center">Act</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {positions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center text-zinc-500 py-8">
                      No open positions
                    </TableCell>
                  </TableRow>
                ) : (
                  positions.map((p) => {
                    const rMultiple = p.total_r ?? 0;
                    const openHeat = p.open_heat ?? 0;
                    const lastPrice = p.last_price ?? p.entry;
                    const sslDistPct = ((lastPrice - p.ssl) / lastPrice) * 100;
                    const trim2r = p.trim_2r_price ?? 0;
                    const urPnl = totals.unrealizedByPosition.find(x => x.ticker === p.ticker)?.unrealized ?? 0;
                    const rPnl = totals.realizedByPosition.find(x => x.ticker === p.ticker)?.realized ?? 0;
                    return (
                      <TableRow key={p.ticker}>
                        <TableCell>
                          {onTickerClick ? (
                            <ClickableTicker ticker={p.ticker} onClick={onTickerClick} />
                          ) : (
                            <span className="font-semibold text-zinc-900">{p.ticker}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Pill tone={rMultiple >= 2 ? "good" : rMultiple < -0.05 ? "warn" : "neutral"}>
                            {rMultiple > 0.005 ? '+' : ''}{rMultiple.toFixed(1)}R
                          </Pill>
                        </TableCell>
                        <TableCell className="text-right">
                          <Pill tone={toneForPnl(openHeat)}>
                            {openHeat > 0.005 ? '+' : ''}{openHeat.toFixed(1)}%
                          </Pill>
                        </TableCell>
                        <TableCell className="text-right font-mono">{p.shares}</TableCell>
                        <TableCell className="text-right font-mono">${(p.avg_price ?? p.entry).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">${lastPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">${p.ssl.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Pill tone={sslDistPct < 3 ? 'warn' : sslDistPct < 5 ? 'neutral' : 'good'}>
                            {sslDistPct.toFixed(1)}%
                          </Pill>
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">${trim2r.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          {p.trimmed > 0 ? (
                            <Pill tone="good">{p.trimmed.toFixed(0)}%</Pill>
                          ) : p.trim_available ? (
                            <Pill tone="good">Ready</Pill>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{p.weight.toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-mono">{fmtUsdCompact(p.value ?? 0)} ({p.shares})</TableCell>
                        <TableCell className={`text-right font-mono ${urPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {urPnl >= 0 ? '+' : ''}{fmtUsd(urPnl)}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${rPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {rPnl > 0 ? '+' + fmtUsd(rPnl) : rPnl < 0 ? fmtUsd(rPnl) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Pill tone={toneForEarnings(p.earnings_days ?? 999)}>
                            {p.earnings_days ?? '—'}
                          </Pill>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => onSellPosition?.(p)}
                            className="h-6 px-1.5 text-[10px]"
                          >
                            Sell
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: Cards */}
          <div className="md:hidden space-y-3">
            {positions.length === 0 ? (
              <div className="text-center text-zinc-500 py-8">No open positions</div>
            ) : (
              positions.map((p) => (
                <PositionCard
                  key={p.ticker}
                  position={p}
                  onTickerClick={onTickerClick}
                  onSell={onSellPosition}
                />
              ))
            )}
          </div>

          {/* P&L Summary - Mobile */}
          <div className="mt-4 md:hidden">
            <div className="space-y-2 text-sm border rounded-lg p-3 bg-zinc-50">
              <div className="flex justify-between">
                <span className="text-zinc-500">Unrealized P&L</span>
                <span className={`font-mono font-bold ${totals.totalUnrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totals.totalUnrealized >= 0 ? '+' : ''}{fmtUsd(totals.totalUnrealized)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Realized P&L</span>
                <span className={`font-mono font-bold ${totals.totalRealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totals.totalRealized > 0 ? '+' + fmtUsd(totals.totalRealized) : fmtUsd(totals.totalRealized)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium">Total P&L</span>
                <span className={`font-mono font-bold ${totals.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totals.totalPnl >= 0 ? '+' : ''}{fmtUsd(totals.totalPnl)}
                </span>
              </div>
            </div>
          </div>

          {/* P&L Summary - Desktop */}
          <div className="mt-4 hidden md:flex justify-end">
            <div className="grid grid-cols-3 gap-4 text-xs border rounded-lg p-3 bg-zinc-50">
              <div className="text-center">
                <div className="text-zinc-500 mb-1">Unrealized P&L</div>
                <div className={`font-mono font-bold ${totals.totalUnrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totals.totalUnrealized >= 0 ? '+' : ''}{fmtUsd(totals.totalUnrealized)}
                  <span className="text-zinc-500 font-normal ml-1">
                    ({totals.totalUnrealized >= 0 ? '+' : ''}{((totals.totalUnrealized / (summary.equity ?? 100000)) * 100).toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="text-center border-x px-4">
                <div className="text-zinc-500 mb-1">Realized P&L</div>
                <div className={`font-mono font-bold ${totals.totalRealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totals.totalRealized > 0 ? '+' + fmtUsd(totals.totalRealized) : totals.totalRealized < 0 ? fmtUsd(totals.totalRealized) : '$0'}
                  <span className="text-zinc-500 font-normal ml-1">
                    ({totals.totalRealized >= 0 ? '+' : ''}{((totals.totalRealized / (summary.equity ?? 100000)) * 100).toFixed(2)}%)
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="text-zinc-500 mb-1">Total P&L</div>
                <div className={`font-mono font-bold ${totals.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totals.totalPnl >= 0 ? '+' : ''}{fmtUsd(totals.totalPnl)}
                  <span className="text-zinc-500 font-normal ml-1">
                    ({totals.totalPnl >= 0 ? '+' : ''}{((totals.totalPnl / (summary.equity ?? 100000)) * 100).toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs text-zinc-500 hidden md:block">
            UR P&L = Unrealized (open position gain/loss). R P&L = Realized (from trims/sells). SSL = 21EMA low band stop.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Main Dashboard Export
// =============================================================================

export default function TradingAgentDashboard() {
  const [active, setActive] = useState<NavItem | string>("Market State");
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);

  // Ticker chart modal state
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);

  // Sell modal state
  const [sellPosition, setSellPosition] = useState<PortfolioPosition | null>(null);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);

  // Add Trade modal state
  const [isAddTradeModalOpen, setIsAddTradeModalOpen] = useState(false);

  // Account equity (editable) - cash is calculated as equity - invested
  const [accountEquity, setAccountEquity] = useState(100000);
  const [isEditingEquity, setIsEditingEquity] = useState(false);
  const [equityInput, setEquityInput] = useState("100000");

  const handleTickerClick = (ticker: string) => {
    setSelectedTicker(ticker);
    setIsChartModalOpen(true);
  };

  const handleCloseChartModal = () => {
    setIsChartModalOpen(false);
    setSelectedTicker(null);
  };

  const handleOpenSellModal = (position: PortfolioPosition) => {
    setSellPosition(position);
    setIsSellModalOpen(true);
  };

  const handleCloseSellModal = () => {
    setIsSellModalOpen(false);
    setSellPosition(null);
  };

  // Helper to refresh portfolio after trade execution
  const refreshPortfolio = async () => {
    try {
      console.log('[Dashboard] Refreshing portfolio and trades...');
      const { portfolio, overview } = await refreshPortfolioOnly(accountEquity, accountEquity);
      console.log('[Dashboard] Got updated data:', portfolio.positions.length, 'positions,', overview.trades_today.length, 'trades');

      // Use functional update to avoid stale closure
      setAgentState(prevState => {
        if (!prevState) return prevState;
        return {
          ...prevState,
          portfolio,
          overview,
        };
      });
    } catch (err) {
      console.error('[Dashboard] Failed to refresh portfolio:', err);
    }
  };

  // Trim handler for TrimRecommendation (from Suggested Trades view)
  const handleTrimRecommendation = async (rec: TrimRecommendation) => {
    const trade: TradeInput = {
      ticker: rec.ticker,
      side: 'SELL',
      action_type: 'TRIM',
      shares: rec.shares_to_sell,
      price: rec.current_price,
      r_multiple: rec.current_r,
      mode: rec.position.mode,
      notes: `Trim 1/3 at ${rec.current_r.toFixed(2)}R. Entry: $${rec.entry_price.toFixed(2)}, SSL: $${rec.ssl.toFixed(2)}`,
    };

    console.log('[Dashboard] Saving trim trade:', trade);
    const result = await saveTradeToDatabase(trade);
    console.log('[Dashboard] Trim trade saved result:', result);

    if (!result) {
      throw new Error('Failed to save trim trade - check if Supabase is configured');
    }

    // Refresh portfolio after successful trim
    console.log('[Dashboard] Trim saved, refreshing portfolio...');
    await refreshPortfolio();
    console.log('[Dashboard] Portfolio refresh complete after trim');
  };

  // Sell handler - sells specified number of shares
  const handleSellShares = async (shares: number) => {
    if (!sellPosition) return;

    const currentPrice = sellPosition.last_price ?? sellPosition.entry;
    const isFullExit = shares >= (sellPosition.shares ?? 0);

    const trade: TradeInput = {
      ticker: sellPosition.ticker,
      side: 'SELL',
      action_type: isFullExit ? 'EXIT' : 'TRIM',
      shares: shares,
      price: currentPrice,
      r_multiple: sellPosition.total_r,
      mode: sellPosition.mode,
      notes: isFullExit
        ? `Full exit at ${(sellPosition.total_r ?? 0).toFixed(2)}R`
        : `Partial sell (${shares} shares) at ${(sellPosition.total_r ?? 0).toFixed(2)}R`,
    };

    console.log('[Dashboard] Saving sell trade:', trade);
    const result = await saveTradeToDatabase(trade);
    console.log('[Dashboard] Sell trade saved result:', result);

    if (!result) {
      throw new Error('Failed to save sell trade - check if Supabase is configured');
    }

    // Refresh portfolio after successful sell
    console.log('[Dashboard] Sell saved, refreshing portfolio...');
    await refreshPortfolio();
    console.log('[Dashboard] Portfolio refresh complete after sell');
    // Note: SellModal closes itself after onConfirm resolves
  };

  // Add Trade handler - creates new position or adds to existing
  const handleAddTrade = async (trade: TradeInput) => {
    console.log('[Dashboard] Saving trade:', trade);
    const result = await saveTradeToDatabase(trade);
    console.log('[Dashboard] Trade saved result:', result);

    if (!result) {
      throw new Error('Failed to save trade - check if Supabase is configured');
    }

    // Refresh portfolio after successful trade
    console.log('[Dashboard] Trade saved, refreshing portfolio...');
    await refreshPortfolio();
    console.log('[Dashboard] Portfolio refresh complete');
  };

  // Equity editing handlers
  const handleEquityEdit = () => {
    setEquityInput(accountEquity.toString());
    setIsEditingEquity(true);
  };

  const handleEquitySave = () => {
    const newEquity = parseFloat(equityInput);
    if (!isNaN(newEquity) && newEquity > 0) {
      setAccountEquity(newEquity);
    }
    setIsEditingEquity(false);
  };

  // Run pipeline on mount - use cached data only (no full scan)
  useEffect(() => {
    const runPipeline = async () => {
      try {
        const state = await runAgentPipeline({
          equity: accountEquity,
          cash: accountEquity, // Will be recalculated based on positions
          skipDailyScan: true, // Don't run full Nasdaq scan on initial load
          onProgress: (progress) => {
            setPipelineProgress({ ...progress });
          },
        });
        setAgentState(state);
        setLoading(false);
      } catch (err) {
        console.error("[Dashboard] Pipeline error:", err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    };
    runPipeline();
  }, []);

  // EOD Refresh handler - clears cache and re-runs with fresh data
  const handleEodRefresh = async () => {
    setLoading(true);
    setError(null);
    clearPipelineCache(); // Force fresh data

    // Set initial progress immediately
    setPipelineProgress({
      task: 'Initializing',
      status: 'starting',
      progress: 0,
      message: 'Clearing cache and starting refresh...',
    });

    try {
      const state = await runAgentPipeline({
        equity: accountEquity,
        cash: accountEquity, // Will be recalculated based on positions
        forceRefresh: true,
        onProgress: (progress) => {
          console.log('[Dashboard] EOD Progress:', progress.task, progress.progress + '%');
          setPipelineProgress(() => ({ ...progress }));
        },
      });
      setAgentState(state);
    } catch (err) {
      console.error("Pipeline error:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Quick Refresh handler - refreshes from Supabase cache without running full Nasdaq scan
  const handleQuickRefresh = async () => {
    setLoading(true);
    setError(null);
    clearQuickCache(); // Keep daily scan, clear structure data

    setPipelineProgress({
      task: 'Initializing',
      status: 'starting',
      progress: 0,
      message: 'Quick refresh (using cached data)...',
    });

    try {
      const state = await runAgentPipeline({
        equity: accountEquity,
        cash: accountEquity,
        forceRefresh: false, // Use cached daily scan if available
        skipDailyScan: true, // Skip full Nasdaq scan, use Supabase cache
        onProgress: (progress) => {
          console.log('[Dashboard] Quick Progress:', progress.task, progress.progress + '%');
          setPipelineProgress(() => ({ ...progress }));
        },
      });
      setAgentState(state);
    } catch (err) {
      console.error("Pipeline error:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Convert permissions for MarketStateStrip
  const permissions: MarketPermissions = agentState?.marketState.permissions
    ? {
        newEntries: agentState.marketState.permissions.new_entries === 'YES',
        adds: agentState.marketState.permissions.adds,
        pressing: agentState.marketState.permissions.pressing,
        trims: agentState.marketState.permissions.trims,
      }
    : {
        newEntries: false,
        adds: false,
        pressing: false,
        trims: true,
      };

  const stateLabel = agentState?.marketState.state.replace(/_/g, ' ') ?? 'Loading...';

  return (
    <div className="min-h-screen bg-zinc-50">
      <TopNav
        active={active}
        onChange={setActive}
        showSearch={true}
        onRefresh={handleQuickRefresh}
      />
      <MarketStateStrip
        stateLabel={stateLabel}
        permissions={permissions}
        onEodRefresh={handleEodRefresh}
        onQuickRefresh={handleQuickRefresh}
      />

      {loading ? (
        <LoadingSpinner progress={pipelineProgress} />
      ) : error ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="font-semibold text-red-700">Pipeline Error</div>
            <div className="mt-2 text-sm text-red-600">{error}</div>
          </div>
        </div>
      ) : agentState ? (
        <>
          {active === "Market State" && <ViewMarketState state={agentState} />}
          {active === "Liquid Leaders" && <ViewLiquidLeaders state={agentState} onTickerClick={handleTickerClick} />}
          {active === "Pullback Scan" && <ViewPullbackScan state={agentState} onTickerClick={handleTickerClick} />}
          {active === "Focus List" && <ViewFocusList state={agentState} onTickerClick={handleTickerClick} />}
          {active === "Suggested Trades" && <ViewSuggestedTrades state={agentState} onTickerClick={handleTickerClick} onTrim={handleTrimRecommendation} onTradeExecuted={handleQuickRefresh} />}
          {active === "Trades Today" && <ViewTradesToday state={agentState} onTickerClick={handleTickerClick} />}
          {active === "Portfolio" && (
                <ViewPortfolio
                  state={agentState}
                  onTickerClick={handleTickerClick}
                  onSellPosition={handleOpenSellModal}
                  onAddTrade={() => setIsAddTradeModalOpen(true)}
                  accountEquity={accountEquity}
                  isEditingEquity={isEditingEquity}
                  equityInput={equityInput}
                  onEquityInputChange={setEquityInput}
                  onEquitySave={handleEquitySave}
                  onEquityEdit={handleEquityEdit}
                />
              )}
        </>
      ) : (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-sm text-zinc-500">Failed to load agent state.</div>
        </div>
      )}

      {/* Ticker Chart Modal */}
      {selectedTicker && (
        <TickerChartModal
          ticker={selectedTicker}
          isOpen={isChartModalOpen}
          onClose={handleCloseChartModal}
        />
      )}

      {/* Sell Modal */}
      <SellModal
        position={sellPosition}
        isOpen={isSellModalOpen}
        onClose={handleCloseSellModal}
        onConfirm={handleSellShares}
      />

      {/* Add Trade Modal */}
      {agentState && (
        <AddTradeModal
          isOpen={isAddTradeModalOpen}
          onClose={() => setIsAddTradeModalOpen(false)}
          onConfirm={handleAddTrade}
          existingPositions={agentState.portfolio.positions}
          equity={accountEquity}
        />
      )}
    </div>
  );
}
// Cache bust: 1769338851
