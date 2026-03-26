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

interface CmsPost {
    id: number;
    title: string;
    slug: string;
    status: string;
    createdAt: string;
}

export default function WeeklyBlogsPage() {
    const { token } = useAuth();
    const [runs, setRuns] = useState<BatchRun[]>([]);
    const [runTotal, setRunTotal] = useState(0);
    const [drafts, setDrafts] = useState<CmsPost[]>([]);
    const [isTriggering, setIsTriggering] = useState(false);
    const [loading, setLoading] = useState(true);
    const [draftsLoading, setDraftsLoading] = useState(true);
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
                type: "blog",
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
                fetch(`${API}/api/batch/runs?type=blog&status=completed&page=1&pageSize=1`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : { total: 0 })),
                fetch(`${API}/api/batch/runs?type=blog&status=failed&page=1&pageSize=1`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : { total: 0 })),
            ]);

            const runData = runsRes as RunListResponse;
            setRuns(Array.isArray(runData.items) ? runData.items : []);
            setRunTotal(typeof runData.total === "number" ? runData.total : 0);
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

    const loadCmsPosts = useCallback(async () => {
        if (!token) return;

        setDraftsLoading(true);
        try {
            const response = await fetch(`${API}/api/posts/cms?limit=200`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = response.ok ? ((await response.json()) as { docs?: any[] }) : { docs: [] };
            const docs = Array.isArray(payload.docs) ? payload.docs : [];
            const normalized: CmsPost[] = docs
                .filter((d) => d && typeof d.id === "number" && d.title && d.slug)
                .map((d) => ({
                    id: d.id,
                    title: d.title,
                    slug: d.slug,
                    status: d.status || "draft",
                    createdAt: d.createdAt || d.updatedAt || new Date().toISOString(),
                }));
            setDrafts(normalized);
        } catch {
            setDrafts([]);
        } finally {
            setDraftsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        void loadRuns();
    }, [loadRuns]);

    useEffect(() => {
        void loadCmsPosts();
    }, [loadCmsPosts]);

    useEffect(() => {
        setRunsPage(1);
    }, [runStatusFilter]);

    useEffect(() => {
        if (!autoRefresh) return;
        const timer = window.setInterval(() => {
            void loadRuns();
            void loadCmsPosts();
        }, 20000);
        return () => window.clearInterval(timer);
    }, [autoRefresh, loadRuns, loadCmsPosts]);

    const triggerBlogBatch = async () => {
        setIsTriggering(true);
        try {
            await fetch(`${API}/api/batch/trigger/blog`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
        } finally {
            setIsTriggering(false);
            setTimeout(() => window.location.reload(), 600);
        }
    };

    const runStats = useMemo(
        () => ({ total: runTotal, completed: completedTotal, failed: failedTotal }),
        [completedTotal, failedTotal, runTotal],
    );
    const totalPages = Math.max(1, Math.ceil(runTotal / RUNS_PAGE_SIZE));

    return (
        <div className="space-y-6">
            <PageHeader
                kicker="Publishing"
                title="Weekly Blogs"
                subtitle="Trigger and monitor weekly blog generation, with latest draft outcomes in one place."
                actions={
                    <button
                        onClick={triggerBlogBatch}
                        disabled={isTriggering}
                        className="tm-button tm-button-primary px-4 py-2 text-sm disabled:opacity-60"
                    >
                        {isTriggering ? "Triggering..." : "Trigger Blog Batch"}
                    </button>
                }
            />

            <div className="grid gap-4 items-start lg:grid-cols-[1.35fr_1fr]">
                <SurfaceCard className="p-0 overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#3a332d] space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">Recent Blog Runs</h3>
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
                        <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>No blog runs yet.</p>
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

                <div className="space-y-3">
                    <SurfaceCard className="p-4">
                        <p className="tm-kicker">Weekly Run Health</p>
                        <div className="mt-2 grid grid-cols-3 gap-3">
                            <div>
                                <p className="text-2xl font-semibold">{runStats.total}</p>
                                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>total</p>
                            </div>
                            <div>
                                <p className="text-2xl font-semibold" style={{ color: "#2f6f4d" }}>{runStats.completed}</p>
                                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>completed</p>
                            </div>
                            <div>
                                <p className="text-2xl font-semibold" style={{ color: "#8e4d3f" }}>{runStats.failed}</p>
                                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>failed</p>
                            </div>
                        </div>
                    </SurfaceCard>

                    <SurfaceCard className="p-0 overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#3a332d] flex items-center justify-between">
                            <h3 className="text-sm font-semibold">Recently Published Drafts</h3>
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>via API CMS sync</span>
                        </div>
                        {draftsLoading ? (
                            <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
                                Loading drafts...
                            </p>
                        ) : drafts.length === 0 ? (
                            <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
                                No drafts available yet.
                            </p>
                        ) : (
                            <ul className="divide-y divide-[#3a332d]">
                                {drafts.slice(0, 25).map((draft) => (
                                    <li key={draft.id} className="px-6 py-4 flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{draft.title}</p>
                                            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                                                {draft.slug} · {new Date(draft.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        <a
                                            href={`https://cms.tokenomics.net/admin/collections/posts/${draft.id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs hover:underline"
                                            style={{ color: "var(--institutional-gold)" }}
                                        >
                                            Open Draft
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SurfaceCard>
                </div>
            </div>
        </div>
    );
}
