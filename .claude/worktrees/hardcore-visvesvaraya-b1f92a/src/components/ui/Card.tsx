"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white",
        "dark:border-slate-800 dark:bg-slate-900",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "border-b border-slate-200 bg-slate-50/80 px-5 py-4",
        "dark:border-slate-800 dark:bg-slate-900/80",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

type CardBodyProps = React.HTMLAttributes<HTMLDivElement>;

export function CardBody({ className, children, ...props }: CardBodyProps) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}
