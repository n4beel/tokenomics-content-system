"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AppInput, AppSelect } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const PAGE_SIZE = 10;

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
    page: number;
    pageSize: number;
    totalPages: number;
}

interface RunStatsResponse {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
}

const typeLabel = (type: string) => {
    if (type === "daily_news" || type === "daily-news") return "Daily News";
    if (type === "weekly") return "Weekly";
    if (type === "blog") return "Blog";
    return type;
};

export default function RunVisibilityPage() {
    const { token } = useAuth();
    const [runs, setRuns] = useState<BatchRun[]>([]);
    const [totalRuns, setTotalRuns] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [stats, setStats] = useState<RunStatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [page, setPage] = useState(1);

    useEffect(() => {
        if (!token) return;

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));
        if (typeFilter !== "all") params.set("type", typeFilter);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (query.trim()) params.set("search", query.trim());

        Promise.all([
            fetch(`${API}/api/batch/runs?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            }).then((r) =>
                r.ok
                    ? r.json()
                    : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 },
            ),
            fetch(`${API}/api/batch/runs/stats`, {
                headers: { Authorization: `Bearer ${token}` },
            }).then((r) => (r.ok ? r.json() : null)),
        ])
            .then(([runsRes, statsRes]) => {
                const parsed = runsRes as RunListResponse;
                setRuns(Array.isArray(parsed.items) ? parsed.items : []);
                setTotalRuns(typeof parsed.total === "number" ? parsed.total : 0);
                setTotalPages(typeof parsed.totalPages === "number" ? parsed.totalPages : 1);
                setStats((statsRes as RunStatsResponse | null) || null);
            })
            .catch(() => {
                setRuns([]);
                setTotalRuns(0);
                setTotalPages(1);
                setStats(null);
            })
            .finally(() => setLoading(false));
    }, [token, page, query, typeFilter, statusFilter]);

    const typeCounts = useMemo(() => {
        const byType = stats?.byType || {};
        return {
            weekly: byType["weekly"] || 0,
            blog: byType["blog"] || 0,
            dailyNews: (byType["daily-news"] || 0) + (byType["daily_news"] || 0),
        };
    }, [stats]);

    const statusCounts = useMemo(() => {
        const byStatus = stats?.byStatus || {};
        return {
            completed: byStatus["completed"] || 0,
            failed: byStatus["failed"] || 0,
            running: byStatus["running"] || 0,
            queued: byStatus["queued"] || 0,
        };
    }, [stats]);

    const duration = (run: BatchRun) => {
        if (!run.completedAt) return null;
        const seconds = Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000);
        if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        return `${seconds}s`;
    };

    return (
        <div className="space-y-6">
            <PageHeader
                kicker="Operations"
                title="Run Visibility"
                subtitle="Filter and inspect run outcomes by type, status, and execution trace health."
            />

            <div className="grid gap-4 md:grid-cols-4">
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Weekly</p>
                    <p className="text-2xl mt-2 font-semibold">{typeCounts.weekly}</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Blogs</p>
                    <p className="text-2xl mt-2 font-semibold">{typeCounts.blog}</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Daily News</p>
                    <p className="text-2xl mt-2 font-semibold">{typeCounts.dailyNews}</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Completed</p>
                    <p className="text-2xl mt-2 font-semibold" style={{ color: "#2f6f4d" }}>{statusCounts.completed}</p>
                </SurfaceCard>
            </div>

            <SurfaceCard className="p-4">
                <div className="grid gap-3 md:grid-cols-4">
                    <AppInput
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search by batch id, error, trigger user"
                        className="md:col-span-2"
                    />
                    <AppSelect
                        value={typeFilter}
                        onChange={(e) => {
                            setTypeFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="all">All types</option>
                        <option value="weekly">Weekly</option>
                        <option value="blog">Blog</option>
                        <option value="daily-news">Daily News</option>
                    </AppSelect>
                    <AppSelect
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="all">All statuses</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                        <option value="running">Running</option>
                        <option value="queued">Queued</option>
                    </AppSelect>
                </div>
            </SurfaceCard>

            <SurfaceCard className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#3a332d] flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Runs</h3>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {totalRuns} matching runs
                    </span>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>Loading...</div>
                ) : runs.length === 0 ? (
                    <div className="p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>No runs match current filters.</div>
                ) : (
                    <ul className="divide-y divide-[#3a332d]">
                        {runs.map((run) => (
                            <li key={run.id} className="px-6 py-4 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium">{typeLabel(run.type)}</p>
                                        <StatusBadge status={run.status} />
                                    </div>
                                    <p className="text-xs mt-1 font-mono" style={{ color: "var(--text-secondary)" }}>
                                        {run.batchId}
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                                        {new Date(run.startedAt).toLocaleString()} · {run.triggeredBy}
                                    </p>
                                    {run.error ? (
                                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "#8e4d3f" }}>{run.error}</p>
                                    ) : null}
                                </div>
                                <div className="text-right shrink-0">
                                    {duration(run) ? (
                                        <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{duration(run)}</p>
                                    ) : null}
                                    <a
                                        href={`/runs/${encodeURIComponent(run.batchId)}`}
                                        className="text-xs hover:underline"
                                        style={{ color: "var(--institutional-gold)" }}
                                    >
                                        View Trace
                                    </a>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </SurfaceCard>

            <SurfaceCard className="p-4 flex items-center justify-between">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Page {page} of {Math.max(1, totalPages)}
                </p>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="tm-button tm-button-primary px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() => setPage((p) => Math.min(Math.max(1, totalPages), p + 1))}
                        disabled={page >= Math.max(1, totalPages)}
                        className="tm-button tm-button-primary px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </SurfaceCard>

            <div className="grid gap-4 md:grid-cols-3">
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Failed</p>
                    <p className="text-2xl mt-2 font-semibold" style={{ color: "#8e4d3f" }}>{statusCounts.failed}</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Running</p>
                    <p className="text-2xl mt-2 font-semibold">{statusCounts.running}</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Queued</p>
                    <p className="text-2xl mt-2 font-semibold">{statusCounts.queued}</p>
                </SurfaceCard>
            </div>
        </div>
    );
}
