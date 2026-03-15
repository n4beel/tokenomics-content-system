"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  completed: "bg-green-500/10 text-green-400 border-green-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
};

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
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const duration = (run: BatchRun) => {
    if (!run.completedAt) return null;
    const s = Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Analytics</h2>
        <p className="text-gray-400 mt-1">Content performance metrics and batch history</p>
      </div>

      {/* Batch Run History */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Batch Run History</h3>
          <span className="text-xs text-gray-600">{runs.length} runs</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No batch runs yet</p>
            <p className="text-gray-600 text-xs mt-1">
              Go to{" "}
              <a href="/settings" className="text-indigo-400 hover:underline">Settings</a> to trigger a batch
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {runs.map(run => (
              <li key={run.id} className="px-6 py-4 hover:bg-gray-800/40 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white capitalize">
                        {run.type.replace(/-/g, " ")}
                      </p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${STATUS_STYLES[run.status] ?? "bg-gray-800 text-gray-400 border-gray-700"}`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <p className="text-xs text-gray-500 font-mono">{run.batchId}</p>
                      <span className="text-gray-700">·</span>
                      <p className="text-xs text-gray-500">
                        {new Date(run.startedAt).toLocaleString("en-US", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                      <span className="text-gray-700">·</span>
                      <p className="text-xs text-gray-600 capitalize">{run.triggeredBy}</p>
                    </div>
                    {run.error && (
                      <p className="text-xs text-red-400 mt-1 truncate max-w-lg">{run.error}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    {duration(run) && (
                      <p className="text-xs text-gray-600">{duration(run)}</p>
                    )}
                    {run.status === "completed" && (
                      <a
                        href="/batch"
                        className="text-xs text-indigo-400 hover:underline block"
                      >
                        Review →
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Publishing metrics placeholder */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
        <p className="text-gray-500 text-lg">📈 Publishing Analytics</p>
        <p className="text-gray-600 text-sm mt-2">
          Engagement metrics will appear after content is published to channels
        </p>
      </div>
    </div>
  );
}
