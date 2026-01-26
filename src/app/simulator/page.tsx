"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import * as d3 from "d3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// =============================================================================
// Types
// =============================================================================

interface Trade {
  symbol: string;
  side: "Long" | "Short";
  buyDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  stopLoss: number;
  result: number; // percentage
  holdingDays: number;
}

interface SimParams {
  // Position sizing
  positionSizePct: number; // 2-15% of equity per trade
  maxPortfolioHeatPct: number; // 2-8% max total open risk
  maxConcurrentPositions: number; // 1-20 max open positions
  qualityFilter: "all" | "B+" | "A"; // Trade quality filter
  // SSL trailing - move stop to breakeven at X R
  sslTrailR: number; // 1-20R
  // Trim I
  trim1PriceR: number; // 2-20R
  trim1Size: number; // 33-66%
  // Trim II
  trim2PriceR: number; // 5-20R
}

interface SimResult {
  equity: number;
  date: Date;
  trade?: Trade;
  drawdown: number;
  peak: number;
}

interface Stats {
  totalReturn: number;
  maxDrawdown: number;
  winRate: number;
  avgTradesPerMonth: number;
  avgRRR: number;
  avgGain: number;
  avgLoss: number;
  biggestGain: number;
  biggestLoss: number;
  avgDaysGain: number;
  avgDaysLoss: number;
  totalTrades: number;
  tradesFiltered: number;
  avgPositionSize: number;
  highestPositionSize: number;
  lowestPositionSize: number;
  avgConcurrentPositions: number;
  maxConcurrentPositions: number;
  minConcurrentPositions: number;
}

// =============================================================================
// Trade Data (parsed from CSV)
// =============================================================================


