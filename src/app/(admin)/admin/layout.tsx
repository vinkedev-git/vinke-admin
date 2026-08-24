// src/app/(admin)/admin/layout.tsx
import { Toaster } from "sonner";
import AdminGuard from "@/components/AdminGuard";
import AdminSidebar from "@/components/AdminSidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
        <AdminSidebar />

        {/* "min-w-0" evita overflow/colagem em layouts flex */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>

      {/* Toast notifications */}
      <Toaster
        position="bottom-right"
        richColors
        toastOptions={{
          classNames: {
            toast: "rounded-2xl border font-semibold text-sm shadow-lg",
          },
        }}
      />
    </AdminGuard>
  );
}
