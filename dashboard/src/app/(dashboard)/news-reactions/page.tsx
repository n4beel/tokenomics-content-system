"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const RUN_STATUS_FILTERS = ["all", "completed", "failed", "running"] as const;
const RUNS_PAGE_SIZE = 10;

interface BatchRun {
    id: string;
    batchId: string;
    type: string;
    status: string;
    triggeredBy: string;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
}

interface RunListResponse {
    items: BatchRun[];
    total: number;
}

export default function NewsReactionsPage() {
    const { token } = useAuth();
    const [runs, setRuns] = useState<BatchRun[]>([]);
    const [runTotal, setRunTotal] = useState(0);
    const [isTriggering, setIsTriggering] = useState(false);
    const [loading, setLoading] = useState(true);
    const [runStatusFilter, setRunStatusFilter] = useState<(typeof RUN_STATUS_FILTERS)[number]>("all");
    const [runsPage, setRunsPage] = useState(1);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [completedTotal, setCompletedTotal] = useState(0);
    const [failedTotal, setFailedTotal] = useState(0);

    const loadRuns = useCallback(async () => {
        if (!token) return;

        setLoading(true);
        try {
            const params = new URLSearchParams({
                type: "daily-news",
                page: String(runsPage),
                pageSize: String(RUNS_PAGE_SIZE),
            });
            if (runStatusFilter !== "all") {
                params.set("status", runStatusFilter);
            }

            const [runsRes, completedRes, failedRes] = await Promise.all([
                fetch(`${API}/api/batch/runs?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : { items: [], total: 0 })),
                fetch(`${API}/api/batch/runs?type=daily-news&status=completed&page=1&pageSize=1`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : { total: 0 })),
                fetch(`${API}/api/batch/runs?type=daily-news&status=failed&page=1&pageSize=1`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : { total: 0 })),
            ]);

            const response = runsRes as RunListResponse;
            setRuns(Array.isArray(response.items) ? response.items : []);
            setRunTotal(typeof response.total === "number" ? response.total : 0);
            setCompletedTotal(typeof (completedRes as { total?: number }).total === "number" ? (completedRes as { total: number }).total : 0);
            setFailedTotal(typeof (failedRes as { total?: number }).total === "number" ? (failedRes as { total: number }).total : 0);
            setLastUpdated(new Date());
        } catch {
            setRuns([]);
            setRunTotal(0);
            setCompletedTotal(0);
            setFailedTotal(0);
        } finally {
            setLoading(false);
        }
    }, [runStatusFilter, runsPage, token]);

    useEffect(() => {
        void loadRuns();
    }, [loadRuns]);

    useEffect(() => {
        setRunsPage(1);
    }, [runStatusFilter]);

    useEffect(() => {
        if (!autoRefresh) return;
        const timer = window.setInterval(() => {
            void loadRuns();
        }, 20000);
        return () => window.clearInterval(timer);
    }, [autoRefresh, loadRuns]);

    const triggerDailyNews = async () => {
        setIsTriggering(true);
        try {
            await fetch(`${API}/api/batch/trigger/daily-news`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
        } finally {
            setIsTriggering(false);
            setTimeout(() => window.location.reload(), 600);
        }
    };

    const stats = useMemo(
        () => ({ total: runTotal, completed: completedTotal, failed: failedTotal }),
        [completedTotal, failedTotal, runTotal],
    );
    const totalPages = Math.max(1, Math.ceil(runTotal / RUNS_PAGE_SIZE));

    return (
        <div className="space-y-6">
            <PageHeader
                kicker="Realtime"
                title="News Reactions"
                subtitle="Launch daily news reaction runs and track completion health for rapid-response content."
                actions={
                    <button
                        onClick={triggerDailyNews}
                        disabled={isTriggering}
                        className="tm-button tm-button-primary px-4 py-2 text-sm disabled:opacity-60"
                    >
                        {isTriggering ? "Triggering..." : "Trigger Daily News"}
                    </button>
                }
            />

            <div className="grid gap-4 items-start lg:grid-cols-[1.35fr_1fr]">
                <SurfaceCard className="p-0 overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#3a332d] space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">Recent Daily News Runs</h3>
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{runTotal} total</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                {RUN_STATUS_FILTERS.map((status) => (
                                    <button
                                        key={status}
                                        onClick={() => setRunStatusFilter(status)}
                                        className={`tm-button px-2.5 py-1 text-xs ${runStatusFilter === status ? "tm-button-primary" : ""}`}
                                    >
                                        {status === "all" ? "All" : status[0].toUpperCase() + status.slice(1)}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setAutoRefresh((prev) => !prev)}
                                    className={`tm-button px-2.5 py-1 text-xs ${autoRefresh ? "tm-button-primary" : ""}`}
                                >
                                    {autoRefresh ? "Auto-refresh On" : "Auto-refresh Off"}
                                </button>
                                <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                                    {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Not updated yet"}
                                </span>
                            </div>
                        </div>
                    </div>
                    {loading ? (
                        <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>Loading...</p>
                    ) : runs.length === 0 ? (
                        <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>No daily news runs yet.</p>
                    ) : (
                        <ul className="divide-y divide-[#3a332d]">
                            {runs.map((run) => (
                                <li key={run.id} className="px-6 py-4 flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">{run.batchId}</p>
                                            <StatusBadge status={run.status} />
                                        </div>
                                        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                                            {new Date(run.startedAt).toLocaleString()}
                                        </p>
                                        {run.error ? (
                                            <p className="text-xs mt-1 line-clamp-2" style={{ color: "#8e4d3f" }}>
                                                {run.error}
                                            </p>
                                        ) : null}
                                    </div>
                                    <a
                                        href={`/runs/${encodeURIComponent(run.batchId)}`}
                                        className="text-xs hover:underline"
                                        style={{ color: "var(--institutional-gold)" }}
                                    >
                                        View Trace
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="px-6 py-3 border-t border-[#3a332d] flex items-center justify-between">
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            Page {runsPage} of {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setRunsPage((prev) => Math.max(1, prev - 1))}
                                disabled={runsPage === 1}
                                className="tm-button px-2.5 py-1 text-xs disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setRunsPage((prev) => Math.min(totalPages, prev + 1))}
                                disabled={runsPage >= totalPages}
                                className="tm-button px-2.5 py-1 text-xs disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </SurfaceCard>

                <SurfaceCard className="p-4">
                    <p className="tm-kicker">Daily Run Health</p>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                        <div>
                            <p className="text-2xl font-semibold">{stats.total}</p>
                            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>total</p>
                        </div>
                        <div>
                            <p className="text-2xl font-semibold" style={{ color: "#2f6f4d" }}>{stats.completed}</p>
                            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>completed</p>
                        </div>
                        <div>
                            <p className="text-2xl font-semibold" style={{ color: "#8e4d3f" }}>{stats.failed}</p>
                            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>failed</p>
                        </div>
                    </div>
                </SurfaceCard>
            </div>
        </div>
    );
}
