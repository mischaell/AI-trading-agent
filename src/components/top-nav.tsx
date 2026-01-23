import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RefreshCcw, Settings } from "lucide-react";

export const DEFAULT_NAV_ITEMS = [
  "Market State",
  "Liquid Leaders",
  "Pullback Scan",
  "Focus List",
  "Suggested Trades",
  "Trades Today",
  "Portfolio",
] as const;

export type NavItem = (typeof DEFAULT_NAV_ITEMS)[number];

export interface TopNavProps {
  active: NavItem | string;
  navItems?: readonly string[];
  onChange?: (value: string) => void;
  disabledItems?: string[];
  showSearch?: boolean;
  showRefresh?: boolean;
  showSettings?: boolean;
  onRefresh?: () => void;
  onSettings?: () => void;
}

export function TopNav({
  active,
  navItems = DEFAULT_NAV_ITEMS,
  onChange,
  disabledItems = [],
  showSearch = false,
  showRefresh = true,
  showSettings = true,
  onRefresh,
  onSettings,
}: TopNavProps) {
  const handleNavChange = (value: string) => {
    if (onChange && !disabledItems.includes(value)) {
      onChange(value);
    }
  };

  return (
    <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-zinc-900" />
          <div className="text-sm font-semibold text-zinc-900">
            Trading Agent Dashboard
          </div>
        </div>

        <Tabs value={active} onValueChange={handleNavChange}>
          <TabsList className="hidden rounded-full md:flex">
            {navItems.map((n) => (
              <TabsTrigger
                key={n}
                value={n}
                disabled={disabledItems.includes(n)}
                className="rounded-full"
              >
                {n}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {showSearch && (
            <div className="relative hidden md:block">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                className="w-[240px] rounded-full pl-8"
                placeholder="Search ticker…"
              />
            </div>
          )}
          {showRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={onRefresh}
            >
              <RefreshCcw className="h-4 w-4" />
            </Button>
          )}
          {showSettings && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={onSettings}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="mx-auto max-w-[1400px] px-4 pb-3 md:hidden">
        <Tabs value={active} onValueChange={handleNavChange}>
          <TabsList className="grid w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="Market State">Market</TabsTrigger>
            <TabsTrigger value="Focus List">Focus</TabsTrigger>
            <TabsTrigger value="Portfolio">Portfolio</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
