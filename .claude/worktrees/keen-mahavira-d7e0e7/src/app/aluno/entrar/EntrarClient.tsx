"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendSignInLinkToEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";

function mapErroToMessage(code: string) {
  switch (code) {
    case "link_invalido":
      return "Link inválido ou expirado. Solicite um novo acesso.";
    case "nao_autorizado":
      return "Você ainda não tem acesso. Verifique sua compra.";
    default:
      return "";
  }
}

export default function EntrarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const erro = searchParams.get("erro") || "";
  const erroMsg = useMemo(() => mapErroToMessage(erro), [erro]);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const onSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!mail) return;

    setLoading(true);
    try {
      // Action Code Settings (mágico)
      // ✅ Ajuste a URL para seu domínio final (Vercel)
      const actionCodeSettings = {
        url: `${window.location.origin}/aluno/confirmar`,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, mail, actionCodeSettings);

      // salva email pra confirmar depois
      window.localStorage.setItem("aluno_email_link", mail);

      alert("Enviamos um link de acesso no seu e-mail. ✅");
      router.replace("/aluno/entrar?ok=1");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Não foi possível enviar o link.";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-6 sm:px-6">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-5 sm:px-6">
          <div className="text-xl font-black text-slate-900">Anestesia Questões</div>
          <div className="mt-1 text-sm text-slate-500">Acesso do Aluno</div>
        </div>

        <form onSubmit={onSendLink} className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
          {erroMsg ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {erroMsg}
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
            Você vai receber um e-mail com um link para entrar.
          </div>
        </form>
      </div>
    </div>
  );
}
