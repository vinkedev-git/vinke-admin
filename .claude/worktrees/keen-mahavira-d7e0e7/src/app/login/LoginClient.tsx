"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

function mapErroToMessage(code: string) {
  switch (code) {
    case "acesso_negado":
      return "Acesso negado. Sua conta não tem permissão de admin.";
    case "verificacao_admin":
      return "Falha ao verificar permissões de admin. Tente novamente.";
    default:
      return "";
  }
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const erro = searchParams.get("erro") || "";
  const erroMsg = useMemo(() => mapErroToMessage(erro), [erro]);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState("");

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !senha.trim()) return;
    setUiError("");

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      router.replace("/admin");
    } catch (err: unknown) {
      const authError = err as { code?: string; message?: string };
      const msg =
        authError?.code === "auth/invalid-credential"
          ? "E-mail ou senha inválidos."
          : authError?.message || "Não foi possível fazer login.";
      setUiError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_0%,rgba(56,189,248,0.16),transparent_45%),radial-gradient(1000px_circle_at_100%_20%,rgba(37,99,235,0.20),transparent_42%),linear-gradient(180deg,#020817_0%,#071235_100%)] p-4 sm:p-6">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-blue-200/15 bg-white/95 shadow-[0_25px_80px_rgba(2,6,23,0.45)] backdrop-blur md:grid-cols-[1.1fr_1fr] dark:border-blue-300/20 dark:bg-[#020b23]/90">
          <div className="relative hidden flex-col justify-between overflow-hidden border-r border-blue-200/20 p-8 md:flex dark:border-blue-300/15">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_0%,rgba(56,189,248,0.23),transparent_55%),radial-gradient(700px_circle_at_100%_80%,rgba(37,99,235,0.26),transparent_50%)]" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-blue-200/30 bg-white/85 px-4 py-3 dark:border-blue-300/20 dark:bg-[#081937]/80">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#071a3f]">
                  <Image src="/logo-icon.png" alt="Logo Anestesia Questões" width={38} height={38} className="h-9 w-9 object-contain" />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">Anestesia Questões</div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Painel Administrativo</div>
                </div>
              </div>
            </div>

            <div className="relative z-10">
              <h1 className="max-w-sm text-3xl font-black leading-tight text-slate-900 dark:text-slate-100">
                Gestão completa da plataforma em um único painel.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300">
                Acompanhe alunos, simulados, assinaturas, questões e operação com controle centralizado.
              </p>
            </div>
          </div>

          <div className="p-5 sm:p-7 md:p-8">
            <div className="mb-5 flex items-center gap-3 md:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200/30 bg-[#071a3f]">
                <Image src="/logo-icon.png" alt="Logo Anestesia Questões" width={38} height={38} className="h-9 w-9 object-contain" />
              </div>
              <div>
                <div className="text-lg font-black text-slate-900 dark:text-slate-100">Anestesia Questões</div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Painel Administrativo</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[11px] font-bold tracking-[0.18em] text-slate-500 dark:text-slate-400">ACESSO ADMIN</div>
              <div className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">Entrar no painel</div>
            </div>

            <form onSubmit={onLogin} className="space-y-4">
              {erroMsg ? (
                <div className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                  {erroMsg}
                </div>
              ) : null}

              {uiError ? (
                <div className="rounded-2xl border border-rose-300/60 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">
                  {uiError}
                </div>
              ) : null}

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">E-mail</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="seuemail@dominio.com"
                  className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/40 dark:border-slate-600 dark:bg-[#0a1737] dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-blue-400 dark:focus:ring-blue-500/30"
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">Senha</div>
                <input
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-200/40 dark:border-slate-600 dark:bg-[#0a1737] dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-blue-400 dark:focus:ring-blue-500/30"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700/80 dark:bg-[#0a1737]/65 dark:text-slate-300">
                Dica: o usuário precisa ter <b>role = &quot;admin&quot;</b> em <b>users/{`uid`}</b>.
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
