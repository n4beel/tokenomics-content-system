"use client";

import { useEffect, useState } from "react";
import { api, type HealthResponse, type ConfigResponse } from "@/lib/api";

export default function OverviewPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.health(), api.config()])
      .then(([h, c]) => {
        setHealth(h);
        setConfig(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-gray-400 mt-1">
          Tokenomics.net AI Content System Overview
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          API Error: {error}
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400">API Status</h3>
            <span
              className={`w-3 h-3 rounded-full ${
                health?.status === "ok" ? "bg-green-500" : "bg-gray-600"
              }`}
            />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {health?.status === "ok" ? "Online" : "Checking..."}
          </p>
          <p className="text-xs text-gray-500 mt-1">{health?.service}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400">LLM Model</h3>
          <p className="text-2xl font-bold text-white mt-2">
            {config?.model || "—"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Gemini: {config?.hasGeminiKey ? "✅" : "❌"} | OpenRouter:{" "}
            {config?.hasOpenRouterKey ? "✅" : "❌"} | Kimi:{" "}
            {config?.hasKimiKey ? "✅" : "❌"}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400">Batch Schedule</h3>
          <p className="text-2xl font-bold text-white mt-2">
            {config?.batchCron || "—"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            CMS: {config?.hasCmsCredentials ? "✅ Connected" : "❌ Not configured"}
          </p>
        </div>
      </div>

      {/* Agent Pipeline */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Agent Pipeline
        </h3>
        <div className="flex items-center gap-4 overflow-x-auto pb-2">
          {[
            { name: "Riley", role: "Research", color: "bg-blue-500" },
            { name: "Maya", role: "Strategy", color: "bg-purple-500" },
            { name: "Quill", role: "Writing", color: "bg-green-500" },
            { name: "Maya QA", role: "Review", color: "bg-amber-500" },
          ].map((agent, i) => (
            <div key={agent.name} className="flex items-center gap-4">
              <div className="bg-gray-800 rounded-lg p-4 min-w-[140px]">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${agent.color}`}
                  />
                  <span className="text-sm font-medium text-white">
                    {agent.name}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{agent.role}</p>
              </div>
              {i < 3 && (
                <span className="text-gray-600 text-lg">→</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
