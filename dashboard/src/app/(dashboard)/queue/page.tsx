import { AppButton } from "@/components/ui/app-button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { SurfaceCard } from "@/components/ui/surface-card";

const slots = [
    { time: "09:00", channel: "LinkedIn", status: "Published", note: "Token vesting explainer" },
    { time: "12:30", channel: "X", status: "Scheduled", note: "Market-cap constraint thread" },
    { time: "16:00", channel: "Blog", status: "Queued", note: "RWA revenue model post" },
    { time: "18:15", channel: "YouTube", status: "Queued", note: "Founder Q&A clip" },
];

export default function QueuePage() {
    return (
        <div className="space-y-6">
            <PageHeader
                kicker="Publishing Queue"
                title="Today's Timeline"
                subtitle="Live schedule of approved posts with status controls."
                actions={
                    <div className="tm-panel px-4 py-3 text-sm">
                        <p style={{ color: "var(--text-secondary)" }}>Daily summary</p>
                        <p className="font-semibold mt-1">1 published · 1 scheduled · 2 queued</p>
                    </div>
                }
            />

            <SurfaceCard>
                <div className="space-y-4">
                    {slots.map((slot, idx) => (
                        <div key={slot.time} className="grid grid-cols-[80px_1fr_auto] gap-4 items-center">
                            <div className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                                {slot.time}
                            </div>
                            <div className="tm-panel px-4 py-3 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold">{slot.channel}</p>
                                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{slot.note}</p>
                                </div>
                                <StatusBadge status={slot.status} />
                            </div>
                            <AppButton className="px-3 py-2 text-xs">
                                {idx === 0 ? "View" : "Reschedule"}
                            </AppButton>
                        </div>
                    ))}
                </div>
            </SurfaceCard>
        </div>
    );
}
