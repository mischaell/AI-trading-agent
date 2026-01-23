"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";

// =============================================================================
// Types
// =============================================================================

interface TickerChartModalProps {
  ticker: string;
  isOpen: boolean;
  onClose: () => void;
}

interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface ChartData {
  bars: OHLCBar[];
  ticker: string;
  name?: string;
  currentPrice: number;
  priceChange: number;
  priceChangePct: number;
}

interface StructureAnalysis {
  position: "above" | "inside" | "below";
  distanceToEma: number; // in ATR units
  entryMode: string;
}

// =============================================================================
// Cache (5 minute TTL)
// =============================================================================

const chartCache: Map<string, { data: ChartData; timestamp: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Helper Functions
// =============================================================================

function ema(values: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    const curr = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    result.push(curr);
    prev = curr;
  }
  return result;
}

function calculateATR(bars: OHLCBar[], period: number = 14): number {
  if (bars.length < period + 1) return 0;
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }
  const atrValues = ema(trueRanges, period);
  return atrValues[atrValues.length - 1] || 0;
}

function analyzeStructure(bars: OHLCBar[]): StructureAnalysis {
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);

  const emaHigh = ema(highs, 21);
  const emaClose = ema(closes, 21);
  const emaLow = ema(lows, 21);
  const atr = calculateATR(bars);

  const currentClose = closes[closes.length - 1];
  const currentEmaHigh = emaHigh[emaHigh.length - 1];
  const currentEmaLow = emaLow[emaLow.length - 1];
  const currentEmaClose = emaClose[emaClose.length - 1];

  let position: "above" | "inside" | "below";
  if (currentClose > currentEmaHigh) {
    position = "above";
  } else if (currentClose < currentEmaLow) {
    position = "below";
  } else {
    position = "inside";
  }

  const distanceToEma = atr > 0 ? (currentClose - currentEmaClose) / atr : 0;

  let entryMode: string;
  if (position === "above" && distanceToEma < 1.5) {
    entryMode = "MODE1 - Weakness into structure";
  } else if (position === "above" && distanceToEma >= 1.5) {
    entryMode = "Extended - Wait for pullback";
  } else if (position === "inside") {
    entryMode = "MODE2 - Reclaim from inside";
  } else {
    entryMode = "MODE3 - Below structure";
  }

  return { position, distanceToEma, entryMode };
}

// =============================================================================
// Main Component
// =============================================================================

