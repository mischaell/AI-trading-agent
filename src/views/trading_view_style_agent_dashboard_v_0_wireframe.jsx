import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, RefreshCcw, Settings, ChevronRight } from "lucide-react";

/**
 * TradingView-style Agent Dashboard — v0 (single view to iterate)
 * Focus: Market State view (Task 1) + TradingView-like layout/styling.
 */

// ----------
// Mock payload (replace with agent output)
// ----------
const MOCK = {
  nav: [
    "Market State",
    "Liquid Leaders",
    "Pullback Scan",
    "Focus List",
    "Trades Today",
    "Portfolio",
  ],
  task1: {
    stateLabel: "PARTICIPATION FADE (Defense / stop adding)",
    market: "QQQE",
    breadthUniverse: "Nasdaq100",
    qqqeStructurePosition: "inside_cloud",
    qqqeStructureSlope: "rising",
    mcoZ: -0.69,
    mcsiZ: -0.38,
    mcsiSlope: "curling_down",
    mcsiVs10dma: "below",
    permissions: {
      newEntries: "NO",
      adds: "NO",
      pressing: "NO",
      trims: "YES",
    },
  },
  // Task 2 (Liquid Leaders) — C) Top 12 only (no mini charts)
  task2: {
    universeLabel: "Liquid Leaders (Top 12)",
    leaders: [
      {
        rank: 1,
        ticker: "NVDA",
        rs: 99,
        adr: 4.8,
        liq: 2200,
        price: 610.4,
        dist21: -0.2,
        earn: 24,
        theme: "AI Compute",
      },
      {
        rank: 2,
        ticker: "META",
        rs: 97,
        adr: 3.1,
        liq: 1200,
        price: 468.2,
        dist21: 0.1,
        earn: 11,
        theme: "Ads / AI",
      },
      {
        rank: 3,
        ticker: "AMZN",
        rs: 95,
        adr: 2.7,
        liq: 1400,
        price: 172.6,
        dist21: -0.1,
        earn: 18,
        theme: "Cloud / Retail",
      },
      {
        rank: 4,
        ticker: "MSFT",
        rs: 94,
        adr: 2.3,
        liq: 1100,
        price: 414.9,
        dist21: 0.2,
        earn: 9,
        theme: "AI / Cloud",
      },
      {
        rank: 5,
        ticker: "GOOGL",
        rs: 93,
        adr: 2.6,
        liq: 900,
        price: 156.3,
        dist21: -0.3,
        earn: 16,
        theme: "Search / AI",
      },
      {
        rank: 6,
        ticker: "AVGO",
        rs: 92,
        adr: 3.4,
        liq: 800,
        price: 1241.0,
        dist21: 0.4,
        earn: 28,
        theme: "Semis",
      },
      {
        rank: 7,
        ticker: "AMD",
        rs: 90,
        adr: 4.2,
        liq: 700,
        price: 162.8,
        dist21: -0.4,
        earn: 21,
        theme: "Semis",
      },
      {
        rank: 8,
        ticker: "TSLA",
        rs: 89,
        adr: 5.6,
        liq: 1500,
        price: 234.1,
        dist21: 0.6,
        earn: 7,
        theme: "Auto / AI",
      },
      {
        rank: 9,
        ticker: "PLTR",
        rs: 88,
        adr: 6.1,
        liq: 450,
        price: 18.9,
        dist21: -0.5,
        earn: 32,
        theme: "AI Software",
      },
      {
        rank: 10,
        ticker: "SMCI",
        rs: 87,
        adr: 8.4,
        liq: 350,
        price: 411.7,
        dist21: 0.9,
        earn: 13,
        theme: "Servers",
      },
      {
        rank: 11,
        ticker: "CRWD",
        rs: 86,
        adr: 4.0,
        liq: 280,
        price: 292.4,
        dist21: -0.2,
        earn: 20,
        theme: "Cyber",
      },
      {
        rank: 12,
        ticker: "ANET",
        rs: 85,
        adr: 3.5,
        liq: 260,
        price: 248.3,
        dist21: 0.0,
        earn: 15,
        theme: "Networking",
      },
    ],
  },
  // Task 3 (Liquid Leaders Pullback Scan) — 5–10 names; no charts
  task3: {
    scanLabel: "Liquid Leaders 21EMA-Structure Pullback (Top 8)",
    rules: {
      notExtended: "< 1x ADR from 21EMA structure",
      dist21atr: "-0.5 to +1.0 x ATR from 21EMA",
      dist50atr: "0 to +3.0 x ATR from 50EMA",
      closeInUpperRange: "> 20% daily closing range",
      contraction: "Price contraction (5d vs 20d)",
      weeklyReturn: "Weekly return < 12%",
      earnings: "Earnings in 7+ days",
    },
    candidates: [
      {
        rank: 1,
        ticker: "NVDA",
        rs: 99,
        theme: "AI Compute",
        price: 610.4,
        adr: 4.8,
        dist21Atr: 0.2,
        dist50Atr: 1.3,
        closePct: 64,
        contract: "YES",
        wkRet: 6.8,
        earn: 24,
        ready: "A",
      },
      {
        rank: 2,
        ticker: "META",
        rs: 97,
        theme: "Ads / AI",
        price: 468.2,
        adr: 3.1,
        dist21Atr: -0.1,
        dist50Atr: 0.9,
        closePct: 58,
        contract: "YES",
        wkRet: 4.1,
        earn: 11,
        ready: "A",
      },
      {
        rank: 3,
        ticker: "AMZN",
        rs: 95,
        theme: "Cloud / Retail",
        price: 172.6,
        adr: 2.7,
        dist21Atr: 0.4,
        dist50Atr: 1.8,
        closePct: 72,
        contract: "YES",
        wkRet: 3.4,
        earn: 18,
        ready: "B",
      },
      {
        rank: 4,
        ticker: "GOOGL",
        rs: 93,
        theme: "Search / AI",
        price: 156.3,
        adr: 2.6,
        dist21Atr: -0.3,
        dist50Atr: 0.7,
        closePct: 55,
        contract: "YES",
        wkRet: 2.9,
        earn: 16,
        ready: "A",
      },
      {
        rank: 5,
        ticker: "AMD",
        rs: 90,
        theme: "Semis",
        price: 162.8,
        adr: 4.2,
        dist21Atr: 0.9,
        dist50Atr: 2.4,
        closePct: 61,
        contract: "YES",
        wkRet: 8.7,
        earn: 21,
        ready: "B",
      },
      {
        rank: 6,
        ticker: "ANET",
        rs: 85,
        theme: "Networking",
        price: 248.3,
        adr: 3.5,
        dist21Atr: 0.0,
        dist50Atr: 1.1,
        closePct: 66,
        contract: "YES",
        wkRet: 5.2,
        earn: 15,
        ready: "A",
      },
      {
        rank: 7,
        ticker: "CRWD",
        rs: 86,
        theme: "Cyber",
        price: 292.4,
        adr: 4.0,
        dist21Atr: -0.2,
        dist50Atr: 0.8,
        closePct: 49,
        contract: "NO",
        wkRet: 2.2,
        earn: 20,
        ready: "C",
      },
      {
        rank: 8,
        ticker: "SMCI",
        rs: 87,
        theme: "Servers",
        price: 411.7,
        adr: 8.4,
        dist21Atr: 1.1,
        dist50Atr: 2.9,
        closePct: 81,
        contract: "YES",
        wkRet: 11.6,
        earn: 13,
        ready: "C",
      },
    ],
  },
};

