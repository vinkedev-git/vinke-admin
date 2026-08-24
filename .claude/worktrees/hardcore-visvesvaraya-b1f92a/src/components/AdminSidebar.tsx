"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  LayoutDashboard, Users, FileText, BookOpen, Tags, Brain,
  AlertTriangle, FlaskConical, CreditCard, Receipt, Package,
  Image, Download, Banknote, ShieldCheck, Settings, LogOut,
  Sun, Moon, type LucideIcon,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { Button, buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { applyThemeMode, getStoredThemeMode, type ThemeMode } from "@/lib/themeClient";

function Item({
  href,
  label,
  icon: Icon,
  disabled = false,
  onNavigate,
}: {
  href?: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isDashboard = href === "/admin";

  const active = href && (isDashboard
    ? pathname === "/admin"
    : pathname?.startsWith(href));

  if (!href || disabled) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold cursor-not-allowed text-slate-400 dark:text-slate-600"
        aria-disabled="true"
      >
        <Icon size={16} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
        active
          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-[0_12px_30px_rgba(37,99,235,0.28)]"
          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white",
      )}
    >
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-600">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
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
      <div className="px-5 py-5 border-b border-slate-200/70 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 p-1.5 flex items-center justify-center shrink-0">
            <img
              src="/logo-icon.png"
              alt=""
              aria-hidden="true"
              className="h-full w-full rounded-xl object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-black text-slate-900 dark:text-slate-50">
              Anestesia Questões
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Painel Administrativo</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="h-0 min-h-0 flex-1 overflow-y-auto px-3 py-4 overscroll-contain [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
        <nav aria-label="Navegação principal">
          <Section title="Navegação">
            <Item href="/admin" label="Dashboard" icon={LayoutDashboard} onNavigate={handleNavigate} />
          </Section>

          <Section title="Gerenciamento">
            <Item href="/admin/alunos" label="Alunos" icon={Users} onNavigate={handleNavigate} />
            <Item href="/admin/provas" label="Provas" icon={FileText} onNavigate={handleNavigate} />
            <Item href="/admin/niveis" label="Níveis" icon={BookOpen} onNavigate={handleNavigate} />
            <Item href="/admin/temas" label="Temas" icon={Tags} onNavigate={handleNavigate} />
            <Item href="/admin/questoes" label="Questões" icon={Brain} onNavigate={handleNavigate} />
            <Item href="/admin/erros-reportados" label="Erros Reportados" icon={AlertTriangle} onNavigate={handleNavigate} />
            <Item href="/admin/simulados" label="Simulados" icon={FlaskConical} onNavigate={handleNavigate} />
          </Section>

          <Section title="Financeiro">
            <Item href="/admin/assinaturas" label="Assinaturas" icon={CreditCard} onNavigate={handleNavigate} />
            <Item href="/admin/faturas" label="Faturas" icon={Receipt} onNavigate={handleNavigate} />
            <Item href="/admin/planos" label="Planos" icon={Package} onNavigate={handleNavigate} />
          </Section>

          <Section title="CMS">
            <Item href="/admin/midias" label="Galeria de Mídias" icon={Image} onNavigate={handleNavigate} />
          </Section>

          <Section title="Sistema">
            <Item href="/admin/importador" label="Importador / Exportador" icon={Download} onNavigate={handleNavigate} />
            <Item href="/admin/pagamento" label="Pagamento" icon={Banknote} onNavigate={handleNavigate} />
            <Item href="/admin/administradores" label="Administradores" icon={ShieldCheck} onNavigate={handleNavigate} />
            <Item href="/admin/configuracoes" label="Configurações" icon={Settings} onNavigate={handleNavigate} />
          </Section>
        </nav>
      </div>

      {/* Footer */}
      <div className="mt-auto p-4 border-t border-slate-200/70 dark:border-slate-800">
        {/* Theme switcher */}
        <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-600">
            Tema
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onThemeChange("light")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition",
                themeMode === "light"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Sun size={12} aria-hidden="true" /> Claro
            </button>
            <button
              type="button"
              onClick={() => onThemeChange("dark")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition",
                themeMode === "dark"
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              )}
            >
              <Moon size={12} aria-hidden="true" /> Escuro
            </button>
          </div>
        </div>

        <Button
          onClick={handleLogout}
          variant="ghost"
          block
          className="justify-start gap-2 text-slate-600 dark:text-slate-400"
        >
          <LogOut size={15} aria-hidden="true" />
          Sair
        </Button>

        <div className="mt-3 text-[11px] text-slate-400 dark:text-slate-600">
          Versão Admin • ambiente local
        </div>
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
          "fixed left-4 z-[70] h-11 w-11 rounded-2xl p-0 shadow-sm lg:hidden",
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
          "fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-sm transition lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar mobile */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[65] flex w-[88vw] max-w-[300px] flex-col overflow-hidden border-r border-slate-200/70 bg-white shadow-2xl transition-transform lg:hidden dark:border-slate-800 dark:bg-slate-950",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Menu lateral"
      >
        {sidebarContent}
      </aside>

      {/* Sidebar desktop */}
      <aside
        className="hidden h-[100dvh] min-h-0 w-[280px] shrink-0 overflow-hidden border-r border-slate-200/70 bg-white sticky top-0 lg:flex lg:flex-col dark:border-slate-800 dark:bg-slate-950"
        aria-label="Menu lateral"
      >
        {sidebarContent}
      </aside>
    </>
  );
}
