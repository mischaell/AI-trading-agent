import React from "react";

export type BarTone = "g" | "r" | "n";

export interface MiniBarTileProps {
  values: number[];
  tones: BarTone[];
  maxBars?: number;
  className?: string;
}

const toneColors: Record<BarTone, string> = {
  g: "bg-emerald-500",
  r: "bg-red-500",
  n: "bg-zinc-400",
};

export function MiniBarTile({
  values,
  tones,
  maxBars = 12,
  className = "",
}: MiniBarTileProps) {
  const clamp01 = (x: number) => Math.max(0.08, Math.min(1, x));

  return (
    <div
      className={`flex h-10 items-end gap-[3px] rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 ${className}`}
    >
      {values.slice(-maxBars).map((v, i) => (
        <div
          key={i}
          className={`w-[5px] rounded-sm ${toneColors[tones[i] ?? "n"]}`}
          style={{ height: `${Math.round(clamp01(v) * 28)}px` }}
        />
      ))}
    </div>
  );
}
