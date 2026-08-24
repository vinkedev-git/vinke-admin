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
    <div className="flex min-h-screen items-center justify-center bg-vinke-offwhite p-4 dark:bg-vinke-navy">
      <div className="w-full max-w-[340px] rounded-[18px] bg-white p-8 shadow-[0_16px_48px_rgba(11,10,33,0.08)] dark:bg-vinke-navy-card dark:shadow-[0_16px_48px_rgba(0,0,0,0.4)]">
        <div className="mb-6 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <VinkeSymbol size={26} />
            <span className="font-display text-2xl font-bold tracking-[0.01em] text-vinke-ink dark:text-white">
              VINKE
            </span>
          </div>
          <span className="text-[10px] font-semibold tracking-[0.2em] text-vinke-ink3">
            ADMINISTRAÇÃO
          </span>
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
            <div className="mb-1.5 text-[11px] font-bold text-vinke-ink dark:text-slate-200">E-mail</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="seuemail@dominio.com"
              className="w-full rounded-[9px] border-[1.5px] border-vinke-line bg-white px-3.5 py-[11px] text-[13px] font-medium text-vinke-ink outline-none transition placeholder:text-vinke-ink3 focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-vinke-lav dark:focus:ring-vinke/30"
            />
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-bold text-vinke-ink dark:text-slate-200">Senha</div>
            <input
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Digite sua senha"
              className="w-full rounded-[9px] border-[1.5px] border-vinke-line bg-white px-3.5 py-[11px] text-[13px] font-medium text-vinke-ink outline-none transition placeholder:text-vinke-ink3 focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-vinke-lav dark:focus:ring-vinke/30"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[9px] bg-vinke p-[13px] text-[13px] font-bold text-white transition hover:bg-vinke-deep disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="text-center text-[11px] font-semibold text-vinke">
            Esqueci minha senha
          </div>
        </form>
      </div>
    </div>
  );
}
