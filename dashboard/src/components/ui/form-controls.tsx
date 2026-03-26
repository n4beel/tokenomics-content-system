import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const controlBase =
    "w-full bg-[#f4ede4] border border-[#d6cec4] rounded-lg px-3.5 py-2.5 text-sm text-[#2b2520] placeholder-[#9b938a] focus:outline-none focus:ring-2 focus:ring-[var(--institutional-gold)] focus:border-transparent transition-all disabled:opacity-60 disabled:cursor-not-allowed";

export const AppInput = React.forwardRef<HTMLInputElement, InputProps>(function AppInput(
    { className = "", ...props },
    ref,
) {
    return <input ref={ref} className={`${controlBase} ${className}`.trim()} {...props} />;
});

export const AppSelect = React.forwardRef<HTMLSelectElement, SelectProps>(function AppSelect(
    { className = "", children, ...props },
    ref,
) {
    return (
        <select
            ref={ref}
            className={`${controlBase} appearance-none bg-[linear-gradient(45deg,transparent_50%,#7a6c5c_50%),linear-gradient(135deg,#7a6c5c_50%,transparent_50%)] bg-[position:calc(100%-16px)_calc(1em+2px),calc(100%-11px)_calc(1em+2px)] bg-[size:5px_5px,5px_5px] bg-no-repeat pr-9 ${className}`.trim()}
            {...props}
        >
            {children}
        </select>
    );
});

export const AppTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function AppTextarea(
    { className = "", ...props },
    ref,
) {
    return <textarea ref={ref} className={`${controlBase} ${className}`.trim()} {...props} />;
});