// ----------
// Minimal "tests" / invariants (kept tiny, no framework)
// ----------
function validateMock() {
  console.assert(
    Array.isArray(MOCK.nav) && MOCK.nav.length > 0,
    "MOCK.nav must be a non-empty array"
  );
  console.assert(
    typeof MOCK.task1?.stateLabel === "string",
    "MOCK.task1.stateLabel must be a string"
  );
  console.assert(
    typeof MOCK.task1?.permissions?.adds === "string",
    "MOCK.task1.permissions.adds must be a string"
  );
  console.assert(
    Array.isArray(MOCK.task2?.leaders) && MOCK.task2.leaders.length === 12,
    "MOCK.task2.leaders must contain 12 leaders (C)"
  );
  console.assert(
    Array.isArray(MOCK.task3?.candidates) && MOCK.task3.candidates.length >= 5,
    "MOCK.task3.candidates must contain 5+ pullback candidates"
  );

  // extra tiny sanity checks
  console.assert(fmtPct(6.8) === "6.8%", "fmtPct should format percent values");
}

// ----------
// Formatting helpers
// ----------
function fmtPct(v: number, dp = 1) {
  // NOTE: v is already in percent points (e.g., 6.8 means 6.8%)
  if (!Number.isFinite(v)) return "—";
  return `${v.toFixed(dp)}%`;
}

