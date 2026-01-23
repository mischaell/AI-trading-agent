import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronRight } from "lucide-react";

/**
 * Focus List View — full nav (all buttons visible) but ONLY Focus List renders.
 * - Clicking other nav buttons does NOTHING (kept disabled).
 * - Keeps file small and avoids accidental routing to other views.
 */

// -----------------
// Mock agent outputs (replace later)
// -----------------
const MARKET_STATE = {
  stateLabel: "PARTICIPATION FADE (Defense / stop adding)",
};

type FocusRow = {
  rank: number;
  ticker: string;
  theme: string;
  ready: "A" | "B" | "C";
  setup: string;
  entry: string;
  riskPct: 0.25 | 0.5;
  entryPx: number;
  stopPx: number;
  shares: number;
  posDollars: number;
  twoR: number;
  earningsD: number;
  dist21Atr: number;
  bars: number[]; // 0..1
  barTone: ("g" | "r" | "n")[];
};

const MOCK_FOCUS: FocusRow[] = [
  {
    rank: 1,
    ticker: "NVDA",
    theme: "AI Compute",
    ready: "A",
    setup: "1) Uptrend Pullback → Rising 21EMA",
    entry: "Strength reclaim (R2G / 21 high reclaim)",
    riskPct: 0.5,
    entryPx: 610.4,
    stopPx: 598.9,
    shares: 4,
    posDollars: 2441.6,
    twoR: 633.4,
    earningsD: 24,
    dist21Atr: 0.2,
    bars: [0.7, 0.85, 0.8, 0.9, 0.75, 0.88, 0.92, 0.86, 0.8, 0.83, 0.9, 0.95],
    barTone: ["g", "g", "g", "g", "g", "g", "g", "g", "g", "g", "g", "g"],
  },
  {
    rank: 2,
    ticker: "META",
    theme: "Ads / AI",
    ready: "A",
    setup: "2) Reclaim & Backtest → Higher Low",
    entry: "Weakness into 21 structure (retest)",
    riskPct: 0.25,
    entryPx: 468.2,
    stopPx: 456.0,
    shares: 5,
    posDollars: 2341.0,
    twoR: 492.6,
    earningsD: 11,
    dist21Atr: -0.1,
    bars: [0.55, 0.6, 0.58, 0.62, 0.65, 0.64, 0.63, 0.67, 0.7, 0.68, 0.66, 0.69],
    barTone: ["g", "g", "g", "g", "g", "g", "g", "g", "g", "g", "g", "g"],
  },
  {
    rank: 3,
    ticker: "GOOGL",
    theme: "Search / AI",
    ready: "A",
    setup: "1) Uptrend Pullback → Rising 21EMA",
    entry: "Weakness into 21 structure",
    riskPct: 0.25,
    entryPx: 156.3,
    stopPx: 151.6,
    shares: 15,
    posDollars: 2344.5,
    twoR: 165.7,
    earningsD: 16,
    dist21Atr: -0.3,
    bars: [0.4, 0.45, 0.42, 0.47, 0.5, 0.48, 0.46, 0.44, 0.49, 0.52, 0.5, 0.53],
    barTone: ["g", "g", "g", "g", "g", "g", "g", "g", "g", "g", "g", "g"],
  },
  {
    rank: 4,
    ticker: "ANET",
    theme: "Networking",
    ready: "A",
    setup: "2) Reclaim & Backtest → Higher Low",
    entry: "Strength reclaim (daily reversal pivot)",
    riskPct: 0.5,
    entryPx: 248.3,
    stopPx: 241.1,
    shares: 10,
    posDollars: 2483.0,
    twoR: 262.7,
    earningsD: 15,
    dist21Atr: 0.0,
    bars: [0.35, 0.38, 0.36, 0.4, 0.42, 0.41, 0.39, 0.43, 0.45, 0.44, 0.46, 0.47],
    barTone: ["g", "g", "g", "g", "g", "g", "g", "g", "g", "g", "g", "g"],
  },
  {
    rank: 5,
    ticker: "AMZN",
    theme: "Cloud / Retail",
    ready: "B",
    setup: "1) Uptrend Pullback → Rising 21EMA",
    entry: "Strength reclaim (tight range above 21)",
    riskPct: 0.25,
    entryPx: 172.6,
    stopPx: 168.8,
    shares: 12,
    posDollars: 2071.2,
    twoR: 180.2,
    earningsD: 18,
    dist21Atr: 0.4,
    bars: [0.3, 0.34, 0.32, 0.36, 0.35, 0.33, 0.37, 0.39, 0.38, 0.36, 0.4, 0.42],
    barTone: ["n", "g", "n", "g", "g", "n", "g", "g", "g", "n", "g", "g"],
  },
];

