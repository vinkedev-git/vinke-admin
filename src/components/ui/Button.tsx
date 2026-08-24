"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
};

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "border border-vinke bg-vinke text-white shadow-[0_10px_24px_rgba(98,54,240,0.22)] hover:bg-vinke-deep hover:border-vinke-deep",
  secondary:
    "border-[1.5px] border-vinke-line bg-white text-vinke-ink hover:bg-vinke-offwhite dark:border-vinke-navy-line dark:bg-vinke-navy-card dark:text-slate-100 dark:hover:bg-vinke-navy-sel",
  ghost:
    "border border-transparent bg-transparent text-vinke-ink2 hover:bg-vinke-soft hover:text-vinke-ink dark:text-slate-300 dark:hover:bg-vinke-navy-sel dark:hover:text-slate-50",
  danger:
    "border border-vinke-red bg-vinke-red text-white hover:bg-[#B93248] hover:border-[#B93248]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "min-h-9 rounded-[9px] px-3 py-2 text-sm",
  md: "min-h-11 rounded-[9px] px-4 py-3 text-sm",
  lg: "min-h-12 rounded-[10px] px-5 py-3.5 text-sm",
};

export function buttonStyles({
  variant = "secondary",
  size = "md",
  block = false,
}: ButtonStyleOptions = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-bold transition outline-none focus-visible:ring-[3px] focus-visible:ring-vinke-ring dark:focus-visible:ring-vinke/40 disabled:cursor-not-allowed disabled:opacity-60",
    variantStyles[variant],
    sizeStyles[size],
    block && "w-full"
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonStyleOptions & {
    loading?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, block, loading, disabled, type = "button", children, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(buttonStyles({ variant, size, block }), className)}
        {...props}
      >
        {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