validateMock();

// ----------
// Styling helpers
// ----------
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "bad"
      ? "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200"
      : tone === "warn"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-zinc-50 text-zinc-700 border-zinc-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function ChartPlaceholder({
  title,
  children,
  heightClass = "h-[320px]",
}: {
  title: string;
  children?: React.ReactNode;
  heightClass?: string;
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
        <div className="mt-2 text-xs text-zinc-500">
          Chart placeholder (swap in real chart later).
        </div>
      </div>
    </div>
  );
}

// ----------
// McClellan panel (styled like your screenshot)

function mcPoints(
  series: number[],
  w: number,
  h: number,
  minY: number,
  maxY: number
) {
  // series assumed in z-score units roughly [-2.5, +2.5]
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
    <g>
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

  const points = mcPoints(series, w, h, minY, maxY);
  const maPoints = maSeries ? mcPoints(maSeries, w, h, minY, maxY) : null;

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
        <rect x="0" y="0" width={w} height={h} fill="#ffffff" />
        <SigmaRail w={w} h={h} minY={minY} maxY={maxY} />
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
        <SigmaLabels w={w} h={h} minY={minY} maxY={maxY} />
      </svg>
    </div>
  );
}

function McClellanPanel() {
  // Mock data shaped like your screenshot (downsloping MCSI, choppy MCO)
  const mcsi = [
    -0.2, 0.6, 1.4, 1.8, 1.6, 1.7, 1.5, 1.6, 1.55, 1.5, 1.4, 1.2, 1.0,
    0.8, 0.7, 0.6, 0.7, 0.6, 0.5, 0.4, 0.2, -0.2, -0.7, -1.2, -0.8,
    -0.4, 0.1, 0.3, 0.1, -0.1, -0.25, -0.38,
  ];
  const mcsiMA = mcsi.map((v, i) => {
    const win = mcsi.slice(Math.max(0, i - 4), i + 1);
    return win.reduce((a, b) => a + b, 0) / win.length;
  });

  const mco = [
    0.2, 1.1, 0.8, 1.0, 0.6, 0.7, 0.2, -0.3, 0.1, 0.5, -0.2, 0.3, 0.0,
    0.2, 0.6, 0.1, 0.4, 0.7, 0.3, 0.5, 0.1, -0.6, -1.2, -0.2, 1.0, 0.8,
    0.2, 0.7, -0.4, -0.2, -0.6, -0.69,
  ];

  return (
    <div className="h-full w-full bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-zinc-900">
          Normalized McClellan Analysis
        </div>
        <span className="rounded-full border border-zinc-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
          Breadth Consensus: Mostly Bullish
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
          rightTagValue="-0.38"
        />
        <McClellanChart
          title="Normalized McClellan Oscillator (MCO)"
          series={mco}
          rightTag="Nasdaq 100"
          rightTagValue="-0.69"
        />
      </div>
    </div>
  );
}

// --- QQQE panel mock (OHLC bars + 21EMA structure cloud) ---

