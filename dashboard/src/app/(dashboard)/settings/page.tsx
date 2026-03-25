"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface Pillar {
  name: string;
  pct: number;
}

interface Config {
  pillars: Pillar[];
  weeklyBatchDay: number;
  weeklyBatchHour: number;
  weeklyBatchMinute: number;
  dailyNewsHour: number;
  dailyNewsMinute: number;
  vnResearchWeight: number;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PILLAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-rose-500",
  "bg-pink-500",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ── Pillar row ────────────────────────────────────────────────────────────────
function PillarRow({
  pillar,
  color,
  onChange,
  onRemove,
}: {
  pillar: Pillar;
  color: string;
  onChange: (p: Pillar) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      {/* Color dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${color}`} />

      {/* Name + bar stacked */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <input
          type="text"
          value={pillar.name}
          onChange={(e) => onChange({ ...pillar, name: e.target.value })}
          className="w-full bg-transparent text-sm text-white focus:outline-none placeholder-gray-600"
          placeholder="Pillar name"
        />
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${Math.min(pillar.pct, 100)}%` }}
          />
        </div>
      </div>

      {/* % input */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <input
          type="number"
          min={0}
          max={100}
          value={pillar.pct}
          onChange={(e) =>
            onChange({ ...pillar, pct: Math.max(0, Math.min(100, +e.target.value)) })
          }
          className="w-12 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white text-right focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
        />
        <span className="text-xs text-gray-500">%</span>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="flex-shrink-0 p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { token } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [newPillarName, setNewPillarName] = useState("");
  const [triggerLoading, setTriggerLoading] = useState<"weekly" | "news" | null>(null);
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    const res = await fetch(`${API}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setConfig(await res.json());
  }, [token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const total = config?.pillars.reduce((s, p) => s + p.pct, 0) ?? 0;

  const save = async () => {
    if (total !== 100) {
      setSaveMsg({ text: `Pillar total must equal 100% (currently ${total}%)`, ok: false });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to save");
      setConfig(await res.json());
      setSaveMsg({ text: "Settings saved", ok: true });

      // Hot-reload cron schedules from DB (fire-and-forget)
      fetch(`${API}/api/batch/refresh-schedules`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {/* non-critical */});
    } catch {
      setSaveMsg({ text: "Failed to save settings", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const addPillar = () => {
    const name = newPillarName.trim();
    if (!name || !config) return;
    setConfig({ ...config, pillars: [...config.pillars, { name, pct: 0 }] });
    setNewPillarName("");
  };

  const updatePillar = (i: number, p: Pillar) => {
    if (!config) return;
    const pillars = [...config.pillars];
    pillars[i] = p;
    setConfig({ ...config, pillars });
  };

  const trigger = async (type: "weekly" | "news") => {
    setTriggerLoading(type);
    setTriggerMsg(null);
    try {
      const path = type === "weekly" ? "trigger/weekly" : "trigger/daily-news";
      const res = await fetch(`${API}/api/batch/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTriggerMsg(
        `✓ ${type === "weekly" ? "Weekly batch" : "News scan"} queued — Batch ID: ${data.batchId}`
      );
    } catch {
      setTriggerMsg("Failed to trigger job");
    } finally {
      setTriggerLoading(null);
    }
  };

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Loading settings…</div>
      </div>
    );
  }

  const vnWeight = config.vnResearchWeight ?? 80;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure content pillars, schedules, and manual triggers</p>
      </div>

      {/* ── Content Pillars ─────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Content Pillars</h2>

        <div className="space-y-3 divide-y divide-gray-800/60">
          {config.pillars.map((p, i) => (
            <div key={i} className={i > 0 ? "pt-3" : ""}>
              <PillarRow
                pillar={p}
                color={PILLAR_COLORS[i % PILLAR_COLORS.length]}
                onChange={(updated) => updatePillar(i, updated)}
                onRemove={() =>
                  setConfig({ ...config, pillars: config.pillars.filter((_, idx) => idx !== i) })
                }
              />
            </div>
          ))}
        </div>

        {/* Total bar */}
        <div className="pt-3 border-t border-gray-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Total allocation</span>
            <span className={`text-sm font-bold tabular-nums ${total === 100 ? "text-green-400" : "text-red-400"}`}>
              {total}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                total === 100 ? "bg-green-500" : total > 100 ? "bg-red-500" : "bg-amber-500"
              }`}
              style={{ width: `${Math.min(total, 100)}%` }}
            />
          </div>
          {total !== 100 && (
            <p className="text-xs text-amber-400 mt-1.5">
              {total < 100 ? `${100 - total}% remaining to allocate` : `${total - 100}% over budget`}
            </p>
          )}
        </div>

        {/* Add pillar */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newPillarName}
            onChange={(e) => setNewPillarName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addPillar(); }}
            placeholder="New pillar name…"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          <button
            onClick={addPillar}
            disabled={!newPillarName.trim()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm rounded-lg transition-all"
          >
            Add
          </button>
        </div>
      </div>

      {/* ── VN Research Weight ───────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">VN Research Weight</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            How much Riley weighs Tony&apos;s voice notes vs. external research
          </p>
        </div>

        <div className="space-y-3">
          {/* Labels */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-xs text-gray-400">Tony&apos;s Voice Notes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Riley&apos;s Research</span>
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </div>

          {/* Dual-color bar */}
          <div className="h-3 rounded-full overflow-hidden flex">
            <div
              className="bg-indigo-500 transition-all"
              style={{ width: `${vnWeight}%` }}
            />
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${100 - vnWeight}%` }}
            />
          </div>

          {/* Slider */}
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={vnWeight}
            onChange={(e) =>
              setConfig({ ...config, vnResearchWeight: +e.target.value })
            }
            className="w-full h-1 accent-indigo-500 cursor-pointer"
          />

          {/* Value display */}
          <div className="flex justify-between">
            <span className="text-sm font-semibold text-indigo-400 tabular-nums">{vnWeight}% Voice Notes</span>
            <span className="text-sm font-semibold text-emerald-400 tabular-nums">{100 - vnWeight}% Research</span>
          </div>
        </div>
      </div>

      {/* ── Batch Schedule ───────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Weekly Batch Schedule</h2>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Day</label>
            <select
              value={config.weeklyBatchDay}
              onChange={(e) => setConfig({ ...config, weeklyBatchDay: +e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Hour</label>
            <input
              type="number" min={0} max={23} value={config.weeklyBatchHour}
              onChange={(e) => setConfig({ ...config, weeklyBatchHour: +e.target.value })}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Minute</label>
            <input
              type="number" min={0} max={59} value={config.weeklyBatchMinute}
              onChange={(e) => setConfig({ ...config, weeklyBatchMinute: +e.target.value })}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <p className="text-xs text-gray-500 pb-2.5">
            Every {DAYS[config.weeklyBatchDay]} at {pad2(config.weeklyBatchHour)}:{pad2(config.weeklyBatchMinute)}
          </p>
        </div>
      </div>

      {/* ── Daily News Schedule ──────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Daily News Schedule</h2>
          <p className="text-xs text-gray-500 mt-0.5">Runs Monday–Friday</p>
        </div>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Hour</label>
            <input
              type="number" min={0} max={23} value={config.dailyNewsHour}
              onChange={(e) => setConfig({ ...config, dailyNewsHour: +e.target.value })}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Minute</label>
            <input
              type="number" min={0} max={59} value={config.dailyNewsMinute}
              onChange={(e) => setConfig({ ...config, dailyNewsMinute: +e.target.value })}
              className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <p className="text-xs text-gray-500 pb-2.5">
            Weekdays at {pad2(config.dailyNewsHour)}:{pad2(config.dailyNewsMinute)}
          </p>
        </div>
      </div>

      {/* ── Save ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        {saveMsg ? (
          <p className={`text-xs font-medium ${saveMsg.ok ? "text-green-400" : "text-red-400"}`}>
            {saveMsg.ok ? "✓" : "✕"} {saveMsg.text}
          </p>
        ) : <div />}
        <button
          id="save-settings"
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-all"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* ── Manual Triggers ──────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Manual Triggers</h2>
          <p className="text-xs text-gray-500 mt-0.5">Run jobs immediately outside the schedule</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800/60 rounded-xl p-4 flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium text-white">Weekly Batch</p>
              <p className="text-xs text-gray-500 mt-0.5">Riley → Maya → Quill → QA</p>
            </div>
            <button
              id="trigger-weekly"
              onClick={() => trigger("weekly")}
              disabled={triggerLoading !== null}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all"
            >
              {triggerLoading === "weekly" ? "Starting…" : "Run Now"}
            </button>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4 flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium text-white">Daily News Scan</p>
              <p className="text-xs text-gray-500 mt-0.5">Riley scans breaking news</p>
            </div>
            <button
              id="trigger-news"
              onClick={() => trigger("news")}
              disabled={triggerLoading !== null}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all"
            >
              {triggerLoading === "news" ? "Starting…" : "Run Now"}
            </button>
          </div>
        </div>
        {triggerMsg && (
          <p className={`text-xs font-medium ${triggerMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
            {triggerMsg}
          </p>
        )}
      </div>
    </div>
  );
}
