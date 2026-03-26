"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AppSelect, AppTextarea } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { SurfaceCard } from "@/components/ui/surface-card";
import { StatusBadge } from "@/components/ui/status-badge";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const RUN_STATUS_FILTERS = ["all", "completed", "failed", "running"] as const;
const RECENT_RUNS_LIMIT = 10;

interface WeeklyRun {
    id: string;
    batchId: string;
    startedAt: string;
    _count?: { posts: number };
}

interface BatchRun {
    id: string;
    batchId: string;
    type: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
}

interface RunListResponse {
    items: BatchRun[];
    total: number;
}

interface Post {
    id: string;
    status: string;
    platform: string;
    topic: string;
    content: string;
    slot?: string | null;
    pillar?: string | null;
}

interface WeeklyTimeline {
    runId: string;
    batchId: string;
    startedAt: string;
    approvedPosts: Post[];
}

const dayLabel: Record<string, string> = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
};

function toDay(slot?: string | null): string {
    const normalized = String(slot || "monday").toLowerCase();
    const day = normalized.split("-")[0];
    return DAYS.includes(day as (typeof DAYS)[number]) ? day : "monday";
}

export default function WeeklyBatchesPage() {
    const { token } = useAuth();
    const [weeklyRuns, setWeeklyRuns] = useState<WeeklyRun[]>([]);
    const [recentWeeklyRuns, setRecentWeeklyRuns] = useState<BatchRun[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<string>("");
    const [activeDay, setActiveDay] = useState<(typeof DAYS)[number]>("monday");
    const [runPosts, setRunPosts] = useState<Post[]>([]);
    const [timeline, setTimeline] = useState<WeeklyTimeline[]>([]);
    const [loading, setLoading] = useState(true);
    const [postsLoading, setPostsLoading] = useState(false);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [isTriggering, setIsTriggering] = useState(false);
    const [copyState, setCopyState] = useState<{ postId: string | null; status: "idle" | "copied" | "error" }>({
        postId: null,
        status: "idle",
    });
    const [weeklyTotal, setWeeklyTotal] = useState(0);
    const [weeklyCompleted, setWeeklyCompleted] = useState(0);
    const [weeklyFailed, setWeeklyFailed] = useState(0);
    const [editingPostId, setEditingPostId] = useState<string | null>(null);
    const [editingContent, setEditingContent] = useState("");
    const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);
    const [approvingAll, setApprovingAll] = useState(false);
    const [runStatusFilter, setRunStatusFilter] = useState<(typeof RUN_STATUS_FILTERS)[number]>("all");
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [refreshTick, setRefreshTick] = useState(0);
    const [recentRunsPage, setRecentRunsPage] = useState(1);
    const [recentRunsTotal, setRecentRunsTotal] = useState(0);

    const loadOverviewData = useCallback(async () => {
        if (!token) return;

        try {
            const [recentWeekly, weeklyRunsRes, completedRes, failedRes] = await Promise.all([
                fetch(`${API}/api/posts/runs/recent`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : [])),
                fetch(`${API}/api/batch/runs?type=weekly&page=1&pageSize=1&limit=1`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : { items: [], total: 0 })),
                fetch(`${API}/api/batch/runs?type=weekly&status=completed&page=1&pageSize=1`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : { total: 0 })),
                fetch(`${API}/api/batch/runs?type=weekly&status=failed&page=1&pageSize=1`, {
                    headers: { Authorization: `Bearer ${token}` },
                }).then((r) => (r.ok ? r.json() : { total: 0 })),
            ]);

            const weekly = Array.isArray(recentWeekly) ? recentWeekly : [];
            setWeeklyRuns(weekly);

            const recent = weeklyRunsRes as RunListResponse;
            setWeeklyTotal(typeof recent.total === "number" ? recent.total : 0);
            setWeeklyCompleted(typeof (completedRes as { total?: number }).total === "number" ? (completedRes as { total: number }).total : 0);
            setWeeklyFailed(typeof (failedRes as { total?: number }).total === "number" ? (failedRes as { total: number }).total : 0);

            if (weekly.length > 0) {
                setSelectedRunId((prev) => prev || weekly[0].id);
            }

            setLastUpdated(new Date());
            setRefreshTick((prev) => prev + 1);
        } catch {
            setWeeklyRuns([]);
            setWeeklyTotal(0);
            setWeeklyCompleted(0);
            setWeeklyFailed(0);
        }
    }, [token]);

    const loadRecentRunsData = useCallback(async () => {
        if (!token) return;

        setLoading(true);
        try {
            const params = new URLSearchParams({
                type: "weekly",
                page: String(recentRunsPage),
                pageSize: String(RECENT_RUNS_LIMIT),
                limit: String(RECENT_RUNS_LIMIT),
            });

            if (runStatusFilter !== "all") {
                params.set("status", runStatusFilter);
            }

            const response = await fetch(`${API}/api/batch/runs?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const payload = response.ok ? ((await response.json()) as RunListResponse) : { items: [], total: 0 };
            setRecentWeeklyRuns(Array.isArray(payload.items) ? payload.items : []);
            setRecentRunsTotal(typeof payload.total === "number" ? payload.total : 0);
            setLastUpdated(new Date());
        } catch {
            setRecentWeeklyRuns([]);
            setRecentRunsTotal(0);
        } finally {
            setLoading(false);
        }
    }, [runStatusFilter, token, recentRunsPage]);

    useEffect(() => {
        void loadOverviewData();
    }, [loadOverviewData]);

    useEffect(() => {
        void loadRecentRunsData();
    }, [loadRecentRunsData]);

    useEffect(() => {
        setRecentRunsPage(1);
    }, [runStatusFilter]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = window.setInterval(() => {
            void loadOverviewData();
            void loadRecentRunsData();
        }, 20000);

        return () => window.clearInterval(interval);
    }, [autoRefresh, loadOverviewData, loadRecentRunsData]);

    useEffect(() => {
        if (!token || !selectedRunId) {
            setRunPosts([]);
            return;
        }

        setPostsLoading(true);
        fetch(`${API}/api/posts/batch/${selectedRunId}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => (r.ok ? r.json() : []))
            .then((posts: Post[]) => {
                const safePosts = Array.isArray(posts) ? posts : [];
                setRunPosts(safePosts);

                const firstDay = DAYS.find((day) =>
                    safePosts.some((post) => post.status !== "approved" && toDay(post.slot) === day),
                );
                setActiveDay(firstDay || "monday");
            })
            .catch(() => setRunPosts([]))
            .finally(() => setPostsLoading(false));
    }, [selectedRunId, token, refreshTick]);

    useEffect(() => {
        if (!token || weeklyRuns.length === 0) {
            setTimeline([]);
            return;
        }

        setTimelineLoading(true);
        const sourceRuns = weeklyRuns.slice(0, 6);

        Promise.all(
            sourceRuns.map(async (run) => {
                const response = await fetch(`${API}/api/posts/batch/${run.id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const posts = response.ok ? ((await response.json()) as Post[]) : [];
                const approvedPosts = (Array.isArray(posts) ? posts : []).filter((post) => post.status === "approved");

                return {
                    runId: run.id,
                    batchId: run.batchId,
                    startedAt: run.startedAt,
                    approvedPosts,
                };
            }),
        )
            .then((items) => setTimeline(items))
            .catch(() => setTimeline([]))
            .finally(() => setTimelineLoading(false));
    }, [token, weeklyRuns]);

    const triggerWeekly = async () => {
        setIsTriggering(true);
        try {
            await fetch(`${API}/api/batch/trigger/weekly`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
        } finally {
            setIsTriggering(false);
            setTimeout(() => window.location.reload(), 700);
        }
    };

    const updatePost = async (postId: string, payload: { status?: string; content?: string }) => {
        if (!token) return;

        const current = runPosts.find((post) => post.id === postId);
        if (!current) return;

        const body = {
            status: payload.status ?? current.status,
            content: payload.content ?? current.content,
        };

        setUpdatingPostId(postId);
        try {
            const response = await fetch(`${API}/api/posts/${postId}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) return;

            setRunPosts((prev) =>
                prev.map((post) => {
                    if (post.id !== postId) return post;
                    return {
                        ...post,
                        status: body.status,
                        content: body.content,
                    };
                }),
            );
        } finally {
            setUpdatingPostId(null);
        }
    };

    const pendingPosts = useMemo(
        () => runPosts.filter((p) => p.status !== "approved"),
        [runPosts],
    );

    const pendingByDay = useMemo(() => {
        const map: Record<string, Post[]> = {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
        };

        for (const post of pendingPosts) {
            map[toDay(post.slot)].push(post);
        }

        return map;
    }, [pendingPosts]);

    const dayPosts = pendingByDay[activeDay] || [];

    const recentRunsTotalPages = Math.max(1, Math.ceil(recentRunsTotal / RECENT_RUNS_LIMIT));

    const downloadTextFile = (fileName: string, text: string) => {
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const exportApprovedPosts = (groupBy: "platform" | "day") => {
        const approved = timeline.flatMap((week) => week.approvedPosts.map((post) => ({ ...post, batchId: week.batchId })));
        if (approved.length === 0) return;

        const groups = new Map<string, Post[]>();

        for (const post of approved) {
            const key = groupBy === "platform" ? (post.platform || "unknown").toUpperCase() : dayLabel[toDay(post.slot)];
            const bucket = groups.get(key) || [];
            bucket.push(post);
            groups.set(key, bucket);
        }

        const sections: string[] = [];
        for (const [group, posts] of groups.entries()) {
            sections.push(`# ${group}`);
            posts.forEach((post, index) => {
                sections.push(`\n## ${index + 1}. ${post.topic || "Untitled"}`);
                sections.push(`Platform: ${post.platform}`);
                sections.push(`Slot: ${dayLabel[toDay(post.slot)]}`);
                sections.push(`Status: ${post.status}`);
                sections.push(`\n${post.content || ""}`);
            });
            sections.push("\n---\n");
        }

        const date = new Date().toISOString().slice(0, 10);
        const fileName = `approved-posts-by-${groupBy}-${date}.md`;
        downloadTextFile(fileName, sections.join("\n"));
    };

    const copyApprovedPost = async (post: Post) => {
        const text = `${post.topic || "Untitled"}\n\n${post.content || ""}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopyState({ postId: post.id, status: "copied" });
            setTimeout(() => setCopyState({ postId: null, status: "idle" }), 1500);
        } catch {
            setCopyState({ postId: post.id, status: "error" });
            setTimeout(() => setCopyState({ postId: null, status: "idle" }), 1500);
        }
    };

    const approveAllPendingInRun = async () => {
        if (!token || !selectedRunId) return;

        const targets = runPosts.filter((post) => post.status !== "approved");
        if (targets.length === 0) return;

        setApprovingAll(true);
        try {
            const results = await Promise.allSettled(
                targets.map((post) =>
                    fetch(`${API}/api/posts/${post.id}`, {
                        method: "PATCH",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ status: "approved", content: post.content }),
                    }),
                ),
            );

            const approvedIds = new Set<string>();
            results.forEach((result, index) => {
                if (result.status === "fulfilled" && result.value.ok) {
                    approvedIds.add(targets[index].id);
                }
            });

            if (approvedIds.size > 0) {
                setRunPosts((prev) =>
                    prev.map((post) =>
                        approvedIds.has(post.id)
                            ? {
                                ...post,
                                status: "approved",
                            }
                            : post,
                    ),
                );
            }
        } finally {
            setApprovingAll(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                kicker="Editorial Control"
                title="Weekly Batches"
                subtitle="Review draft content by day, approve or reject per item, and manage approved output by week."
                actions={
                    <button
                        onClick={triggerWeekly}
                        disabled={isTriggering}
                        className="tm-button tm-button-primary px-4 py-2 text-sm disabled:opacity-60"
                    >
                        {isTriggering ? "Triggering..." : "Trigger Weekly Batch"}
                    </button>
                }
            />

            <SurfaceCard className="p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#3a332d] flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Pending Review</h3>
                    <div className="flex items-center gap-2">
                        {weeklyRuns.length > 0 && (
                            <AppSelect
                                value={selectedRunId}
                                onChange={(e) => setSelectedRunId(e.target.value)}
                                className="text-xs py-1.5 px-2.5 w-auto min-w-[190px]"
                            >
                                {weeklyRuns.map((run) => (
                                    <option key={run.id} value={run.id}>
                                        {new Date(run.startedAt).toLocaleDateString()} ({run._count?.posts ?? 0} posts)
                                    </option>
                                ))}
                            </AppSelect>
                        )}
                        <button
                            onClick={() => void approveAllPendingInRun()}
                            disabled={approvingAll || pendingPosts.length === 0}
                            className="tm-button tm-button-primary px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                            {approvingAll ? "Approving..." : `Approve All (${pendingPosts.length})`}
                        </button>
                    </div>
                </div>

                <div className="px-6 pt-4 border-b border-[#3a332d]">
                    <div className="flex gap-2 overflow-auto pb-3">
                        {DAYS.map((day) => (
                            <button
                                key={day}
                                onClick={() => setActiveDay(day)}
                                className={`tm-button px-3 py-1.5 text-xs whitespace-nowrap ${activeDay === day ? "tm-button-primary" : ""}`}
                            >
                                {dayLabel[day]} ({pendingByDay[day].length})
                            </button>
                        ))}
                    </div>
                </div>

                <div className="max-h-[540px] overflow-auto divide-y divide-[#3a332d]">
                    {postsLoading ? (
                        <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>Loading posts...</p>
                    ) : dayPosts.length === 0 ? (
                        <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
                            No pending posts for {dayLabel[activeDay]}.
                        </p>
                    ) : (
                        dayPosts.map((post) => (
                            <div key={post.id} className="p-4 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                                            {post.platform}
                                        </p>
                                        {post.pillar ? (
                                            <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#c7beb4]" style={{ color: "var(--text-secondary)" }}>
                                                {post.pillar}
                                            </span>
                                        ) : null}
                                    </div>
                                    <StatusBadge status={post.status} />
                                </div>

                                <p className="text-sm font-medium">{post.topic || "Untitled"}</p>

                                {editingPostId === post.id ? (
                                    <div className="space-y-2">
                                        <AppTextarea
                                            value={editingContent}
                                            onChange={(e) => setEditingContent(e.target.value)}
                                            rows={8}
                                            className="text-xs"
                                        />
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    void updatePost(post.id, { content: editingContent });
                                                    setEditingPostId(null);
                                                    setEditingContent("");
                                                }}
                                                disabled={updatingPostId === post.id}
                                                className="tm-button tm-button-primary px-3 py-1.5 text-xs disabled:opacity-50"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingPostId(null);
                                                    setEditingContent("");
                                                }}
                                                className="tm-button px-3 py-1.5 text-xs"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <p className="text-xs line-clamp-4" style={{ color: "var(--text-secondary)" }}>
                                            {post.content}
                                        </p>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                onClick={() => void updatePost(post.id, { status: "approved" })}
                                                disabled={updatingPostId === post.id}
                                                className="tm-button tm-button-primary px-3 py-1.5 text-xs disabled:opacity-50"
                                            >
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => void updatePost(post.id, { status: "rejected" })}
                                                disabled={updatingPostId === post.id}
                                                className="tm-button px-3 py-1.5 text-xs disabled:opacity-50"
                                            >
                                                Reject
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingPostId(post.id);
                                                    setEditingContent(post.content || "");
                                                }}
                                                className="tm-button px-3 py-1.5 text-xs"
                                            >
                                                Edit
                                            </button>
                                            {post.status === "rejected" ? (
                                                <button
                                                    onClick={() => void updatePost(post.id, { status: "draft" })}
                                                    disabled={updatingPostId === post.id}
                                                    className="tm-button px-3 py-1.5 text-xs disabled:opacity-50"
                                                >
                                                    Reset
                                                </button>
                                            ) : null}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </SurfaceCard>

            <div className="grid gap-4 items-start lg:grid-cols-[1.35fr_1fr]">
                <SurfaceCard className="p-0 overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#3a332d] space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">Recent Weekly Runs</h3>
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{recentRunsTotal} total</span>
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
                    ) : recentWeeklyRuns.length === 0 ? (
                        <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>No weekly runs for this filter.</p>
                    ) : (
                        <ul className="divide-y divide-[#3a332d]">
                            {recentWeeklyRuns.map((run) => (
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
                            Page {recentRunsPage} of {recentRunsTotalPages}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setRecentRunsPage((prev) => Math.max(1, prev - 1))}
                                disabled={recentRunsPage === 1}
                                className="tm-button px-2.5 py-1 text-xs disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setRecentRunsPage((prev) => Math.min(recentRunsTotalPages, prev + 1))}
                                disabled={recentRunsPage >= recentRunsTotalPages}
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
                                <p className="text-2xl font-semibold">{weeklyTotal}</p>
                                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>total</p>
                            </div>
                            <div>
                                <p className="text-2xl font-semibold" style={{ color: "#2f6f4d" }}>{weeklyCompleted}</p>
                                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>completed</p>
                            </div>
                            <div>
                                <p className="text-2xl font-semibold" style={{ color: "#8e4d3f" }}>{weeklyFailed}</p>
                                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>failed</p>
                            </div>
                        </div>
                    </SurfaceCard>

                    <SurfaceCard className="p-0 overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#3a332d] flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold">Approved Timeline</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => exportApprovedPosts("platform")}
                                    disabled={timeline.length === 0}
                                    className="tm-button px-2.5 py-1 text-xs disabled:opacity-50"
                                >
                                    Export by Platform
                                </button>
                                <button
                                    onClick={() => exportApprovedPosts("day")}
                                    disabled={timeline.length === 0}
                                    className="tm-button px-2.5 py-1 text-xs disabled:opacity-50"
                                >
                                    Export by Day
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[540px] overflow-auto divide-y divide-[#3a332d]">
                            {timelineLoading ? (
                                <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>Loading timeline...</p>
                            ) : timeline.length === 0 ? (
                                <p className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>No weekly history yet.</p>
                            ) : (
                                timeline.map((week) => (
                                    <div key={week.runId} className="p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-semibold">Week of {new Date(week.startedAt).toLocaleDateString()}</p>
                                                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                                    {week.batchId} · {week.approvedPosts.length} approved
                                                </p>
                                            </div>
                                        </div>

                                        {week.approvedPosts.length === 0 ? (
                                            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                                No approved content in this week.
                                            </p>
                                        ) : (
                                            <ul className="space-y-2">
                                                {week.approvedPosts.slice(0, 5).map((post) => (
                                                    <li key={post.id} className="rounded-lg border border-[#3a332d] px-3 py-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                                                                {post.platform} · {dayLabel[toDay(post.slot)]}
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                                <StatusBadge status={post.status} />
                                                                <button
                                                                    onClick={() => void copyApprovedPost(post)}
                                                                    className="tm-button px-2.5 py-1 text-[11px]"
                                                                >
                                                                    {copyState.postId === post.id && copyState.status === "copied"
                                                                        ? "Copied"
                                                                        : copyState.postId === post.id && copyState.status === "error"
                                                                            ? "Copy failed"
                                                                            : "Copy"}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <p className="text-sm mt-1 line-clamp-2">{post.topic || "Untitled"}</p>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </SurfaceCard>
                </div>
            </div>
        </div>
    );
}