export function TickerChartModal({ ticker, isOpen, onClose }: TickerChartModalProps) {
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch data when modal opens
  const fetchChartData = useCallback(async () => {
    // Check cache first
    const cached = chartCache.get(ticker);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setChartData(cached.data);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/market-data?ticker=${ticker}&days=130`);
      const json = await response.json();

      if (!json.data || json.data.length === 0) {
        throw new Error(`No data available for ${ticker}`);
      }

      const bars: OHLCBar[] = json.data;
      const lastBar = bars[bars.length - 1];
      const prevBar = bars.length > 1 ? bars[bars.length - 2] : lastBar;

      const data: ChartData = {
        bars,
        ticker,
        name: json.name,
        currentPrice: lastBar.close,
        priceChange: lastBar.close - prevBar.close,
        priceChangePct: ((lastBar.close - prevBar.close) / prevBar.close) * 100,
      };

      // Cache the data
      chartCache.set(ticker, { data, timestamp: Date.now() });
      setChartData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch chart data");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    if (isOpen && ticker) {
      fetchChartData();
    }
  }, [isOpen, ticker, fetchChartData]);

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

  if (!isOpen) return null;

  const structure = chartData ? analyzeStructure(chartData.bars) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="w-[1020px] max-w-[95vw] rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="text-xl font-bold text-zinc-900">{ticker}</div>
            {chartData && (
              <>
                <div className="text-2xl font-semibold text-zinc-900">
                  ${chartData.currentPrice.toFixed(2)}
                </div>
                <div
                  className={`text-sm font-medium ${
                    chartData.priceChange >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {chartData.priceChange >= 0 ? "+" : ""}
                  {chartData.priceChange.toFixed(2)} ({chartData.priceChangePct.toFixed(2)}%)
                </div>
              </>
            )}
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

        {/* Chart Area */}
        <div className="h-[480px] px-6 py-4">
          {loading && <LoadingState />}
          {error && <ErrorState message={error} onRetry={fetchChartData} />}
          {chartData && !loading && !error && <ChartSVG data={chartData} />}
        </div>

        {/* Footer - Structure Analysis */}
        {structure && chartData && (
          <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-3">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-zinc-500">Structure: </span>
                <span
                  className={`font-medium ${
                    structure.position === "above"
                      ? "text-emerald-600"
                      : structure.position === "below"
                        ? "text-red-600"
                        : "text-amber-600"
                  }`}
                >
                  {structure.position === "above"
                    ? "Above Cloud"
                    : structure.position === "below"
                      ? "Below Cloud"
                      : "Inside Cloud"}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Distance: </span>
                <span className="font-medium text-zinc-900">
                  {structure.distanceToEma >= 0 ? "+" : ""}
                  {structure.distanceToEma.toFixed(2)} ATR
                </span>
              </div>
            </div>
            <div className="text-sm">
              <span className="text-zinc-500">Entry: </span>
              <span className="font-medium text-zinc-900">{structure.entryMode}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="text-sm text-red-600">{message}</div>
      <button
        onClick={onRetry}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
      >
        Retry
      </button>
    </div>
  );
}

function ChartSVG({ data }: { data: ChartData }) {
  const { bars } = data;

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);

  const emaHigh = ema(highs, 21);
  const emaLow = ema(lows, 21);
  const emaClose = ema(closes, 21);

  // Chart dimensions
  const margin = { top: 10, right: 50, bottom: 25, left: 10 };
  const totalW = 960;
  const totalH = 420;
  const chartW = totalW - margin.left - margin.right;
  const chartH = totalH - margin.top - margin.bottom;

  const minP = Math.min(...lows) * 0.995;
  const maxP = Math.max(...highs) * 1.005;

  const yFor = (p: number) => margin.top + chartH - ((p - minP) / (maxP - minP)) * chartH;
  const xStep = bars.length === 1 ? 0 : chartW / (bars.length - 1);
  const xFor = (i: number) => margin.left + i * xStep;

  // Cloud path
  const cloudPath = () => {
    const top = emaHigh.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
    const bot = [...emaLow]
      .reverse()
      .map((v, i) => {
        const idx = emaLow.length - 1 - i;
        return `${xFor(idx).toFixed(1)},${yFor(v).toFixed(1)}`;
      })
      .join(" ");
    return `M ${top.replace(/ /g, " L ")} L ${bot.replace(/ /g, " L ")} Z`;
  };

  // Bar color based on position relative to cloud (TradingView style)
  const barColor = (i: number) => {
    const close = closes[i];
    const open = bars[i].open;
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

  // Price ticks
  const priceRange = maxP - minP;
  const priceStep = priceRange / 4;
  const priceTicks = Array.from({ length: 5 }, (_, i) => minP + i * priceStep);

  // Generate date labels (show ~6 labels across the chart)
  const dateLabels: { idx: number; label: string }[] = [];
  const labelInterval = Math.max(1, Math.floor(bars.length / 6));
  for (let i = 0; i < bars.length; i += labelInterval) {
    const date = new Date(bars[i].date);
    const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    dateLabels.push({ idx: i, label });
  }

  return (
    <svg viewBox={`0 0 ${totalW} ${totalH}`} className="h-full w-full">
      {/* Grid lines */}
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

      {/* 21EMA Structure Cloud (TradingView style - gray) */}
      <path d={cloudPath()} fill="#9ca3af" opacity={0.2} />

      {/* EMA lines (gray tones) */}
      <polyline
        fill="none"
        stroke="#a1a1aa"
        strokeWidth={1}
        points={emaHigh.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
      />
      <polyline
        fill="none"
        stroke="#a1a1aa"
        strokeWidth={1}
        points={emaLow.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
      />
      <polyline
        fill="none"
        stroke="#71717a"
        strokeWidth={1.25}
        points={emaClose.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
      />

      {/* OHLC Bars (thinner, cleaner TradingView style) */}
      {bars.map((b, i) => {
        const x = xFor(i);
        const col = barColor(i);
        return (
          <g key={i}>
            <line
              x1={x}
              y1={yFor(b.high)}
              x2={x}
              y2={yFor(b.low)}
              stroke={col}
              strokeWidth={1}
            />
            <line
              x1={x - 2.5}
              y1={yFor(b.open)}
              x2={x}
              y2={yFor(b.open)}
              stroke={col}
              strokeWidth={1}
            />
            <line
              x1={x}
              y1={yFor(b.close)}
              x2={x + 2.5}
              y2={yFor(b.close)}
              stroke={col}
              strokeWidth={1}
            />
          </g>
        );
      })}

      {/* Current price line */}
      <line
        x1={margin.left}
        y1={yFor(closes[closes.length - 1])}
        x2={margin.left + chartW}
        y2={yFor(closes[closes.length - 1])}
        stroke="#71717a"
        strokeWidth={1}
        strokeDasharray="4,4"
        opacity={0.6}
      />

      {/* Price labels (right side) */}
      {priceTicks.map((p) => (
        <text
          key={p}
          x={margin.left + chartW + 5}
          y={yFor(p) + 4}
          fontSize={11}
          fontFamily="ui-monospace, monospace"
          fill="#71717a"
        >
          ${p.toFixed(2)}
        </text>
      ))}

      {/* Date labels (bottom) */}
      {dateLabels.map(({ idx, label }) => (
        <text
          key={idx}
          x={xFor(idx)}
          y={margin.top + chartH + 18}
          fontSize={10}
          fontFamily="ui-sans-serif, system-ui"
          fill="#71717a"
          textAnchor="middle"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

export default TickerChartModal;
