"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { applyThemeMode, getStoredThemeMode, type ThemeMode } from "@/lib/themeClient";

export default function ThemeSettingsCard() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const stored = getStoredThemeMode();
    setMode(stored);
    applyThemeMode(stored);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (mode === "system") applyThemeMode("system");
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [mode]);

  const setTheme = (next: ThemeMode) => {
    setMode(next);
    applyThemeMode(next);
  };

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
        <div className="text-2xl font-black text-slate-900">Aparência</div>
      </div>
      <div className="p-5">
        <div className="mb-4 text-sm text-slate-500">
          Escolha como o dashboard deve aparecer para este navegador.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === "light" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTheme("light")}
          >
            Claro
          </Button>
          <Button
            variant={mode === "dark" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTheme("dark")}
          >
            Escuro
          </Button>
          <Button
            variant={mode === "system" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTheme("system")}
          >
            Sistema
          </Button>
        </div>
      </div>
    </div>
  );
}
