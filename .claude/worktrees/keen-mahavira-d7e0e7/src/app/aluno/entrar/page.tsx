import { Suspense } from "react";
import AlunoLoginClient from "./AlunoLoginClient";

export const dynamic = "force-dynamic";

export default function AlunoEntrarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
          Carregando...
        </div>
      }
    >
      <AlunoLoginClient />
    </Suspense>
  );
}