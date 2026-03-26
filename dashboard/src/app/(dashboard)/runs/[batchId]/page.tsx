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

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

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

function parsePossiblyStringifiedJson(value: unknown): unknown {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;

    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function JsonLeaf({ label, value }: { label?: string; value: string | number | boolean | null }) {
    const prefix = label ? `${label}: ` : "";
    return (
        <p className="text-[12px] leading-5" style={{ color: "#d1d5db" }}>
            <span style={{ color: "#f3f4f6" }}>{prefix}</span>
            {value === null ? "null" : String(value)}
        </p>
    );
}

function JsonTreeNode({ label, value, depth = 0 }: { label?: string; value: unknown; depth?: number }) {
    const parsed = parsePossiblyStringifiedJson(value) as JsonValue;

    if (parsed === null || typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") {
        return <JsonLeaf label={label} value={parsed as string | number | boolean | null} />;
    }

    if (Array.isArray(parsed)) {
        return (
            <details open={depth < 1} className="rounded border border-[#374151] bg-[#111827]">
                <summary className="cursor-pointer px-3 py-2 text-[12px]" style={{ color: "#f3f4f6" }}>
                    {label ? `${label}: ` : ""}Array({parsed.length})
                </summary>
                <div className="px-3 pb-3 space-y-1">
                    {parsed.map((item, index) => (
                        <JsonTreeNode key={`${label || "array"}-${index}`} label={`[${index}]`} value={item} depth={depth + 1} />
                    ))}
                </div>
            </details>
        );
    }

    const entries = Object.entries(parsed || {});
    return (
        <details open={depth < 1} className="rounded border border-[#374151] bg-[#111827]">
            <summary className="cursor-pointer px-3 py-2 text-[12px]" style={{ color: "#f3f4f6" }}>
                {label ? `${label}: ` : ""}Object({entries.length})
            </summary>
            <div className="px-3 pb-3 space-y-1">
                {entries.map(([k, v]) => (
                    <JsonTreeNode key={`${label || "object"}-${k}`} label={k} value={v} depth={depth + 1} />
                ))}
            </div>
        </details>
    );
}

export default function RunDetailPage({ params }: RunPageProps) {
    const { token } = useAuth();
    const [batchId, setBatchId] = useState<string>("");
    const [run, setRun] = useState<BatchRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [finalStateMode, setFinalStateMode] = useState<"viewer" | "pretty">("viewer");
    const [rawResultMode, setRawResultMode] = useState<"viewer" | "pretty">("viewer");

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
                <div className="rounded-xl p-8 text-sm text-center border" style={{ background: "#f5f1e8", borderColor: "#d6ccbf", color: "#3f3a34" }}>
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
                            <p className="text-sm font-semibold capitalize" style={{ color: "#1f2937" }}>{run.type.replace(/-/g, " ")}</p>
                            <StatusBadge status={run.status} />
                        </div>
                        <div className="text-xs space-y-1" style={{ color: "#4b5563" }}>
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

                    <SurfaceCard className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold" style={{ color: "#1f2937" }}>Final State Snapshot</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setFinalStateMode("viewer")}
                                    className={`tm-button px-2.5 py-1 text-xs ${finalStateMode === "viewer" ? "tm-button-primary" : ""}`}
                                >
                                    Viewer
                                </button>
                                <button
                                    onClick={() => setFinalStateMode("pretty")}
                                    className={`tm-button px-2.5 py-1 text-xs ${finalStateMode === "pretty" ? "tm-button-primary" : ""}`}
                                >
                                    Pretty JSON
                                </button>
                            </div>
                        </div>
                        {Object.keys(finalState).length === 0 ? (
                            <p className="text-xs" style={{ color: "#6b7280" }}>No state deltas captured.</p>
                        ) : finalStateMode === "viewer" ? (
                            <JsonTreeNode value={finalState} />
                        ) : (
                            <pre className="text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-[#374151] bg-[#111827]" style={{ color: "#f3f4f6" }}>
                                {JSON.stringify(finalState, null, 2)}
                            </pre>
                        )}
                    </SurfaceCard>

                    <SurfaceCard className="space-y-3">
                        <h2 className="text-sm font-semibold" style={{ color: "#1f2937" }}>Latest Model Output</h2>
                        {lastModelText ? (
                            <pre className="text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-[#374151] bg-[#111827]" style={{ color: "#f3f4f6" }}>
                                {lastModelText}
                            </pre>
                        ) : (
                            <p className="text-xs" style={{ color: "#6b7280" }}>No text output found in events.</p>
                        )}
                    </SurfaceCard>

                    <SurfaceCard className="space-y-4">
                        <h2 className="text-sm font-semibold" style={{ color: "#1f2937" }}>Tool Calls Summary</h2>
                        {toolSummaries.length === 0 ? (
                            <p className="text-xs" style={{ color: "#6b7280" }}>No tool calls detected in captured events.</p>
                        ) : (
                            <ul className="space-y-2">
                                {toolSummaries.map((tool) => (
                                    <li key={tool.name} className="border rounded-lg p-3" style={{ borderColor: "#d6ccbf", background: "#fbf8f3" }}>
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <p className="text-xs font-semibold" style={{ color: "#1f2937" }}>{tool.name}</p>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px]" style={{ color: "#6b7280" }}>calls: {tool.calls}</span>
                                                <span className="text-[11px]" style={{ color: "#6b7280" }}>responses: {tool.responses}</span>
                                                <span
                                                    className={`text-[11px] px-2 py-0.5 rounded border ${tool.lastStatus === "success"
                                                        ? "bg-green-500/10 text-green-300 border-green-500/30"
                                                        : tool.lastStatus === "error"
                                                            ? "bg-red-500/10 text-red-300 border-red-500/30"
                                                            : "border-[#5a5248]"
                                                        }`}
                                                    style={tool.lastStatus === "unknown" ? { color: "#6b7280", background: "#f5f1e8" } : undefined}
                                                >
                                                    {tool.lastStatus}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-[11px] mt-2 whitespace-pre-wrap" style={{ color: "#4b5563" }}>{tool.lastResponsePreview}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SurfaceCard>

                    <SurfaceCard className="space-y-4">
                        <h2 className="text-sm font-semibold" style={{ color: "#1f2937" }}>Event Timeline</h2>
                        {events.length === 0 ? (
                            <p className="text-xs" style={{ color: "#6b7280" }}>This run did not store ADK event trace as an array.</p>
                        ) : (
                            <ul className="space-y-2">
                                {events.map((event, idx) => (
                                    <li key={event.id || idx} className="border rounded-lg p-3" style={{ borderColor: "#d6ccbf", background: "#fbf8f3" }}>
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-medium" style={{ color: "#1f2937" }}>{event.author || "unknown"}</p>
                                            <p className="text-[11px]" style={{ color: "#6b7280" }}>{formatTs(event.timestamp)}</p>
                                        </div>
                                        <p className="text-xs mt-1" style={{ color: "#4b5563" }}>{summarizeEvent(event)}</p>
                                        {(event.content?.parts?.length || event.actions?.stateDelta) && (
                                            <details className="mt-2">
                                                <summary className="text-[11px] cursor-pointer" style={{ color: "#9a6f43" }}>Show full event JSON</summary>
                                                <div className="mt-2">
                                                    <JsonTreeNode value={event} />
                                                </div>
                                            </details>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SurfaceCard>

                    <SurfaceCard className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold" style={{ color: "#1f2937" }}>Raw Stored Result</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setRawResultMode("viewer")}
                                    className={`tm-button px-2.5 py-1 text-xs ${rawResultMode === "viewer" ? "tm-button-primary" : ""}`}
                                >
                                    Viewer
                                </button>
                                <button
                                    onClick={() => setRawResultMode("pretty")}
                                    className={`tm-button px-2.5 py-1 text-xs ${rawResultMode === "pretty" ? "tm-button-primary" : ""}`}
                                >
                                    Pretty JSON
                                </button>
                            </div>
                        </div>
                        <details>
                            <summary className="text-xs cursor-pointer" style={{ color: "#9a6f43" }}>Expand full result payload</summary>
                            <div className="mt-2">
                                {rawResultMode === "viewer" ? (
                                    <JsonTreeNode value={run.result} />
                                ) : (
                                    <pre className="text-[11px] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap border border-[#374151] bg-[#111827]" style={{ color: "#f3f4f6" }}>
                                        {JSON.stringify(run.result, null, 2)}
                                    </pre>
                                )}
                            </div>
                        </details>
                    </SurfaceCard>
                </>
            )}
        </div>
    );
}
