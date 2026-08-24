// src/components/AdminShell.tsx
"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/Breadcrumb";

type AdminShellProps = {
  title?: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export default function AdminShell({
  title,
  subtitle,
  breadcrumb,
  actions,
  children,
}: AdminShellProps) {
  return (
    <div className="min-h-screen flex-1 min-w-0 bg-slate-50 dark:bg-slate-950">
      {/* Topbar */}
      <div className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/80">
        <div className="px-4 py-4 pl-24 sm:px-6 sm:pl-24 lg:px-10 lg:pl-10">
          {breadcrumb && breadcrumb.length > 0 && (
            <Breadcrumb items={breadcrumb} className="mb-2" />
          )}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              {title ? (
                <h1 className="text-xl font-extrabold leading-tight text-slate-900 dark:text-slate-50">
                  {title}
                </h1>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 break-words text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
              ) : null}
            </div>

            <div
              className={cn(
                "flex shrink-0 flex-wrap items-center gap-3",
                actions ? "w-full md:w-auto" : "hidden"
              )}
            >
              {actions}
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="overflow-x-hidden px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
        <div className="w-full max-w-[1200px] min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
