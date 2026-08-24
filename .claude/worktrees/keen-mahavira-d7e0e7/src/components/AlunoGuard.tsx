"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";

export default function AlunoGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        const isLogin = pathname?.startsWith("/aluno/entrar") ?? false;

        if (!user) {
          if (isLogin) {
            if (mountedRef.current) setLoading(false);
            return;
          }
          router.replace("/aluno/entrar");
          return;
        }

        // entitlement por UID
        const entRef = doc(db, "entitlements", user.uid);
        const entSnap = await getDoc(entRef);

        const active = entSnap.exists() ? entSnap.data()?.active === true : false;

        if (!active) {
          router.replace("/aluno/entrar?erro=assinatura_inativa");
          return;
        }

        if (isLogin) {
          router.replace("/aluno");
          return;
        }

        if (mountedRef.current) setLoading(false);
      } catch {
        router.replace("/aluno/entrar?erro=verificacao_entitlement");
      }
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
        Carregando área do aluno…
      </div>
    );
  }

  return <>{children}</>;
}