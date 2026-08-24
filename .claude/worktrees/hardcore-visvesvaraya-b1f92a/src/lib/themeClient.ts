"use client";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "aq-theme";

export function getStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function getEffectiveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

export function applyThemeMode(mode: ThemeMode) {
  const effective = getEffectiveTheme(mode);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(effective);
  root.setAttribute("data-theme", mode);
  localStorage.setItem(STORAGE_KEY, mode);
}