const TRADE_DATA: Trade[] = [
  { symbol: "SOFI", side: "Long", buyDate: new Date("2025-11-11"), exitDate: new Date("2025-11-13"), entryPrice: 30.82, exitPrice: 30.68, stopLoss: 28.01, result: -0.5, holdingDays: 2 },
  { symbol: "GLW", side: "Long", buyDate: new Date("2025-11-10"), exitDate: new Date("2025-11-13"), entryPrice: 88.27, exitPrice: 87.61, stopLoss: 84.88, result: -0.7, holdingDays: 3 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-11-12"), exitDate: new Date("2025-11-13"), entryPrice: 187.15, exitPrice: 180.43, stopLoss: 182.25, result: -3.6, holdingDays: 1 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-11-11"), exitDate: new Date("2025-11-13"), entryPrice: 191.27, exitPrice: 180.43, stopLoss: 182, result: -5.7, holdingDays: 2 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-11-12"), exitDate: new Date("2025-11-13"), entryPrice: 157.91, exitPrice: 151.6, stopLoss: 154.94, result: -4, holdingDays: 1 },
  { symbol: "CLS", side: "Long", buyDate: new Date("2025-11-12"), exitDate: new Date("2025-11-13"), entryPrice: 335.56, exitPrice: 316.89, stopLoss: 306.23, result: -5.6, holdingDays: 1 },
  { symbol: "INTC", side: "Long", buyDate: new Date("2025-11-12"), exitDate: new Date("2025-11-12"), entryPrice: 37.97, exitPrice: 37.91, stopLoss: 37.12, result: -0.2, holdingDays: 0 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-11-10"), exitDate: new Date("2025-11-11"), entryPrice: 187.91, exitPrice: 178.97, stopLoss: 176.47, result: -4.8, holdingDays: 1 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-11-10"), exitDate: new Date("2025-11-11"), entryPrice: 169.71, exitPrice: 159.16, stopLoss: 154.8, result: -6.2, holdingDays: 1 },
  { symbol: "CRWD", side: "Long", buyDate: new Date("2025-10-20"), exitDate: new Date("2025-11-06"), entryPrice: 490.16, exitPrice: 513.76, stopLoss: 478.36, result: 7.9, holdingDays: 17 },
  { symbol: "SNOW", side: "Long", buyDate: new Date("2025-09-25"), exitDate: new Date("2025-11-06"), entryPrice: 219.28, exitPrice: 222.42, stopLoss: 217.71, result: 8.7, holdingDays: 42 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-09-17"), exitDate: new Date("2025-11-06"), entryPrice: 139.01, exitPrice: 150.37, stopLoss: 133.33, result: 20.1, holdingDays: 50 },
  { symbol: "AMD", side: "Long", buyDate: new Date("2025-09-25"), exitDate: new Date("2025-11-06"), entryPrice: 158.79, exitPrice: 161.27, stopLoss: 157.55, result: 19.2, holdingDays: 42 },
  { symbol: "MU", side: "Long", buyDate: new Date("2025-09-04"), exitDate: new Date("2025-11-06"), entryPrice: 121.5, exitPrice: 142.04, stopLoss: 111.23, result: 52.8, holdingDays: 63 },
  { symbol: "SNOW", side: "Long", buyDate: new Date("2025-10-22"), exitDate: new Date("2025-11-06"), entryPrice: 240.7, exitPrice: 252.61, stopLoss: 234.26, result: 9.4, holdingDays: 15 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-10-22"), exitDate: new Date("2025-11-06"), entryPrice: 167.04, exitPrice: 180.5, stopLoss: 160.31, result: 11.2, holdingDays: 15 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-10-23"), exitDate: new Date("2025-11-06"), entryPrice: 144.25, exitPrice: 157.03, stopLoss: 138.69, result: 13.5, holdingDays: 14 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-11-06"), exitDate: new Date("2025-11-06"), entryPrice: 183.62, exitPrice: 184.26, stopLoss: 176.35, result: 0.3, holdingDays: 0 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-11-06"), exitDate: new Date("2025-11-06"), entryPrice: 359.27, exitPrice: 356.18, stopLoss: 350.35, result: -0.9, holdingDays: 0 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-11-06"), exitDate: new Date("2025-11-06"), entryPrice: 618.87, exitPrice: 617.04, stopLoss: 600.88, result: -0.3, holdingDays: 0 },
  { symbol: "DELL", side: "Long", buyDate: new Date("2025-11-05"), exitDate: new Date("2025-11-06"), entryPrice: 153.44, exitPrice: 149.99, stopLoss: 151.41, result: -2.2, holdingDays: 1 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-11-06"), exitDate: new Date("2025-11-06"), entryPrice: 165.83, exitPrice: 164.29, stopLoss: 154.66, result: -0.9, holdingDays: 0 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-11-06"), exitDate: new Date("2025-11-06"), entryPrice: 137.25, exitPrice: 129.04, stopLoss: 135.91, result: -6, holdingDays: 0 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-11-05"), exitDate: new Date("2025-11-06"), entryPrice: 186.5, exitPrice: 177.08, stopLoss: 183.31, result: -5.1, holdingDays: 1 },
  { symbol: "SOFI", side: "Long", buyDate: new Date("2025-11-05"), exitDate: new Date("2025-11-06"), entryPrice: 29.71, exitPrice: 28.03, stopLoss: 28.01, result: -5.7, holdingDays: 1 },
  { symbol: "DELL", side: "Long", buyDate: new Date("2025-10-22"), exitDate: new Date("2025-11-04"), entryPrice: 146.71, exitPrice: 153.77, stopLoss: 143.18, result: 5.7, holdingDays: 13 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-11-04"), exitDate: new Date("2025-11-04"), entryPrice: 168.36, exitPrice: 164.91, stopLoss: 152.51, result: -2, holdingDays: 0 },
  { symbol: "DELL", side: "Long", buyDate: new Date("2025-11-04"), exitDate: new Date("2025-11-04"), entryPrice: 156.94, exitPrice: 154.51, stopLoss: 151.64, result: -1.5, holdingDays: 0 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-11-04"), exitDate: new Date("2025-11-04"), entryPrice: 183.32, exitPrice: 180.4, stopLoss: 175.29, result: -1.6, holdingDays: 0 },
  { symbol: "SOFI", side: "Long", buyDate: new Date("2025-10-31"), exitDate: new Date("2025-11-04"), entryPrice: 29.06, exitPrice: 29.54, stopLoss: 27.68, result: 1.7, holdingDays: 4 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-11-03"), exitDate: new Date("2025-11-04"), entryPrice: 456.04, exitPrice: 447.4, stopLoss: 432.6, result: -1.9, holdingDays: 1 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-11-03"), exitDate: new Date("2025-11-04"), entryPrice: 365.73, exitPrice: 353.73, stopLoss: 350.2, result: -3.3, holdingDays: 1 },
  { symbol: "DDOG", side: "Long", buyDate: new Date("2025-10-23"), exitDate: new Date("2025-11-04"), entryPrice: 155.53, exitPrice: 157.91, stopLoss: 150.57, result: 1.2, holdingDays: 12 },
  { symbol: "CEG", side: "Long", buyDate: new Date("2025-10-23"), exitDate: new Date("2025-11-04"), entryPrice: 362.88, exitPrice: 376.6, stopLoss: 356.04, result: 3.2, holdingDays: 12 },
  { symbol: "COIN", side: "Long", buyDate: new Date("2025-10-31"), exitDate: new Date("2025-11-03"), entryPrice: 350.6, exitPrice: 334.23, stopLoss: 336.98, result: -4.7, holdingDays: 3 },
  { symbol: "HPE", side: "Long", buyDate: new Date("2025-10-31"), exitDate: new Date("2025-10-31"), entryPrice: 24.76, exitPrice: 24.24, stopLoss: 23.7, result: -2.1, holdingDays: 0 },
  { symbol: "ASTS", side: "Long", buyDate: new Date("2025-10-31"), exitDate: new Date("2025-10-31"), entryPrice: 79.1, exitPrice: 77.72, stopLoss: 72.77, result: -1.7, holdingDays: 0 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-10-23"), exitDate: new Date("2025-10-30"), entryPrice: 437.65, exitPrice: 442.27, stopLoss: 420.64, result: 0.9, holdingDays: 7 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-10-23"), exitDate: new Date("2025-10-30"), entryPrice: 62.95, exitPrice: 61.37, stopLoss: 58.8, result: -2.5, holdingDays: 7 },
  { symbol: "SMCI", side: "Long", buyDate: new Date("2025-10-17"), exitDate: new Date("2025-10-23"), entryPrice: 52.34, exitPrice: 55.98, stopLoss: 50.52, result: -3.4, holdingDays: 6 },
  { symbol: "SNOW", side: "Long", buyDate: new Date("2025-10-17"), exitDate: new Date("2025-10-22"), entryPrice: 240.35, exitPrice: 241.82, stopLoss: 232.18, result: 0.6, holdingDays: 5 },
  { symbol: "DELL", side: "Long", buyDate: new Date("2025-10-20"), exitDate: new Date("2025-10-22"), entryPrice: 149.9, exitPrice: 147.39, stopLoss: 143.46, result: -1.7, holdingDays: 2 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-10-22"), exitDate: new Date("2025-10-22"), entryPrice: 166.67, exitPrice: 163.64, stopLoss: 160.46, result: -1.8, holdingDays: 0 },
  { symbol: "NVDA", side: "Long", buyDate: new Date("2025-10-17"), exitDate: new Date("2025-10-22"), entryPrice: 183.82, exitPrice: 181.33, stopLoss: 180.46, result: -1.4, holdingDays: 5 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-10-22"), exitDate: new Date("2025-10-22"), entryPrice: 144.76, exitPrice: 137.88, stopLoss: 139.88, result: -4.8, holdingDays: 0 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-10-20"), exitDate: new Date("2025-10-22"), entryPrice: 182.38, exitPrice: 176.79, stopLoss: 174.35, result: -3.1, holdingDays: 2 },
  { symbol: "OKLO", side: "Long", buyDate: new Date("2025-09-11"), exitDate: new Date("2025-10-22"), entryPrice: 73.62, exitPrice: 81.5, stopLoss: 69.68, result: 34.6, holdingDays: 41 },
  { symbol: "MP", side: "Long", buyDate: new Date("2025-10-08"), exitDate: new Date("2025-10-21"), entryPrice: 70.3, exitPrice: 74.72, stopLoss: 68.09, result: 9.2, holdingDays: 13 },
  { symbol: "MP", side: "Long", buyDate: new Date("2025-10-02"), exitDate: new Date("2025-10-21"), entryPrice: 68.55, exitPrice: 72.01, stopLoss: 66.82, result: 10.2, holdingDays: 19 },
  { symbol: "OKLO", side: "Long", buyDate: new Date("2025-10-21"), exitDate: new Date("2025-10-21"), entryPrice: 147.73, exitPrice: 137.6, stopLoss: 134.11, result: -6.9, holdingDays: 0 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-10-21"), exitDate: new Date("2025-10-21"), entryPrice: 147.03, exitPrice: 142.71, stopLoss: 139.93, result: -2.9, holdingDays: 0 },
  { symbol: "TEM", side: "Long", buyDate: new Date("2025-09-30"), exitDate: new Date("2025-10-16"), entryPrice: 79.8, exitPrice: 82.62, stopLoss: 78.39, result: 8.7, holdingDays: 16 },
  { symbol: "CRWV", side: "Long", buyDate: new Date("2025-10-15"), exitDate: new Date("2025-10-16"), entryPrice: 136.03, exitPrice: 141.86, stopLoss: 127, result: 4.3, holdingDays: 1 },
  { symbol: "SNOW", side: "Long", buyDate: new Date("2025-10-15"), exitDate: new Date("2025-10-16"), entryPrice: 242.17, exitPrice: 240.26, stopLoss: 231.4, result: -0.8, holdingDays: 1 },
  { symbol: "TEM", side: "Long", buyDate: new Date("2025-10-15"), exitDate: new Date("2025-10-16"), entryPrice: 93.17, exitPrice: 90.55, stopLoss: 86.46, result: -2.8, holdingDays: 1 },
  { symbol: "JOBY", side: "Long", buyDate: new Date("2025-10-13"), exitDate: new Date("2025-10-16"), entryPrice: 16.82, exitPrice: 18.01, stopLoss: 16, result: -0.2, holdingDays: 3 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-10-16"), exitDate: new Date("2025-10-16"), entryPrice: 132.65, exitPrice: 132.65, stopLoss: 131.67, result: -0.8, holdingDays: 0 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-09-05"), exitDate: new Date("2025-10-16"), entryPrice: 98.53, exitPrice: 107.89, stopLoss: 96.55, result: 29.3, holdingDays: 41 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-09-16"), exitDate: new Date("2025-10-14"), entryPrice: 115.46, exitPrice: 130.4, stopLoss: 107.99, result: 15.9, holdingDays: 28 },
  { symbol: "TEM", side: "Long", buyDate: new Date("2025-10-14"), exitDate: new Date("2025-10-14"), entryPrice: 88.9, exitPrice: 90.12, stopLoss: 85.89, result: 1.4, holdingDays: 0 },
  { symbol: "SNOW", side: "Long", buyDate: new Date("2025-10-14"), exitDate: new Date("2025-10-14"), entryPrice: 240.8, exitPrice: 241.89, stopLoss: 230.43, result: 0.5, holdingDays: 0 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-10-14"), exitDate: new Date("2025-10-14"), entryPrice: 181.33, exitPrice: 179.25, stopLoss: 173.59, result: -1.1, holdingDays: 0 },
  { symbol: "CRWV", side: "Long", buyDate: new Date("2025-10-14"), exitDate: new Date("2025-10-14"), entryPrice: 136.72, exitPrice: 133.9, stopLoss: 126.14, result: -2.1, holdingDays: 0 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-10-13"), exitDate: new Date("2025-10-14"), entryPrice: 147.66, exitPrice: 140.32, stopLoss: 142.46, result: -5, holdingDays: 1 },
  { symbol: "ALAB", side: "Long", buyDate: new Date("2025-10-13"), exitDate: new Date("2025-10-13"), entryPrice: 207.09, exitPrice: 199.34, stopLoss: 203.97, result: -3.7, holdingDays: 0 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-09-05"), exitDate: new Date("2025-10-10"), entryPrice: 156.85, exitPrice: 176.05, stopLoss: 147.25, result: 12.5, holdingDays: 35 },
  { symbol: "NVDA", side: "Long", buyDate: new Date("2025-09-25"), exitDate: new Date("2025-10-10"), entryPrice: 175.87, exitPrice: 180.69, stopLoss: 173.46, result: 4.6, holdingDays: 15 },
  { symbol: "CLS", side: "Long", buyDate: new Date("2025-10-07"), exitDate: new Date("2025-10-10"), entryPrice: 235.7, exitPrice: 240.16, stopLoss: 233.47, result: 4.1, holdingDays: 3 },
  { symbol: "ALAB", side: "Long", buyDate: new Date("2025-10-03"), exitDate: new Date("2025-10-10"), entryPrice: 201.97, exitPrice: 228, stopLoss: 200.69, result: 10.1, holdingDays: 7 },
  { symbol: "WBD", side: "Long", buyDate: new Date("2025-09-10"), exitDate: new Date("2025-10-10"), entryPrice: 12.22, exitPrice: 13.56, stopLoss: 11.55, result: 27.4, holdingDays: 30 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-09-04"), exitDate: new Date("2025-10-10"), entryPrice: 340.55, exitPrice: 396.05, stopLoss: 309.26, result: 20.2, holdingDays: 36 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-10-09"), exitDate: new Date("2025-10-10"), entryPrice: 182.15, exitPrice: 177.86, stopLoss: 173.94, result: -2.4, holdingDays: 1 },
  { symbol: "GEV", side: "Long", buyDate: new Date("2025-10-07"), exitDate: new Date("2025-10-10"), entryPrice: 606.78, exitPrice: 618.18, stopLoss: 601.08, result: 1, holdingDays: 3 },
  { symbol: "ALAB", side: "Long", buyDate: new Date("2025-10-07"), exitDate: new Date("2025-10-10"), entryPrice: 211.87, exitPrice: 212.62, stopLoss: 202.39, result: 0.4, holdingDays: 3 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-10-02"), exitDate: new Date("2025-10-10"), entryPrice: 148.91, exitPrice: 158.63, stopLoss: 144.05, result: 3.9, holdingDays: 8 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-10-02"), exitDate: new Date("2025-10-07"), entryPrice: 146.67, exitPrice: 151.71, stopLoss: 144.15, result: -2.4, holdingDays: 5 },
  { symbol: "ANET", side: "Long", buyDate: new Date("2025-09-25"), exitDate: new Date("2025-10-07"), entryPrice: 142.54, exitPrice: 149.06, stopLoss: 139.28, result: 2.6, holdingDays: 12 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-09-08"), exitDate: new Date("2025-10-02"), entryPrice: 93.64, exitPrice: 101.64, stopLoss: 89.64, result: 4.7, holdingDays: 24 },
  { symbol: "GEV", side: "Long", buyDate: new Date("2025-09-09"), exitDate: new Date("2025-09-25"), entryPrice: 611.48, exitPrice: 608.03, stopLoss: 579.32, result: -0.6, holdingDays: 16 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-09-25"), exitDate: new Date("2025-09-25"), entryPrice: 48.31, exitPrice: 48.31, stopLoss: 46.23, result: -5.9, holdingDays: 0 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-09-11"), exitDate: new Date("2025-09-25"), entryPrice: 46.7, exitPrice: 51.98, stopLoss: 44.06, result: 2, holdingDays: 14 },
  { symbol: "NVDA", side: "Long", buyDate: new Date("2025-09-24"), exitDate: new Date("2025-09-24"), entryPrice: 178.91, exitPrice: 176.82, stopLoss: 173.7, result: -1.2, holdingDays: 0 },
  { symbol: "IBKR", side: "Long", buyDate: new Date("2025-09-23"), exitDate: new Date("2025-09-24"), entryPrice: 64.94, exitPrice: 64.33, stopLoss: 62.41, result: -0.9, holdingDays: 1 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-09-19"), exitDate: new Date("2025-09-24"), entryPrice: 48.64, exitPrice: 48.9, stopLoss: 45.76, result: 0.5, holdingDays: 5 },
  { symbol: "CCL", side: "Long", buyDate: new Date("2025-09-10"), exitDate: new Date("2025-09-19"), entryPrice: 31.17, exitPrice: 32.51, stopLoss: 30.5, result: -0.2, holdingDays: 9 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-09-10"), exitDate: new Date("2025-09-19"), entryPrice: 65.03, exitPrice: 65.67, stopLoss: 63.62, result: 1, holdingDays: 9 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-09-16"), exitDate: new Date("2025-09-18"), entryPrice: 47.15, exitPrice: 47.25, stopLoss: 45.39, result: 0.2, holdingDays: 2 },
  { symbol: "NFLX", side: "Long", buyDate: new Date("2025-09-04"), exitDate: new Date("2025-09-04"), entryPrice: 1, exitPrice: 252.9, stopLoss: 0.95, result: 1194.1, holdingDays: 0 },
  { symbol: "META", side: "Long", buyDate: new Date("2025-09-05"), exitDate: new Date("2025-09-10"), entryPrice: 751.33, exitPrice: 753.39, stopLoss: 721.79, result: 0.3, holdingDays: 5 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-09-05"), exitDate: new Date("2025-09-10"), entryPrice: 712.11, exitPrice: 704.8, stopLoss: 669.71, result: -1, holdingDays: 5 },
  { symbol: "AMZN", side: "Long", buyDate: new Date("2025-09-08"), exitDate: new Date("2025-09-10"), entryPrice: 234.51, exitPrice: 229.4, stopLoss: 221.17, result: -2.2, holdingDays: 2 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-09-03"), exitDate: new Date("2025-09-03"), entryPrice: 158.2, exitPrice: 154.03, stopLoss: 157.2, result: -2.6, holdingDays: 0 },
  { symbol: "ALAB", side: "Long", buyDate: new Date("2025-09-03"), exitDate: new Date("2025-09-03"), entryPrice: 176.38, exitPrice: 175.42, stopLoss: 165.16, result: -0.5, holdingDays: 0 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-09-03"), exitDate: new Date("2025-09-03"), entryPrice: 93.48, exitPrice: 92.87, stopLoss: 91.95, result: -0.7, holdingDays: 0 },
  { symbol: "CVNA", side: "Long", buyDate: new Date("2025-09-03"), exitDate: new Date("2025-09-03"), entryPrice: 370.43, exitPrice: 366.78, stopLoss: 350.13, result: -1, holdingDays: 0 },
  { symbol: "IONQ", side: "Long", buyDate: new Date("2025-08-26"), exitDate: new Date("2025-09-02"), entryPrice: 39.48, exitPrice: 43, stopLoss: 38.94, result: 8.9, holdingDays: 7 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-08-22"), exitDate: new Date("2025-09-02"), entryPrice: 139.58, exitPrice: 139.04, stopLoss: 134.4, result: -0.4, holdingDays: 11 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-08-11"), exitDate: new Date("2025-09-02"), entryPrice: 90.81, exitPrice: 92.81, stopLoss: 88.76, result: 2.2, holdingDays: 22 },
  { symbol: "AMZU", side: "Long", buyDate: new Date("2025-08-22"), exitDate: new Date("2025-09-02"), entryPrice: 37.31, exitPrice: 36.94, stopLoss: 36.96, result: -1, holdingDays: 11 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-08-15"), exitDate: new Date("2025-08-29"), entryPrice: 91.17, exitPrice: 93.7, stopLoss: 89.31, result: 2.8, holdingDays: 14 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-08-29"), exitDate: new Date("2025-08-29"), entryPrice: 103.27, exitPrice: 103.93, stopLoss: 101.93, result: 0.6, holdingDays: 0 },
  { symbol: "NFLX", side: "Long", buyDate: new Date("2025-08-25"), exitDate: new Date("2025-08-25"), entryPrice: 1, exitPrice: 207, stopLoss: 0.95, result: 1197.1, holdingDays: 0 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-08-29"), exitDate: new Date("2025-08-29"), entryPrice: 156.87, exitPrice: 156.5, stopLoss: 153.89, result: -0.2, holdingDays: 0 },
  { symbol: "META", side: "Long", buyDate: new Date("2025-08-28"), exitDate: new Date("2025-08-29"), entryPrice: 747.57, exitPrice: 736.77, stopLoss: 744.51, result: -1.4, holdingDays: 1 },
  { symbol: "AMD", side: "Long", buyDate: new Date("2025-08-28"), exitDate: new Date("2025-08-29"), entryPrice: 166.87, exitPrice: 162.68, stopLoss: 164.91, result: -2.5, holdingDays: 1 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-08-13"), exitDate: new Date("2025-08-29"), entryPrice: 690.77, exitPrice: 744.69, stopLoss: 671.64, result: 0.5, holdingDays: 16 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-08-26"), exitDate: new Date("2025-08-27"), entryPrice: 692.25, exitPrice: 691.25, stopLoss: 684.57, result: -0.1, holdingDays: 1 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-08-18"), exitDate: new Date("2025-08-27"), entryPrice: 92.1, exitPrice: 95.62, stopLoss: 89.54, result: 3.8, holdingDays: 9 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-08-26"), exitDate: new Date("2025-08-27"), entryPrice: 106.94, exitPrice: 106.94, stopLoss: 104.11, result: -3.4, holdingDays: 1 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-08-20"), exitDate: new Date("2025-08-27"), entryPrice: 103.13, exitPrice: 103.13, stopLoss: 99.32, result: 0.2, holdingDays: 7 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-08-06"), exitDate: new Date("2025-08-27"), entryPrice: 104.57, exitPrice: 115.46, stopLoss: 97.76, result: 1.7, holdingDays: 21 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-08-22"), exitDate: new Date("2025-08-25"), entryPrice: 106.47, exitPrice: 107.43, stopLoss: 99.32, result: 0.9, holdingDays: 3 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-08-22"), exitDate: new Date("2025-08-25"), entryPrice: 696.39, exitPrice: 694.85, stopLoss: 684.04, result: -0.2, holdingDays: 3 },
  { symbol: "AMD", side: "Long", buyDate: new Date("2025-08-22"), exitDate: new Date("2025-08-25"), entryPrice: 167.46, exitPrice: 163.36, stopLoss: 165.25, result: -2.4, holdingDays: 3 },
  { symbol: "AMZU", side: "Long", buyDate: new Date("2025-08-20"), exitDate: new Date("2025-08-21"), entryPrice: 37.86, exitPrice: 36.44, stopLoss: 37.16, result: -3.8, holdingDays: 1 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-08-21"), exitDate: new Date("2025-08-21"), entryPrice: 689.1, exitPrice: 689.01, stopLoss: 683.94, result: 0, holdingDays: 0 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-08-19"), exitDate: new Date("2025-08-21"), entryPrice: 329.78, exitPrice: 319.57, stopLoss: 320.92, result: -3.1, holdingDays: 2 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-08-15"), exitDate: new Date("2025-08-21"), entryPrice: 334.32, exitPrice: 319.57, stopLoss: 320.2, result: -4.4, holdingDays: 6 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-08-07"), exitDate: new Date("2025-08-21"), entryPrice: 320.52, exitPrice: 319.57, stopLoss: 310.45, result: -0.3, holdingDays: 14 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-08-19"), exitDate: new Date("2025-08-19"), entryPrice: 109.24, exitPrice: 107.43, stopLoss: 104.3, result: -1.7, holdingDays: 0 },
  { symbol: "AMD", side: "Long", buyDate: new Date("2025-08-19"), exitDate: new Date("2025-08-19"), entryPrice: 170.11, exitPrice: 166.93, stopLoss: 167, result: -1.9, holdingDays: 0 },
  { symbol: "AMD", side: "Long", buyDate: new Date("2025-08-18"), exitDate: new Date("2025-08-19"), entryPrice: 175.52, exitPrice: 166.93, stopLoss: 166.76, result: -4.9, holdingDays: 1 },
  { symbol: "XYZ", side: "Long", buyDate: new Date("2025-08-18"), exitDate: new Date("2025-08-19"), entryPrice: 76.6, exitPrice: 74.27, stopLoss: 74.01, result: -3, holdingDays: 1 },
  { symbol: "BITX", side: "Long", buyDate: new Date("2025-08-18"), exitDate: new Date("2025-08-19"), entryPrice: 60.42, exitPrice: 60.42, stopLoss: 58.8, result: -6.5, holdingDays: 1 },
  { symbol: "BITX", side: "Long", buyDate: new Date("2025-08-06"), exitDate: new Date("2025-08-19"), entryPrice: 59.96, exitPrice: 67.85, stopLoss: 59.43, result: -1, holdingDays: 13 },
  { symbol: "BITX", side: "Long", buyDate: new Date("2025-08-15"), exitDate: new Date("2025-08-15"), entryPrice: 61.51, exitPrice: 61.17, stopLoss: 60.69, result: -0.6, holdingDays: 0 },
  { symbol: "IONQ", side: "Long", buyDate: new Date("2025-08-11"), exitDate: new Date("2025-08-15"), entryPrice: 41.92, exitPrice: 40.27, stopLoss: 40.51, result: -3.9, holdingDays: 4 },
  { symbol: "XYZ", side: "Long", buyDate: new Date("2025-08-15"), exitDate: new Date("2025-08-15"), entryPrice: 75.88, exitPrice: 75.34, stopLoss: 73.84, result: -0.7, holdingDays: 0 },
  { symbol: "MU", side: "Long", buyDate: new Date("2025-08-15"), exitDate: new Date("2025-08-15"), entryPrice: 121.03, exitPrice: 120.65, stopLoss: 114.79, result: -0.3, holdingDays: 0 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-08-14"), exitDate: new Date("2025-08-14"), entryPrice: 42.9, exitPrice: 43.06, stopLoss: 42.48, result: 0.4, holdingDays: 0 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-08-06"), exitDate: new Date("2025-08-14"), entryPrice: 139.75, exitPrice: 132.75, stopLoss: 131.4, result: -5, holdingDays: 8 },
  { symbol: "CVNA", side: "Long", buyDate: new Date("2025-08-14"), exitDate: new Date("2025-08-14"), entryPrice: 343.74, exitPrice: 341.24, stopLoss: 341.09, result: -0.7, holdingDays: 0 },
  { symbol: "CVNA", side: "Long", buyDate: new Date("2025-08-08"), exitDate: new Date("2025-08-08"), entryPrice: 348.2, exitPrice: 346.16, stopLoss: 341.67, result: -0.6, holdingDays: 0 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-08-07"), exitDate: new Date("2025-08-08"), entryPrice: 90.92, exitPrice: 89.63, stopLoss: 88.72, result: -1.4, holdingDays: 1 },
  { symbol: "RBRK", side: "Long", buyDate: new Date("2025-08-06"), exitDate: new Date("2025-08-08"), entryPrice: 91.74, exitPrice: 87.37, stopLoss: 86.56, result: -4.8, holdingDays: 2 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-08-05"), exitDate: new Date("2025-08-05"), entryPrice: 105.39, exitPrice: 103.87, stopLoss: 97.55, result: -1.4, holdingDays: 0 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-08-05"), exitDate: new Date("2025-08-05"), entryPrice: 139.91, exitPrice: 135.89, stopLoss: 131.21, result: -2.9, holdingDays: 0 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-07-03"), exitDate: new Date("2025-07-31"), entryPrice: 134.33, exitPrice: 144.77, stopLoss: 131.75, result: 10.9, holdingDays: 28 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-06-16"), exitDate: new Date("2025-07-31"), entryPrice: 25.88, exitPrice: 30.05, stopLoss: 25.51, result: 35.6, holdingDays: 45 },
  { symbol: "CRDO", side: "Long", buyDate: new Date("2025-07-22"), exitDate: new Date("2025-07-31"), entryPrice: 89.7, exitPrice: 101.8, stopLoss: 88.42, result: 20.7, holdingDays: 9 },
  { symbol: "ALAB", side: "Long", buyDate: new Date("2025-07-16"), exitDate: new Date("2025-07-31"), entryPrice: 90.9, exitPrice: 108.65, stopLoss: 89.83, result: 35.3, holdingDays: 15 },
  { symbol: "SMCI", side: "Long", buyDate: new Date("2025-07-22"), exitDate: new Date("2025-07-31"), entryPrice: 49.94, exitPrice: 52.86, stopLoss: 48.13, result: 16.1, holdingDays: 9 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-06-23"), exitDate: new Date("2025-07-31"), entryPrice: 252.05, exitPrice: 263.28, stopLoss: 240.52, result: 8.6, holdingDays: 38 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-07-31"), exitDate: new Date("2025-07-31"), entryPrice: 320.29, exitPrice: 314.3, stopLoss: 313.91, result: -1.9, holdingDays: 0 },
  { symbol: "AVAV", side: "Long", buyDate: new Date("2025-07-31"), exitDate: new Date("2025-07-31"), entryPrice: 268.02, exitPrice: 266.56, stopLoss: 253.79, result: -0.5, holdingDays: 0 },
  { symbol: "UAL", side: "Long", buyDate: new Date("2025-07-31"), exitDate: new Date("2025-07-31"), entryPrice: 90.19, exitPrice: 89.89, stopLoss: 86.61, result: -0.3, holdingDays: 0 },
  { symbol: "BITX", side: "Long", buyDate: new Date("2025-07-02"), exitDate: new Date("2025-07-30"), entryPrice: 53.95, exitPrice: 59.42, stopLoss: 52.07, result: 14.3, holdingDays: 28 },
  { symbol: "ARM", side: "Long", buyDate: new Date("2025-07-16"), exitDate: new Date("2025-07-30"), entryPrice: 152.46, exitPrice: 163.44, stopLoss: 145.54, result: 6.8, holdingDays: 14 },
  { symbol: "ANET", side: "Long", buyDate: new Date("2025-07-01"), exitDate: new Date("2025-07-30"), entryPrice: 98.73, exitPrice: 105.99, stopLoss: 93.14, result: 13.2, holdingDays: 29 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-07-16"), exitDate: new Date("2025-07-29"), entryPrice: 354.15, exitPrice: 360.2, stopLoss: 342.65, result: 1.4, holdingDays: 13 },
  { symbol: "NET", side: "Long", buyDate: new Date("2025-07-16"), exitDate: new Date("2025-07-29"), entryPrice: 188.24, exitPrice: 198.45, stopLoss: 180.01, result: 4.6, holdingDays: 13 },
  { symbol: "RDDT", side: "Long", buyDate: new Date("2025-07-16"), exitDate: new Date("2025-07-29"), entryPrice: 144.88, exitPrice: 148.8, stopLoss: 138.15, result: 3.1, holdingDays: 13 },
  { symbol: "TEM", side: "Long", buyDate: new Date("2025-07-25"), exitDate: new Date("2025-07-25"), entryPrice: 64.49, exitPrice: 64.52, stopLoss: 62.2, result: 0, holdingDays: 0 },
  { symbol: "AFRM", side: "Long", buyDate: new Date("2025-07-25"), exitDate: new Date("2025-07-25"), entryPrice: 66.66, exitPrice: 66.97, stopLoss: 64.62, result: 0.5, holdingDays: 0 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-07-25"), exitDate: new Date("2025-07-25"), entryPrice: 158.82, exitPrice: 157.94, stopLoss: 153.56, result: -0.6, holdingDays: 0 },
  { symbol: "BITX", side: "Long", buyDate: new Date("2025-07-25"), exitDate: new Date("2025-07-25"), entryPrice: 61.37, exitPrice: 60.98, stopLoss: 59.63, result: -0.6, holdingDays: 0 },
  { symbol: "AFRM", side: "Long", buyDate: new Date("2025-07-22"), exitDate: new Date("2025-07-24"), entryPrice: 65.88, exitPrice: 65.98, stopLoss: 64.64, result: 0.2, holdingDays: 2 },
  { symbol: "AFRM", side: "Long", buyDate: new Date("2025-07-17"), exitDate: new Date("2025-07-21"), entryPrice: 68.05, exitPrice: 66.85, stopLoss: 64.07, result: -1.8, holdingDays: 4 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-07-17"), exitDate: new Date("2025-07-18"), entryPrice: 707.12, exitPrice: 694.19, stopLoss: 703.58, result: -1.8, holdingDays: 1 },
  { symbol: "CVNA", side: "Long", buyDate: new Date("2025-07-15"), exitDate: new Date("2025-07-17"), entryPrice: 348.49, exitPrice: 350.15, stopLoss: 337.15, result: 0.5, holdingDays: 2 },
  { symbol: "UVXY", side: "Long", buyDate: new Date("2025-07-15"), exitDate: new Date("2025-07-15"), entryPrice: 17.21, exitPrice: 17.05, stopLoss: 16.85, result: -0.9, holdingDays: 0 },
  { symbol: "MU", side: "Short", buyDate: new Date("2025-07-15"), exitDate: new Date("2025-07-15"), entryPrice: 120.2, exitPrice: 119.61, stopLoss: 121.39, result: 0.5, holdingDays: 0 },
  { symbol: "MRVL", side: "Short", buyDate: new Date("2025-07-15"), exitDate: new Date("2025-07-15"), entryPrice: 72.4, exitPrice: 72.7, stopLoss: 74.01, result: -0.4, holdingDays: 0 },
  { symbol: "RDDT", side: "Short", buyDate: new Date("2025-07-15"), exitDate: new Date("2025-07-15"), entryPrice: 143.64, exitPrice: 147.3, stopLoss: 147.3, result: -2.5, holdingDays: 0 },
  { symbol: "ALAB", side: "Long", buyDate: new Date("2025-07-08"), exitDate: new Date("2025-07-14"), entryPrice: 91.89, exitPrice: 100.02, stopLoss: 88.63, result: 2.3, holdingDays: 6 },
  { symbol: "RGTI", side: "Long", buyDate: new Date("2025-07-02"), exitDate: new Date("2025-07-11"), entryPrice: 11.59, exitPrice: 12.95, stopLoss: 11.18, result: 7.3, holdingDays: 9 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-06-23"), exitDate: new Date("2025-07-11"), entryPrice: 107.55, exitPrice: 114.53, stopLoss: 104.8, result: 5, holdingDays: 18 },
  { symbol: "RDDT", side: "Long", buyDate: new Date("2025-07-11"), exitDate: new Date("2025-07-11"), entryPrice: 145.52, exitPrice: 146.3, stopLoss: 136.92, result: 0.5, holdingDays: 0 },
  { symbol: "ASTS", side: "Long", buyDate: new Date("2025-07-11"), exitDate: new Date("2025-07-11"), entryPrice: 44.49, exitPrice: 45.66, stopLoss: 41.63, result: 2.6, holdingDays: 0 },
  { symbol: "ARM", side: "Long", buyDate: new Date("2025-07-11"), exitDate: new Date("2025-07-11"), entryPrice: 146.79, exitPrice: 145.94, stopLoss: 145.62, result: -0.6, holdingDays: 0 },
  { symbol: "ACHR", side: "Long", buyDate: new Date("2025-07-08"), exitDate: new Date("2025-07-11"), entryPrice: 10.27, exitPrice: 10.51, stopLoss: 10.01, result: 2.3, holdingDays: 3 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-06-18"), exitDate: new Date("2025-07-10"), entryPrice: 26.55, exitPrice: 30.05, stopLoss: 25.58, result: 28.8, holdingDays: 22 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-06-16"), exitDate: new Date("2025-07-10"), entryPrice: 26.05, exitPrice: 30.05, stopLoss: 25.49, result: 31.3, holdingDays: 24 },
  { symbol: "ASTS", side: "Long", buyDate: new Date("2025-07-10"), exitDate: new Date("2025-07-10"), entryPrice: 44.57, exitPrice: 44.11, stopLoss: 41.46, result: -1, holdingDays: 0 },
  { symbol: "RDDT", side: "Long", buyDate: new Date("2025-07-09"), exitDate: new Date("2025-07-10"), entryPrice: 145.2, exitPrice: 143.42, stopLoss: 136, result: -1.2, holdingDays: 1 },
  { symbol: "RBRK", side: "Long", buyDate: new Date("2025-07-09"), exitDate: new Date("2025-07-10"), entryPrice: 90.18, exitPrice: 86.75, stopLoss: 86.87, result: -3.8, holdingDays: 1 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-07-09"), exitDate: new Date("2025-07-10"), entryPrice: 348.69, exitPrice: 340.76, stopLoss: 342.92, result: -2.3, holdingDays: 1 },
  { symbol: "ASTS", side: "Long", buyDate: new Date("2025-07-07"), exitDate: new Date("2025-07-09"), entryPrice: 44.21, exitPrice: 43.18, stopLoss: 40.89, result: -2.3, holdingDays: 2 },
  { symbol: "NBIS", side: "Long", buyDate: new Date("2025-07-08"), exitDate: new Date("2025-07-08"), entryPrice: 47.56, exitPrice: 47.11, stopLoss: 46.06, result: -0.9, holdingDays: 0 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-07-03"), exitDate: new Date("2025-07-08"), entryPrice: 338.87, exitPrice: 344.11, stopLoss: 325.69, result: 1.5, holdingDays: 5 },
  { symbol: "TOST", side: "Long", buyDate: new Date("2025-07-07"), exitDate: new Date("2025-07-08"), entryPrice: 44.23, exitPrice: 46.24, stopLoss: 42.13, result: 0.2, holdingDays: 1 },
  { symbol: "RBRK", side: "Long", buyDate: new Date("2025-07-07"), exitDate: new Date("2025-07-08"), entryPrice: 89.83, exitPrice: 86.88, stopLoss: 87.04, result: -3.3, holdingDays: 1 },
  { symbol: "NBIS", side: "Long", buyDate: new Date("2025-07-02"), exitDate: new Date("2025-07-07"), entryPrice: 50.01, exitPrice: 47.77, stopLoss: 46.2, result: -4.5, holdingDays: 5 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-07-01"), exitDate: new Date("2025-07-07"), entryPrice: 113.38, exitPrice: 115.83, stopLoss: 107.89, result: 2.2, holdingDays: 6 },
  { symbol: "ARM", side: "Long", buyDate: new Date("2025-07-07"), exitDate: new Date("2025-07-07"), entryPrice: 152.4, exitPrice: 149.39, stopLoss: 145.95, result: -2, holdingDays: 0 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-06-23"), exitDate: new Date("2025-07-02"), entryPrice: 715.44, exitPrice: 743.05, stopLoss: 679.52, result: 2.1, holdingDays: 9 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-06-24"), exitDate: new Date("2025-07-01"), entryPrice: 375.8, exitPrice: 377.01, stopLoss: 370.86, result: 0.3, holdingDays: 7 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-06-30"), exitDate: new Date("2025-07-01"), entryPrice: 389.53, exitPrice: 378.7, stopLoss: 371.63, result: -2.8, holdingDays: 1 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-06-26"), exitDate: new Date("2025-07-01"), entryPrice: 389.44, exitPrice: 378.7, stopLoss: 371.63, result: -2.8, holdingDays: 5 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-06-25"), exitDate: new Date("2025-07-01"), entryPrice: 388.78, exitPrice: 378.7, stopLoss: 371.63, result: -2.6, holdingDays: 6 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-07-01"), exitDate: new Date("2025-07-01"), entryPrice: 114.01, exitPrice: 112.94, stopLoss: 107.89, result: -0.9, holdingDays: 0 },
  { symbol: "RGTI", side: "Long", buyDate: new Date("2025-07-01"), exitDate: new Date("2025-07-01"), entryPrice: 11.53, exitPrice: 11.28, stopLoss: 11.16, result: -2.2, holdingDays: 0 },
  { symbol: "RGTI", side: "Long", buyDate: new Date("2025-06-30"), exitDate: new Date("2025-07-01"), entryPrice: 11.67, exitPrice: 11.28, stopLoss: 11.15, result: -3.3, holdingDays: 1 },
  { symbol: "RGTI", side: "Long", buyDate: new Date("2025-06-30"), exitDate: new Date("2025-07-01"), entryPrice: 11.44, exitPrice: 11.28, stopLoss: 11.15, result: -1.4, holdingDays: 1 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-06-26"), exitDate: new Date("2025-07-01"), entryPrice: 158.33, exitPrice: 149.89, stopLoss: 155.33, result: -5.3, holdingDays: 5 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-06-26"), exitDate: new Date("2025-07-01"), entryPrice: 156.75, exitPrice: 149.89, stopLoss: 155.33, result: -4.4, holdingDays: 5 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-07-01"), exitDate: new Date("2025-07-01"), entryPrice: 356.63, exitPrice: 347.33, stopLoss: 347.67, result: -2.6, holdingDays: 0 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-30"), exitDate: new Date("2025-07-01"), entryPrice: 350.68, exitPrice: 347.33, stopLoss: 340.05, result: -1, holdingDays: 1 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-06-09"), exitDate: new Date("2025-06-27"), entryPrice: 126.89, exitPrice: 143.89, stopLoss: 123.67, result: 6.4, holdingDays: 18 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-06-09"), exitDate: new Date("2025-06-27"), entryPrice: 125.17, exitPrice: 143.89, stopLoss: 123.67, result: 7.9, holdingDays: 18 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-06-09"), exitDate: new Date("2025-06-27"), entryPrice: 126.9, exitPrice: 143.89, stopLoss: 123.51, result: 6.5, holdingDays: 18 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-06-25"), exitDate: new Date("2025-06-25"), entryPrice: 156.39, exitPrice: 156.31, stopLoss: 155.16, result: -0.1, holdingDays: 0 },
  { symbol: "CVNA", side: "Long", buyDate: new Date("2025-06-23"), exitDate: new Date("2025-06-25"), entryPrice: 316.15, exitPrice: 314.7, stopLoss: 304.22, result: -0.5, holdingDays: 2 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-06-23"), exitDate: new Date("2025-06-23"), entryPrice: 108.19, exitPrice: 106.38, stopLoss: 104.8, result: -1.7, holdingDays: 0 },
  { symbol: "TEM", side: "Long", buyDate: new Date("2025-06-23"), exitDate: new Date("2025-06-23"), entryPrice: 65.99, exitPrice: 64.63, stopLoss: 63.06, result: -2.1, holdingDays: 0 },
  { symbol: "CVNA", side: "Long", buyDate: new Date("2025-06-23"), exitDate: new Date("2025-06-23"), entryPrice: 317.02, exitPrice: 311.92, stopLoss: 304.22, result: -1.6, holdingDays: 0 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-06-23"), exitDate: new Date("2025-06-23"), entryPrice: 250.26, exitPrice: 247.51, stopLoss: 240.66, result: -1.1, holdingDays: 0 },
  { symbol: "TEM", side: "Long", buyDate: new Date("2025-06-20"), exitDate: new Date("2025-06-23"), entryPrice: 67.7, exitPrice: 64.63, stopLoss: 65.45, result: -4.5, holdingDays: 3 },
  { symbol: "QBTS", side: "Long", buyDate: new Date("2025-06-20"), exitDate: new Date("2025-06-23"), entryPrice: 15.67, exitPrice: 14.88, stopLoss: 14.98, result: -5, holdingDays: 3 },
  { symbol: "CRWD", side: "Long", buyDate: new Date("2025-06-10"), exitDate: new Date("2025-06-20"), entryPrice: 466.98, exitPrice: 477.45, stopLoss: 454.83, result: 2.2, holdingDays: 10 },
  { symbol: "CRWD", side: "Long", buyDate: new Date("2025-06-09"), exitDate: new Date("2025-06-20"), entryPrice: 464.12, exitPrice: 477.45, stopLoss: 453.62, result: 2.9, holdingDays: 11 },
  { symbol: "QBTS", side: "Long", buyDate: new Date("2025-06-20"), exitDate: new Date("2025-06-20"), entryPrice: 15.68, exitPrice: 15.58, stopLoss: 14.99, result: -0.6, holdingDays: 0 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-06-20"), exitDate: new Date("2025-06-20"), entryPrice: 107.33, exitPrice: 106.27, stopLoss: 105.02, result: -1, holdingDays: 0 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-06-20"), exitDate: new Date("2025-06-20"), entryPrice: 108.18, exitPrice: 106.27, stopLoss: 105.02, result: -1.8, holdingDays: 0 },
  { symbol: "CEG", side: "Long", buyDate: new Date("2025-06-20"), exitDate: new Date("2025-06-20"), entryPrice: 306.57, exitPrice: 305, stopLoss: 296.58, result: -0.5, holdingDays: 0 },
  { symbol: "TEM", side: "Long", buyDate: new Date("2025-06-20"), exitDate: new Date("2025-06-20"), entryPrice: 68.44, exitPrice: 67.73, stopLoss: 65.52, result: -1, holdingDays: 0 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-06-18"), exitDate: new Date("2025-06-20"), entryPrice: 157.31, exitPrice: 154.38, stopLoss: 155.87, result: -1.9, holdingDays: 2 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-06-18"), exitDate: new Date("2025-06-20"), entryPrice: 156.34, exitPrice: 154.38, stopLoss: 155.87, result: -1.3, holdingDays: 2 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-18"), exitDate: new Date("2025-06-18"), entryPrice: 358.2, exitPrice: 353.81, stopLoss: 365.34, result: -1.2, holdingDays: 0 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-06-17"), exitDate: new Date("2025-06-17"), entryPrice: 157.96, exitPrice: 157.7, stopLoss: 156.01, result: -0.2, holdingDays: 0 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-16"), exitDate: new Date("2025-06-17"), entryPrice: 372.97, exitPrice: 360.26, stopLoss: 365.34, result: -3.4, holdingDays: 1 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-16"), exitDate: new Date("2025-06-17"), entryPrice: 367.15, exitPrice: 360.26, stopLoss: 365.34, result: -1.9, holdingDays: 1 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-06-13"), exitDate: new Date("2025-06-13"), entryPrice: 25.96, exitPrice: 25.52, stopLoss: 25.5, result: -1.7, holdingDays: 0 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-06-13"), exitDate: new Date("2025-06-13"), entryPrice: 26.38, exitPrice: 25.52, stopLoss: 25.5, result: -3.3, holdingDays: 0 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-06-13"), exitDate: new Date("2025-06-13"), entryPrice: 25.95, exitPrice: 25.52, stopLoss: 25.5, result: -1.7, holdingDays: 0 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-12"), exitDate: new Date("2025-06-13"), entryPrice: 374.64, exitPrice: 361.87, stopLoss: 365.89, result: -3.4, holdingDays: 1 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-11"), exitDate: new Date("2025-06-13"), entryPrice: 379.5, exitPrice: 361.87, stopLoss: 365.89, result: -4.6, holdingDays: 2 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-11"), exitDate: new Date("2025-06-13"), entryPrice: 386.44, exitPrice: 361.87, stopLoss: 375.91, result: -6.4, holdingDays: 2 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-10"), exitDate: new Date("2025-06-13"), entryPrice: 381.11, exitPrice: 361.87, stopLoss: 374.78, result: -5, holdingDays: 3 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-06-12"), exitDate: new Date("2025-06-12"), entryPrice: 85.88, exitPrice: 85.57, stopLoss: 84.49, result: -0.4, holdingDays: 0 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-06-12"), exitDate: new Date("2025-06-12"), entryPrice: 85.55, exitPrice: 85.57, stopLoss: 84.49, result: 0, holdingDays: 0 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-06-09"), exitDate: new Date("2025-06-12"), entryPrice: 385.36, exitPrice: 382, stopLoss: 379.89, result: -0.9, holdingDays: 3 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-06-10"), exitDate: new Date("2025-06-12"), entryPrice: 390.02, exitPrice: 382.6, stopLoss: 381.39, result: -1.9, holdingDays: 2 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-06-12"), exitDate: new Date("2025-06-12"), entryPrice: 86.05, exitPrice: 85.37, stopLoss: 84.6, result: -0.8, holdingDays: 0 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-06-10"), exitDate: new Date("2025-06-10"), entryPrice: 86.23, exitPrice: 86.51, stopLoss: 85.49, result: 0.3, holdingDays: 0 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-06-10"), exitDate: new Date("2025-06-10"), entryPrice: 86.67, exitPrice: 86.53, stopLoss: 85.52, result: -0.2, holdingDays: 0 },
  { symbol: "BROS", side: "Long", buyDate: new Date("2025-06-10"), exitDate: new Date("2025-06-10"), entryPrice: 72.68, exitPrice: 71.84, stopLoss: 70, result: -1.2, holdingDays: 0 },
  { symbol: "APP", side: "Long", buyDate: new Date("2025-06-10"), exitDate: new Date("2025-06-10"), entryPrice: 385.6, exitPrice: 383.1, stopLoss: 375.23, result: -0.6, holdingDays: 0 },
  { symbol: "LYFT", side: "Long", buyDate: new Date("2025-06-09"), exitDate: new Date("2025-06-09"), entryPrice: 15.86, exitPrice: 15.73, stopLoss: 15.32, result: -0.8, holdingDays: 0 },
  { symbol: "NBIS", side: "Long", buyDate: new Date("2025-06-03"), exitDate: new Date("2025-06-05"), entryPrice: 35.9, exitPrice: 40.07, stopLoss: 34.67, result: 23.3, holdingDays: 2 },
  { symbol: "NBIS", side: "Long", buyDate: new Date("2025-06-02"), exitDate: new Date("2025-06-05"), entryPrice: 35.75, exitPrice: 40.07, stopLoss: 34.51, result: 23.9, holdingDays: 3 },
  { symbol: "CRWD", side: "Long", buyDate: new Date("2025-05-09"), exitDate: new Date("2025-06-05"), entryPrice: 406.43, exitPrice: 445.54, stopLoss: 400.22, result: 10.9, holdingDays: 27 },
  { symbol: "SNOW", side: "Long", buyDate: new Date("2025-04-30"), exitDate: new Date("2025-06-05"), entryPrice: 156.83, exitPrice: 168.93, stopLoss: 151.07, result: 19.1, holdingDays: 36 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-04-25"), exitDate: new Date("2025-06-05"), entryPrice: 126.63, exitPrice: 133.58, stopLoss: 121.48, result: 17.3, holdingDays: 41 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-05-05"), exitDate: new Date("2025-06-05"), entryPrice: 46.05, exitPrice: 52.74, stopLoss: 45.22, result: 31.5, holdingDays: 31 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-04-30"), exitDate: new Date("2025-06-05"), entryPrice: 187.32, exitPrice: 200.29, stopLoss: 180.64, result: 21.5, holdingDays: 36 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-06-05"), exitDate: new Date("2025-06-05"), entryPrice: 85.3, exitPrice: 84.24, stopLoss: 83.08, result: -1.2, holdingDays: 0 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-06-05"), exitDate: new Date("2025-06-05"), entryPrice: 59.27, exitPrice: 58.13, stopLoss: 58.95, result: -1.9, holdingDays: 0 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-06-04"), exitDate: new Date("2025-06-05"), entryPrice: 59.95, exitPrice: 58.13, stopLoss: 58.95, result: -3, holdingDays: 1 },
  { symbol: "CLS", side: "Long", buyDate: new Date("2025-05-30"), exitDate: new Date("2025-06-05"), entryPrice: 112.36, exitPrice: 121.14, stopLoss: 107.98, result: 6.7, holdingDays: 6 },
  { symbol: "CRWD", side: "Long", buyDate: new Date("2025-06-05"), exitDate: new Date("2025-06-05"), entryPrice: 456.83, exitPrice: 459.77, stopLoss: 450.43, result: 0.6, holdingDays: 0 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-05-30"), exitDate: new Date("2025-06-05"), entryPrice: 125.25, exitPrice: 125.25, stopLoss: 120.09, result: -4.9, holdingDays: 6 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-05-07"), exitDate: new Date("2025-06-05"), entryPrice: 110.45, exitPrice: 118.47, stopLoss: 105.91, result: 9.5, holdingDays: 29 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-04-22"), exitDate: new Date("2025-06-05"), entryPrice: 94.37, exitPrice: 100.23, stopLoss: 89.45, result: 19, holdingDays: 44 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-04-23"), exitDate: new Date("2025-06-05"), entryPrice: 256.18, exitPrice: 291.64, stopLoss: 252.2, result: 16.7, holdingDays: 43 },
  { symbol: "BROS", side: "Long", buyDate: new Date("2025-05-30"), exitDate: new Date("2025-06-03"), entryPrice: 71.67, exitPrice: 70.68, stopLoss: 67.53, result: -1.4, holdingDays: 4 },
  { symbol: "TOST", side: "Long", buyDate: new Date("2025-06-03"), exitDate: new Date("2025-06-03"), entryPrice: 42.04, exitPrice: 41.52, stopLoss: 41.41, result: -1.2, holdingDays: 0 },
  { symbol: "TOST", side: "Long", buyDate: new Date("2025-05-30"), exitDate: new Date("2025-06-03"), entryPrice: 41.73, exitPrice: 41.52, stopLoss: 41.13, result: -0.5, holdingDays: 4 },
  { symbol: "SHOP", side: "Long", buyDate: new Date("2025-05-30"), exitDate: new Date("2025-06-03"), entryPrice: 106.84, exitPrice: 104.58, stopLoss: 103.1, result: -2.1, holdingDays: 4 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-05-07"), exitDate: new Date("2025-05-29"), entryPrice: 108.72, exitPrice: 118.47, stopLoss: 105.7, result: 11.8, holdingDays: 22 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-05-06"), exitDate: new Date("2025-05-29"), entryPrice: 275.77, exitPrice: 288.61, stopLoss: 268.69, result: 17.3, holdingDays: 23 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-05-06"), exitDate: new Date("2025-05-29"), entryPrice: 47.21, exitPrice: 52.74, stopLoss: 45.57, result: 22.9, holdingDays: 23 },
  { symbol: "CRWD", side: "Long", buyDate: new Date("2025-05-22"), exitDate: new Date("2025-05-29"), entryPrice: 435, exitPrice: 472.35, stopLoss: 425.35, result: 7.5, holdingDays: 7 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-05-29"), exitDate: new Date("2025-05-29"), entryPrice: 122.35, exitPrice: 122, stopLoss: 119.58, result: -0.3, holdingDays: 0 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-05-28"), exitDate: new Date("2025-05-29"), entryPrice: 123.08, exitPrice: 122, stopLoss: 119.42, result: -0.9, holdingDays: 1 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-05-23"), exitDate: new Date("2025-05-29"), entryPrice: 120.2, exitPrice: 122, stopLoss: 117.9, result: 1.5, holdingDays: 6 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-05-21"), exitDate: new Date("2025-05-29"), entryPrice: 120.81, exitPrice: 122, stopLoss: 117.48, result: 1, holdingDays: 8 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-05-29"), exitDate: new Date("2025-05-29"), entryPrice: 650.8, exitPrice: 635.54, stopLoss: 637.5, result: -2.3, holdingDays: 0 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-05-22"), exitDate: new Date("2025-05-29"), entryPrice: 640.5, exitPrice: 635.54, stopLoss: 629.43, result: -0.8, holdingDays: 7 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-04-30"), exitDate: new Date("2025-05-29"), entryPrice: 591.07, exitPrice: 650.29, stopLoss: 576.4, result: 7.7, holdingDays: 29 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-05-23"), exitDate: new Date("2025-05-29"), entryPrice: 87.03, exitPrice: 83.02, stopLoss: 85.72, result: -4.6, holdingDays: 6 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-05-22"), exitDate: new Date("2025-05-29"), entryPrice: 88.37, exitPrice: 83.02, stopLoss: 85.62, result: -6.1, holdingDays: 7 },
  { symbol: "OKTA", side: "Long", buyDate: new Date("2025-04-25"), exitDate: new Date("2025-05-28"), entryPrice: 102.77, exitPrice: 111.46, stopLoss: 100.58, result: 10.7, holdingDays: 33 },
  { symbol: "SRAD", side: "Long", buyDate: new Date("2025-05-22"), exitDate: new Date("2025-05-27"), entryPrice: 23.61, exitPrice: 23.91, stopLoss: 23.3, result: 1.3, holdingDays: 5 },
  { symbol: "SRAD", side: "Long", buyDate: new Date("2025-05-22"), exitDate: new Date("2025-05-27"), entryPrice: 23.42, exitPrice: 23.91, stopLoss: 22.85, result: 2.1, holdingDays: 5 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-05-22"), exitDate: new Date("2025-05-22"), entryPrice: 407.69, exitPrice: 401.5, stopLoss: 389.76, result: -1.5, holdingDays: 0 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-05-21"), exitDate: new Date("2025-05-22"), entryPrice: 402.7, exitPrice: 401.5, stopLoss: 387.97, result: -0.3, holdingDays: 1 },
  { symbol: "STNE", side: "Long", buyDate: new Date("2025-05-20"), exitDate: new Date("2025-05-21"), entryPrice: 13.34, exitPrice: 13.05, stopLoss: 13.24, result: -2.2, holdingDays: 1 },
  { symbol: "FTNT", side: "Long", buyDate: new Date("2025-05-19"), exitDate: new Date("2025-05-21"), entryPrice: 104.37, exitPrice: 104.2, stopLoss: 102.16, result: -0.2, holdingDays: 2 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-05-20"), exitDate: new Date("2025-05-21"), entryPrice: 410.02, exitPrice: 400.35, stopLoss: 385.88, result: -2.4, holdingDays: 1 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-05-19"), exitDate: new Date("2025-05-21"), entryPrice: 397.84, exitPrice: 400.35, stopLoss: 382.04, result: 0.6, holdingDays: 2 },
  { symbol: "MSTR", side: "Long", buyDate: new Date("2025-05-16"), exitDate: new Date("2025-05-21"), entryPrice: 395.64, exitPrice: 400.35, stopLoss: 379.81, result: 1.2, holdingDays: 5 },
  { symbol: "SRAD", side: "Long", buyDate: new Date("2025-05-19"), exitDate: new Date("2025-05-20"), entryPrice: 23.92, exitPrice: 23.53, stopLoss: 23.22, result: -1.6, holdingDays: 1 },
  { symbol: "STNE", side: "Long", buyDate: new Date("2025-05-20"), exitDate: new Date("2025-05-20"), entryPrice: 13.38, exitPrice: 13.28, stopLoss: 13.24, result: -0.7, holdingDays: 0 },
  { symbol: "STNE", side: "Long", buyDate: new Date("2025-05-19"), exitDate: new Date("2025-05-20"), entryPrice: 13.48, exitPrice: 13.28, stopLoss: 13.23, result: -1.5, holdingDays: 1 },
  { symbol: "ASTS", side: "Long", buyDate: new Date("2025-05-19"), exitDate: new Date("2025-05-19"), entryPrice: 24.94, exitPrice: 24.43, stopLoss: 25.12, result: -2, holdingDays: 0 },
  { symbol: "ASTS", side: "Long", buyDate: new Date("2025-05-15"), exitDate: new Date("2025-05-19"), entryPrice: 26.42, exitPrice: 24.43, stopLoss: 25, result: -7.5, holdingDays: 4 },
  { symbol: "DOCU", side: "Long", buyDate: new Date("2025-05-05"), exitDate: new Date("2025-05-06"), entryPrice: 82.31, exitPrice: 81.97, stopLoss: 79.86, result: -0.4, holdingDays: 1 },
  { symbol: "ONON", side: "Long", buyDate: new Date("2025-04-28"), exitDate: new Date("2025-05-06"), entryPrice: 46.04, exitPrice: 48.03, stopLoss: 43.88, result: 4.4, holdingDays: 8 },
  { symbol: "ONON", side: "Long", buyDate: new Date("2025-04-30"), exitDate: new Date("2025-05-01"), entryPrice: 46.94, exitPrice: 47.92, stopLoss: 44.53, result: 2.1, holdingDays: 1 },
  { symbol: "TOST", side: "Long", buyDate: new Date("2025-04-24"), exitDate: new Date("2025-04-29"), entryPrice: 36.08, exitPrice: 36.22, stopLoss: 34.28, result: 0.4, holdingDays: 5 },
  { symbol: "IONQ", side: "Long", buyDate: new Date("2025-04-23"), exitDate: new Date("2025-04-29"), entryPrice: 26.63, exitPrice: 28.02, stopLoss: 24.81, result: 5.2, holdingDays: 6 },
  { symbol: "ADSK", side: "Long", buyDate: new Date("2025-04-28"), exitDate: new Date("2025-04-29"), entryPrice: 272.55, exitPrice: 272.72, stopLoss: 263.27, result: 0.1, holdingDays: 1 },
  { symbol: "ADSK", side: "Long", buyDate: new Date("2025-04-24"), exitDate: new Date("2025-04-25"), entryPrice: 268.33, exitPrice: 269.23, stopLoss: 261.38, result: 0.3, holdingDays: 1 },
  { symbol: "T", side: "Long", buyDate: new Date("2025-04-24"), exitDate: new Date("2025-04-24"), entryPrice: 27.72, exitPrice: 27.56, stopLoss: 27.09, result: -0.6, holdingDays: 0 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-04-16"), exitDate: new Date("2025-04-16"), entryPrice: 48.3, exitPrice: 47.73, stopLoss: 47.65, result: -1.2, holdingDays: 0 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-04-16"), exitDate: new Date("2025-04-16"), entryPrice: 73.77, exitPrice: 73.19, stopLoss: 72.09, result: -0.8, holdingDays: 0 },
  { symbol: "RBLX", side: "Long", buyDate: new Date("2025-04-16"), exitDate: new Date("2025-04-16"), entryPrice: 59.55, exitPrice: 59.02, stopLoss: 57.82, result: -0.9, holdingDays: 0 },
  { symbol: "RBRK", side: "Long", buyDate: new Date("2025-04-15"), exitDate: new Date("2025-04-16"), entryPrice: 63.01, exitPrice: 61.59, stopLoss: 61.29, result: -2.3, holdingDays: 1 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-04-15"), exitDate: new Date("2025-04-16"), entryPrice: 553.54, exitPrice: 559.17, stopLoss: 539.65, result: 1, holdingDays: 1 },
  { symbol: "GEO", side: "Long", buyDate: new Date("2025-04-14"), exitDate: new Date("2025-04-16"), entryPrice: 29.76, exitPrice: 29.45, stopLoss: 28.21, result: -1, holdingDays: 2 },
  { symbol: "HOOD", side: "Long", buyDate: new Date("2025-04-16"), exitDate: new Date("2025-04-16"), entryPrice: 42.8, exitPrice: 41.9, stopLoss: 41.72, result: -2.1, holdingDays: 0 },
  { symbol: "EAT", side: "Long", buyDate: new Date("2025-04-15"), exitDate: new Date("2025-04-15"), entryPrice: 153.25, exitPrice: 150.77, stopLoss: 146.02, result: -1.6, holdingDays: 0 },
  { symbol: "TTWO", side: "Long", buyDate: new Date("2025-04-15"), exitDate: new Date("2025-04-15"), entryPrice: 214.83, exitPrice: 214.88, stopLoss: 208.02, result: 0, holdingDays: 0 },
  { symbol: "NVDA", side: "Long", buyDate: new Date("2025-04-15"), exitDate: new Date("2025-04-15"), entryPrice: 112.06, exitPrice: 112.08, stopLoss: 110.38, result: 0, holdingDays: 0 },
  { symbol: "DG", side: "Long", buyDate: new Date("2025-04-14"), exitDate: new Date("2025-04-15"), entryPrice: 90.61, exitPrice: 89.66, stopLoss: 86.89, result: -1, holdingDays: 1 },
  { symbol: "META", side: "Short", buyDate: new Date("2025-04-14"), exitDate: new Date("2025-04-11"), entryPrice: 532.32, exitPrice: 533.46, stopLoss: 557.77, result: -0.2, holdingDays: 0 },
  { symbol: "NVDA", side: "Short", buyDate: new Date("2025-04-14"), exitDate: new Date("2025-04-11"), entryPrice: 110.48, exitPrice: 110.5, stopLoss: 114.29, result: 0, holdingDays: 0 },
  { symbol: "NVDA", side: "Short", buyDate: new Date("2025-04-11"), exitDate: new Date("2025-04-11"), entryPrice: 108.94, exitPrice: 108.94, stopLoss: 110.86, result: -1.3, holdingDays: 0 },
  { symbol: "IBIT", side: "Short", buyDate: new Date("2025-04-10"), exitDate: new Date("2025-04-11"), entryPrice: 45.16, exitPrice: 45.16, stopLoss: 47.48, result: -5.4, holdingDays: 1 },
  { symbol: "RIVN", side: "Short", buyDate: new Date("2025-04-11"), exitDate: new Date("2025-04-11"), entryPrice: 11.28, exitPrice: 11.28, stopLoss: 11.7, result: -0.9, holdingDays: 0 },
  { symbol: "RIVN", side: "Short", buyDate: new Date("2025-04-03"), exitDate: new Date("2025-04-11"), entryPrice: 12.14, exitPrice: 11.62, stopLoss: 12.4, result: 6.7, holdingDays: 8 },
  { symbol: "AAPL", side: "Short", buyDate: new Date("2025-04-01"), exitDate: new Date("2025-04-11"), entryPrice: 221.5, exitPrice: 209.4, stopLoss: 225.62, result: 8, holdingDays: 10 },
  { symbol: "GH", side: "Short", buyDate: new Date("2025-04-03"), exitDate: new Date("2025-04-03"), entryPrice: 41.92, exitPrice: 42, stopLoss: 44.1, result: -0.2, holdingDays: 0 },
  { symbol: "CART", side: "Short", buyDate: new Date("2025-04-03"), exitDate: new Date("2025-04-03"), entryPrice: 38.96, exitPrice: 40.06, stopLoss: 40.54, result: -2.8, holdingDays: 0 },
  { symbol: "CART", side: "Short", buyDate: new Date("2025-04-01"), exitDate: new Date("2025-04-01"), entryPrice: 39.88, exitPrice: 40.22, stopLoss: 40.8, result: -0.9, holdingDays: 0 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-03-20"), exitDate: new Date("2025-03-28"), entryPrice: 73.66, exitPrice: 74.37, stopLoss: 72.47, result: 1, holdingDays: 8 },
  { symbol: "HWM", side: "Long", buyDate: new Date("2025-03-18"), exitDate: new Date("2025-03-28"), entryPrice: 128.09, exitPrice: 131.75, stopLoss: 124.34, result: 2.9, holdingDays: 10 },
  { symbol: "ZS", side: "Long", buyDate: new Date("2025-03-18"), exitDate: new Date("2025-03-28"), entryPrice: 202.2, exitPrice: 208.05, stopLoss: 196.81, result: 2.9, holdingDays: 10 },
  { symbol: "ZS", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-28"), entryPrice: 200.14, exitPrice: 208.05, stopLoss: 196.81, result: 4, holdingDays: 11 },
  { symbol: "TTWO", side: "Long", buyDate: new Date("2025-03-19"), exitDate: new Date("2025-03-28"), entryPrice: 206.76, exitPrice: 212.89, stopLoss: 203.48, result: 3, holdingDays: 9 },
  { symbol: "UBER", side: "Long", buyDate: new Date("2025-03-21"), exitDate: new Date("2025-03-28"), entryPrice: 74.27, exitPrice: 74.86, stopLoss: 72.77, result: 0.8, holdingDays: 7 },
  { symbol: "NFLX", side: "Long", buyDate: new Date("2025-03-21"), exitDate: new Date("2025-03-28"), entryPrice: 956, exitPrice: 974.54, stopLoss: 940.95, result: 1.9, holdingDays: 7 },
  { symbol: "GH", side: "Long", buyDate: new Date("2025-03-18"), exitDate: new Date("2025-03-27"), entryPrice: 42.47, exitPrice: 45.16, stopLoss: 41.85, result: 6.3, holdingDays: 9 },
  { symbol: "GH", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-27"), entryPrice: 43.69, exitPrice: 45.16, stopLoss: 41.85, result: 3.4, holdingDays: 10 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-03-21"), exitDate: new Date("2025-03-27"), entryPrice: 87.36, exitPrice: 90.11, stopLoss: 84.46, result: 3.1, holdingDays: 6 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-03-27"), exitDate: new Date("2025-03-27"), entryPrice: 49.63, exitPrice: 49.47, stopLoss: 48.8, result: -0.3, holdingDays: 0 },
  { symbol: "META", side: "Long", buyDate: new Date("2025-03-27"), exitDate: new Date("2025-03-27"), entryPrice: 607.53, exitPrice: 606.32, stopLoss: 600.1, result: -0.2, holdingDays: 0 },
  { symbol: "DE", side: "Long", buyDate: new Date("2025-03-26"), exitDate: new Date("2025-03-27"), entryPrice: 481.82, exitPrice: 482.85, stopLoss: 477.18, result: 0.2, holdingDays: 1 },
  { symbol: "WBD", side: "Long", buyDate: new Date("2025-03-26"), exitDate: new Date("2025-03-26"), entryPrice: 11.13, exitPrice: 11.04, stopLoss: 10.9, result: -0.8, holdingDays: 0 },
  { symbol: "SPOT", side: "Long", buyDate: new Date("2025-03-21"), exitDate: new Date("2025-03-26"), entryPrice: 597.16, exitPrice: 587.46, stopLoss: 587.46, result: -1.6, holdingDays: 5 },
  { symbol: "MSTR", side: "Short", buyDate: new Date("2025-03-21"), exitDate: new Date("2025-03-21"), entryPrice: 297.95, exitPrice: 298.62, stopLoss: 309.4, result: -0.2, holdingDays: 0 },
  { symbol: "ALGM", side: "Long", buyDate: new Date("2025-03-18"), exitDate: new Date("2025-03-21"), entryPrice: 26.33, exitPrice: 26.36, stopLoss: 25.88, result: 0.1, holdingDays: 3 },
  { symbol: "TMUS", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-20"), entryPrice: 260.89, exitPrice: 257.36, stopLoss: 252.93, result: -1.4, holdingDays: 3 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-03-20"), exitDate: new Date("2025-03-20"), entryPrice: 88.59, exitPrice: 87.49, stopLoss: 85.12, result: -1.2, holdingDays: 0 },
  { symbol: "NFLX", side: "Long", buyDate: new Date("2025-03-19"), exitDate: new Date("2025-03-20"), entryPrice: 955.28, exitPrice: 954.23, stopLoss: 924, result: -0.1, holdingDays: 1 },
  { symbol: "MMM", side: "Long", buyDate: new Date("2025-03-19"), exitDate: new Date("2025-03-20"), entryPrice: 153.22, exitPrice: 151.8, stopLoss: 150.94, result: -0.9, holdingDays: 1 },
  { symbol: "GILD", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-18"), entryPrice: 112.25, exitPrice: 110.78, stopLoss: 109.46, result: -1.3, holdingDays: 1 },
  { symbol: "TTWO", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-18"), entryPrice: 205.1, exitPrice: 203.94, stopLoss: 201.84, result: -0.6, holdingDays: 1 },
  { symbol: "PLTR", side: "Long", buyDate: new Date("2025-03-18"), exitDate: new Date("2025-03-18"), entryPrice: 85.59, exitPrice: 84.38, stopLoss: 81.8, result: -1.4, holdingDays: 0 },
  { symbol: "SMCI", side: "Long", buyDate: new Date("2025-03-18"), exitDate: new Date("2025-03-18"), entryPrice: 40.24, exitPrice: 39.64, stopLoss: 38.85, result: -1.5, holdingDays: 0 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-18"), entryPrice: 131.51, exitPrice: 125.73, stopLoss: 124.59, result: -4.4, holdingDays: 1 },
  { symbol: "HWM", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-18"), entryPrice: 128.41, exitPrice: 125.31, stopLoss: 125.31, result: -2.4, holdingDays: 1 },
  { symbol: "BE", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-17"), entryPrice: 24.9, exitPrice: 24.51, stopLoss: 23.66, result: -1.6, holdingDays: 0 },
  { symbol: "EXLS", side: "Long", buyDate: new Date("2025-03-17"), exitDate: new Date("2025-03-17"), entryPrice: 47.13, exitPrice: 46.49, stopLoss: 45.2, result: -1.4, holdingDays: 0 },
  { symbol: "EQT", side: "Short", buyDate: new Date("2025-03-11"), exitDate: new Date("2025-03-14"), entryPrice: 49.25, exitPrice: 50.54, stopLoss: 50.17, result: -2.6, holdingDays: 3 },
  { symbol: "VLO", side: "Short", buyDate: new Date("2025-03-11"), exitDate: new Date("2025-03-14"), entryPrice: 126.62, exitPrice: 129.38, stopLoss: 128.47, result: -2.2, holdingDays: 3 },
  { symbol: "HESM", side: "Short", buyDate: new Date("2025-03-11"), exitDate: new Date("2025-03-14"), entryPrice: 40.68, exitPrice: 42.08, stopLoss: 40.95, result: -3.5, holdingDays: 3 },
  { symbol: "NFLX", side: "Short", buyDate: new Date("2025-03-14"), exitDate: new Date("2025-03-14"), entryPrice: 912.31, exitPrice: 915.01, stopLoss: 919.55, result: -0.3, holdingDays: 0 },
  { symbol: "NVDA", side: "Short", buyDate: new Date("2025-03-14"), exitDate: new Date("2025-03-14"), entryPrice: 120.75, exitPrice: 120.86, stopLoss: 121.88, result: -0.1, holdingDays: 0 },
  { symbol: "ERY", side: "Long", buyDate: new Date("2025-03-13"), exitDate: new Date("2025-03-14"), entryPrice: 23.82, exitPrice: 23.06, stopLoss: 23.57, result: -3.2, holdingDays: 1 },
  { symbol: "TMDX", side: "Short", buyDate: new Date("2025-03-12"), exitDate: new Date("2025-03-14"), entryPrice: 67.63, exitPrice: 68.19, stopLoss: 69.67, result: -0.8, holdingDays: 2 },
  { symbol: "DASH", side: "Short", buyDate: new Date("2025-03-12"), exitDate: new Date("2025-03-12"), entryPrice: 182.76, exitPrice: 187.39, stopLoss: 189.97, result: -2.5, holdingDays: 0 },
  { symbol: "ACMR", side: "Long", buyDate: new Date("2025-03-11"), exitDate: new Date("2025-03-11"), entryPrice: 26.62, exitPrice: 26.31, stopLoss: 26.3, result: -1.2, holdingDays: 0 },
  { symbol: "MP", side: "Long", buyDate: new Date("2025-03-11"), exitDate: new Date("2025-03-11"), entryPrice: 24.77, exitPrice: 24.37, stopLoss: 24.07, result: -1.6, holdingDays: 0 },
  { symbol: "ACMR", side: "Long", buyDate: new Date("2025-03-10"), exitDate: new Date("2025-03-10"), entryPrice: 26.24, exitPrice: 26.08, stopLoss: 25.46, result: -0.6, holdingDays: 0 },
  { symbol: "MP", side: "Long", buyDate: new Date("2025-03-10"), exitDate: new Date("2025-03-10"), entryPrice: 24.68, exitPrice: 24.58, stopLoss: 24.17, result: -0.4, holdingDays: 0 },
  { symbol: "ACMR", side: "Long", buyDate: new Date("2025-03-10"), exitDate: new Date("2025-03-10"), entryPrice: 26.62, exitPrice: 26.08, stopLoss: 26.08, result: -2, holdingDays: 0 },
  { symbol: "MP", side: "Long", buyDate: new Date("2025-03-10"), exitDate: new Date("2025-03-10"), entryPrice: 25.09, exitPrice: 24.57, stopLoss: 24.57, result: -2.1, holdingDays: 0 },
  { symbol: "NFLX", side: "Long", buyDate: new Date("2025-03-05"), exitDate: new Date("2025-03-06"), entryPrice: 991.43, exitPrice: 969.48, stopLoss: 969.48, result: -2.2, holdingDays: 1 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-02-03"), exitDate: new Date("2025-03-05"), entryPrice: 122.04, exitPrice: 123.3, stopLoss: 118.2, result: 5.6, holdingDays: 30 },
  { symbol: "SE", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-03-05"), entryPrice: 118.19, exitPrice: 124.45, stopLoss: 112.81, result: 9.3, holdingDays: 36 },
  { symbol: "DE", side: "Long", buyDate: new Date("2025-02-14"), exitDate: new Date("2025-02-24"), entryPrice: 472.79, exitPrice: 495.1, stopLoss: 463.97, result: 3.7, holdingDays: 10 },
  { symbol: "CRWD", side: "Long", buyDate: new Date("2025-01-31"), exitDate: new Date("2025-02-24"), entryPrice: 404.04, exitPrice: 425.4, stopLoss: 390.22, result: 1.8, holdingDays: 24 },
  { symbol: "CART", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-02-24"), entryPrice: 46.66, exitPrice: 49.78, stopLoss: 44.81, result: 8.2, holdingDays: 27 },
  { symbol: "TQQQ", side: "Long", buyDate: new Date("2025-02-21"), exitDate: new Date("2025-02-21"), entryPrice: 90.03, exitPrice: 86.98, stopLoss: 86.89, result: -3.4, holdingDays: 0 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-02-20"), exitDate: new Date("2025-02-21"), entryPrice: 226.54, exitPrice: 221.45, stopLoss: 222.75, result: -2.2, holdingDays: 1 },
  { symbol: "CIEN", side: "Long", buyDate: new Date("2025-02-21"), exitDate: new Date("2025-02-21"), entryPrice: 87.23, exitPrice: 86.81, stopLoss: 85.18, result: -0.5, holdingDays: 0 },
  { symbol: "CIEN", side: "Long", buyDate: new Date("2025-02-04"), exitDate: new Date("2025-02-21"), entryPrice: 87.05, exitPrice: 94.68, stopLoss: 81.65, result: 2, holdingDays: 17 },
  { symbol: "PL", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-02-20"), entryPrice: 5.24, exitPrice: 6.17, stopLoss: 4.92, result: 10.6, holdingDays: 23 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-02-19"), exitDate: new Date("2025-02-20"), entryPrice: 54.82, exitPrice: 54.82, stopLoss: 53.03, result: 0, holdingDays: 1 },
  { symbol: "ISRG", side: "Long", buyDate: new Date("2025-02-12"), exitDate: new Date("2025-02-20"), entryPrice: 585.96, exitPrice: 585.96, stopLoss: 581.05, result: 0, holdingDays: 8 },
  { symbol: "GEV", side: "Long", buyDate: new Date("2025-02-20"), exitDate: new Date("2025-02-20"), entryPrice: 371.28, exitPrice: 362.75, stopLoss: 357, result: -2.3, holdingDays: 0 },
  { symbol: "RDDT", side: "Long", buyDate: new Date("2025-02-20"), exitDate: new Date("2025-02-20"), entryPrice: 178.8, exitPrice: 176.15, stopLoss: 174.88, result: -1.5, holdingDays: 0 },
  { symbol: "EXPE", side: "Long", buyDate: new Date("2025-02-19"), exitDate: new Date("2025-02-20"), entryPrice: 202.28, exitPrice: 202.22, stopLoss: 200.14, result: 0, holdingDays: 1 },
  { symbol: "CLS", side: "Long", buyDate: new Date("2025-02-12"), exitDate: new Date("2025-02-20"), entryPrice: 129.4, exitPrice: 123.49, stopLoss: 122.29, result: -4.6, holdingDays: 8 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-02-20"), exitDate: new Date("2025-02-20"), entryPrice: 227.87, exitPrice: 225.27, stopLoss: 224.3, result: -1.1, holdingDays: 0 },
  { symbol: "GEV", side: "Long", buyDate: new Date("2025-02-20"), exitDate: new Date("2025-02-20"), entryPrice: 379.57, exitPrice: 365.09, stopLoss: 357, result: -3.8, holdingDays: 0 },
  { symbol: "UAL", side: "Long", buyDate: new Date("2025-02-19"), exitDate: new Date("2025-02-20"), entryPrice: 106.12, exitPrice: 102.37, stopLoss: 102.37, result: -3.5, holdingDays: 1 },
  { symbol: "RCL", side: "Long", buyDate: new Date("2025-02-19"), exitDate: new Date("2025-02-20"), entryPrice: 262.05, exitPrice: 239.1, stopLoss: 253.17, result: -8.8, holdingDays: 1 },
  { symbol: "VST", side: "Long", buyDate: new Date("2025-02-11"), exitDate: new Date("2025-02-20"), entryPrice: 168.7, exitPrice: 166.04, stopLoss: 162.97, result: -1.8, holdingDays: 9 },
  { symbol: "TEAM", side: "Long", buyDate: new Date("2025-02-18"), exitDate: new Date("2025-02-19"), entryPrice: 314.57, exitPrice: 303.87, stopLoss: 307.31, result: -3.4, holdingDays: 1 },
  { symbol: "RBLX", side: "Long", buyDate: new Date("2025-02-14"), exitDate: new Date("2025-02-19"), entryPrice: 65.65, exitPrice: 63.77, stopLoss: 63.22, result: -2.9, holdingDays: 5 },
  { symbol: "NTRA", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-02-18"), entryPrice: 170.21, exitPrice: 176.56, stopLoss: 159, result: 0.5, holdingDays: 21 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-02-13"), exitDate: new Date("2025-02-18"), entryPrice: 28.28, exitPrice: 27.77, stopLoss: 27.01, result: -1.8, holdingDays: 5 },
  { symbol: "AMZU", side: "Long", buyDate: new Date("2025-02-14"), exitDate: new Date("2025-02-18"), entryPrice: 45.28, exitPrice: 43.03, stopLoss: 44.29, result: -5, holdingDays: 4 },
  { symbol: "GTLB", side: "Long", buyDate: new Date("2025-02-13"), exitDate: new Date("2025-02-14"), entryPrice: 69.81, exitPrice: 67.2, stopLoss: 67.05, result: -3.7, holdingDays: 1 },
  { symbol: "AMZU", side: "Long", buyDate: new Date("2025-02-13"), exitDate: new Date("2025-02-13"), entryPrice: 45.17, exitPrice: 44.97, stopLoss: 44.29, result: -0.4, holdingDays: 0 },
  { symbol: "TWLO", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-02-13"), entryPrice: 140.84, exitPrice: 148.87, stopLoss: 135.44, result: 3.1, holdingDays: 16 },
  { symbol: "GTLB", side: "Long", buyDate: new Date("2025-02-13"), exitDate: new Date("2025-02-13"), entryPrice: 69.58, exitPrice: 69.02, stopLoss: 67.05, result: -0.8, holdingDays: 0 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-02-12"), exitDate: new Date("2025-02-13"), entryPrice: 54.63, exitPrice: 54.33, stopLoss: 53.69, result: -0.5, holdingDays: 1 },
  { symbol: "AMZN", side: "Long", buyDate: new Date("2025-02-12"), exitDate: new Date("2025-02-12"), entryPrice: 230.33, exitPrice: 229.15, stopLoss: 228.06, result: -0.5, holdingDays: 0 },
  { symbol: "RBLX", side: "Long", buyDate: new Date("2025-02-12"), exitDate: new Date("2025-02-12"), entryPrice: 65.59, exitPrice: 65.36, stopLoss: 63.63, result: -0.4, holdingDays: 0 },
  { symbol: "CAVA", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-02-11"), entryPrice: 125.7, exitPrice: 134.68, stopLoss: 120.69, result: 4.9, holdingDays: 14 },
  { symbol: "FOUR", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-02-11"), entryPrice: 117.34, exitPrice: 121.5, stopLoss: 112.93, result: 0.8, holdingDays: 14 },
  { symbol: "TOST", side: "Long", buyDate: new Date("2025-02-05"), exitDate: new Date("2025-02-11"), entryPrice: 41.01, exitPrice: 40.19, stopLoss: 38.89, result: -2, holdingDays: 6 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-01-31"), exitDate: new Date("2025-02-11"), entryPrice: 29.41, exitPrice: 28.1, stopLoss: 27.77, result: -4.3, holdingDays: 11 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-02-10"), exitDate: new Date("2025-02-11"), entryPrice: 55.45, exitPrice: 53.97, stopLoss: 53.69, result: -2.7, holdingDays: 1 },
  { symbol: "IONQ", side: "Long", buyDate: new Date("2025-02-11"), exitDate: new Date("2025-02-11"), entryPrice: 41.53, exitPrice: 39.18, stopLoss: 39.18, result: -5.7, holdingDays: 0 },
  { symbol: "NTRA", side: "Long", buyDate: new Date("2025-02-04"), exitDate: new Date("2025-02-07"), entryPrice: 175.65, exitPrice: 172.69, stopLoss: 172.5, result: -1.7, holdingDays: 3 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-01-30"), exitDate: new Date("2025-02-05"), entryPrice: 392.77, exitPrice: 416.09, stopLoss: 384.48, result: -1.5, holdingDays: 6 },
  { symbol: "XYZ", side: "Long", buyDate: new Date("2025-02-03"), exitDate: new Date("2025-02-04"), entryPrice: 89.85, exitPrice: 86.54, stopLoss: 87.71, result: -3.7, holdingDays: 1 },
  { symbol: "XYZ", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-02-04"), entryPrice: 87.59, exitPrice: 92.63, stopLoss: 84.36, result: 0.5, holdingDays: 7 },
  { symbol: "DXYZ", side: "Long", buyDate: new Date("2025-01-30"), exitDate: new Date("2025-01-31"), entryPrice: 57.14, exitPrice: 60.43, stopLoss: 54.11, result: -1.3, holdingDays: 1 },
  { symbol: "LUNR", side: "Long", buyDate: new Date("2025-01-30"), exitDate: new Date("2025-01-31"), entryPrice: 22.38, exitPrice: 23.71, stopLoss: 21.15, result: -0.9, holdingDays: 1 },
  { symbol: "VITL", side: "Long", buyDate: new Date("2025-01-29"), exitDate: new Date("2025-01-31"), entryPrice: 44.26, exitPrice: 43.89, stopLoss: 41.94, result: -0.8, holdingDays: 2 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-01-29"), exitDate: new Date("2025-01-31"), entryPrice: 58.58, exitPrice: 59.34, stopLoss: 57.55, result: 1.3, holdingDays: 2 },
  { symbol: "SUPV", side: "Long", buyDate: new Date("2025-01-29"), exitDate: new Date("2025-01-30"), entryPrice: 16.79, exitPrice: 16.82, stopLoss: 15.76, result: 0.2, holdingDays: 1 },
  { symbol: "RCAT", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-01-30"), entryPrice: 8.66, exitPrice: 8.84, stopLoss: 7.72, result: 2.1, holdingDays: 2 },
  { symbol: "REAL", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-01-30"), entryPrice: 9.45, exitPrice: 9.19, stopLoss: 9.15, result: -2.8, holdingDays: 2 },
  { symbol: "RKLB", side: "Long", buyDate: new Date("2025-01-29"), exitDate: new Date("2025-01-30"), entryPrice: 30.02, exitPrice: 28.19, stopLoss: 27.85, result: -6.1, holdingDays: 1 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-01-28"), exitDate: new Date("2025-01-28"), entryPrice: 58.85, exitPrice: 58.06, stopLoss: 58.04, result: -1.3, holdingDays: 0 },
  { symbol: "ASAN", side: "Long", buyDate: new Date("2025-01-27"), exitDate: new Date("2025-01-27"), entryPrice: 19.95, exitPrice: 22.01, stopLoss: 18.9, result: 3.4, holdingDays: 0 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-01-02"), exitDate: new Date("2025-01-27"), entryPrice: 54.38, exitPrice: 59.82, stopLoss: 51.77, result: 5.4, holdingDays: 25 },
  { symbol: "SFM", side: "Long", buyDate: new Date("2025-01-27"), exitDate: new Date("2025-01-27"), entryPrice: 148.71, exitPrice: 149.21, stopLoss: 141.7, result: 0.3, holdingDays: 0 },
  { symbol: "BROS", side: "Long", buyDate: new Date("2025-01-27"), exitDate: new Date("2025-01-27"), entryPrice: 59.63, exitPrice: 59.23, stopLoss: 57.78, result: -0.7, holdingDays: 0 },
  { symbol: "VST", side: "Long", buyDate: new Date("2025-01-02"), exitDate: new Date("2025-01-27"), entryPrice: 146.95, exitPrice: 171.24, stopLoss: 134.86, result: 0.9, holdingDays: 25 },
  { symbol: "VRT", side: "Long", buyDate: new Date("2025-01-02"), exitDate: new Date("2025-01-27"), entryPrice: 120.95, exitPrice: 137.04, stopLoss: 112.23, result: -6, holdingDays: 25 },
  { symbol: "CLS", side: "Long", buyDate: new Date("2025-01-02"), exitDate: new Date("2025-01-27"), entryPrice: 95.98, exitPrice: 111.38, stopLoss: 90.31, result: 16, holdingDays: 25 },
  { symbol: "GEO", side: "Long", buyDate: new Date("2025-01-27"), exitDate: new Date("2025-01-27"), entryPrice: 32.61, exitPrice: 31.89, stopLoss: 31.66, result: -2.2, holdingDays: 0 },
  { symbol: "TSLA", side: "Long", buyDate: new Date("2025-01-07"), exitDate: new Date("2025-01-24"), entryPrice: 396.13, exitPrice: 433.63, stopLoss: 373.04, result: 5, holdingDays: 17 },
  { symbol: "NTRA", side: "Long", buyDate: new Date("2025-01-24"), exitDate: new Date("2025-01-24"), entryPrice: 171.76, exitPrice: 167.52, stopLoss: 167.17, result: -2.5, holdingDays: 0 },
  { symbol: "IBIT", side: "Long", buyDate: new Date("2025-01-23"), exitDate: new Date("2025-01-23"), entryPrice: 59.31, exitPrice: 59.08, stopLoss: 58.16, result: -0.4, holdingDays: 0 },
  { symbol: "ALAB", side: "Long", buyDate: new Date("2025-01-21"), exitDate: new Date("2025-01-22"), entryPrice: 121.52, exitPrice: 123.34, stopLoss: 119.02, result: 1.5, holdingDays: 1 },
  { symbol: "ALAB", side: "Long", buyDate: new Date("2025-01-21"), exitDate: new Date("2025-01-21"), entryPrice: 130.12, exitPrice: 123.34, stopLoss: 123.34, result: -5.2, holdingDays: 0 },
  { symbol: "DOCU", side: "Long", buyDate: new Date("2025-01-15"), exitDate: new Date("2025-01-16"), entryPrice: 91.72, exitPrice: 91.19, stopLoss: 87.8, result: -0.6, holdingDays: 1 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-01-15"), exitDate: new Date("2025-01-16"), entryPrice: 227.8, exitPrice: 229.47, stopLoss: 219.51, result: 0.7, holdingDays: 1 },
  { symbol: "AVGO", side: "Long", buyDate: new Date("2025-01-13"), exitDate: new Date("2025-01-14"), entryPrice: 224.72, exitPrice: 223.25, stopLoss: 219.51, result: -0.7, holdingDays: 1 },
].sort((a, b) => a.buyDate.getTime() - b.buyDate.getTime());

// =============================================================================
// Default Parameters
// =============================================================================

const DEFAULT_PARAMS: SimParams = {
  positionSizePct: 4,
  maxPortfolioHeatPct: 4,
  maxConcurrentPositions: 10,
  qualityFilter: "all",
  sslTrailR: 1,
  trim1PriceR: 2,
  trim1Size: 33,
  trim2PriceR: 5,
};

// =============================================================================
// Simulation Logic
// =============================================================================

function simulateEquityCurve(trades: Trade[], params: SimParams, startingEquity: number = 100000): { results: SimResult[]; stats: Stats } {
  const results: SimResult[] = [];
  let equity = startingEquity;
  let peak = equity;
  let maxDrawdown = 0;

  // Initial point
  if (trades.length > 0) {
    const startDate = new Date(trades[0].buyDate);
    startDate.setDate(startDate.getDate() - 1);
    results.push({ equity, date: startDate, drawdown: 0, peak });
  }

  const winners: Trade[] = [];
  const losers: Trade[] = [];
  let tradesFiltered = 0;
  const positionSizes: number[] = []; // Track actual position sizes in $
  const concurrentCounts: number[] = []; // Track number of concurrent positions

  // Track open positions for portfolio heat
  const openPositions: { trade: Trade; risk: number; exitDate: Date }[] = [];

  for (const trade of trades) {
    // Calculate R per share
    const rPerShare = Math.abs(trade.entryPrice - trade.stopLoss);
    if (rPerShare <= 0) continue;

    // Quality filter - estimate grade based on R-multiple achieved
    const actualR = (trade.result / 100) * trade.entryPrice / rPerShare;
    let grade: "A" | "B" | "C" = "C";
    if (actualR >= 3 || (actualR >= 0 && trade.holdingDays >= 10)) grade = "A";
    else if (actualR >= 1 || actualR >= -0.5) grade = "B";

    // Apply quality filter
    if (params.qualityFilter === "A" && grade !== "A") {
      tradesFiltered++;
      continue;
    }
    if (params.qualityFilter === "B+" && grade === "C") {
      tradesFiltered++;
      continue;
    }

    // Clean up closed positions
    openPositions.forEach((pos, idx) => {
      if (pos.exitDate <= trade.buyDate) {
        openPositions.splice(idx, 1);
      }
    });

    // Calculate current portfolio heat (total risk of open positions)
    const currentHeat = openPositions.reduce((sum, pos) => sum + pos.risk, 0);
    const maxHeat = params.maxPortfolioHeatPct;

    // Skip trade if adding it would exceed portfolio heat limit
    const tradeRiskPct = (rPerShare / trade.entryPrice) * params.positionSizePct;
    if (currentHeat + tradeRiskPct > maxHeat) {
      tradesFiltered++;
      continue;
    }

    // Skip trade if max concurrent positions reached
    if (openPositions.length >= params.maxConcurrentPositions) {
      tradesFiltered++;
      continue;
    }

    // Base position size from parameter
    const positionSize = equity * (params.positionSizePct / 100);
    const shares = Math.floor(positionSize / trade.entryPrice);
    if (shares <= 0) continue;

    // Track actual position size
    const actualPositionSize = shares * trade.entryPrice;
    positionSizes.push(actualPositionSize);

    // Track this position
    openPositions.push({
      trade,
      risk: tradeRiskPct,
      exitDate: trade.exitDate,
    });
    concurrentCounts.push(openPositions.length);

    // Simulate trim strategy
    let finalResult = trade.result;

    // If trade hit trim 1 target (2R+), take partial profits
    if (actualR >= params.trim1PriceR) {
      const trim1Portion = params.trim1Size / 100;
      const trim1Profit = (params.trim1PriceR * rPerShare / trade.entryPrice) * 100;

      // If trade also hit trim 2 target
      if (actualR >= params.trim2PriceR) {
        const remainingAfterTrim1 = 1 - trim1Portion;
        const trim2Portion = 0.33; // Fixed 33% of remaining
        const trim2Profit = (params.trim2PriceR * rPerShare / trade.entryPrice) * 100;
        const runnerPortion = remainingAfterTrim1 - (remainingAfterTrim1 * trim2Portion);

        // Weighted result: trim1 + trim2 + runner
        finalResult = (trim1Portion * trim1Profit) +
                     (remainingAfterTrim1 * trim2Portion * trim2Profit) +
                     (runnerPortion * trade.result);
      } else {
        // Only trim 1 hit
        const runnerPortion = 1 - trim1Portion;
        finalResult = (trim1Portion * trim1Profit) + (runnerPortion * trade.result);
      }
    }

    // Apply SSL trailing - if trade went to sslTrailR before stopping out, move stop to breakeven
    if (params.sslTrailR > 1 && actualR < 0) {
      // Check if trade ever reached the trail threshold (assume it did if final result was close)
      const maxR = Math.max(actualR, 0);
      if (maxR >= params.sslTrailR) {
        finalResult = 0; // Stopped at breakeven
      }
    }

    // Apply P&L
    const pnl = positionSize * (finalResult / 100);
    equity += pnl;

    if (equity > peak) peak = equity;
    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    results.push({
      equity,
      date: trade.exitDate,
      trade,
      drawdown,
      peak,
    });

    // Track for stats
    if (finalResult >= 0) {
      winners.push({ ...trade, result: finalResult });
    } else {
      losers.push({ ...trade, result: finalResult });
    }
  }

  // Calculate stats
  const allTrades = [...winners, ...losers];
  const totalMonths = trades.length > 0
    ? (trades[trades.length - 1].exitDate.getTime() - trades[0].buyDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    : 1;

  const avgGain = winners.length > 0
    ? winners.reduce((sum, t) => sum + t.result, 0) / winners.length
    : 0;
  const avgLoss = losers.length > 0
    ? losers.reduce((sum, t) => sum + t.result, 0) / losers.length
    : 0;

  const stats: Stats = {
    totalReturn: ((equity - startingEquity) / startingEquity) * 100,
    maxDrawdown,
    winRate: allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0,
    avgTradesPerMonth: Math.round(allTrades.length / Math.max(totalMonths, 1)),
    avgRRR: avgLoss !== 0 ? Math.abs(avgGain / avgLoss) : 0,
    avgGain,
    avgLoss,
    biggestGain: winners.length > 0 ? Math.max(...winners.map(t => t.result)) : 0,
    biggestLoss: losers.length > 0 ? Math.min(...losers.map(t => t.result)) : 0,
    avgDaysGain: winners.length > 0
      ? winners.reduce((sum, t) => sum + t.holdingDays, 0) / winners.length
      : 0,
    avgDaysLoss: losers.length > 0
      ? losers.reduce((sum, t) => sum + t.holdingDays, 0) / losers.length
      : 0,
    tradesFiltered,
    totalTrades: allTrades.length,
    avgPositionSize: positionSizes.length > 0
      ? positionSizes.reduce((sum, s) => sum + s, 0) / positionSizes.length
      : 0,
    highestPositionSize: positionSizes.length > 0 ? Math.max(...positionSizes) : 0,
    lowestPositionSize: positionSizes.length > 0 ? Math.min(...positionSizes) : 0,
    avgConcurrentPositions: concurrentCounts.length > 0
      ? concurrentCounts.reduce((sum, c) => sum + c, 0) / concurrentCounts.length
      : 0,
    maxConcurrentPositions: concurrentCounts.length > 0 ? Math.max(...concurrentCounts) : 0,
    minConcurrentPositions: concurrentCounts.length > 0 ? Math.min(...concurrentCounts) : 0,
  };

  return { results, stats };
}

// =============================================================================
// Slider Component
// =============================================================================

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "",
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-zinc-600">{label}</span>
        <span className="font-mono font-bold text-zinc-900">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-600"
      />
    </div>
  );
}

// =============================================================================
// Equity Curve Chart
// =============================================================================

function EquityCurveChart({ results }: { results: SimResult[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || results.length === 0) return;

    const container = containerRef.current;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Aggregate results by week for smooth curve
    const weeklyResults: SimResult[] = [];
    const weekMap = new Map<string, SimResult>();

    results.forEach(r => {
      // Get week key (year-week)
      const date = new Date(r.date);
      const yearStart = new Date(date.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
      const weekKey = `${date.getFullYear()}-${weekNum}`;

      // Keep the last (highest equity) result for each week
      const existing = weekMap.get(weekKey);
      if (!existing || r.date >= existing.date) {
        weekMap.set(weekKey, r);
      }
    });

    // Sort by date
    weeklyResults.push(...Array.from(weekMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime()));

    const margin = { top: 20, right: 60, bottom: 40, left: 70 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    const g = svg
      .attr("width", container.clientWidth)
      .attr("height", container.clientHeight)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales - use weekly data for cleaner visualization
    const xScale = d3.scaleTime()
      .domain(d3.extent(weeklyResults, d => d.date) as [Date, Date])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([
        d3.min(weeklyResults, d => d.equity)! * 0.95,
        d3.max(weeklyResults, d => d.equity)! * 1.05,
      ])
      .range([height, 0]);

    const yScaleDD = d3.scaleLinear()
      .domain([0, d3.max(weeklyResults, d => d.drawdown)! * 1.5 || 10])
      .range([height, height * 0.7]);

    // Grid
    g.append("g")
      .call(d3.axisLeft(yScale).tickSize(-width).tickFormat(() => ""))
      .selectAll("line").attr("stroke", "#f4f4f5");

    // Drawdown area (smoothed)
    const ddArea = d3.area<SimResult>()
      .x(d => xScale(d.date))
      .y0(height)
      .y1(d => yScaleDD(d.drawdown))
      .curve(d3.curveBasis);

    g.append("path")
      .datum(weeklyResults)
      .attr("fill", "rgba(239, 68, 68, 0.15)")
      .attr("d", ddArea);

    // Equity area fill
    const area = d3.area<SimResult>()
      .x(d => xScale(d.date))
      .y0(height)
      .y1(d => yScale(d.equity))
      .curve(d3.curveBasis);

    g.append("path")
      .datum(weeklyResults)
      .attr("fill", "rgba(59, 130, 246, 0.08)")
      .attr("d", area);

    // Smooth equity line
    const line = d3.line<SimResult>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.equity))
      .curve(d3.curveBasis);

    g.append("path")
      .datum(weeklyResults)
      .attr("fill", "none")
      .attr("stroke", "#1d4ed8")
      .attr("stroke-width", 2.5)
      .attr("d", line);

    // Starting line
    g.append("line")
      .attr("x1", 0).attr("x2", width)
      .attr("y1", yScale(100000)).attr("y2", yScale(100000))
      .attr("stroke", "#a1a1aa")
      .attr("stroke-dasharray", "4,4");

    // Monthly markers (small dots at month ends)
    const monthlyPoints = weeklyResults.filter((r, i, arr) => {
      if (i === 0) return true;
      const prevMonth = arr[i - 1].date.getMonth();
      const currMonth = r.date.getMonth();
      return currMonth !== prevMonth;
    });

    g.selectAll(".month-dot")
      .data(monthlyPoints)
      .enter()
      .append("circle")
      .attr("cx", d => xScale(d.date))
      .attr("cy", d => yScale(d.equity))
      .attr("r", 4)
      .attr("fill", "#1d4ed8")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    // Axes
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(10).tickFormat(d3.timeFormat("%b") as any))
      .selectAll("text").attr("fill", "#71717a").attr("font-size", "11px");

    g.append("g")
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(d => `$${((d as number) / 1000).toFixed(0)}k`))
      .selectAll("text").attr("fill", "#71717a").attr("font-size", "11px");

    g.append("g")
      .attr("transform", `translate(${width},0)`)
      .call(d3.axisRight(yScaleDD).ticks(3).tickFormat(d => `${(d as number).toFixed(0)}%`))
      .selectAll("text").attr("fill", "#ef4444").attr("font-size", "10px");

  }, [results]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <svg ref={svgRef} className="h-full w-full" />
    </div>
  );
}

// =============================================================================
// Concurrent Positions Streamgraph
// =============================================================================

interface PositionData {
  date: Date;
  [ticker: string]: Date | number;
}

function ConcurrentPositionsChart({ trades }: { trades: Trade[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentPeriod, setCurrentPeriod] = useState<"H1" | "H2">("H1");

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || trades.length === 0) return;

    const container = containerRef.current;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Get all tickers
    const tickerSet = new Set<string>();
    trades.forEach(t => tickerSet.add(t.symbol));
    const tickers = Array.from(tickerSet).sort();

    // Helper to generate weekly position data for a date range
    const generateWeeklyData = (startMonth: number, endMonth: number, numWeeks: number) => {
      const year = 2025;
      const startDate = new Date(year, startMonth, 1);
      const endDate = new Date(year, endMonth + 1, 0);

      // Filter trades for this period
      const periodTrades = trades.filter(t => {
        const buyDate = new Date(t.buyDate);
        const exitDate = new Date(t.exitDate);
        return (buyDate <= endDate && exitDate >= startDate);
      });

      // Generate all dates in range
      const allDates: string[] = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
      }

      // Build daily data
      const dailyData = allDates.map(dateStr => {
        const date = new Date(dateStr);
        const row: PositionData = { date };
        tickers.forEach(ticker => {
          row[ticker] = periodTrades.filter(t =>
            t.symbol === ticker &&
            new Date(t.buyDate) <= date &&
            new Date(t.exitDate) >= date
          ).length;
        });
        return row;
      });

      // Aggregate to fixed number of weeks
      const weekSize = Math.ceil(dailyData.length / numWeeks);
      const weeklyData: PositionData[] = [];
      for (let i = 0; i < numWeeks; i++) {
        const weekEnd = Math.min((i + 1) * weekSize - 1, dailyData.length - 1);
        if (weekEnd >= 0 && dailyData[weekEnd]) {
          weeklyData.push(dailyData[weekEnd]);
        }
      }
      return weeklyData;
    };

    const numWeeks = 26;
    const h1Data = generateWeeklyData(0, 5, numWeeks);
    const h2Data = generateWeeklyData(6, 10, numWeeks);

    const margin = { top: 50, right: 120, bottom: 40, left: 20 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    const g = svg
      .attr("width", container.clientWidth)
      .attr("height", container.clientHeight)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Stack generator
    const stack = d3.stack<PositionData>()
      .keys(tickers)
      .offset(d3.stackOffsetWiggle)
      .order(d3.stackOrderInsideOut);

    const h1Series = stack(h1Data);
    const h2Series = stack(h2Data);

    // X scale (use index for smooth morphing)
    const xScale = d3.scaleLinear()
      .domain([0, numWeeks - 1])
      .range([0, width]);

    // Y scale (accommodate both periods)
    const allYValues = [...h1Series, ...h2Series].flatMap(s => s.flatMap(d => [d[0], d[1]]));
    const yMin = Math.min(...allYValues.filter(v => isFinite(v)));
    const yMax = Math.max(...allYValues.filter(v => isFinite(v)));
    const yScale = d3.scaleLinear()
      .domain([yMin || -5, yMax || 5])
      .range([height, 0]);

    // Color scale
    const color = d3.scaleOrdinal<string>()
      .domain(tickers)
      .range(d3.schemeTableau10);

    // Area generator
    const area = d3.area<d3.SeriesPoint<PositionData>>()
      .x((_, i) => xScale(i))
      .y0(d => yScale(d[0]))
      .y1(d => yScale(d[1]))
      .curve(d3.curveBasis);

    // Draw initial streams (H1)
    const paths = g.selectAll("path.stream")
      .data(h1Series)
      .enter()
      .append("path")
      .attr("class", "stream")
      .attr("fill", d => color(d.key))
      .attr("opacity", 0.85)
      .attr("d", area);

    // Period label
    const periodLabel = g.append("text")
      .attr("x", width / 2)
      .attr("y", -25)
      .attr("text-anchor", "middle")
      .attr("font-size", "16px")
      .attr("font-weight", "bold")
      .attr("fill", "#3b82f6")
      .text("H1 2025 (Jan - Jun)");

    // X axis labels
    const h1Months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const h2Months = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const xAxisGroup = g.append("g")
      .attr("transform", `translate(0,${height + 10})`);

    const drawXAxis = (months: string[]) => {
      xAxisGroup.selectAll("text").remove();
      months.forEach((month, i) => {
        xAxisGroup.append("text")
          .attr("x", xScale(i * (numWeeks / 6) + numWeeks / 12))
          .attr("y", 10)
          .attr("text-anchor", "middle")
          .attr("font-size", "12px")
          .attr("fill", "#71717a")
          .text(month);
      });
    };
    drawXAxis(h1Months);

    // Legend
    const topTickers = tickers.slice(0, 12);
    const legend = g.append("g")
      .attr("transform", `translate(${width + 15}, 0)`);

    topTickers.forEach((ticker, i) => {
      const row = legend.append("g")
        .attr("transform", `translate(0, ${i * 18})`);
      row.append("rect")
        .attr("width", 14)
        .attr("height", 14)
        .attr("rx", 3)
        .attr("fill", color(ticker));
      row.append("text")
        .attr("x", 20)
        .attr("y", 11)
        .attr("font-size", "12px")
        .attr("fill", "#52525b")
        .text(ticker);
    });

    // Animation loop
    let period: "H1" | "H2" = "H1";

    const animate = () => {
      const nextPeriod = period === "H1" ? "H2" : "H1";
      const nextSeries = nextPeriod === "H1" ? h1Series : h2Series;
      const nextMonths = nextPeriod === "H1" ? h1Months : h2Months;
      const nextLabel = nextPeriod === "H1" ? "H1 2025 (Jan - Jun)" : "H2 2025 (Jul - Nov)";

      // Transition paths
      paths.data(nextSeries)
        .transition()
        .duration(1500)
        .ease(d3.easeCubicInOut)
        .attr("d", area);

      // Update label with fade
      periodLabel
        .transition()
        .duration(200)
        .attr("opacity", 0)
        .transition()
        .duration(200)
        .text(nextLabel)
        .attr("fill", nextPeriod === "H1" ? "#3b82f6" : "#f97316")
        .attr("opacity", 1);

      // Update x axis mid-transition
      setTimeout(() => drawXAxis(nextMonths), 750);

      period = nextPeriod;
      setCurrentPeriod(nextPeriod);
    };

    // Start animation loop after initial delay
    const timeout = setTimeout(() => {
      animate();
    }, 2000);

    const interval = setInterval(animate, 3500);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };

  }, [trades]);

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <svg ref={svgRef} className="h-full w-full" />
      <div className="absolute bottom-4 left-4 flex gap-2">
        <span className={`px-2 py-1 rounded text-xs font-medium ${currentPeriod === "H1" ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"}`}>
          H1
        </span>
        <span className={`px-2 py-1 rounded text-xs font-medium ${currentPeriod === "H2" ? "bg-orange-100 text-orange-700" : "bg-zinc-100 text-zinc-500"}`}>
          H2
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Stats Panel
// =============================================================================

function StatsPanel({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-lg bg-blue-50 p-2">
        <div className="text-[10px] text-blue-600">Performance</div>
        <div className={`text-lg font-bold ${stats.totalReturn >= 0 ? "text-green-600" : "text-red-600"}`}>
          {stats.totalReturn >= 0 ? "+" : ""}{stats.totalReturn.toFixed(1)}%
        </div>
      </div>
      <div className="rounded-lg bg-red-50 p-2">
        <div className="text-[10px] text-red-600">Max Drawdown</div>
        <div className="text-lg font-bold text-red-600">-{stats.maxDrawdown.toFixed(1)}%</div>
      </div>
      <div className="rounded-lg bg-zinc-50 p-2">
        <div className="text-[10px] text-zinc-500">Win Rate</div>
        <div className="text-base font-bold text-zinc-900">{stats.winRate.toFixed(0)}%</div>
      </div>
      <div className="rounded-lg bg-zinc-50 p-2">
        <div className="text-[10px] text-zinc-500">Trades Filtered</div>
        <div className="text-base font-bold text-zinc-900">{stats.tradesFiltered}</div>
      </div>
      <div className="rounded-lg bg-zinc-50 p-2">
        <div className="text-[10px] text-zinc-500">Avg Trades/Month</div>
        <div className="text-base font-bold text-zinc-900">{stats.avgTradesPerMonth}</div>
      </div>
      <div className="rounded-lg bg-zinc-50 p-2">
        <div className="text-[10px] text-zinc-500">Avg RRR</div>
        <div className="text-base font-bold text-zinc-900">{stats.avgRRR.toFixed(2)}</div>
      </div>
      <div className="rounded-lg bg-green-50 p-2">
        <div className="text-[10px] text-green-600">Avg Gain</div>
        <div className="text-base font-bold text-green-600">+{stats.avgGain.toFixed(1)}%</div>
      </div>
      <div className="rounded-lg bg-red-50 p-2">
        <div className="text-[10px] text-red-600">Avg Loss</div>
        <div className="text-base font-bold text-red-600">{stats.avgLoss.toFixed(1)}%</div>
      </div>
      <div className="rounded-lg bg-green-50 p-2">
        <div className="text-[10px] text-green-600">Biggest Gain</div>
        <div className="text-base font-bold text-green-600">+{stats.biggestGain.toFixed(1)}%</div>
      </div>
      <div className="rounded-lg bg-red-50 p-2">
        <div className="text-[10px] text-red-600">Biggest Loss</div>
        <div className="text-base font-bold text-red-600">{stats.biggestLoss.toFixed(1)}%</div>
      </div>
      <div className="rounded-lg bg-zinc-50 p-2">
        <div className="text-[10px] text-zinc-500">Avg Days (Win)</div>
        <div className="text-base font-bold text-zinc-900">{stats.avgDaysGain.toFixed(1)}</div>
      </div>
      <div className="rounded-lg bg-zinc-50 p-2">
        <div className="text-[10px] text-zinc-500">Avg Days (Loss)</div>
        <div className="text-base font-bold text-zinc-900">{stats.avgDaysLoss.toFixed(1)}</div>
      </div>
      <div className="col-span-2 rounded-lg bg-purple-50 p-2">
        <div className="text-[10px] text-purple-600">Position Size (Avg / High / Low)</div>
        <div className="text-sm font-bold text-purple-700">
          ${stats.avgPositionSize.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${stats.highestPositionSize.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${stats.lowestPositionSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div className="col-span-2 rounded-lg bg-orange-50 p-2">
        <div className="text-[10px] text-orange-600">Concurrent Positions (Avg / High / Low)</div>
        <div className="text-sm font-bold text-orange-700">
          {stats.avgConcurrentPositions.toFixed(1)} / {stats.maxConcurrentPositions} / {stats.minConcurrentPositions}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function SimulatorPage() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const [chartView, setChartView] = useState<"equity" | "positions">("equity");

  // Filter to 2025 trades only
  const trades2025 = useMemo(() =>
    TRADE_DATA.filter(t => t.buyDate >= new Date("2025-01-01")),
    []
  );

  const { results, stats } = useMemo(
    () => simulateEquityCurve(trades2025, params),
    [trades2025, params]
  );

  const handleReset = () => setParams(DEFAULT_PARAMS);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b bg-white px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold text-zinc-900">Trading Simulator</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>Reset</Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Parameters */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Risk Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Slider
                  label="Position Size"
                  value={params.positionSizePct}
                  min={2}
                  max={15}
                  step={0.5}
                  unit="%"
                  onChange={(v) => setParams(p => ({ ...p, positionSizePct: v }))}
                />
                <Slider
                  label="Max Portfolio Heat"
                  value={params.maxPortfolioHeatPct}
                  min={2}
                  max={8}
                  step={0.5}
                  unit="%"
                  onChange={(v) => setParams(p => ({ ...p, maxPortfolioHeatPct: v }))}
                />
                <Slider
                  label="Max Concurrent Positions"
                  value={params.maxConcurrentPositions}
                  min={1}
                  max={20}
                  step={1}
                  unit=""
                  onChange={(v) => setParams(p => ({ ...p, maxConcurrentPositions: v }))}
                />
                <div>
                  <label className="text-xs text-zinc-500">Quality Filter</label>
                  <select
                    value={params.qualityFilter}
                    onChange={(e) => setParams(p => ({ ...p, qualityFilter: e.target.value as "all" | "B+" | "A" }))}
                    className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="all">All Trades</option>
                    <option value="B+">B+ (Good trades)</option>
                    <option value="A">A Only (Best trades)</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">SSL Trailing</CardTitle>
              </CardHeader>
              <CardContent>
                <Slider
                  label="Move to BE at"
                  value={params.sslTrailR}
                  min={1}
                  max={20}
                  step={1}
                  unit="R"
                  onChange={(v) => setParams(p => ({ ...p, sslTrailR: v }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trim I</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Slider
                  label="Price Target"
                  value={params.trim1PriceR}
                  min={2}
                  max={20}
                  step={1}
                  unit="R"
                  onChange={(v) => setParams(p => ({ ...p, trim1PriceR: v }))}
                />
                <Slider
                  label="Trim Size"
                  value={params.trim1Size}
                  min={33}
                  max={66}
                  step={1}
                  unit="%"
                  onChange={(v) => setParams(p => ({ ...p, trim1Size: v }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trim II</CardTitle>
              </CardHeader>
              <CardContent>
                <Slider
                  label="Price Target"
                  value={params.trim2PriceR}
                  min={5}
                  max={20}
                  step={1}
                  unit="R"
                  onChange={(v) => setParams(p => ({ ...p, trim2PriceR: v }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">2025 Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <StatsPanel stats={stats} />
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setChartView("equity")}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      chartView === "equity"
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    Equity Curve
                  </button>
                  <button
                    onClick={() => setChartView("positions")}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      chartView === "positions"
                        ? "bg-orange-100 text-orange-700 font-medium"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    Positions
                  </button>
                </div>
                <div className="text-sm text-zinc-500">{stats.totalTrades} trades</div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[600px]">
                {chartView === "equity" ? (
                  <EquityCurveChart results={results} />
                ) : (
                  <ConcurrentPositionsChart trades={trades2025} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
