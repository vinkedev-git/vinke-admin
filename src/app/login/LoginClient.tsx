"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { VinkeSymbol } from "@/components/VinkeLogo";

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
    <div className="min-h-screen bg-vinke-offwhite p-4 sm:p-6 dark:bg-vinke-navy">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_25px_80px_rgba(11,10,33,0.10)] md:grid-cols-[1.1fr_1fr] dark:border-white/10 dark:bg-[#131033]">
          <div className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-200/70 p-8 md:flex dark:border-white/10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_18%_0%,rgba(98,54,240,0.08),transparent_55%),radial-gradient(700px_circle_at_100%_85%,rgba(98,54,240,0.10),transparent_50%)]" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-3">
                <VinkeSymbol size={40} />
                <div>
                  <div className="font-display text-base font-bold tracking-[0.01em] text-slate-900 dark:text-white">
                    VINKE
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Painel Administrativo
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10">
              <h1 className="max-w-sm font-display text-3xl font-bold leading-tight text-slate-900 dark:text-white">
                Gestão completa da plataforma em um único painel.
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-300">
                Acompanhe alunos, simulados, assinaturas, questões e operação com
                controle centralizado.
              </p>
            </div>
          </div>

          <div className="p-5 sm:p-7 md:p-8">
            <div className="mb-5 flex items-center gap-3 md:hidden">
              <VinkeSymbol size={36} />
              <div>
                <div className="font-display text-lg font-bold tracking-[0.01em] text-slate-900 dark:text-white">
                  VINKE
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Painel Administrativo
                </div>
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[11px] font-bold tracking-[0.18em] text-vinke dark:text-violet-300">
                ACESSO ADMIN
              </div>
              <div className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
                Entrar no painel
              </div>
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
                  className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-vinke focus:ring-4 focus:ring-vinke/15 dark:border-white/15 dark:bg-[#0f0d29] dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-violet-400 dark:focus:ring-vinke/30"
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
                  className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-vinke focus:ring-4 focus:ring-vinke/15 dark:border-white/15 dark:bg-[#0f0d29] dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-violet-400 dark:focus:ring-vinke/30"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-vinke px-4 py-3 text-sm font-bold text-white shadow-[0_18px_40px_rgba(98,54,240,0.30)] transition hover:bg-vinke-deep disabled:opacity-60"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                Dica: o usuário precisa ter <b>role = &quot;admin&quot;</b> em <b>users/{`uid`}</b>.
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
