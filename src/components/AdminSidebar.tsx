"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { Sun, Moon, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import { buttonStyles } from "@/components/ui/Button";
import { VinkeSymbol } from "@/components/VinkeLogo";
import { cn } from "@/lib/cn";
import { applyThemeMode, getStoredThemeMode, type ThemeMode } from "@/lib/themeClient";

function Item({
  href,
  label,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  badge?: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isDashboard = href === "/admin";

  const active = isDashboard ? pathname === "/admin" : pathname?.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-[9px] px-3 py-[7px] text-xs font-semibold transition",
        active
          ? "bg-vinke font-bold text-white"
          : "text-[#B7B3CC] hover:bg-white/5 hover:text-white",
      )}
    >
      <span className="truncate">{label}</span>
      {badge}
    </Link>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 pb-0.5 pt-2.5 text-[9px] font-bold tracking-[0.14em] text-[#4E4A6B]">
      {children}
    </span>
  );
}

export default function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = getStoredThemeMode();
      setThemeMode(stored);
      applyThemeMode(stored);
    }
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setMobileOpen(false);
    router.replace("/login");
  };

  const handleNavigate = () => {
    onNavigate?.();
    setMobileOpen(false);
  };

  const onThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyThemeMode(mode);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <VinkeSymbol size={19} className="text-white" />
        <span className="font-display text-base font-bold tracking-[0.01em] text-white">
          VINKE
        </span>
        <span className="mt-[3px] text-[8px] font-semibold tracking-[0.16em] text-vinke-ink3">
          ADMIN
        </span>
      </div>

      {/* Nav */}
      <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
        <nav aria-label="Navegação principal" className="flex flex-col gap-[3px]">
          <Item href="/admin" label="Visão geral" onNavigate={handleNavigate} />

          <GroupLabel>CONTEÚDO</GroupLabel>
          <Item href="/admin/questoes" label="Questões" onNavigate={handleNavigate} />
          <Item href="/admin/provas" label="Provas ENEM" onNavigate={handleNavigate} />
          <Item href="/admin/taxonomia" label="Taxonomia" onNavigate={handleNavigate} />
          <Item href="/admin/simulados" label="Simulados" onNavigate={handleNavigate} />
          <Item href="/admin/flashcards" label="Flashcards" onNavigate={handleNavigate} />
          <Item href="/admin/midias" label="Mídias" onNavigate={handleNavigate} />
          <Item href="/admin/importador" label="Importador" onNavigate={handleNavigate} />

          <GroupLabel>PESSOAS</GroupLabel>
          <Item href="/admin/alunos" label="Alunos" onNavigate={handleNavigate} />
          <Item href="/admin/administradores" label="Administradores" onNavigate={handleNavigate} />

          <GroupLabel>RECEITA</GroupLabel>
          <Item href="/admin/planos" label="Planos" onNavigate={handleNavigate} />
          <Item href="/admin/assinaturas" label="Assinaturas" onNavigate={handleNavigate} />
          <Item href="/admin/faturas" label="Faturas" onNavigate={handleNavigate} />

          <GroupLabel>QUALIDADE</GroupLabel>
          <Item href="/admin/erros-reportados" label="Erros reportados" onNavigate={handleNavigate} />
          <Item href="/admin/configuracoes" label="Configurações" onNavigate={handleNavigate} />
        </nav>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-[#1D1A3A] px-4 py-3">
        <div className="mb-2 flex gap-1 rounded-[9px] bg-white/5 p-1">
          <button
            type="button"
            onClick={() => onThemeChange("light")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 py-1.5 text-[11px] font-bold transition",
              themeMode === "light" ? "bg-white text-vinke-ink" : "text-[#B7B3CC] hover:text-white"
            )}
          >
            <Sun size={11} aria-hidden="true" /> Claro
          </button>
          <button
            type="button"
            onClick={() => onThemeChange("dark")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 py-1.5 text-[11px] font-bold transition",
              themeMode === "dark" ? "bg-vinke text-white" : "text-[#B7B3CC] hover:text-white"
            )}
          >
            <Moon size={11} aria-hidden="true" /> Escuro
          </button>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-[9px] px-3 py-2 text-xs font-semibold text-[#B7B3CC] transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={13} aria-hidden="true" />
          Sair
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Hamburguer mobile */}
      <button
        type="button"
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        onClick={() => setMobileOpen((prev) => !prev)}
        className={cn(
          buttonStyles({ variant: "secondary", size: "sm" }),
          "fixed left-4 z-[70] h-11 w-11 rounded-[10px] p-0 shadow-sm lg:hidden",
          "top-[calc(env(safe-area-inset-top)+0.9rem)]"
        )}
      >
        <span className="flex flex-col items-center justify-center gap-1.5" aria-hidden="true">
          <span className={cn("block h-0.5 w-5 rounded-full bg-current transition", mobileOpen && "translate-y-2 rotate-45")} />
          <span className={cn("block h-0.5 w-5 rounded-full bg-current transition", mobileOpen && "opacity-0")} />
          <span className={cn("block h-0.5 w-5 rounded-full bg-current transition", mobileOpen && "-translate-y-2 -rotate-45")} />
        </span>
      </button>

      {/* Overlay mobile */}
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-vinke-navy/40 backdrop-blur-sm transition lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar mobile */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[65] flex w-[88vw] max-w-[280px] flex-col overflow-hidden bg-vinke-navy shadow-2xl transition-transform lg:hidden dark:bg-vinke-navy-deep",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Menu lateral"
      >
        {sidebarContent}
      </aside>

      {/* Sidebar desktop */}
      <aside
        className="sticky top-0 hidden h-[100dvh] min-h-0 w-[216px] shrink-0 flex-col overflow-hidden bg-vinke-navy lg:flex dark:bg-vinke-navy-deep"
        aria-label="Menu lateral"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
