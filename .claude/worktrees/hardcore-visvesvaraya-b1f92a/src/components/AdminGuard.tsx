"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  // Evita setState depois de unmount
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        const isLoginRoute = pathname?.startsWith("/login") ?? false;

        // Se não está logado:
        if (!user) {
          if (isLoginRoute) {
            if (mountedRef.current) setLoading(false);
            return;
          }
          router.replace("/login");
          return;
        }

        // Verifica se é admin (users/{uid}.role === "admin")
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        const isAdmin = snap.exists() && snap.data()?.role === "admin";

        if (!isAdmin) {
          router.replace("/login?erro=acesso_negado");
          return;
        }

        // Se estiver no /login e já for admin -> manda pro painel
        if (isLoginRoute) {
          router.replace("/admin");
          return;
        }

        if (mountedRef.current) setLoading(false);
      } catch (e) {
        router.replace("/login?erro=verificacao_admin");
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
        Carregando painel…
      </div>
    );
  }

  return <>{children}</>;
}