// -----------------
// Helpers
// -----------------
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "warn"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-zinc-50 text-zinc-700 border-zinc-200";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function MiniBarTile({ values, tones }: { values: number[]; tones: ("g" | "r" | "n")[] }) {
  const clamp01 = (x: number) => Math.max(0.08, Math.min(1, x));
  const colorFor = (t: "g" | "r" | "n") =>
    t === "g" ? "bg-emerald-500" : t === "r" ? "bg-red-500" : "bg-zinc-400";

  return (
    <div className="flex h-10 items-end gap-[3px] rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2">
      {values.slice(-12).map((v, i) => (
        <div
          key={i}
          className={`w-[5px] rounded-sm ${colorFor(tones[i] ?? "n")}`}
          style={{ height: `${Math.round(clamp01(v) * 28)}px` }}
        />
      ))}
    </div>
  );
}

function toneForReady(r: "A" | "B" | "C") {
  if (r === "A") return "good";
  if (r === "B") return "neutral";
  return "warn";
}

// -----------------
// Market State Strip (locked contract)
// -----------------
function MarketStateStrip() {
  const t = MARKET_STATE;

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
            <Button variant="outline" className="rounded-full border-red-300 text-red-600" disabled>
              Adds
            </Button>
            <Button variant="outline" className="rounded-full border-red-300 text-red-600" disabled>
              Pressing
            </Button>
            <Button variant="outline" className="rounded-full border-emerald-300 text-emerald-600">
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

// -----------------
// Full Top Nav (visible buttons, NO click routing)
// -----------------
const NAV = [
  "Market State",
  "Liquid Leaders",
  "Pullback Scan",
  "Focus List",
  "Trades Today",
  "Portfolio",
];

function TopNavFull({ active }: { active: string }) {
  return (
    <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-zinc-900" />
          <div className="text-sm font-semibold text-zinc-900">Trading Agent Dashboard</div>
        </div>

        <Tabs value={active}>
          <TabsList className="rounded-full">
            {NAV.map((n) => (
              <TabsTrigger
                key={n}
                value={n}
                disabled={n !== "Focus List"}
                className="rounded-full"
              >
                {n}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}

// -----------------
// Focus List View
// -----------------
function FocusListView() {
  const rows = MOCK_FOCUS;

  const counts = useMemo(() => {
    const a = rows.filter((x) => x.ready === "A").length;
    const b = rows.filter((x) => x.ready === "B").length;
    const c = rows.filter((x) => x.ready === "C").length;
    return { a, b, c, total: rows.length };
  }, [rows]);

  const totalDollars = useMemo(() => rows.reduce((acc, r) => acc + r.posDollars, 0), [rows]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Entry Readiness / Focus List — Task 4 Output</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Top 5</Pill>
              <Pill tone="good">A: {counts.a}</Pill>
              <Pill>B: {counts.b}</Pill>
              <Pill tone={counts.c ? "warn" : "neutral"}>C: {counts.c}</Pill>
              <Pill>Planned $: {totalDollars.toLocaleString()}</Pill>
            </div>
            <Pill tone="warn">Market Gate: {MARKET_STATE.stateLabel}</Pill>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[56px]">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Setup</TableHead>
                <TableHead className="text-right">Ready</TableHead>
                <TableHead className="text-right">Risk%</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Stop</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Position $</TableHead>
                <TableHead className="text-right">2R</TableHead>
                <TableHead className="text-right">E(d)</TableHead>
                <TableHead className="text-right">Δ21 (xATR)</TableHead>
                <TableHead className="text-right">Tile</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.ticker}>
                  <TableCell className="text-zinc-500">{r.rank}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-zinc-900">{r.ticker}</div>
                    <div className="text-xs text-zinc-500">{r.theme}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-zinc-800">{r.setup}</div>
                    <div className="text-xs text-zinc-500">{r.entry}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Pill tone={toneForReady(r.ready)}>{r.ready}</Pill>
                  </TableCell>
                  <TableCell className="text-right">{r.riskPct.toFixed(2)}%</TableCell>
                  <TableCell className="text-right">{r.entryPx.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.stopPx.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.shares}</TableCell>
                  <TableCell className="text-right">{r.posDollars.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.twoR.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.earningsD}</TableCell>
                  <TableCell className="text-right">{r.dist21Atr.toFixed(1)}</TableCell>
                  <TableCell className="text-right">
                    <div className="w-[110px]">
                      <MiniBarTile values={r.bars} tones={r.barTone} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Contract note: Focus List prepares plans only. Execution occurs in “Trades Today”.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function FocusListOnlyApp() {
  // Nav is visible, but only Focus List is enabled/active for now.
  const [active] = useState("Focus List");

  return (
    <div className="min-h-screen bg-zinc-50">
      <TopNavFull active={active} />
      <MarketStateStrip />
      <FocusListView />
    </div>
  );
}

console.assert(MOCK_FOCUS.length === 5, "Mock focus list should have 5 rows");
