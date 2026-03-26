"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SurfaceCard } from "@/components/ui/surface-card";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface RunPageProps {
    params: Promise<{ batchId: string }>;
}

interface BatchRun {
    id: string;
    batchId: string;
    type: string;
    status: string;
    triggeredBy: string;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
    result: unknown;
}

interface AdkEvent {
    id?: string;
    author?: string;
    timestamp?: number;
    content?: {
        role?: string;
        parts?: Array<{
            text?: string;
            functionCall?: { name?: string; args?: unknown };
            functionResponse?: { name?: string; response?: unknown };
        }>;
    };
    actions?: {
        stateDelta?: Record<string, unknown>;
    };
}

interface ToolSummary {
    name: string;
    calls: number;
    responses: number;
    lastStatus: "success" | "error" | "unknown";
    lastResponsePreview: string;
}

function formatTs(ts?: number): string {
    if (!ts) return "-";
    const millis = ts > 1e12 ? ts : ts * 1000;
    return new Date(millis).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function summarizeEvent(event: AdkEvent): string {
    const parts = event.content?.parts ?? [];
    for (const part of parts) {
        if (part.text && part.text.trim()) {
            const text = part.text.trim().replace(/\s+/g, " ");
            return text.length > 180 ? `${text.slice(0, 180)}...` : text;
        }
        if (part.functionCall?.name) {
            return `Tool call: ${part.functionCall.name}`;
        }
        if (part.functionResponse?.name) {
            return `Tool response: ${part.functionResponse.name}`;
        }
    }
    if (event.actions?.stateDelta && Object.keys(event.actions.stateDelta).length > 0) {
        return `State update: ${Object.keys(event.actions.stateDelta).join(", ")}`;
    }
    return "Event";
}

function summarizeResponsePreview(value: unknown): string {
    if (value === null || value === undefined) return "No response payload";
    if (typeof value === "string") return value.length > 180 ? `${value.slice(0, 180)}...` : value;
    try {
        const text = JSON.stringify(value);
        return text.length > 180 ? `${text.slice(0, 180)}...` : text;
    } catch {
        return "[unserializable response]";
    }
}

function inferToolStatus(response: unknown): "success" | "error" | "unknown" {
    if (!response) return "unknown";

    if (typeof response === "string") {
        try {
            const parsed = JSON.parse(response);
            if (typeof parsed?.success === "boolean") return parsed.success ? "success" : "error";
            if (typeof parsed?.error === "string" && parsed.error.length > 0) return "error";
            return "unknown";
        } catch {
            const lower = response.toLowerCase();
            if (lower.includes("error") || lower.includes("failed")) return "error";
            return "unknown";
        }
    }

    if (typeof response === "object") {
        const record = response as Record<string, unknown>;
        if (typeof record.success === "boolean") return record.success ? "success" : "error";
        if (typeof record.error === "string" && record.error.length > 0) return "error";
    }

    return "unknown";
}

export default function RunDetailPage({ params }: RunPageProps) {
    const { token } = useAuth();
    const [batchId, setBatchId] = useState<string>("");
    const [run, setRun] = useState<BatchRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        params.then((p) => setBatchId(decodeURIComponent(p.batchId)));
    }, [params]);

    useEffect(() => {
        if (!batchId || !token) return;

        fetch(`${API}/api/batch/runs/${encodeURIComponent(batchId)}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(async (res) => {
                if (!res.ok) {
                    const payload = await res.json().catch(() => ({ message: res.statusText }));
                    throw new Error(payload.message || "Failed to load run details");
                }
                return res.json();
            })
            .then(setRun)
            .catch((e: Error) => setError(e.message))
            .finally(() => setLoading(false));
    }, [batchId, token]);

    const events = useMemo<AdkEvent[]>(() => {
        if (!run) return [];
        return Array.isArray(run.result) ? (run.result as AdkEvent[]) : [];
    }, [run]);

    const finalState = useMemo<Record<string, unknown>>(() => {
        const state: Record<string, unknown> = {};
        for (const event of events) {
            if (event.actions?.stateDelta) {
                Object.assign(state, event.actions.stateDelta);
            }
        }
        return state;
    }, [events]);

    const lastModelText = useMemo(() => {
        for (let i = events.length - 1; i >= 0; i--) {
            const ev = events[i];
            const part = ev.content?.parts?.find((p) => typeof p.text === "string" && !!p.text?.trim());
            if (part?.text) return part.text;
        }
        return null;
    }, [events]);

    const toolSummaries = useMemo<ToolSummary[]>(() => {
        const map = new Map<string, ToolSummary>();

        const getOrCreate = (name: string): ToolSummary => {
            const existing = map.get(name);
            if (existing) return existing;
            const created: ToolSummary = {
                name,
                calls: 0,
                responses: 0,
                lastStatus: "unknown",
                lastResponsePreview: "No response yet",
            };
            map.set(name, created);
            return created;
        };

        for (const event of events) {
            const parts = event.content?.parts ?? [];
            for (const part of parts) {
                if (part.functionCall?.name) {
                    const item = getOrCreate(part.functionCall.name);
                    item.calls += 1;
                }

                if (part.functionResponse?.name) {
                    const item = getOrCreate(part.functionResponse.name);
                    item.responses += 1;
                    item.lastStatus = inferToolStatus(part.functionResponse.response);
                    item.lastResponsePreview = summarizeResponsePreview(part.functionResponse.response);
                }
            }
        }

        return Array.from(map.values()).sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
    }, [events]);

    return (
        <div className="space-y-6">
            <PageHeader
                kicker="Run Diagnostics"
                title="Run Trace"
                subtitle={batchId || "loading..."}
                actions={<a href="/analytics" className="text-sm hover:underline" style={{ color: "var(--institutional-gold)" }}>Back to Analytics</a>}
            />

            {loading && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-gray-400 text-sm text-center">
                    Loading run details...
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
                    {error}
                </div>
            )}

            {!loading && run && (
                <>
                    <SurfaceCard className="space-y-3">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-white capitalize">{run.type.replace(/-/g, " ")}</p>
                            <StatusBadge status={run.status} />
                        </div>
                        <div className="text-xs text-gray-400 space-y-1">
                            <p>Started: {new Date(run.startedAt).toLocaleString()}</p>
                            <p>Completed: {run.completedAt ? new Date(run.completedAt).toLocaleString() : "still running"}</p>
                            <p>Triggered by: {run.triggeredBy}</p>
                            <p>ADK events captured: {events.length}</p>
                        </div>
                        {run.error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-xs text-red-300 whitespace-pre-wrap">
                                {run.error}
                            </div>
                        )}
                    </SurfaceCard>

                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
                        <h2 className="text-sm font-semibold text-white">Final State Snapshot</h2>
                        {Object.keys(finalState).length === 0 ? (
                            <p className="text-xs text-gray-500">No state deltas captured.</p>
                        ) : (
                            <pre className="text-xs text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(finalState, null, 2)}
                            </pre>
                        )}
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
                        <h2 className="text-sm font-semibold text-white">Latest Model Output</h2>
                        {lastModelText ? (
                            <pre className="text-xs text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                                {lastModelText}
                            </pre>
                        ) : (
                            <p className="text-xs text-gray-500">No text output found in events.</p>
                        )}
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                        <h2 className="text-sm font-semibold text-white">Tool Calls Summary</h2>
                        {toolSummaries.length === 0 ? (
                            <p className="text-xs text-gray-500">No tool calls detected in captured events.</p>
                        ) : (
                            <ul className="space-y-2">
                                {toolSummaries.map((tool) => (
                                    <li key={tool.name} className="border border-gray-800 rounded-lg p-3 bg-gray-950/50">
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <p className="text-xs font-semibold text-white">{tool.name}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] text-gray-400">calls: {tool.calls}</span>
                                                <span className="text-[11px] text-gray-500">responses: {tool.responses}</span>
                                                <span
                                                    className={`text-[11px] px-2 py-0.5 rounded border ${tool.lastStatus === "success"
                                                        ? "bg-green-500/10 text-green-300 border-green-500/30"
                                                        : tool.lastStatus === "error"
                                                            ? "bg-red-500/10 text-red-300 border-red-500/30"
                                                            : "bg-gray-800 text-gray-400 border-gray-700"
                                                        }`}
                                                >
                                                    {tool.lastStatus}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-gray-400 mt-2 whitespace-pre-wrap">{tool.lastResponsePreview}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
                        <h2 className="text-sm font-semibold text-white">Event Timeline</h2>
                        {events.length === 0 ? (
                            <p className="text-xs text-gray-500">This run did not store ADK event trace as an array.</p>
                        ) : (
                            <ul className="space-y-2">
                                {events.map((event, idx) => (
                                    <li key={event.id || idx} className="border border-gray-800 rounded-lg p-3 bg-gray-950/50">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs text-gray-300 font-medium">{event.author || "unknown"}</p>
                                            <p className="text-[11px] text-gray-500">{formatTs(event.timestamp)}</p>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">{summarizeEvent(event)}</p>
                                        {(event.content?.parts?.length || event.actions?.stateDelta) && (
                                            <details className="mt-2">
                                                <summary className="text-[11px] text-cyan-400 cursor-pointer">Show full event JSON</summary>
                                                <pre className="mt-2 text-[11px] text-gray-300 bg-black/40 border border-gray-800 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                                                    {JSON.stringify(event, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
                        <h2 className="text-sm font-semibold text-white">Raw Stored Result</h2>
                        <details>
                            <summary className="text-xs text-cyan-400 cursor-pointer">Expand full result payload</summary>
                            <pre className="mt-2 text-[11px] text-gray-300 bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(run.result, null, 2)}
                            </pre>
                        </details>
                    </div>
                </>
            )}
        </div>
    );
}
