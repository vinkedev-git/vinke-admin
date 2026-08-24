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
          "w-full rounded-[9px] border-[1.5px] bg-white px-4 py-3 text-sm outline-none transition",
          "border-vinke-line placeholder:text-vinke-ink3 text-vinke-ink",
          "focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100 dark:placeholder:text-slate-500",
          "dark:focus:border-vinke-lav dark:focus:ring-vinke/30",
          hasError && "border-vinke-red focus:border-vinke-red focus:ring-vinke-red-soft dark:border-vinke-red dark:focus:ring-vinke-red/30",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
