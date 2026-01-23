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
 * Portfolio — full nav visible, ONLY Portfolio renders.
 * - No routing
 * - Self-contained mock portfolio snapshot
 * - Snapshot is a single-line ribbon (no wrap, horizontal scroll)
 */

// -----------------
// Market State (locked contract, display-only)
// -----------------
const MARKET_STATE = {
  stateLabel: "PARTICIPATION FADE (Defense / stop adding)",
};

// -----------------
// Types
// -----------------
type PortfolioSummary = {
  asOf: string; // e.g., "2026-01-17 12:04"
  equity: number;
  cash: number;
  netExposurePct: number; // %
  openRiskPct: number; // % of equity at risk (NER)
  positions: number;
};

type PositionRow = {
  ticker: string;
  theme: string;
  qty: number;
  avg: number;
  last: number;
  value: number;
  pnlDay: number; // $ (mock)
  pnlUnreal: number; // $
  rUnreal: number; // R multiple (mock)
  stop: number; // 21EMA low band (close-based)
  twoR: number;
  earningsD: number;
  dist21Atr: number; // xATR distance from 21 structure
  status: "CORE" | "STARTER" | "RUNNER";
};

// -----------------
// Mock snapshot (replace later)
// -----------------
const MOCK_SUMMARY: PortfolioSummary = {
  asOf: "2026-01-17 12:04",
  equity: 100000,
  cash: 62000,
  netExposurePct: 38.0,
  openRiskPct: 1.25,
  positions: 4,
};

