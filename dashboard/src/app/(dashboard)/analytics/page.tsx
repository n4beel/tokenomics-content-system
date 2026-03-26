"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SurfaceCard } from "@/components/ui/surface-card";

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
  _count?: { posts: number };
}

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [runs, setRuns] = useState<BatchRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/batch/runs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then(setRuns)
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [token]);

  const duration = (run: BatchRun) => {
    if (!run.completedAt) return null;
    const s = Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Analytics"
        title="Weekly Performance Snapshot"
        subtitle="Batch throughput, run traces, and execution confidence signals."
      />

      {/* Batch Run History */}
      <SurfaceCard className="overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Batch Run History</h3>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{runs.length} runs</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No batch runs yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Go to{" "}
              <a href="/settings" className="hover:underline" style={{ color: "var(--gold-deep)" }}>Settings</a> to trigger a batch
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-700">
            {runs.map(run => (
              <li key={run.id} className="px-6 py-4 hover:bg-gray-800/60 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white capitalize">
                        {run.type.replace(/-/g, " ")}
                      </p>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <p className="text-xs font-mono" style={{ color: "#4f4944" }}>{run.batchId}</p>
                      <span className="text-gray-700">·</span>
                      <p className="text-xs" style={{ color: "#4f4944" }}>
                        {new Date(run.startedAt).toLocaleString("en-US", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                      <span className="text-gray-700">·</span>
                      <p className="text-xs capitalize" style={{ color: "var(--text-secondary)" }}>{run.triggeredBy}</p>
                    </div>
                    {run.error && (
                      <p className="text-xs mt-1 truncate max-w-lg" style={{ color: "#8f4b3e" }}>{run.error}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    {duration(run) && (
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{duration(run)}</p>
                    )}
                    <a
                      href={`/runs/${encodeURIComponent(run.batchId)}`}
                      className="text-xs hover:underline block"
                      style={{ color: "var(--gold-deep)" }}
                    >
                      {run.status === "completed" ? "Review Trace ->" : "View Trace ->"}
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SurfaceCard>

      {/* Publishing metrics placeholder */}
      <SurfaceCard className="p-12 text-center">
        <p className="text-lg">Publishing Analytics</p>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Engagement metrics will appear after content is published to channels
        </p>
      </SurfaceCard>
    </div>
  );
}
