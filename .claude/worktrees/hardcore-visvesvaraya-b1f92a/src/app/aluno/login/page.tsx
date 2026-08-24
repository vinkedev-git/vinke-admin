// src/app/aluno/login/page.tsx
"use client";

import { sendSignInLinkToEmail } from "firebase/auth";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";

const APP_URL = "https://anestesia-questoes-admin.vercel.app";

export default function AlunoLoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim().toLowerCase();
    if (!em) return;

    setLoading(true);
    try {
      const actionCodeSettings = {
        url: `${APP_URL}/aluno/entrar`,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, em, actionCodeSettings);
      localStorage.setItem("aq_magic_email", em);
      setSent(true);
    } catch {
      alert("Não foi possível enviar o link. Verifique o Firebase Auth e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-6 sm:px-6">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-5 sm:px-6">
          <div className="text-xl font-black text-slate-900">Anestesia Questões</div>
          <div className="mt-1 text-sm text-slate-500">Acesso do Aluno (link mágico)</div>
        </div>

        <form onSubmit={onSend} className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
          {sent ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Link enviado! Confira seu e-mail e clique para entrar.
            </div>
          ) : null}

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">E-mail</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="seuemail@..."
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <Button type="submit" disabled={loading} variant="primary" block>
            {loading ? "Enviando..." : "Enviar link de acesso"}
          </Button>

          <div className="text-xs text-slate-500">
            Se você comprou pela Eduzz, o acesso será liberado automaticamente após confirmação de pagamento.
          </div>
        </form>
      </div>
    </div>
  );
}
