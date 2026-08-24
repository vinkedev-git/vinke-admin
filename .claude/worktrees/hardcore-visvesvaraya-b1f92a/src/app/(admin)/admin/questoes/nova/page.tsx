"use client";

import AdminShell from "@/components/AdminShell";
import {
  QuestionEditorForm,
  createEmptyQuestionForm,
} from "@/components/admin/QuestionEditorForm";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function NovaQuestaoPage() {
  const router = useRouter();

  return (
    <AdminShell
      title="Nova questão"
      subtitle="Criar nova questão no questionsBank"
    >
      <QuestionEditorForm
        mode="create"
        initialValue={createEmptyQuestionForm()}
        onCancel={() => router.push("/admin/questoes")}
        onSubmit={async (payload) => {
          const token = await auth.currentUser?.getIdToken();
          if (!token) throw new Error("Sessão inválida. Faça login novamente.");

          const res = await fetch("/api/admin/questions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "Não foi possível criar a questão.");
          }
          router.push("/admin/questoes");
        }}
      />
    </AdminShell>
  );
}
