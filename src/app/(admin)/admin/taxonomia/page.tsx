"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/apiClient";
import { buttonStyles } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type TaxNode = {
  id: string;
  tipo: "area" | "disciplina" | "assunto";
  nome: string;
  sigla?: string;
  areaId?: string;
  disciplinaId?: string;
  ordem?: number;
  ativo?: boolean;
};

export default function TaxonomiaPage() {
  const [items, setItems] = useState<TaxNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openAreas, setOpenAreas] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.get<{ items: TaxNode[] }>("/api/admin/taxonomia");
      setItems(data.items);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const areas = useMemo(
    () =>
      items
        .filter((i) => i.tipo === "area")
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
    [items]
  );

  const disciplinasDa = (areaId: string) =>
    items
      .filter((i) => i.tipo === "disciplina" && i.areaId === areaId)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome));

  const assuntosDe = (disciplinaId: string) =>
    items
      .filter((i) => i.tipo === "assunto" && i.disciplinaId === disciplinaId)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome));

  const countAssuntosArea = (areaId: string) =>
    items.filter((i) => i.tipo === "assunto" && i.areaId === areaId).length;

  const toggleArea = (id: string) =>
    setOpenAreas((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-[900px] px-4 py-6 pl-20 sm:px-6 lg:pl-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-[22px] font-bold text-vinke-ink dark:text-white">
              Taxonomia
            </h1>
            <div className="text-xs font-medium text-vinke-ink3">
              áreas, disciplinas e assuntos do ENEM — a classificação de cada questão do banco
            </div>
          </div>
        </div>

        {errorMsg ? (
          <div className="mt-4 flex flex-col gap-1.5 rounded-[12px] bg-vinke-red-soft p-4 dark:bg-vinke-red/10">
            <span className="font-display text-[13px] font-bold text-vinke-red dark:text-vinke-red-dark">
              Não foi possível carregar
            </span>
            <span className="text-xs font-medium text-vinke-ink2 dark:text-slate-300">{errorMsg}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-1 self-start rounded-[8px] border-[1.5px] border-vinke-red px-3 py-1.5 text-[11px] font-bold text-vinke-red"
            >
              Tentar novamente
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 flex flex-col gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-[13px] bg-white dark:bg-vinke-navy-card"
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2.5">
            {areas.map((area) => {
              const open = openAreas[area.id] ?? false;
              const discs = disciplinasDa(area.id);
              return (
                <div
                  key={area.id}
                  className="rounded-[13px] bg-white px-4 py-3.5 dark:border dark:border-vinke-navy-line dark:bg-vinke-navy-card"
                >
                  <button
                    type="button"
                    onClick={() => toggleArea(area.id)}
                    className="flex w-full items-center gap-2.5 text-left"
                  >
                    {open ? (
                      <ChevronDown size={16} className="shrink-0 text-vinke-ink3" />
                    ) : (
                      <ChevronRight size={16} className="shrink-0 text-vinke-ink3" />
                    )}
                    <span className="font-display text-sm font-bold text-vinke-ink dark:text-white">
                      {area.nome}
                    </span>
                    <span className="rounded-full bg-vinke-soft px-2 py-0.5 text-[10px] font-bold text-vinke dark:bg-vinke/15 dark:text-vinke-lav">
                      {discs.length} disciplinas · {countAssuntosArea(area.id)} assuntos
                    </span>
                  </button>

                  {open ? (
                    <div className="ml-[7px] mt-2.5 flex flex-col gap-3 border-l-2 border-vinke-line2 pl-4 dark:border-vinke-navy-line">
                      {discs.map((disc) => (
                        <DisciplinaBlock
                          key={disc.id}
                          disc={disc}
                          areaId={area.id}
                          assuntos={assuntosDe(disc.id)}
                          onChanged={load}
                        />
                      ))}
                      <AddInline
                        placeholder="nova disciplina…"
                        label="+ disciplina"
                        onSubmit={async (nome) => {
                          await api.post("/api/admin/taxonomia", {
                            tipo: "disciplina",
                            nome,
                            areaId: area.id,
                          });
                          toast.success(`Disciplina "${nome}" criada`);
                          await load();
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 text-[11px] leading-relaxed text-vinke-ink4">
          As 4 áreas são a estrutura oficial do ENEM e não podem ser excluídas. Assuntos são
          livres — organize como fizer sentido para o conteúdo. Competências e habilidades da
          matriz do INEP serão adicionadas na próxima etapa, como etiqueta das questões.
        </div>
      </div>
    </div>
  );
}

function DisciplinaBlock({
  disc,
  areaId,
  assuntos,
  onChanged,
}: {
  disc: { id: string; nome: string };
  areaId: string;
  assuntos: { id: string; nome: string }[];
  onChanged: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-vinke-ink dark:text-slate-100">{disc.nome}</span>
        <span className="text-[11px] font-medium text-vinke-ink3">· {assuntos.length}</span>
        <NodeActions
          id={disc.id}
          nome={disc.nome}
          kind="disciplina"
          onChanged={onChanged}
          deletable={assuntos.length === 0}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {assuntos.map((a) => (
          <AssuntoChip key={a.id} id={a.id} nome={a.nome} onChanged={onChanged} />
        ))}
        <AddInline
          compact
          placeholder="novo assunto…"
          label="+ assunto"
          onSubmit={async (nome) => {
            await api.post("/api/admin/taxonomia", {
              tipo: "assunto",
              nome,
              areaId,
              disciplinaId: disc.id,
            });
            toast.success(`Assunto "${nome}" criado`);
            await onChanged();
          }}
        />
      </div>
    </div>
  );
}

function AssuntoChip({
  id,
  nome,
  onChanged,
}: {
  id: string;
  nome: string;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(nome);
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    const next = value.trim();
    if (!next || next === nome) {
      setEditing(false);
      setValue(nome);
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/api/admin/taxonomia/${id}`, { nome: next });
      toast.success("Assunto renomeado");
      setEditing(false);
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao renomear");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Excluir o assunto "${nome}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/taxonomia/${id}`);
      toast.success("Assunto excluído");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-vinke bg-white py-0.5 pl-2.5 pr-1 dark:bg-vinke-navy">
        <input
          autoFocus
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void rename();
            if (e.key === "Escape") {
              setEditing(false);
              setValue(nome);
            }
          }}
          onBlur={() => void rename()}
          className="w-40 bg-transparent text-[11px] font-semibold text-vinke-ink outline-none dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(nome);
          }}
          className="text-vinke-ink3"
        >
          <X size={11} />
        </button>
      </span>
    );
  }

  return (
    <span className="group inline-flex items-center gap-1 rounded-full bg-vinke-offwhite py-1 pl-3 pr-1.5 text-[11px] font-semibold text-vinke-ink2 dark:bg-vinke-navy dark:text-slate-300">
      {nome}
      <span className="hidden items-center gap-0.5 group-hover:inline-flex">
        <button
          type="button"
          title="Renomear"
          onClick={() => setEditing(true)}
          className="rounded p-0.5 text-vinke-ink3 hover:text-vinke"
        >
          <Pencil size={10} />
        </button>
        <button
          type="button"
          title="Excluir"
          onClick={() => void remove()}
          className="rounded p-0.5 text-vinke-ink3 hover:text-vinke-red"
        >
          <Trash2 size={10} />
        </button>
      </span>
    </span>
  );
}

function NodeActions({
  id,
  nome,
  kind,
  deletable,
  onChanged,
}: {
  id: string;
  nome: string;
  kind: "disciplina";
  deletable: boolean;
  onChanged: () => Promise<void>;
}) {
  const rename = async () => {
    const next = window.prompt(`Renomear ${kind}:`, nome)?.trim();
    if (!next || next === nome) return;
    try {
      await api.patch(`/api/admin/taxonomia/${id}`, { nome: next });
      toast.success("Renomeado");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao renomear");
    }
  };

  const remove = async () => {
    if (!window.confirm(`Excluir a ${kind} "${nome}"?`)) return;
    try {
      await api.delete(`/api/admin/taxonomia/${id}`);
      toast.success("Excluído");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir");
    }
  };

  return (
    <span className="ml-1 inline-flex items-center gap-0.5">
      <button
        type="button"
        title="Renomear"
        onClick={() => void rename()}
        className="rounded p-0.5 text-vinke-ink4 hover:text-vinke"
      >
        <Pencil size={11} />
      </button>
      {deletable ? (
        <button
          type="button"
          title="Excluir"
          onClick={() => void remove()}
          className="rounded p-0.5 text-vinke-ink4 hover:text-vinke-red"
        >
          <Trash2 size={11} />
        </button>
      ) : null}
    </span>
  );
}

function AddInline({
  placeholder,
  label,
  compact,
  onSubmit,
}: {
  placeholder: string;
  label: string;
  compact?: boolean;
  onSubmit: (nome: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const nome = value.trim();
    if (!nome) return;
    setBusy(true);
    try {
      await onSubmit(nome);
      setValue("");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "font-bold text-vinke transition hover:text-vinke-deep dark:text-vinke-lav",
          compact
            ? "rounded-full border-[1.5px] border-dashed border-vinke-line px-3 py-0.5 text-[11px] dark:border-vinke-navy-line"
            : "self-start text-[11px]"
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        compact
          ? "rounded-full border-[1.5px] border-vinke bg-white py-0.5 pl-2.5 pr-1 dark:bg-vinke-navy"
          : "rounded-[9px] border-[1.5px] border-vinke bg-white px-2 py-1 dark:bg-vinke-navy"
      )}
    >
      <input
        autoFocus
        value={value}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") {
            setOpen(false);
            setValue("");
          }
        }}
        className="w-44 bg-transparent text-[11px] font-semibold text-vinke-ink outline-none placeholder:text-vinke-ink3 dark:text-slate-100"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className={cn(buttonStyles({ variant: "primary", size: "sm" }), "min-h-0 rounded-full px-2 py-0.5 text-[10px]")}
      >
        <Plus size={10} /> criar
      </button>
    </span>
  );
}
