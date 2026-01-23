"use client";

import React, { useEffect, useMemo, useState } from "react";
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

// Pipeline imports
import { runAgentPipeline, AgentState, saveTradeToDatabase, TradeInput, PipelineProgress, clearPipelineCache } from "@/lib/agent-pipeline";
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
  screenshotUrl,
  consensus,
}: {
  mcoZ: number;
  mcsiZ: number;
  screenshotUrl?: string | null;
  consensus?: string;
}) {
  // If we have a screenshot, show it instead of mock charts
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

  // Fallback to mock charts
  const mcsi = [
    -0.2, 0.6, 1.4, 1.8, 1.6, 1.7, 1.5, 1.6, 1.55, 1.5, 1.4, 1.2, 1.0,
    0.8, 0.7, 0.6, 0.7, 0.6, 0.5, 0.4, 0.2, -0.2, -0.7, -1.2, -0.8,
    -0.4, 0.1, 0.3, 0.1, -0.1, -0.25, mcsiZ,
  ];
  const mcsiMA = mcsi.map((v, i) => {
    const win = mcsi.slice(Math.max(0, i - 4), i + 1);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });

  const mco = [
    0.2, 1.1, 0.8, 1.0, 0.6, 0.7, 0.2, -0.3, 0.1, 0.5, -0.2, 0.3, 0.0,
    0.2, 0.6, 0.1, 0.4, 0.7, 0.3, 0.5, 0.1, -0.6, -1.2, -0.2, 1.0, 0.8,
    0.2, 0.7, -0.4, -0.2, -0.6, mcoZ,
  ];

  return (
    <div className="h-full w-full bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-zinc-900">
          Normalized McClellan Analysis
        </div>
        <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-[11px] font-semibold text-zinc-600">
          Mock Data - Upload screenshot to update
        </span>
      </div>
      <div className="mb-3 flex items-center justify-end gap-2">
        {["All Markets", "Nasdaq 100", "S&P 500", "Russell 2000", "NYSE"].map(
          (t, idx) => (
            <span
              key={t}
              className={
                "rounded-md border px-3 py-1 text-[11px] font-medium " +
                (idx === 1
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700")
              }
            >
              {t}
            </span>
          )
        )}
      </div>

      <div className="grid gap-3">
        <McClellanChart
          title="Normalized McClellan Summation Index (MCSI)"
          series={mcsi}
          maSeries={mcsiMA}
          rightTag="Nasdaq 100"
          rightTagValue={mcsiZ.toFixed(2)}
        />
        <McClellanChart
          title="Normalized McClellan Oscillator (MCO)"
          series={mco}
          rightTag="Nasdaq 100"
          rightTagValue={mcoZ.toFixed(2)}
        />
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

function LoadingSpinner({ progress }: { progress: PipelineProgress | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const progressPct = progress?.progress ?? 0;
  const taskName = progress?.task ?? 'Initializing';
  const message = progress?.message ?? 'Starting pipeline...';

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

        {/* Task info */}
        <div className="text-center">
          <div className="text-sm font-medium text-zinc-900">{taskName}</div>
          <div className="text-xs text-zinc-500 mt-1">{message}</div>
        </div>

        {/* Elapsed time */}
        <div className="text-xs text-zinc-400 mt-2">
          Elapsed: {elapsed}s • Estimated: 60-90s
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

  const rows = useMemo(
    () => [
      { k: "QQQE vs 21EMA structure", v: t.qqqe_structure_position.replace("_", " ") },
      { k: "21EMA structure slope", v: t.qqqe_structure_slope },
      { k: "MCO (z)", v: `${t.mco_z.toFixed(2)}σ` },
      { k: "MCSI (z)", v: `${t.mcsi_z.toFixed(2)}σ` },
      { k: "MCSI slope", v: t.mcsi_slope.replace("_", " ") },
      { k: "MCSI vs 10DMA", v: t.mcsi_vs_10dma },
    ],
    [t]
  );

  const permissions = t.permissions ?? {
    new_entries: 'NO',
    adds: false,
    pressing: false,
    trims: true,
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* QQQE Chart - Full Width */}
      <ChartPlaceholder
        title="QQQE — Daily (21EMA Structure Cloud)"
        heightClass="h-[400px]"
        footerNote="Real-time data via Yahoo Finance. 6 months of daily OHLC."
      >
        <QQQEPanel />
      </ChartPlaceholder>

      {/* McClellan Charts - Below */}
      <div className="mt-4">
        <ChartPlaceholder
          title="Nasdaq100 — Normalized McClellan (MCSI + MCO)"
          heightClass={screenshotUrl ? "h-auto" : "h-[520px]"}
          footerNote={screenshotUrl ? "Data from uploaded screenshot" : "Breadth data from Supabase. Upload screenshot to update."}
        >
          <McClellanPanel
            mcoZ={extractedBreadth?.mco_z ?? t.mco_z}
            mcsiZ={extractedBreadth?.mcsi_z ?? t.mcsi_z}
            screenshotUrl={screenshotUrl}
            consensus={extractedBreadth?.breadth_consensus}
          />
        </ChartPlaceholder>
      </div>

      {/* Breadth Import & Market Analysis - Side by Side */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Breadth Screenshot Upload */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Import Breadth Data</CardTitle>
          </CardHeader>
          <CardContent>
            <BreadthUpload onDataExtracted={handleBreadthExtracted} />
            <div className="mt-3 text-xs text-zinc-500">
              Upload a screenshot from the Normalized McClellan Analysis tool.
              AI will extract MCSI/MCO z-scores automatically.
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
            </div>

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

            <div className="mt-4 flex flex-wrap gap-2">
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

            <div className="mt-3 text-xs text-zinc-500">
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
                <TableHead className="w-[64px]">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Theme</TableHead>
                <TableHead className="text-right">RS</TableHead>
                <TableHead className="text-right">ADR%</TableHead>
                <TableHead className="text-right">Liquidity ($m/day)</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Δ21 (xATR)</TableHead>
                <TableHead className="text-right">Earnings (d)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaders.slice(0, 15).map((r) => {
                const earnTone = r.earnings_days <= 7 ? "warn" : "neutral";
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
                    <TableCell className="text-zinc-700">{r.theme}</TableCell>
                    <TableCell className="text-right font-medium">{r.rs}</TableCell>
                    <TableCell className="text-right">{r.adr_pct.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{r.liquidity_m.toFixed(0)}</TableCell>
                    <TableCell className="text-right">{r.price.toFixed(1)}</TableCell>
                    <TableCell className="text-right">
                      <Pill tone={distTone}>{r.dist_21ema_atr.toFixed(1)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={earnTone}>{r.earnings_days}</Pill>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Contract note: Task 2 only enumerates leaders that pass universe filters.
            No entry/exit logic is applied here. Showing top 15 of {universe.count}.
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
                <TableHead className="w-[64px]">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Theme</TableHead>
                <TableHead className="text-right">RS</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">ADR%</TableHead>
                <TableHead className="text-right">Δ21 (xATR)</TableHead>
                <TableHead className="text-right">Δ50 (xATR)</TableHead>
                <TableHead className="text-right">Close%</TableHead>
                <TableHead className="text-right">Contract</TableHead>
                <TableHead className="text-right">Weekly%</TableHead>
                <TableHead className="text-right">Earnings (d)</TableHead>
                <TableHead className="text-right">Ready</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pullbacks.candidates.map((r) => {
                const earnTone = r.earnings_days <= 7 ? "warn" : "neutral";
                const dist21Tone = r.dist_21_atr < -0.5 || r.dist_21_atr > 1 ? "warn" : "neutral";
                const dist50Tone = r.dist_50_atr < 0 || r.dist_50_atr > 3 ? "warn" : "neutral";
                const closeTone = r.close_pct < 20 ? "warn" : "neutral";
                const wkTone = r.weekly_return_pct >= 12 ? "warn" : "neutral";
                const contrTone = r.contraction ? "good" : "warn";
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
                    <TableCell className="text-zinc-700">{r.theme}</TableCell>
                    <TableCell className="text-right font-medium">{r.rs}</TableCell>
                    <TableCell className="text-right">{r.price.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{r.adr_pct.toFixed(1)}</TableCell>
                    <TableCell className="text-right">
                      <Pill tone={dist21Tone}>{r.dist_21_atr.toFixed(1)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={dist50Tone}>{r.dist_50_atr.toFixed(1)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={closeTone}>{r.close_pct.toFixed(0)}%</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={contrTone}>{r.contraction ? 'YES' : 'NO'}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={wkTone}>{fmtPct(r.weekly_return_pct)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={earnTone}>{r.earnings_days}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={toneForReady(r.ready_grade)}>{r.ready_grade}</Pill>
                    </TableCell>
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
  const sizing = state.sizing;
  const marketState = state.marketState;

  const candidates = focusList.candidates ?? [];

  const counts = useMemo(() => {
    const a = candidates.filter((x) => x.reclaim_backtest_grade === "A").length;
    const b = candidates.filter((x) => x.reclaim_backtest_grade === "B").length;
    const c = candidates.filter((x) => x.reclaim_backtest_grade === "C").length;
    return { a, b, c, total: candidates.length };
  }, [candidates]);

  const totalDollars = sizing.total_planned_dollars ?? 0;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Focus List</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Top {focusList.top5.length}</Pill>
              <Pill tone="good">A: {counts.a}</Pill>
              <Pill>B: {counts.b}</Pill>
              <Pill tone={counts.c ? "warn" : "neutral"}>C: {counts.c}</Pill>
              <Pill>Planned $: {totalDollars.toLocaleString()}</Pill>
            </div>
            <Pill tone={marketState.state === 'CONFIRMED_UPTREND' ? 'good' : 'warn'}>
              Market: {marketState.state.replace(/_/g, ' ')}
            </Pill>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[56px]">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead className="text-right">Grade</TableHead>
                <TableHead className="text-right">Mode</TableHead>
                <TableHead className="text-right">E(d)</TableHead>
                <TableHead className="text-right">Δ21 (xATR)</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {candidates.map((c) => (
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
                  <TableCell>
                    <div className="text-sm text-zinc-800">{c.setup}</div>
                    <div className="text-xs text-zinc-500">{c.entry_trigger}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Pill tone={toneForReady(c.reclaim_backtest_grade)}>{c.reclaim_backtest_grade}</Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Pill tone={c.mode === 'MODE1' ? 'neutral' : 'good'}>{c.mode}</Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Pill tone={toneForEarnings(c.earnings_days)}>{c.earnings_days}</Pill>
                  </TableCell>
                  <TableCell className="text-right">{c.dist_to_21ema_atr.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Contract note: Focus List prepares plans only. Execution occurs in "Suggested Trades".
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ViewSuggestedTrades({ state, onTradeExecuted, onTickerClick }: { state: AgentState; onTradeExecuted?: () => void; onTickerClick?: (ticker: string) => void }) {
  const plan = state.executionPlan;
  const marketState = state.marketState;
  const { passed, withheld, totals } = plan;

  // Track executed trades by ticker
  const [executedTrades, setExecutedTrades] = useState<Record<string, 'executing' | 'success' | 'error'>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleExecuteTrade = async (order: typeof passed[0]) => {
    // Prevent double execution
    if (executedTrades[order.ticker]) return;

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
        // Trigger pipeline refresh after short delay
        if (onTradeExecuted) {
          setTimeout(onTradeExecuted, 500);
        }
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
    const status = executedTrades[ticker];
    if (status === 'executing') return { text: 'Saving...', disabled: true, className: 'bg-zinc-400' };
    if (status === 'success') return { text: 'Executed', disabled: true, className: 'bg-green-600' };
    if (status === 'error') return { text: 'Retry', disabled: false, className: 'bg-red-600 hover:bg-red-700' };
    return { text: 'Execute', disabled: false, className: 'bg-blue-600 hover:bg-blue-700' };
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
          <div className="flex items-center gap-6 overflow-x-auto whitespace-nowrap">
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
          {passed.length === 0 ? (
            <div className="text-sm text-zinc-500">No order tickets generated.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">SSL</TableHead>
                  <TableHead className="text-right">R/Share</TableHead>
                  <TableHead className="text-right">2R Trim</TableHead>
                  <TableHead className="text-right">Position $</TableHead>
                  <TableHead className="text-right">NER %</TableHead>
                  <TableHead className="text-center">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passed.map((order) => {
                  const btnState = getButtonState(order.ticker);
                  return (
                    <TableRow key={order.ticker}>
                      <TableCell>
                        <Pill tone="good">BUY</Pill>
                      </TableCell>
                      <TableCell className="font-mono">
                        {onTickerClick ? (
                          <ClickableTicker ticker={order.ticker} onClick={onTickerClick} />
                        ) : (
                          <span className="font-semibold">{order.ticker}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Pill tone={order.mode === 'MODE1' ? 'neutral' : 'good'}>
                          {order.mode}
                        </Pill>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {order.entry.shares}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${order.entry_price.toFixed(2)}
                      </TableCell>
                      <TableCell>{order.entry.order_type}</TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        ${order.stop.ssl.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${order.r_per_share.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600">
                        ${order.profit.trim_2r.price.toFixed(2)} ({order.profit.trim_2r.shares})
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtUsd(order.position_dollars)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {order.ec_risk_pct.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <button
                          onClick={() => handleExecuteTrade(order)}
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
          )}
        </CardContent>
      </Card>

      {/* Stop Instructions */}
      {passed.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
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

      {/* Withheld Trades */}
      <Card className="rounded-2xl shadow-sm">
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
                <TableHead className="w-[72px]">Time (UTC)</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {trades.map((t, i) => (
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
                      t.action_type === 'TRIM' ? 'neutral' :
                      t.action_type === 'EXIT' ? 'warn' : 'neutral'
                    }>
                      {t.action_type}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right font-mono">{t.shares}</TableCell>
                  <TableCell className="text-right font-mono">${t.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {t.r_multiple !== undefined ? (
                      <Pill tone={t.r_multiple >= 2 ? 'good' : t.r_multiple < 0 ? 'warn' : 'neutral'}>
                        {t.r_multiple >= 0 ? '+' : ''}{t.r_multiple.toFixed(1)}R
                      </Pill>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">{t.notes ?? ""}</TableCell>
                </TableRow>
              ))}
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

function ViewPortfolio({ state, onTickerClick }: { state: AgentState; onTickerClick?: (ticker: string) => void }) {
  const portfolio = state.portfolio;
  const { summary, positions } = portfolio;

  const totals = useMemo(() => {
    const invested = positions.reduce((acc, p) => acc + (p.value ?? 0), 0);
    const equity = summary.equity ?? 100000;
    const unrealDollars = (summary.open_heat / 100) * equity;
    return { invested, unrealDollars };
  }, [positions, summary]);

  const asOfDisplay = portfolio.as_of
    ? new Date(portfolio.as_of).toLocaleString()
    : 'N/A';

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* Snapshot ribbon */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Pill>As of {asOfDisplay}</Pill>
            <Pill>Equity <span className="font-bold">{fmtUsd(summary.equity ?? 0)}</span></Pill>
            <Pill>Cash <span className="font-bold">{fmtUsd(summary.cash ?? 0)}</span></Pill>
            <Pill>Invested <span className="font-bold">{fmtUsd(totals.invested)}</span></Pill>
            <Pill>Gross Exposure <span className="font-bold">{summary.gross_exposure.toFixed(1)}%</span></Pill>
            <Pill>NER <span className="font-bold">{summary.ner.toFixed(2)}%</span></Pill>
            <Pill>Positions <span className="font-bold">{summary.position_count}</span></Pill>
            <Pill tone={toneForPnl(summary.open_heat)}>
              Open Heat <span className="font-bold">{summary.open_heat >= 0 ? '+' : ''}{summary.open_heat.toFixed(2)}%</span>
            </Pill>
            <Pill tone={toneForPnl(summary.secured_profits)}>
              Secured <span className="font-bold">{summary.secured_profits >= 0 ? '+' : ''}{summary.secured_profits.toFixed(2)}%</span>
            </Pill>
          </div>
        </CardContent>
      </Card>

      {/* Positions table */}
      <Card className="mt-4 rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Open Positions</CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Theme</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Last</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Open Heat</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead className="text-right">SSL</TableHead>
                <TableHead className="text-right">2R</TableHead>
                <TableHead className="text-right">Trimmed</TableHead>
                <TableHead className="text-right">E(d)</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {positions.map((p) => {
                const rMultiple = p.total_r ?? 0;
                const openHeat = p.open_heat ?? 0;
                return (
                  <TableRow key={p.ticker}>
                    <TableCell>
                      {onTickerClick ? (
                        <ClickableTicker ticker={p.ticker} onClick={onTickerClick} />
                      ) : (
                        <span className="font-semibold text-zinc-900">{p.ticker}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-700">{p.theme ?? '-'}</TableCell>
                    <TableCell className="text-right">{p.shares}</TableCell>
                    <TableCell className="text-right">{(p.avg_price ?? p.entry).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{(p.last_price ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{fmtUsd(p.value ?? 0)}</TableCell>
                    <TableCell className="text-right">{p.weight.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <Pill tone={toneForPnl(openHeat)}>
                        {openHeat >= 0 ? '+' : ''}{openHeat.toFixed(2)}%
                      </Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={rMultiple >= 2 ? "good" : rMultiple < 0 ? "warn" : "neutral"}>
                        {rMultiple >= 0 ? '+' : ''}{rMultiple.toFixed(1)}R
                      </Pill>
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      {p.ssl.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {(p.trim_2r_price ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.trimmed > 0 ? (
                        <Pill tone="good">{p.trimmed.toFixed(0)}%</Pill>
                      ) : (
                        <span className="text-zinc-400">0%</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={toneForEarnings(p.earnings_days ?? 999)}>
                        {p.earnings_days ?? '-'}
                      </Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={p.status === 'RUNNER' ? 'good' : p.status === 'STARTER' ? 'neutral' : 'neutral'}>
                        {p.status}
                      </Pill>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Contract notes: Stops are close-based vs 21EMA low band (SSL). Status: STARTER (&lt;1R), CORE (1-2R), RUNNER (≥2R).
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

  const handleTickerClick = (ticker: string) => {
    setSelectedTicker(ticker);
    setIsChartModalOpen(true);
  };

  const handleCloseChartModal = () => {
    setIsChartModalOpen(false);
    setSelectedTicker(null);
  };

  // Run pipeline on mount
  useEffect(() => {
    const runPipeline = async () => {
      try {
        const state = await runAgentPipeline({
          equity: 100000,
          cash: 50000,
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
        equity: 100000,
        cash: 50000,
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
      />
      <MarketStateStrip
        stateLabel={stateLabel}
        permissions={permissions}
        onEodRefresh={handleEodRefresh}
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
          {active === "Suggested Trades" && <ViewSuggestedTrades state={agentState} onTradeExecuted={handleEodRefresh} onTickerClick={handleTickerClick} />}
          {active === "Trades Today" && <ViewTradesToday state={agentState} onTickerClick={handleTickerClick} />}
          {active === "Portfolio" && <ViewPortfolio state={agentState} onTickerClick={handleTickerClick} />}
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
    </div>
  );
}
