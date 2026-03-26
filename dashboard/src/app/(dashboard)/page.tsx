"use client";

import { useEffect, useState } from "react";
import { api, type ConfigResponse, type HealthResponse } from "@/lib/api";
import { SurfaceCard } from "@/components/ui/surface-card";
import { AppButton } from "@/components/ui/app-button";

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

    const channels = [
        { name: "LinkedIn", count: "12" },
        { name: "X", count: "8" },
        { name: "YouTube", count: "4" },
        { name: "Blog", count: "2" },
    ];

    return (
        <div className="space-y-6">
            <section className="tm-card p-6 md:p-8 relative overflow-hidden">
                <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[rgba(184,149,110,0.18)] blur-3xl" />
                <div className="relative grid md:grid-cols-[1.4fr_1fr] gap-6 items-start">
                    <div>
                        <p className="tm-kicker">Dashboard Overview</p>
                        <h2 className="text-3xl md:text-4xl mt-2 leading-tight">Weekly Content Command</h2>
                        <p className="text-sm md:text-base mt-3 max-w-xl" style={{ color: "var(--text-secondary)" }}>
                            Track approvals, publishing cadence, and system integrity in one institutional-grade workspace.
                        </p>
                        <div className="flex flex-wrap gap-3 mt-6">
                            <AppButton asLink href="/batch">
                                Open Batch Review
                            </AppButton>
                            <AppButton asLink href="/settings">
                                Trigger Manual Run
                            </AppButton>
                        </div>
                    </div>

                    <div className="tm-panel p-4">
                        <p className="tm-kicker">Today</p>
                        <div className="mt-3 space-y-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span style={{ color: "var(--text-secondary)" }}>Queue readiness</span>
                                <span className="font-semibold">32 / 43 approved</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span style={{ color: "var(--text-secondary)" }}>Voice notes indexed</span>
                                <span className="font-semibold">7</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span style={{ color: "var(--text-secondary)" }}>Next publish slot</span>
                                <span className="font-semibold">13:30</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {error && (
                <div className="tm-card p-4 border-[rgba(179,79,61,0.35)]">
                    <p className="text-sm" style={{ color: "#a9493c" }}>API error: {error}</p>
                </div>
            )}

            <section className="grid md:grid-cols-3 gap-4">
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">API Status</p>
                    <p className="text-2xl mt-2 font-semibold">{health?.status === "ok" ? "Online" : "Checking"}</p>
                    <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>{health?.service ?? "content-system"}</p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Model</p>
                    <p className="text-2xl mt-2 font-semibold">{config?.model || "-"}</p>
                    <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                        Gemini {config?.hasGeminiKey ? "configured" : "missing"} | OpenRouter {config?.hasOpenRouterKey ? "configured" : "missing"}
                    </p>
                </SurfaceCard>
                <SurfaceCard className="p-5">
                    <p className="tm-kicker">Batch Cron</p>
                    <p className="text-2xl mt-2 font-semibold">{config?.batchCron || "-"}</p>
                    <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                        CMS {config?.hasCmsCredentials ? "connected" : "not configured"}
                    </p>
                </SurfaceCard>
            </section>

            <section className="tm-card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl">Daily Output Mix</h3>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>live signal</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {channels.map((channel, idx) => (
                        <div key={channel.name} className="tm-panel p-4">
                            <p className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>
                                {channel.name}
                            </p>
                            <p className="text-2xl mt-2" style={{ color: idx % 2 === 0 ? "var(--institutional-gold)" : "var(--text-primary)" }}>
                                {channel.count}
                            </p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
