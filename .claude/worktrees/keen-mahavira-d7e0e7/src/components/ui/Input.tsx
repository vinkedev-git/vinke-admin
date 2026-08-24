"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition",
          "border-slate-200 placeholder:text-slate-400 text-slate-900",
          "focus:border-blue-400 focus:ring-2 focus:ring-blue-200",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500",
          "dark:focus:border-blue-500 dark:focus:ring-blue-500/30",
          hasError && "border-red-400 focus:border-red-400 focus:ring-red-200 dark:border-red-500 dark:focus:ring-red-500/30",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
