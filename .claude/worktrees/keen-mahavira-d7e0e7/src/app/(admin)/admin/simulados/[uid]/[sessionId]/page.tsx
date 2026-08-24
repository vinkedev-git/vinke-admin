"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { buttonStyles } from "@/components/ui/Button";
import { auth } from "@/lib/firebase";

type DetailedQuestion = {
  questionId: string;
  prompt: string;
  selectedOptionId: string;
  correctOptionId: string;
  isCorrect: boolean | null;
  answered: boolean;
};

type SimuladoDetails = {
  uid: string;
  sessionId: string;
  code: string;
  createdAt: string;
  endedAt: string;
  aluno: string;
  nota: number;
  status: "pendente" | "concluido";
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  questions: DetailedQuestion[];
};

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">
        {value || "—"}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SimuladoDetails["status"] }) {
  const cls =
    status === "concluido"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-sky-100 text-sky-700";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase ${cls}`}>
      {status === "concluido" ? "concluído" : "pendente"}
    </span>
  );
}

export default function SimuladoDetalhePage({
  params,
}: {
  params: Promise<{ uid: string; sessionId: string }>;
}) {
  const [details, setDetails] = useState<SimuladoDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const { uid, sessionId } = await params;
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Sessão inválida. Faça login novamente.");

        const res = await fetch(`/api/admin/simulados/${uid}/${sessionId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          simulado?: SimuladoDetails;
        };

        if (!res.ok || !data.ok || !data.simulado) {
          throw new Error(data.error || "Não foi possível carregar o simulado.");
        }

        if (active) setDetails(data.simulado);
      } catch (error) {
        if (active) {
          setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar o simulado.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [params]);

  return (
    <AdminShell
      title="Detalhes do Simulado"
      subtitle="Acompanhe o desempenho do aluno e o andamento das respostas."
      actions={
        <Link href="/admin/simulados" className={buttonStyles({ variant: "secondary" })}>
          Voltar
        </Link>
      }
    >
      {errorMsg ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {errorMsg}
        </div>
      ) : null}

      {!errorMsg && !details && loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-5 py-10 text-sm text-slate-500 shadow-sm">
          Carregando simulado...
        </div>
      ) : null}

      {details ? (
        <div className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
              <div className="text-2xl font-black text-slate-900">Resumo</div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-3">
              <InfoField label="Cód." value={details.code} />
              <InfoField label="Criado em" value={details.createdAt} />
              <InfoField label="Encerrado em" value={details.endedAt} />
              <InfoField label="Aluno" value={details.aluno} />
              <InfoField label="Nota" value={`${details.nota.toFixed(1)}%`} />
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Status
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <StatusBadge status={details.status} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Questões
              </div>
              <div className="mt-2 text-3xl font-black text-slate-900">{details.totalQuestions}</div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Respondidas
              </div>
              <div className="mt-2 text-3xl font-black text-slate-900">{details.answeredCount}</div>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Corretas
              </div>
              <div className="mt-2 text-3xl font-black text-slate-900">{details.correctCount}</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
              <div className="text-2xl font-black text-slate-900">Questões</div>
            </div>

            <div className="space-y-3 p-5">
              {details.questions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhuma questão vinculada a este simulado.
                </div>
              ) : null}

              {details.questions.map((question, index) => (
                <details
                  key={`${question.questionId}-${index}`}
                  className="overflow-hidden rounded-2xl border border-slate-200"
                >
                  <summary className="cursor-pointer list-none bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 marker:hidden">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-xs font-bold text-slate-600">
                          {index + 1}
                        </span>
                        <span>{question.prompt}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                          {question.answered ? "respondida" : "sem resposta"}
                        </span>
                        {question.isCorrect === true ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                            correta
                          </span>
                        ) : null}
                        {question.isCorrect === false ? (
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700">
                            incorreta
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </summary>

                  <div className="grid gap-3 border-t border-slate-200 p-4 md:grid-cols-3">
                    <InfoField label="ID" value={question.questionId} />
                    <InfoField label="Resposta do aluno" value={question.selectedOptionId || "—"} />
                    <InfoField label="Alternativa correta" value={question.correctOptionId || "—"} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
