"use client";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function AlunoAppPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/aluno/entrar");
        return;
      }
      const entSnap = await getDoc(doc(db, "entitlements", u.uid));
      const active = entSnap.exists() && entSnap.data()?.active === true;

      if (!active) {
        router.replace("/aluno/entrar?msg=sem_acesso");
        return;
      }

      setEmail(u.email || "");
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xl font-black text-slate-900">Área do Aluno</div>
            <div className="truncate text-sm text-slate-500">{email}</div>
          </div>
          <Button
            onClick={async () => {
              await signOut(auth);
              router.replace("/aluno/entrar");
            }}
            variant="secondary"
            size="sm"
          >
            Sair
          </Button>
        </div>

        <div className="mt-6 rounded-2xl border bg-slate-50 p-5 text-sm text-slate-700">
          ✅ Acesso ativo. Próximo passo: aqui a gente coloca o app do aluno (questões, simulados etc).
        </div>
      </div>
    </div>
  );
}