const MOCK_POSITIONS: PositionRow[] = [
  {
    ticker: "NVDA",
    theme: "AI Compute",
    qty: 4,
    avg: 610.4,
    last: 624.1,
    value: 2496.4,
    pnlDay: 38.0,
    pnlUnreal: 54.8,
    rUnreal: 1.2,
    stop: 598.9,
    twoR: 633.4,
    earningsD: 24,
    dist21Atr: 0.2,
    status: "STARTER",
  },
  {
    ticker: "META",
    theme: "Ads / AI",
    qty: 3,
    avg: 468.2,
    last: 492.8,
    value: 1478.4,
    pnlDay: 12.5,
    pnlUnreal: 73.8,
    rUnreal: 2.1,
    stop: 456.0,
    twoR: 492.6,
    earningsD: 11,
    dist21Atr: -0.1,
    status: "RUNNER",
  },
  {
    ticker: "ANET",
    theme: "Networking",
    qty: 10,
    avg: 248.3,
    last: 244.9,
    value: 2449.0,
    pnlDay: -21.0,
    pnlUnreal: -34.0,
    rUnreal: -0.5,
    stop: 241.1,
    twoR: 262.7,
    earningsD: 15,
    dist21Atr: 0.0,
    status: "STARTER",
  },
  {
    ticker: "GOOGL",
    theme: "Search / AI",
    qty: 15,
    avg: 156.3,
    last: 160.8,
    value: 2412.0,
    pnlDay: 9.0,
    pnlUnreal: 67.5,
    rUnreal: 1.6,
    stop: 151.6,
    twoR: 165.7,
    earningsD: 16,
    dist21Atr: -0.3,
    status: "CORE",
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
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

function fmtUsd(n: number) {
  const s = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${n < 0 ? "-" : ""}$${s}`;
}

function toneForPnl(n: number) {
  if (n > 0) return "good";
  if (n < 0) return "warn";
  return "neutral";
}

function toneForDist21(x: number) {
  // Warn if outside your pullback buy window: -0.5 to +1.0 xATR
  if (x < -0.5 || x > 1.0) return "warn";
  return "neutral";
}

function toneForEarnings(d: number) {
  return d <= 7 ? "warn" : "neutral";
}

// -----------------
// Market State Strip (locked contract)
// -----------------
function MarketStateStrip() {
  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
          <div className="text-lg font-semibold tracking-tight text-zinc-900">
            <span className="font-medium text-zinc-500">Current State:</span>{" "}
            <span className="font-bold">{MARKET_STATE.stateLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-zinc-900">New Entries:</span>
            <Button
              variant="outline"
              className="rounded-full border-red-300 text-red-600"
              disabled
            >
              Adds
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-red-300 text-red-600"
              disabled
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

// -----------------
// Full Top Nav (visible, inert)
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
          <div className="text-sm font-semibold text-zinc-900">
            Trading Agent Dashboard
          </div>
        </div>

        <Tabs value={active}>
          <TabsList className="rounded-full">
            {NAV.map((n) => (
              <TabsTrigger
                key={n}
                value={n}
                disabled={n !== "Portfolio"}
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
// Portfolio View
// -----------------
function PortfolioView() {
  const s = MOCK_SUMMARY;
  const rows = MOCK_POSITIONS;

  const totals = useMemo(() => {
    const invested = rows.reduce((acc, r) => acc + r.value, 0);
    const day = rows.reduce((acc, r) => acc + r.pnlDay, 0);
    const unreal = rows.reduce((acc, r) => acc + r.pnlUnreal, 0);
    return { invested, day, unreal };
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* Snapshot — single line, no wrap */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Pill>As of {s.asOf}</Pill>
            <Pill>Equity  <span className="font-bold">{fmtUsd(s.equity)}</span></Pill>
            <Pill>Cash  <span className="font-bold">{fmtUsd(s.cash)}</span></Pill>
            <Pill>Invested  <span className="font-bold">{fmtUsd(totals.invested)}</span></Pill>
            <Pill>Net Exposure  <span className="font-bold">{s.netExposurePct.toFixed(1)}%</span></Pill>
            <Pill>Open Risk (NER)  <span className="font-bold">{s.openRiskPct.toFixed(2)}%</span></Pill>
            <Pill>Positions  <span className="font-bold">{s.positions}</span></Pill>
            <Pill tone={toneForPnl(totals.day)}>Day P/L  <span className="font-bold">{fmtUsd(totals.day)}</span></Pill>
            <Pill tone={toneForPnl(totals.unreal)}>Unreal P/L  <span className="font-bold">{fmtUsd(totals.unreal)}</span></Pill>
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
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Last</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Day P/L</TableHead>
                <TableHead className="text-right">Unreal P/L</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead className="text-right">Stop</TableHead>
                <TableHead className="text-right">2R</TableHead>
                <TableHead className="text-right">E(d)</TableHead>
                <TableHead className="text-right">Δ21</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.ticker}>
                  <TableCell className="font-semibold text-zinc-900">
                    {r.ticker}
                  </TableCell>
                  <TableCell className="text-zinc-700">{r.theme}</TableCell>
                  <TableCell className="text-right">{r.qty}</TableCell>
                  <TableCell className="text-right">{r.avg.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.last.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{fmtUsd(r.value)}</TableCell>
                  <TableCell className="text-right">
                    <Pill tone={toneForPnl(r.pnlDay)}>{fmtUsd(r.pnlDay)}</Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Pill tone={toneForPnl(r.pnlUnreal)}>
                      {fmtUsd(r.pnlUnreal)}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Pill
                      tone={
                        r.rUnreal >= 2
                          ? "good"
                          : r.rUnreal < 0
                          ? "warn"
                          : "neutral"
                      }
                    >
                      {r.rUnreal.toFixed(1)}R
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right">{r.stop.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.twoR.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Pill tone={toneForEarnings(r.earningsD)}>{r.earningsD}</Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Pill tone={toneForDist21(r.dist21Atr)}>
                      {r.dist21Atr.toFixed(1)}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <Pill>{r.status}</Pill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-3 text-xs text-zinc-500">
            Contract notes: Stops are close-based vs 21EMA low band. Earnings risk
            handled elsewhere.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------
// App shell
// -----------------
export default function PortfolioOnlyApp() {
  const [active] = useState("Portfolio");

  return (
    <div className="min-h-screen bg-zinc-50">
      <TopNavFull active={active} />
      <MarketStateStrip />
      <PortfolioView />
    </div>
  );
}

// Minimal sanity checks
console.assert(MOCK_POSITIONS.length > 0, "Portfolio should have mock positions");
console.assert(MOCK_SUMMARY.equity > 0, "Equity should be positive");
