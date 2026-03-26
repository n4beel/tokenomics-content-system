import React from "react";

type Variant = "primary" | "secondary";

interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    asLink?: boolean;
    href?: string;
}

export function AppButton({ variant = "primary", className = "", children, asLink, href, ...props }: AppButtonProps) {
    const base = "tm-button tm-button-primary px-4 py-2.5 text-sm";
    const cls = `${base} ${className}`.trim();

    if (asLink && href) {
        return (
            <a href={href} className={cls}>
                {children}
            </a>
        );
    }

    return (
        <button className={cls} {...props}>
            {children}
        </button>
    );
}
