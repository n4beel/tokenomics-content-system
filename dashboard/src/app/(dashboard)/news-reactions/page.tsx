"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

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

const dummySignals = [
    { label: "Reaction velocity", value: "7 / day", note: "avg generated reactions" },
    { label: "Publish readiness", value: "81%", note: "meets quality gates" },
    { label: "Escalation volume", value: "3", note: "items flagged this week" },
];

export default function NewsReactionsPage() {
    const { token } = useAuth();
    const [runs, setRuns] = useState<BatchRun[]>([]);
    const [runTotal, setRunTotal] = useState(0);
    const [isTriggering, setIsTriggering] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;

        fetch(`${API}/api/batch/runs?type=daily-news&page=1&pageSize=5`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => (r.ok ? r.json() : { items: [], total: 0 }))
            .then((response: RunListResponse) => {
                setRuns(Array.isArray(response.items) ? response.items : []);
                setRunTotal(typeof response.total === "number" ? response.total : 0);
            })
            .catch(() => {
                setRuns([]);
                setRunTotal(0);
            })
            .finally(() => setLoading(false));
    }, [token]);

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

    const stats = useMemo(() => {
        const total = runTotal;
        const completed = runs.filter((r) => r.status === "completed").length;
        const failed = runs.filter((r) => r.status === "failed").length;
        return { total, completed, failed };
    }, [runs, runTotal]);

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

            <div className="grid gap-4 md:grid-cols-3">
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Total Runs</p>
                    <p className="text-3xl mt-2 font-semibold">{stats.total}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>all daily news jobs</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Completed</p>
                    <p className="text-3xl mt-2 font-semibold" style={{ color: "#2f6f4d" }}>{stats.completed}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>clean finishes</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Failed</p>
                    <p className="text-3xl mt-2 font-semibold" style={{ color: "#8e4d3f" }}>{stats.failed}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>needs intervention</p>
                </SurfaceCard>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {dummySignals.map((signal) => (
                    <SurfaceCard key={signal.label} className="p-5">
                        <p className="tm-kicker">{signal.label}</p>
                        <p className="text-2xl mt-2 font-semibold">{signal.value}</p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{signal.note}</p>
                    </SurfaceCard>
                ))}
            </div>

            <SurfaceCard className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#3a332d]">
                    <h3 className="text-sm font-semibold">Recent Daily News Runs</h3>
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
            </SurfaceCard>
        </div>
    );
}
