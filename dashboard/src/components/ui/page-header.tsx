import React from "react";

interface PageHeaderProps {
    kicker?: string;
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
}

export function PageHeader({ kicker, title, subtitle, actions }: PageHeaderProps) {
    return (
        <section className="tm-card p-6 md:p-8">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    {kicker && <p className="tm-kicker">{kicker}</p>}
                    <h2 className="text-3xl mt-2 leading-tight">{title}</h2>
                    {subtitle && (
                        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                            {subtitle}
                        </p>
                    )}
                </div>
                {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
            </div>
        </section>
    );
}
