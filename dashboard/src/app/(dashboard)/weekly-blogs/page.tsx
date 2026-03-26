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

interface CmsDraft {
    id: number;
    title: string;
    slug: string;
    status: string;
    createdAt: string;
}

interface CmsDraftResponse {
    docs?: Array<{
        id: number;
        title?: string;
        slug?: string;
        status?: string;
        createdAt?: string;
        updatedAt?: string;
    }>;
}

const dummySignals = [
    { label: "Draft throughput", value: "+18%", note: "vs previous week" },
    { label: "QA pass rate", value: "92%", note: "first-pass quality" },
    { label: "Median runtime", value: "14m 40s", note: "blog pipeline" },
];

export default function WeeklyBlogsPage() {
    const { token } = useAuth();
    const [runs, setRuns] = useState<BatchRun[]>([]);
    const [runTotal, setRunTotal] = useState(0);
    const [drafts, setDrafts] = useState<CmsDraft[]>([]);
    const [isTriggering, setIsTriggering] = useState(false);
    const [loading, setLoading] = useState(true);
    const [draftsLoading, setDraftsLoading] = useState(true);

    useEffect(() => {
        if (!token) return;

        fetch(`${API}/api/batch/runs?type=blog&page=1&pageSize=5`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => (r.ok ? r.json() : { items: [], total: 0 }))
            .then((runsResponse) => {
                const runData = runsResponse as RunListResponse;
                setRuns(Array.isArray(runData.items) ? runData.items : []);
                setRunTotal(typeof runData.total === "number" ? runData.total : 0);
            })
            .catch(() => {
                setRuns([]);
                setRunTotal(0);
            })
            .finally(() => setLoading(false));

        fetch("https://cms.tokenomics.net/api/posts?limit=8")
            .then((r) => (r.ok ? r.json() : { docs: [] }))
            .then((cms) => {
                const docs = Array.isArray((cms as CmsDraftResponse)?.docs)
                    ? (cms as CmsDraftResponse).docs || []
                    : [];
                const normalized = docs
                    .filter((d): d is { id: number; title: string; slug: string; status?: string; createdAt?: string; updatedAt?: string } =>
                        Boolean(d && d.slug && d.title),
                    )
                    .map((d) => ({
                        id: d.id,
                        title: d.title,
                        slug: d.slug,
                        status: d.status || "draft",
                        createdAt: d.createdAt || d.updatedAt || new Date().toISOString(),
                    }));
                setDrafts(normalized);
            })
            .catch(() => setDrafts([]))
            .finally(() => setDraftsLoading(false));
    }, [token]);

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

    const runStats = useMemo(() => {
        const total = runTotal;
        const completed = runs.filter((r) => r.status === "completed").length;
        const failed = runs.filter((r) => r.status === "failed").length;
        return { total, completed, failed };
    }, [runs, runTotal]);

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

            <div className="grid gap-4 md:grid-cols-3">
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Blog Runs</p>
                    <p className="text-3xl mt-2 font-semibold">{runStats.total}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>all recorded runs</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Completed</p>
                    <p className="text-3xl mt-2 font-semibold" style={{ color: "#2f6f4d" }}>{runStats.completed}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>delivery success</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Failed</p>
                    <p className="text-3xl mt-2 font-semibold" style={{ color: "#8e4d3f" }}>{runStats.failed}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>requires operator review</p>
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
                    <h3 className="text-sm font-semibold">Recent Blog Runs</h3>
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
                                    {run.error && (
                                        <p className="text-xs mt-1 line-clamp-2" style={{ color: "#8e4d3f" }}>
                                            {run.error}
                                        </p>
                                    )}
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

            <SurfaceCard className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#3a332d] flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Recently Published Drafts</h3>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>from CMS drafts feed</span>
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
                        {drafts.slice(0, 8).map((draft) => (
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
    );
}
