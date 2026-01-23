import React from "react";

export type PillTone = "neutral" | "good" | "bad" | "warn";

export interface PillProps {
  children: React.ReactNode;
  tone?: PillTone;
  className?: string;
}

const toneStyles: Record<PillTone, string> = {
  good: "bg-emerald-50 text-emerald-700 border-emerald-200",
  bad: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  warn: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-zinc-50 text-zinc-700 border-zinc-200",
};

export function Pill({ children, tone = "neutral", className = "" }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${toneStyles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
