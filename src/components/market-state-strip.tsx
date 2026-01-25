import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

export interface MarketPermissions {
  newEntries: boolean;
  adds: boolean;
  pressing: boolean;
  trims: boolean;
}

export interface MarketStateStripProps {
  stateLabel: string;
  permissions?: MarketPermissions;
  onEodRefresh?: () => void;
  onQuickRefresh?: () => void;
}

const defaultPermissions: MarketPermissions = {
  newEntries: false,
  adds: false,
  pressing: false,
  trims: true,
};

export function MarketStateStrip({
  stateLabel,
  permissions = defaultPermissions,
  onEodRefresh,
  onQuickRefresh,
}: MarketStateStripProps) {
  // Dynamic button styles based on permission state
  const permissionStyle = (enabled: boolean) =>
    enabled
      ? "rounded-full border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : "rounded-full border-red-300 bg-red-50 text-red-600 hover:bg-red-100";

  return (
    <div className="border-b border-zinc-200 bg-white">
      <div className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
          {/* Current State + New Entries aligned together */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-lg font-semibold tracking-tight text-zinc-900">
              <span className="font-medium text-zinc-500">Current State:</span>{" "}
              <span className="font-bold">{stateLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className={permissionStyle(permissions.newEntries)}
              >
                New Entries: {permissions.newEntries ? "YES" : "NO"}
              </Button>
              <Button
                variant="outline"
                className={permissionStyle(permissions.adds)}
              >
                Adds: {permissions.adds ? "YES" : "NO"}
              </Button>
              <Button
                variant="outline"
                className={permissionStyle(permissions.pressing)}
              >
                Pressing: {permissions.pressing ? "YES" : "NO"}
              </Button>
              <Button
                variant="outline"
                className={permissionStyle(permissions.trims)}
              >
                Trims: {permissions.trims ? "YES" : "NO"}
              </Button>
            </div>
          </div>

          {/* Refresh buttons on the right */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full border-zinc-300 text-zinc-700 hover:bg-zinc-100"
              onClick={onQuickRefresh}
            >
              Quick Refresh
            </Button>
            <Button
              className="rounded-full bg-zinc-900 text-white hover:bg-zinc-800"
              onClick={onEodRefresh}
            >
              EOD Refresh <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
