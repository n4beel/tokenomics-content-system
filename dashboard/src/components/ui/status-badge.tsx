import React from "react";

const statusStyles: Record<string, string> = {
    queued: "bg-[rgba(184,149,110,0.16)] text-[#8b6a47] border-[#c9ac88]",
    waiting: "bg-[rgba(184,149,110,0.16)] text-[#8b6a47] border-[#c9ac88]",
    running: "bg-[rgba(26,23,20,0.09)] text-[#5e5650] border-[#c7beb4]",
    active: "bg-[rgba(26,23,20,0.09)] text-[#5e5650] border-[#c7beb4]",
    completed: "bg-[rgba(67,144,95,0.16)] text-[#2f6f4d] border-[#7fb998]",
    published: "bg-[rgba(67,144,95,0.16)] text-[#2f6f4d] border-[#7fb998]",
    failed: "bg-[rgba(165,88,71,0.15)] text-[#8e4d3f] border-[#b56f60]",
    rejected: "bg-[rgba(165,88,71,0.15)] text-[#8e4d3f] border-[#b56f60]",
};

interface StatusBadgeProps {
    status: string;
    className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
    const style = statusStyles[status.toLowerCase()] || "bg-[rgba(26,23,20,0.09)] text-[#5e5650] border-[#c7beb4]";
    return (
        <span className={`text-xs px-2.5 py-1 rounded-full border ${style} ${className}`.trim()}>
            {status}
        </span>
    );
}
