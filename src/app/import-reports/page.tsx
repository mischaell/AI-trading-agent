"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// =============================================================================
// Types
// =============================================================================

interface GmailStatus {
  connected: boolean;
  email?: string;
  expiresAt?: string;
}

interface ImportedReport {
  id: string;
  report_date: string;
  qqqe_position: "above" | "below" | "inside" | null;
  qqqe_structure_slope: "rising" | "flat" | "declining" | null;
  market_action: string | null;
  market_analysis_text: string | null;
  price_qqqe_text: string | null;
  mcsi_reading: number | null;
  mco_reading: number | null;
  mco_zscore: number | null;
  mco_status: "oversold" | "neutral" | "overbought" | null;
  breadth_text: string | null;
  tlmm_signal: string | null;
  market_view_text: string | null;
  credit_spreads_text: string | null;
  btc_text: string | null;
  universe_tickers: string[] | null;
  universe_count: number | null;
  pullback_count: number | null;
  pullback_candidates: string[] | null;
  // Image-extracted data
  mcsi_nasdaq_zscore: number | null;
  mcsi_sp500_zscore: number | null;
  mco_nasdaq_zscore: number | null;
  mco_sp500_zscore: number | null;
  breadth_consensus: string | null;
  top_themes: { rank: number; name: string; leaders: string[]; settingUp: string[] }[] | null;
  top_sectors: { rank: number; name: string; leaders: string[]; settingUp: string[] }[] | null;
  images_analyzed: number | null;
  parsing_confidence: number | null;
  created_at: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  failed: number;
  duration?: string;
  reports: {
    date: string;
    status: "imported" | "skipped" | "failed";
    reason?: string;
  }[];
  error?: string;
}

// =============================================================================
// Main Component
// =============================================================================

