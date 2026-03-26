"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { PageHeader } from "@/components/ui/page-header";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday",
};

const PLATFORM_ICONS: Record<string, string> = {
  linkedin: "in", x: "𝕏", youtube: "▶", blog: "✍", newsletter: "✉",
};
const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "bg-blue-600", x: "bg-gray-900 border border-gray-600",
  youtube: "bg-red-600", blog: "bg-purple-600", newsletter: "bg-green-700",
};
const PILLAR_COLORS: Record<string, string> = {
  "RWA Tokenization": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "Industry & DeFi": "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "News & Intel": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Builder's Playbook": "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "Fundamentals": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "General": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

interface Post {
  id: string;
  batchRunId: string;
  platform: string;
  pillar: string | null;
  topic: string;
  content: string;
  status: string;
  slot: string | null;
}

interface BatchRun {
  id: string;
  batchId: string;
  status: string;
  startedAt: string;
}

interface Summary { draft: number; approved: number; rejected: number }

export default function BatchPage() {
  const { token } = useAuth();
  const [runs, setRuns] = useState<BatchRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [summary, setSummary] = useState<Summary>({ draft: 0, approved: 0, rejected: 0 });
  const [activeDay, setActiveDay] = useState<string>("monday");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Load recent runs
  useEffect(() => {
    fetch(`${API}/api/batch/runs`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then((data: BatchRun[]) => {
        const completed = data.filter(r => r.status === "completed");
        setRuns(completed);
        if (completed.length > 0) setSelectedRun(completed[0].id);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [token]);

  const loadPosts = useCallback((batchRunId: string) => {
    Promise.all([
      fetch(`${API}/api/posts/batch/${batchRunId}`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API}/api/posts/batch/${batchRunId}/summary`, { headers }).then(r => r.ok ? r.json() : {}),
    ]).then(([postsData, summaryData]: [Post[], Record<string, number>]) => {
      setPosts(postsData);
      setSummary({
        draft: summaryData['draft'] || 0,
        approved: summaryData['approved'] || 0,
        rejected: summaryData['rejected'] || 0,
      });
    });
  }, [token]);

  useEffect(() => {
    if (selectedRun) loadPosts(selectedRun);
  }, [selectedRun, loadPosts]);

  const updatePost = async (id: string, status: string, content?: string) => {
    await fetch(`${API}/api/posts/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status, ...(content !== undefined ? { content } : {}) }),
    });
    setPosts(prev => prev.map(p => p.id === id
      ? { ...p, status, ...(content !== undefined ? { content } : {}) }
      : p
    ));
    setSummary(prev => {
      const old = posts.find(p => p.id === id)?.status ?? "draft";
      const next = { ...prev };
      if (old in next) (next as any)[old] = Math.max(0, (next as any)[old] - 1);
      if (status in next) (next as any)[status] = ((next as any)[status] || 0) + 1;
      return next;
    });
  };

  const bulkApprove = async () => {
    if (!selectedRun) return;
    await fetch(`${API}/api/posts/batch/${selectedRun}/bulk-approve`, { method: "POST", headers });
    loadPosts(selectedRun);
  };

  const dayPosts = posts.filter(p => (p.slot || "monday") === activeDay);
  const platforms = [...new Set(posts.map(p => p.platform))].sort();
  const total = summary.draft + summary.approved + summary.rejected;

  const selectedRunData = runs.find(r => r.id === selectedRun);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <PageHeader
          kicker="Editorial"
          title="Batch Review"
          subtitle={
            selectedRunData
              ? `Week of ${new Date(selectedRunData.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${summary.approved} approved · ${summary.draft} pending · ${summary.rejected} rejected`
              : "Review weekly generated content by day and platform."
          }
        />

        <div className="flex items-center gap-3 justify-end">
          {/* Run selector */}
          {runs.length > 1 && (
            <select
              value={selectedRun || ""}
              onChange={e => setSelectedRun(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {runs.map(r => (
                <option key={r.id} value={r.id}>
                  {new Date(r.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </option>
              ))}
            </select>
          )}
          {summary.draft > 0 && (
            <button
              onClick={bulkApprove}
              className="tm-button tm-button-primary px-4 py-2 text-sm font-medium"
            >
              Bulk Approve All
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-gray-500">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
          <p className="text-gray-400 text-lg">No completed batches yet</p>
          <p className="text-gray-600 text-sm mt-2">
            Trigger a weekly batch from{" "}
            <a href="/settings" className="text-indigo-400 hover:underline">Settings</a> to get started
          </p>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          {total > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800">
              <div className="bg-green-500 transition-all" style={{ width: `${(summary.approved / total) * 100}%` }} />
              <div className="bg-yellow-500 transition-all" style={{ width: `${(summary.draft / total) * 100}%` }} />
              <div className="bg-red-500 transition-all" style={{ width: `${(summary.rejected / total) * 100}%` }} />
            </div>
          )}

          {/* Day tabs */}
          <div className="flex gap-1 border-b border-gray-800">
            {DAYS.map(day => {
              const count = posts.filter(p => (p.slot || "monday") === day).length;
              return (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeDay === day
                    ? "border-indigo-500 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                    }`}
                >
                  {DAY_LABELS[day]}
                  {count > 0 && (
                    <span className="ml-1.5 text-xs text-gray-600">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Card grid */}
          {dayPosts.length === 0 ? (
            <div className="py-16 text-center text-gray-600">
              No posts scheduled for {DAY_LABELS[activeDay]}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {dayPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  editingId={editingId}
                  editContent={editContent}
                  setEditingId={setEditingId}
                  setEditContent={setEditContent}
                  onApprove={() => updatePost(post.id, "approved")}
                  onReject={() => updatePost(post.id, "rejected")}
                  onReset={() => updatePost(post.id, "draft")}
                  onSaveEdit={() => {
                    updatePost(post.id, post.status, editContent);
                    setEditingId(null);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PostCard({
  post, editingId, editContent,
  setEditingId, setEditContent,
  onApprove, onReject, onReset, onSaveEdit,
}: {
  post: Post;
  editingId: string | null;
  editContent: string;
  setEditingId: (id: string | null) => void;
  setEditContent: (c: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onReset: () => void;
  onSaveEdit: () => void;
}) {
  const isEditing = editingId === post.id;
  const pillarStyle = PILLAR_COLORS[post.pillar || "General"] || PILLAR_COLORS.General;

  const statusRing =
    post.status === "approved" ? "ring-1 ring-green-500/40" :
      post.status === "rejected" ? "ring-1 ring-red-500/30 opacity-60" : "";

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden transition-all ${statusRing}`}>
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold text-white ${PLATFORM_COLORS[post.platform] || "bg-gray-700"}`}>
            {PLATFORM_ICONS[post.platform] || "?"}
          </span>
          <span className="text-sm font-medium text-gray-300 capitalize">{post.platform}</span>
        </div>
        {post.status === "approved" && (
          <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</span>
        )}
        {post.status === "rejected" && (
          <span className="w-5 h-5 rounded-full bg-red-500/30 text-red-400 flex items-center justify-center text-xs">✕</span>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-3 flex-1">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="w-full h-36 text-sm text-gray-300 bg-gray-800 border border-gray-700 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        ) : (
          <p className="text-sm text-gray-400 leading-relaxed line-clamp-5">{post.content}</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {post.pillar && (
            <span className={`text-xs px-2 py-0.5 rounded border ${pillarStyle}`}>
              {post.pillar}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={onSaveEdit}
                className="flex-1 tm-button tm-button-primary py-1.5 text-xs font-medium"
              >
                Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          ) : post.status === "approved" || post.status === "rejected" ? (
            <button
              onClick={onReset}
              className="w-full py-1.5 text-xs font-medium text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg transition-colors"
            >
              Reset to Pending
            </button>
          ) : (
            <>
              <button
                onClick={onApprove}
                className="flex-1 tm-button tm-button-primary py-1.5 text-xs font-semibold"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => { setEditingId(post.id); setEditContent(post.content); }}
                className="flex-1 tm-button tm-button-primary py-1.5 text-xs font-semibold"
              >
                ✎ Edit
              </button>
              <button
                onClick={onReject}
                className="flex-1 tm-button tm-button-primary py-1.5 text-xs font-semibold"
              >
                ✕ Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
