import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Anestesia Questões",
  description: "Painel administrativo e área do aluno do Anestesia Questões",
  icons: {
    icon: [{ url: "/logo-icon.png", type: "image/png" }],
    shortcut: "/logo-icon.png",
    apple: "/logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeInitScript = `
    (function () {
      try {
        var stored = localStorage.getItem("aq-theme");
        var mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
        var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        var effective = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
        var root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(effective);
        root.setAttribute("data-theme", mode);
      } catch (e) {}
    })();
  `;

  return (
    <html lang="pt-BR" data-theme="system">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
