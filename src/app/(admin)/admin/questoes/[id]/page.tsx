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
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";

export default function EditarQuestaoPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(createEmptyQuestionForm());
  const { dialog: confirmDialog, confirm } = useConfirm();

  useEffect(() => {
    if (!id) return;

    const loadQuestion = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "questionsBank", id));
        if (!snap.exists()) {
          toast.error("Questão não encontrada.");
          router.replace("/admin/questoes");
          return;
        }
        setForm(questionDocToForm(snap.data()));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível carregar a questão.");
        router.replace("/admin/questoes");
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
      breadcrumb={[
        { label: "Questões", href: "/admin/questoes" },
        { label: loading ? "..." : `#${id}` },
      ]}
    >
      {confirmDialog}

      {loading ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <Skeleton className="mb-4 h-5 w-40" />
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          </div>
        </div>
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
            const ok = await confirm({
              title: "Excluir esta questão?",
              description: `ID: ${id} — Essa ação não pode ser desfeita.`,
              confirmLabel: "Excluir",
              variant: "danger",
            });
            if (!ok) return;

            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("Sessão inválida. Faça login novamente.");

            const res = await fetch(`/api/admin/questions/${id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              throw new Error(data.error || "Não foi possível excluir a questão.");
            }
            toast.success("Questão excluída.");
            router.replace("/admin/questoes");
          }}
        />
      )}
    </AdminShell>
  );
}
