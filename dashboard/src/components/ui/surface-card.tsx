import React from "react";

interface SurfaceCardProps {
    children: React.ReactNode;
    className?: string;
}

export function SurfaceCard({ children, className = "" }: SurfaceCardProps) {
    return <section className={`tm-card p-6 ${className}`.trim()}>{children}</section>;
}
