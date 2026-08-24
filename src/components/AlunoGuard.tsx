"use client";

import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { hasActiveEntitlement } from "@/lib/entitlementStatus";

export default function AlunoGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopHeartbeat = () => {
    if (!heartbeatRef.current) return;
    clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
  };

  const sendActivityPing = async (user: NonNullable<typeof auth.currentUser>) => {
    const token = await user.getIdToken();
    await fetch("/api/telemetry/activity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ client: "web" }),
    }).catch(() => undefined);
  };

  useEffect(() => {
    mountedRef.current = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        const isLogin = pathname?.startsWith("/aluno/entrar") ?? false;

        if (!user) {
          stopHeartbeat();
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

        const active = entSnap.exists() ? hasActiveEntitlement(entSnap.data()) : false;

        if (!active) {
          stopHeartbeat();
          router.replace("/aluno/entrar?erro=assinatura_inativa");
          return;
        }

        void sendActivityPing(user);
        stopHeartbeat();
        heartbeatRef.current = setInterval(() => {
          void sendActivityPing(user);
        }, 60_000);

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
      stopHeartbeat();
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