export default function ImportReportsPage() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [reports, setReports] = useState<ImportedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedReport, setSelectedReport] = useState<ImportedReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search configuration
  const [senderEmail, setSenderEmail] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("The Prime Report");

  // Check Gmail connection status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/status?userId=default-user");
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Failed to check Gmail status:", err);
      setStatus({ connected: false });
    }
  }, []);

  // Load imported reports from database
  const loadReports = useCallback(async () => {
    try {
      const res = await fetch("/api/gmail/import?limit=50");
      const data = await res.json();
      setReports(data.reports || []);
    } catch (err) {
      console.error("Failed to load reports:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    Promise.all([checkStatus(), loadReports()]).finally(() => setLoading(false));

    // Check URL params for errors or success
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      setError(params.get("error"));
    }
    if (params.get("connected") === "true") {
      checkStatus();
    }
  }, [checkStatus, loadReports]);

  // Connect Gmail
  const handleConnect = () => {
    window.location.href = "/api/gmail/auth?userId=default-user&returnUrl=/import-reports";
  };

  // Disconnect Gmail
  const handleDisconnect = async () => {
    try {
      await fetch("/api/gmail/status?userId=default-user", { method: "DELETE" });
      setStatus({ connected: false });
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  };

  // Import reports
  const handleImport = async (days: number) => {
    setImporting(true);
    setImportResult(null);
    setError(null);

    try {
      const res = await fetch("/api/gmail/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "default-user",
          days,
          senderEmail: senderEmail || undefined,
          subjectFilter: subjectFilter || undefined,
        }),
      });

      const data: ImportResult = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setImportResult(data);

      // Reload reports after import
      if (data.imported > 0) {
        await loadReports();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Get position badge color
  const getPositionColor = (position: string | null) => {
    switch (position) {
      case "above":
        return "bg-emerald-100 text-emerald-700";
      case "below":
        return "bg-red-100 text-red-700";
      case "inside":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-zinc-100 text-zinc-600";
    }
  };

  // Get MCO status badge color
  const getMcoStatusColor = (status: string | null) => {
    switch (status) {
      case "oversold":
        return "bg-emerald-100 text-emerald-700";
      case "overbought":
        return "bg-red-100 text-red-700";
      default:
        return "bg-zinc-100 text-zinc-600";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-zinc-500 hover:text-zinc-900">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-zinc-900">Import Trading Reports</h1>
          </div>
          {status?.connected && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">Connected: {status.email}</span>
              <button
                onClick={handleDisconnect}
                className="text-sm text-red-600 hover:underline"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-red-700">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Connection Card */}
        {!status?.connected ? (
          <div className="mb-8 rounded-xl bg-white p-8 shadow-sm">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-blue-100 p-4">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-zinc-900">Connect Gmail</h2>
              <p className="max-w-md text-zinc-600">
                Connect your Gmail account to automatically import and analyze daily trading reports
                from The Prime Report.
              </p>
              <button
                onClick={handleConnect}
                className="mt-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
              >
                Connect Gmail Account
              </button>
              <p className="text-xs text-zinc-400">
                We only request read-only access to your emails.
              </p>
            </div>
          </div>
        ) : (
          /* Import Controls */
          <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Import Reports</h2>

            {/* Search Configuration */}
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  From Email (optional)
                </label>
                <input
                  type="text"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="e.g., newsletter@example.com"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Subject Contains
                </label>
                <input
                  type="text"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  placeholder="e.g., Prime Report"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleImport(7)}
                disabled={importing}
                className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {importing ? "Importing..." : "Import Last 7 Days"}
              </button>
              <button
                onClick={() => handleImport(30)}
                disabled={importing}
                className="rounded-lg bg-zinc-100 px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
              >
                Import Last 30 Days
              </button>
              <button
                onClick={() => handleImport(90)}
                disabled={importing}
                className="rounded-lg bg-zinc-100 px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
              >
                Import Last 90 Days
              </button>
              <button
                onClick={() => handleImport(365)}
                disabled={importing}
                className="rounded-lg bg-zinc-100 px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
              >
                Import All (1 Year)
              </button>
            </div>

            {/* Import Progress */}
            {importing && (
              <div className="mt-4 flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
                <span className="text-sm text-zinc-600">
                  Importing reports from Gmail... This may take a minute.
                </span>
              </div>
            )}

            {/* Import Result */}
            {importResult && (
              <div className="mt-4 rounded-lg bg-zinc-50 p-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium text-zinc-900">
                    Import Complete ({importResult.duration})
                  </span>
                  <span className="text-emerald-600">
                    {importResult.imported} imported
                  </span>
                  <span className="text-zinc-500">
                    {importResult.skipped} skipped
                  </span>
                  {importResult.failed > 0 && (
                    <span className="text-red-600">
                      {importResult.failed} failed
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reports Table */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-zinc-900">
              Imported Reports ({reports.length})
            </h2>
          </div>

          {reports.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              No reports imported yet. Connect Gmail and import reports to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">QQQE</th>
                    <th className="px-6 py-3">MCSI</th>
                    <th className="px-6 py-3">MCO</th>
                    <th className="px-6 py-3">Signal</th>
                    <th className="px-6 py-3">Leaders</th>
                    <th className="px-6 py-3">Pullbacks</th>
                    <th className="px-6 py-3">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr
                      key={report.id}
                      onClick={() => setSelectedReport(report)}
                      className="cursor-pointer border-b border-zinc-50 hover:bg-zinc-50"
                    >
                      <td className="px-6 py-4 font-medium text-zinc-900">
                        {formatDate(report.report_date)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getPositionColor(
                            report.qqqe_position
                          )}`}
                        >
                          {report.qqqe_position || "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm">
                        {report.mcsi_reading?.toFixed(0) || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">
                            {report.mco_reading?.toFixed(0) || "—"}
                          </span>
                          {report.mco_status && (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getMcoStatusColor(
                                report.mco_status
                              )}`}
                            >
                              {report.mco_status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-600">
                        {report.tlmm_signal || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {report.universe_tickers?.slice(0, 3).map((ticker) => (
                            <span
                              key={ticker}
                              className="rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700"
                            >
                              {ticker}
                            </span>
                          ))}
                          {(report.universe_count || 0) > 3 && (
                            <span className="text-xs text-zinc-400">
                              +{(report.universe_count || 0) - 3}
                            </span>
                          )}
                          {!report.universe_tickers?.length && (
                            <span className="text-sm text-zinc-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {report.pullback_candidates?.slice(0, 3).map((ticker) => (
                            <span
                              key={ticker}
                              className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700"
                            >
                              {ticker}
                            </span>
                          ))}
                          {(report.pullback_count || 0) > 3 && (
                            <span className="text-xs text-zinc-400">
                              +{(report.pullback_count || 0) - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="h-2 w-16 rounded-full bg-zinc-100">
                          <div
                            className="h-2 rounded-full bg-emerald-500"
                            style={{
                              width: `${(report.parsing_confidence || 0) * 100}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Report Detail Modal */}
        {selectedReport && (
          <ReportDetailModal
            report={selectedReport}
            onClose={() => setSelectedReport(null)}
          />
        )}
      </main>
    </div>
  );
}

// =============================================================================
// Report Detail Modal
// =============================================================================

function ReportDetailModal({
  report,
  onClose,
}: {
  report: ImportedReport;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-[800px] max-w-[95vw] overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            Report: {new Date(report.report_date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 p-6">
          {/* Market Analysis */}
          <section className="relative">
            <span className="absolute -top-1 right-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
              From Text
            </span>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Market Analysis
            </h3>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">QQQE Position</div>
                <div className="mt-1 font-semibold capitalize text-zinc-900">
                  {report.qqqe_position || "—"}
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Structure Slope</div>
                <div className="mt-1 font-semibold capitalize text-zinc-900">
                  {report.qqqe_structure_slope || "—"}
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">Market Action</div>
                <div className="mt-1 font-semibold text-zinc-900">
                  {report.market_action || "—"}
                </div>
              </div>
            </div>
            {report.market_analysis_text && (
              <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
                {report.market_analysis_text}
              </div>
            )}
          </section>

          {/* Price QQQE */}
          {report.price_qqqe_text && (
            <section className="relative">
              <span className="absolute -top-1 right-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
                From Text
              </span>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Price QQQE
              </h3>
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                {report.price_qqqe_text}
              </div>
            </section>
          )}

          {/* Breadth Data */}
          <section className="relative">
            <span className="absolute -top-1 right-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
              From Text
            </span>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Breadth (MCSI/MCO)
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">MCSI Reading</div>
                <div className="mt-1 font-mono text-xl font-semibold text-zinc-900">
                  {report.mcsi_reading?.toFixed(0) || "—"}
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 p-3">
                <div className="text-xs text-zinc-500">MCO Reading</div>
                <div className="mt-1 font-mono text-xl font-semibold text-zinc-900">
                  {report.mco_reading?.toFixed(0) || "—"}
                  {report.mco_zscore && (
                    <span className="ml-2 text-sm text-zinc-500">
                      ({report.mco_zscore > 0 ? "+" : ""}
                      {report.mco_zscore.toFixed(1)}σ)
                    </span>
                  )}
                </div>
              </div>
            </div>
            {report.breadth_text && (
              <div className="rounded-lg bg-indigo-50 p-4 text-sm text-indigo-900">
                {report.breadth_text}
              </div>
            )}
          </section>

          {/* McClellan Z-Scores (from image) */}
          {(report.mcsi_nasdaq_zscore !== null || report.mco_nasdaq_zscore !== null) && (
            <section className="relative">
              <span className="absolute -top-1 right-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
                From Image
              </span>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                McClellan Z-Scores
                {report.breadth_consensus && (
                  <span className="ml-2 text-xs font-normal normal-case text-emerald-600">
                    {report.breadth_consensus}
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-zinc-500 mb-2">MCSI Z-Scores</div>
                  <div className="space-y-1">
                    {report.mcsi_nasdaq_zscore !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-600">Nasdaq 100</span>
                        <span className={`font-mono font-semibold ${report.mcsi_nasdaq_zscore < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {report.mcsi_nasdaq_zscore > 0 ? '+' : ''}{report.mcsi_nasdaq_zscore.toFixed(2)}σ
                        </span>
                      </div>
                    )}
                    {report.mcsi_sp500_zscore !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-600">S&P 500</span>
                        <span className={`font-mono font-semibold ${report.mcsi_sp500_zscore < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {report.mcsi_sp500_zscore > 0 ? '+' : ''}{report.mcsi_sp500_zscore.toFixed(2)}σ
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-zinc-500 mb-2">MCO Z-Scores</div>
                  <div className="space-y-1">
                    {report.mco_nasdaq_zscore !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-600">Nasdaq 100</span>
                        <span className={`font-mono font-semibold ${report.mco_nasdaq_zscore < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {report.mco_nasdaq_zscore > 0 ? '+' : ''}{report.mco_nasdaq_zscore.toFixed(2)}σ
                        </span>
                      </div>
                    )}
                    {report.mco_sp500_zscore !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-600">S&P 500</span>
                        <span className={`font-mono font-semibold ${report.mco_sp500_zscore < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {report.mco_sp500_zscore > 0 ? '+' : ''}{report.mco_sp500_zscore.toFixed(2)}σ
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Top Sectors & Themes (from image) */}
          {(report.top_themes || report.top_sectors) && (
            <section className="relative">
              <span className="absolute -top-1 right-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
                From Image
              </span>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Sectors & Themes
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {report.top_themes && report.top_themes.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-zinc-500 mb-2">Top Themes</div>
                    <div className="space-y-2">
                      {report.top_themes.slice(0, 5).map((theme) => (
                        <div key={theme.rank} className="rounded bg-pink-50 p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-pink-600">#{theme.rank}</span>
                            <span className="text-sm font-semibold text-pink-900">{theme.name}</span>
                          </div>
                          {theme.leaders.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {theme.leaders.slice(0, 4).map((t) => (
                                <span key={t} className="text-xs bg-pink-100 px-1.5 py-0.5 rounded text-pink-700">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {report.top_sectors && report.top_sectors.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-zinc-500 mb-2">Top Sectors</div>
                    <div className="space-y-2">
                      {report.top_sectors.slice(0, 5).map((sector) => (
                        <div key={sector.rank} className="rounded bg-cyan-50 p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-cyan-600">#{sector.rank}</span>
                            <span className="text-sm font-semibold text-cyan-900">{sector.name}</span>
                          </div>
                          {sector.leaders.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {sector.leaders.slice(0, 4).map((t) => (
                                <span key={t} className="text-xs bg-cyan-100 px-1.5 py-0.5 rounded text-cyan-700">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 360° Market View / TLMM Signal */}
          <section className="relative">
            <span className="absolute -top-1 right-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
              From Text
            </span>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              360° Market View
            </h3>
            <div className="rounded-lg bg-blue-100 p-4 mb-3">
              <div className="text-lg font-bold text-blue-700">
                {report.tlmm_signal || "No Signal"}
              </div>
            </div>
            {report.market_view_text && (
              <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-900">
                {report.market_view_text}
              </div>
            )}
          </section>

          {/* Market Internals */}
          <section className="relative">
            <span className="absolute -top-1 right-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
              From Text
            </span>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Market Internals
            </h3>
            <div className="space-y-3">
              {/* Credit Spreads */}
              <div>
                <div className="text-xs font-medium text-zinc-500 mb-1">Credit Spreads (SHY/HYG)</div>
                {report.credit_spreads_text ? (
                  <div className="rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
                    {report.credit_spreads_text}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-400">No data</div>
                )}
              </div>
              {/* BTC */}
              <div>
                <div className="text-xs font-medium text-zinc-500 mb-1">#BTC (Bitcoin)</div>
                {report.btc_text ? (
                  <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900">
                    {report.btc_text}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-400">No data</div>
                )}
              </div>
            </div>
          </section>

          {/* Liquid Leaders Universe */}
          <section className="relative">
            <span className="absolute -top-1 right-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
              From Text
            </span>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Liquid Leaders Universe ({report.universe_count || 0})
            </h3>
            {report.universe_tickers && report.universe_tickers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {report.universe_tickers.map((ticker) => (
                  <span
                    key={ticker}
                    className="rounded-lg bg-purple-50 px-3 py-1.5 font-semibold text-purple-700"
                  >
                    {ticker}
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-zinc-50 p-4 text-center text-zinc-500">
                No tickers extracted
              </div>
            )}
          </section>

          {/* Pullback Candidates */}
          <section className="relative">
            <span className="absolute -top-1 right-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-500">
              From Text
            </span>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Pullback Candidates ({report.pullback_count || 0})
            </h3>
            {report.pullback_candidates && report.pullback_candidates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {report.pullback_candidates.map((ticker) => (
                  <span
                    key={ticker}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700"
                  >
                    {ticker}
                  </span>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-zinc-50 p-4 text-center text-zinc-500">
                No pullback candidates
              </div>
            )}
          </section>

          {/* Parsing Confidence */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Parsing Info
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <span className="text-sm text-zinc-600">Confidence</span>
                <div className="h-3 flex-1 rounded-full bg-zinc-100">
                  <div
                    className="h-3 rounded-full bg-emerald-500"
                    style={{ width: `${(report.parsing_confidence || 0) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {((report.parsing_confidence || 0) * 100).toFixed(0)}%
                </span>
              </div>
              {report.images_analyzed !== null && report.images_analyzed > 0 && (
                <div className="flex items-center gap-2 text-sm text-zinc-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{report.images_analyzed} images analyzed</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
