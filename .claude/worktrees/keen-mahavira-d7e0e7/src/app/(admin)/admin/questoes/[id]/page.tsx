"use client";

import AdminShell from "@/components/AdminShell";
import {
  QuestionEditorForm,
  createEmptyQuestionForm,
  questionDocToForm,
} from "@/components/admin/QuestionEditorForm";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EditarQuestaoPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(createEmptyQuestionForm());

  useEffect(() => {
    if (!id) return;

    const loadQuestion = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "questionsBank", id));
        if (!snap.exists()) {
          alert("Questão não encontrada.");
          router.replace("/admin/questoes");
          return;
        }

        setForm(questionDocToForm(snap.data()));
      } finally {
        setLoading(false);
      }
    };

    void loadQuestion();
  }, [id, router]);

  return (
    <AdminShell
      title="Editar questão"
      subtitle={loading ? "Carregando..." : `questionsBank/${id}`}
    >
      {loading ? (
        <div className="rounded-2xl border bg-white p-6 text-sm text-slate-600">Carregando...</div>
      ) : (
        <QuestionEditorForm
          mode="edit"
          initialValue={form}
          onCancel={() => router.push("/admin/questoes")}
          onSubmit={async (payload) => {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("Sessão inválida. Faça login novamente.");

            const res = await fetch(`/api/admin/questions/${id}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(payload),
            });
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              throw new Error(data.error || "Não foi possível salvar a questão.");
            }
          }}
          onDelete={async () => {
            if (!confirm("Tem certeza que deseja excluir esta questão?")) return;
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("Sessão inválida. Faça login novamente.");

            const res = await fetch(`/api/admin/questions/${id}`, {
              method: "DELETE",
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              throw new Error(data.error || "Não foi possível excluir a questão.");
            }
            router.replace("/admin/questoes");
          }}
        />
      )}
    </AdminShell>
  );
}