type OHLC = { o: number; h: number; l: number; c: number };

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
  // Synthetic series that visually resembles your screenshot: uptrend → drawdown → recovery
  const bars: OHLC[] = [
    { o: 96.2, h: 96.8, l: 95.9, c: 96.6 },
    { o: 96.6, h: 97.4, l: 96.4, c: 97.1 },
    { o: 97.1, h: 97.6, l: 96.8, c: 97.4 },
    { o: 97.4, h: 98.2, l: 97.2, c: 98.0 },
    { o: 98.0, h: 99.0, l: 97.8, c: 98.7 },
    { o: 98.7, h: 99.4, l: 98.2, c: 99.1 },
    { o: 99.1, h: 100.1, l: 98.9, c: 99.8 },
    { o: 99.8, h: 100.7, l: 99.4, c: 100.4 },
    { o: 100.4, h: 101.2, l: 100.0, c: 100.9 },
    { o: 100.9, h: 101.8, l: 100.5, c: 101.5 },
    { o: 101.5, h: 102.3, l: 101.0, c: 101.9 },
    { o: 101.9, h: 102.6, l: 101.2, c: 102.1 },
    { o: 102.1, h: 102.8, l: 101.3, c: 101.7 },
    { o: 101.7, h: 102.0, l: 100.2, c: 100.8 },
    { o: 100.8, h: 101.1, l: 99.1, c: 99.6 },
    { o: 99.6, h: 100.0, l: 97.4, c: 98.1 },
    { o: 98.1, h: 99.0, l: 96.6, c: 97.2 },
    { o: 97.2, h: 98.4, l: 96.8, c: 97.9 },
    { o: 97.9, h: 99.6, l: 97.6, c: 99.2 },
    { o: 99.2, h: 100.8, l: 98.9, c: 100.3 },
    { o: 100.3, h: 101.6, l: 99.9, c: 101.1 },
    { o: 101.1, h: 102.4, l: 100.7, c: 102.0 },
    { o: 102.0, h: 103.1, l: 101.5, c: 102.6 },
    { o: 102.6, h: 103.7, l: 102.1, c: 103.2 },
    { o: 103.2, h: 104.0, l: 102.8, c: 103.6 },
    { o: 103.6, h: 104.2, l: 102.9, c: 103.1 },
  ];

  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const closes = bars.map((b) => b.c);

  const len = 21;
  const emaHigh = ema(highs, len);
  const emaLow = ema(lows, len);
  const emaClose = ema(closes, len);

  const w = 620;
  const h = 260;

  const minP = Math.min(...lows) - 0.8;
  const maxP = Math.max(...highs) + 0.8;
  const yFor = (p: number) => h - ((p - minP) / (maxP - minP)) * h;

  const xStep = bars.length === 1 ? 0 : w / (bars.length - 1);

  const pathLine = (arr: number[]) =>
    arr
      .map((v, i) => `${(i * xStep).toFixed(1)},${yFor(v).toFixed(1)}`)
      .join(" ");

  const cloudPath = () => {
    const top = emaHigh
      .map((v, i) => `${(i * xStep).toFixed(1)},${yFor(v).toFixed(1)}`)
      .join(" ");
    const bot = [...emaLow]
      .reverse()
      .map((v, i) => {
        const idx = emaLow.length - 1 - i;
        return `${(idx * xStep).toFixed(1)},${yFor(v).toFixed(1)}`;
      })
      .join(" ");
    return `M ${top.replace(/ /g, " L ")} L ${bot.replace(/ /g, " L ")} Z`;
  };

  // Close-based only: green when close > all three EMAs, red when close < all three EMAs, else grey.
  const barColor = (i: number) => {
    const c = closes[i];
    if (c > emaHigh[i] && c > emaClose[i] && c > emaLow[i]) return "#16a34a"; // green
    if (c < emaHigh[i] && c < emaClose[i] && c < emaLow[i]) return "#ef4444"; // red
    return "#a1a1aa"; // neutral
  };

  return (
    <div className="h-full w-full bg-white p-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
        {/* cloud */}
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

        {/* ohlc bars */}
        {bars.map((b, i) => {
          const x = i * xStep;
          const yH = yFor(b.h);
          const yL = yFor(b.l);
          const yO = yFor(b.o);
          const yC = yFor(b.c);
          const col = barColor(i);
          return (
            <g key={i}>
              <line x1={x} y1={yH} x2={x} y2={yL} stroke={col} strokeWidth={2} />
              {/* open tick (left) */}
              <line x1={x - 5} y1={yO} x2={x} y2={yO} stroke={col} strokeWidth={2} />
              {/* close tick (right) */}
              <line x1={x} y1={yC} x2={x + 5} y2={yC} stroke={col} strokeWidth={2} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ----------
// Top nav (NO market-state buttons here)
// ----------
function TopNav({
  active,
  onChange,
}: {
  active: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-zinc-900" />
          <div>
            <div className="text-sm font-semibold text-zinc-900">
              Trading Agent Dashboard
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          {MOCK.nav.map((t) => (
            <button
              key={t}
              onClick={() => onChange(t)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active === t
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative hidden md:block">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              className="w-[240px] rounded-full pl-8"
              placeholder="Search ticker…"
            />
          </div>
          <Button variant="ghost" size="icon" className="rounded-full">
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="mx-auto max-w-[1400px] px-4 pb-3 md:hidden">
        <Tabs value={active} onValueChange={onChange}>
          <TabsList className="grid w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="Market State">Market</TabsTrigger>
            <TabsTrigger value="Liquid Leaders">Leaders</TabsTrigger>
            <TabsTrigger value="Portfolio">Portfolio</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * MarketStateStrip (below TopNav)
 * Spec:
 * - Big current state on left
 * - Right side controls:
 *   - New Entries: (NOT a button; bold text + colon)
 *   - Adds (red button)
 *   - Pressing (red button)
 *   - Trims (green button)
 *   - EOD Refresh (black button)
 */
function MarketStateStrip() {
  const t = MOCK.task1;

  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="text-lg font-semibold tracking-tight text-zinc-900">
            <span className="font-medium text-zinc-500">Current State:</span>{" "}
            <span className="font-bold">{t.stateLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-zinc-900">New Entries:</span>
            <Button
              variant="outline"
              className="rounded-full border-red-300 text-red-600"
            >
              Adds
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-red-300 text-red-600"
            >
              Pressing
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-emerald-300 text-emerald-600"
            >
              Trims
            </Button>
            <Button className="rounded-full bg-zinc-900 text-white hover:bg-zinc-800">
              EOD Refresh <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewMarketState() {
  const t = MOCK.task1;

  const rows = useMemo(
    () => [
      {
        k: "QQQE vs 21EMA structure",
        v: t.qqqeStructurePosition.replace("_", " "),
      },
      { k: "21EMA structure slope", v: t.qqqeStructureSlope },
      { k: "MCO (z)", v: `${t.mcoZ}σ` },
      { k: "MCSI (z)", v: `${t.mcsiZ}σ` },
      { k: "MCSI slope", v: t.mcsiSlope.replace("_", " ") },
      { k: "MCSI vs 10DMA", v: t.mcsiVs10dma },
    ],
    [t]
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartPlaceholder title="QQQE — Daily (21EMA Structure Cloud)">
          <QQQEPanel />
        </ChartPlaceholder>
        <ChartPlaceholder
          title="Nasdaq100 — Normalized McClellan (MCSI + MCO)"
          heightClass="h-[520px]"
        >
          <McClellanPanel />
        </ChartPlaceholder>
      </div>

      <div className="mt-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Market Analysis — Task 1 Output
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2">
              <Pill tone="warn">Current State: {t.stateLabel}</Pill>
              <Pill>
                {t.market} | {t.breadthUniverse}
              </Pill>
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
                    <TableCell className="text-right font-medium text-zinc-900">
                      {r.v}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone={t.permissions.newEntries === "NO" ? "warn" : "neutral"}>
                New Entries: {t.permissions.newEntries}
              </Pill>
              <Pill tone={t.permissions.adds === "NO" ? "warn" : "neutral"}>
                Adds: {t.permissions.adds}
              </Pill>
              <Pill tone={t.permissions.pressing === "NO" ? "warn" : "neutral"}>
                Pressing: {t.permissions.pressing}
              </Pill>
              <Pill tone={t.permissions.trims === "YES" ? "good" : "neutral"}>
                Trims: {t.permissions.trims}
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

function ViewLiquidLeaders() {
  const t = MOCK.task2;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="text-sm font-semibold text-zinc-900">
            Liquid Leaders — Task 2 Output
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{t.universeLabel}</Pill>
              <Pill>Universe: Ex-China / Ex-Defensives</Pill>
            </div>
            <Pill tone="neutral">No mini-charts (perf-safe)</Pill>
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
              {t.leaders.map((r) => {
                const earnTone = r.earn <= 7 ? "warn" : "neutral";
                const distTone = Math.abs(r.dist21) > 1 ? "warn" : "neutral";
                return (
                  <TableRow key={r.ticker}>
                    <TableCell className="text-zinc-500">{r.rank}</TableCell>
                    <TableCell className="font-semibold text-zinc-900">
                      {r.ticker}
                    </TableCell>
                    <TableCell className="text-zinc-700">{r.theme}</TableCell>
                    <TableCell className="text-right font-medium">{r.rs}</TableCell>
                    <TableCell className="text-right">{r.adr.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{r.liq.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.price.toFixed(1)}</TableCell>
                    <TableCell className="text-right">
                      <Pill tone={distTone}>{r.dist21.toFixed(1)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={earnTone}>{r.earn}</Pill>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Contract note: Task 2 only enumerates leaders that pass universe filters.
            No entry/exit logic is applied here.
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewPullbackScan() {
  const t = MOCK.task3;

  const rulePills = [
    t.rules.notExtended,
    t.rules.dist21atr,
    t.rules.dist50atr,
    t.rules.closeInUpperRange,
    t.rules.contraction,
    t.rules.weeklyReturn,
    t.rules.earnings,
  ];

  const toneForReady = (r: string) => {
    if (r === "A") return "good";
    if (r === "B") return "neutral";
    return "warn";
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="text-sm font-semibold text-zinc-900">
            Pullback Scan — Task 3 Output
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{t.scanLabel}</Pill>
              <Pill tone="neutral">No charts (perf-safe)</Pill>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="warn">Market Gate: {MOCK.task1.stateLabel}</Pill>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {rulePills.map((x) => (
              <Pill key={x}>{x}</Pill>
            ))}
          </div>

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
                <TableHead className="text-right">Close% (range)</TableHead>
                <TableHead className="text-right">Contraction</TableHead>
                <TableHead className="text-right">Weekly%</TableHead>
                <TableHead className="text-right">Earnings (d)</TableHead>
                <TableHead className="text-right">Ready</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.candidates.map((r) => {
                const earnTone = r.earn <= 7 ? "warn" : "neutral";
                const dist21Tone =
                  r.dist21Atr < -0.5 || r.dist21Atr > 1 ? "warn" : "neutral";
                const dist50Tone =
                  r.dist50Atr < 0 || r.dist50Atr > 3 ? "warn" : "neutral";
                const closeTone = r.closePct < 20 ? "warn" : "neutral";
                const wkTone = r.wkRet >= 12 ? "warn" : "neutral";
                const contrTone = r.contract === "YES" ? "good" : "warn";
                return (
                  <TableRow key={r.ticker}>
                    <TableCell className="text-zinc-500">{r.rank}</TableCell>
                    <TableCell className="font-semibold text-zinc-900">
                      {r.ticker}
                    </TableCell>
                    <TableCell className="text-zinc-700">{r.theme}</TableCell>
                    <TableCell className="text-right font-medium">{r.rs}</TableCell>
                    <TableCell className="text-right">{r.price.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{r.adr.toFixed(1)}</TableCell>
                    <TableCell className="text-right">
                      <Pill tone={dist21Tone}>{r.dist21Atr.toFixed(1)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={dist50Tone}>{r.dist50Atr.toFixed(1)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={closeTone}>{r.closePct}%</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={contrTone}>{r.contract}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={wkTone}>{fmtPct(r.wkRet)}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={earnTone}>{r.earn}</Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Pill tone={toneForReady(r.ready)}>{r.ready}</Pill>
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

export default function TradingAgentDashboardV0() {
  const [active, setActive] = useState("Market State");

  return (
    <div className="min-h-screen bg-white">
      <TopNav active={active} onChange={setActive} />
      <MarketStateStrip />

      {active === "Market State" ? (
        <ViewMarketState />
      ) : active === "Liquid Leaders" ? (
        <ViewLiquidLeaders />
      ) : active === "Pullback Scan" ? (
        <ViewPullbackScan />
      ) : (
        <div className="mx-auto max-w-[1400px] px-4 py-8">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-700">
            <div className="font-semibold text-zinc-900">{active}</div>
            <div className="mt-1 text-zinc-600">
              Placeholder. We will implement this view next using the same TradingView
              styling + agent_skeleton output formats.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
