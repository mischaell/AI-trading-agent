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
 * Trades Today — full nav visible, ONLY Trades Today renders.
 * - No routing
 * - No dependency on other views
 * - Mock trades for UI + contract validation
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
type TradeRow = {
  time: string; // HH:MM
  ticker: string;
  side: "BUY" | "SELL";
  action: "ENTRY" | "TRIM" | "EXIT";
  qty: number;
  price: number;
  rMultiple?: number;
  note?: string;
};

// -----------------
// Mock trades (last 24h)
// -----------------
const MOCK_TRADES: TradeRow[] = [
  {
    time: "10:12",
    ticker: "NVDA",
    side: "BUY",
    action: "ENTRY",
    qty: 4,
    price: 610.4,
    rMultiple: 0.0,
    note: "Starter — reclaim 21EMA",
  },
  {
    time: "11:03",
    ticker: "META",
    side: "SELL",
    action: "TRIM",
    qty: 2,
    price: 492.8,
    rMultiple: 2.1,
    note: "1/3 off at +2R",
  },
  {
    time: "14:47",
    ticker: "ANET",
    side: "BUY",
    action: "ENTRY",
    qty: 10,
    price: 248.3,
    rMultiple: 0.0,
    note: "A-setup, tight risk",
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

function toneForSide(side: "BUY" | "SELL") {
  return side === "BUY" ? "good" : "warn";
}

// -----------------
// Market State Strip (same as other views)
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
          <div className="text-sm font-semibold text-zinc-900">Trading Agent Dashboard</div>
        </div>

        <Tabs value={active}>
          <TabsList className="rounded-full">
            {NAV.map((n) => (
              <TabsTrigger
                key={n}
                value={n}
                disabled={n !== "Trades Today"}
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
// Trades Today View
// -----------------
function TradesTodayView() {
  const rows = MOCK_TRADES;

  const stats = useMemo(() => {
    const buys = rows.filter((r) => r.side === "BUY").length;
    const sells = rows.filter((r) => r.side === "SELL").length;
    return { buys, sells, total: rows.length };
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Trades Today — Last 24h</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Trades: {stats.total}</Pill>
              <Pill tone="good">Buys: {stats.buys}</Pill>
              <Pill tone="warn">Sells: {stats.sells}</Pill>
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
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">R</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-zinc-500">{r.time}</TableCell>
                  <TableCell className="font-semibold text-zinc-900">{r.ticker}</TableCell>
                  <TableCell>
                    <Pill tone={toneForSide(r.side)}>{r.side}</Pill>
                  </TableCell>
                  <TableCell>{r.action}</TableCell>
                  <TableCell className="text-right">{r.qty}</TableCell>
                  <TableCell className="text-right">{r.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {r.rMultiple !== undefined ? r.rMultiple.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="text-zinc-600">{r.note ?? ""}</TableCell>
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

// -----------------
// App shell
// -----------------
export default function TradesTodayOnlyApp() {
  const [active] = useState("Trades Today");

  return (
    <div className="min-h-screen bg-zinc-50">
      <TopNavFull active={active} />
      <MarketStateStrip />
      <TradesTodayView />
    </div>
  );
}

console.assert(MOCK_TRADES.length > 0, "Trades Today should have mock trades");
