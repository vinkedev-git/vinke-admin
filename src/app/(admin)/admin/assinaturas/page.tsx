"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, CreditCard } from "lucide-react";
import AdminShell from "@/components/AdminShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { StatusBadge, statusLabel } from "@/components/ui/StatusBadge";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/apiClient";
import { cn } from "@/lib/cn";

type AssinaturaItem = {
  uid: string;
  aluno: string;
  email: string;
  origem: string;
  plano: string;
  planoOrigem: "catalogo" | "eduzz" | "manual" | "sem-plano";
  status: "ativo" | "pendente" | "inativo" | "vencido";
  validade: string;
  planId: string;
  productId: string;
  productTitle: string;
  invoiceStatus: string;
  amountPaid: number | null;
  validUntilRaw: string;
};

type AssinaturaItemWithSort = AssinaturaItem & {
  sortSeconds: number;
};

type FaturaItem = {
  uid: string;
  aluno: string;
  email: string;
  total: number | null;
  createdAt: string;
  status: string;
  productTitle: string;
};

type Tab = "assinaturas" | "faturas";

function planoOrigemLabel(origem: AssinaturaItem["planoOrigem"]) {
  if (origem === "catalogo") return "Catálogo";
  if (origem === "eduzz") return "Eduzz";
  if (origem === "manual") return "Manual";
  return "Sem plano";
}

function formatMoney(value: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// ─── Nova assinatura modal ────────────────────────────────────────────────────

function NovaAssinaturaModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<{ uid: string; name: string; email: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const search = async () => {
    const q = value.trim();
    if (!q) return;
    setSearching(true);
    setFound(null);
    setNotFound(false);
    try {
      const data = await api.get<{ items?: Array<{ uid: string; name?: string; email?: string }> }>(
        `/api/admin/alunos?search=${encodeURIComponent(q)}`
      );
      const rows = Array.isArray(data.items) ? data.items : [];
      if (rows.length > 0) {
        const first = rows[0]!;
        setFound({
          uid: first.uid,
          name: String(first.name ?? "").trim() || "Sem nome",
          email: String(first.email ?? "").trim() || "—",
        });
      } else {
        setNotFound(true);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao buscar aluno.");
    } finally {
      setSearching(false);
    }
  };

  const goToSubscription = () => {
    if (found) router.push(`/admin/assinaturas/${found.uid}`);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-vinke-navy/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-[14px] border border-vinke-line bg-white p-6 shadow-[0_16px_40px_rgba(11,10,33,0.12)] dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <div className="mb-5">
          <div className="font-display text-base font-bold text-vinke-ink dark:text-slate-100">Nova assinatura</div>
          <div className="mt-0.5 text-sm text-vinke-ink3">
            Busque o aluno pelo e-mail ou UID para configurar a assinatura manualmente.
          </div>
        </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); setFound(null); setNotFound(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            placeholder="E-mail ou UID do aluno"
            className="min-w-0 flex-1 rounded-[9px] border-[1.5px] border-vinke-line bg-white px-4 py-2.5 text-sm outline-none transition focus:border-vinke focus:ring-[3px] focus:ring-vinke-ring dark:border-vinke-navy-line dark:bg-vinke-navy dark:text-slate-100 dark:placeholder-slate-500"
          />
          <Button variant="primary" size="sm" onClick={() => void search()} loading={searching}>
            Buscar
          </Button>
        </div>

        {notFound && (
          <div className="mt-3 rounded-[10px] bg-vinke-amber-soft px-4 py-3 text-sm text-vinke-amber dark:bg-vinke-amber/10 dark:text-vinke-amber-bar">
            Nenhum aluno encontrado com esse e-mail ou UID.
          </div>
        )}

        {found && (
          <div className="mt-3 rounded-[10px] bg-vinke-green-soft px-4 py-3 dark:bg-vinke-green/10">
            <div className="text-sm font-semibold text-vinke-green-text dark:text-vinke-green">{found.name}</div>
            <div className="mt-0.5 text-xs text-vinke-green-text/80 dark:text-vinke-green/80">{found.email}</div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={goToSubscription} disabled={!found}>
            Configurar assinatura →
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AssinaturasFaturasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "faturas" ? "faturas" : "assinaturas";

  const [items, setItems] = useState<AssinaturaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [faturas, setFaturas] = useState<FaturaItem[]>([]);
  const [faturasLoading, setFaturasLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const setTab = (next: Tab) => {
    router.replace(next === "faturas" ? "/admin/assinaturas?tab=faturas" : "/admin/assinaturas", {
      scroll: false,
    });
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const data = await api.get<{ items?: AssinaturaItemWithSort[] }>("/api/admin/assinaturas");
        if (active) {
          const rows = Array.isArray(data.items)
            ? data.items.map((item) => ({
                uid: item.uid,
                aluno: item.aluno,
                email: item.email,
                origem: item.origem,
                plano: item.plano,
                planoOrigem: item.planoOrigem,
                status: item.status,
                validade: item.validade,
                planId: item.planId,
                productId: item.productId,
                productTitle: item.productTitle,
                invoiceStatus: item.invoiceStatus,
                amountPaid: item.amountPaid,
                validUntilRaw: item.validUntilRaw,
              }))
            : [];
          setItems(rows);
        }
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Não foi possível carregar as assinaturas.");
      } finally {
        if (active) setLoading(false);
      }
    };

    const loadFaturas = async () => {
      setFaturasLoading(true);
      try {
        const data = await api.get<{ items?: FaturaItem[] }>("/api/admin/faturas");
        if (active) setFaturas(data.items ?? []);
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Erro ao carregar as faturas.");
      } finally {
        if (active) setFaturasLoading(false);
      }
    };

    void load();
    void loadFaturas();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter((item) =>
      [item.aluno, item.email, item.origem, item.plano, item.status, item.planoOrigem]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [items, search]);

  const filteredFaturas = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return faturas;
    return faturas.filter((item) =>
      [item.aluno, item.email, item.status, item.productTitle, item.createdAt]
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [faturas, search]);

  // Métricas honestas com os dados atuais. MRR/churn reais entram quando a
  // recorrência da Eduzz estiver conectada.
  const metrics = useMemo(() => {
    const ativas = items.filter((i) => i.status === "ativo").length;
    const pendentes = items.filter((i) => i.status === "pendente").length;
    const vencidas = items.filter((i) => i.status === "vencido" || i.status === "inativo").length;
    const faturado = faturas.reduce((sum, f) => {
      const st = (f.status || "").toLowerCase();
      if (st === "emitida" || st === "ativo" || st === "paga") return sum + (f.total ?? 0);
      return sum;
    }, 0);
    return { ativas, pendentes, vencidas, faturado };
  }, [items, faturas]);

  const quickUpdateStatus = async (item: AssinaturaItem, nextStatus: "ativo" | "pendente") => {
    setUpdatingUid(item.uid);
    try {
      await api.patch(`/api/admin/assinaturas/${item.uid}`, {
        email: item.email === "—" ? "" : item.email,
        active: nextStatus === "ativo",
        pending: nextStatus === "pendente",
        planId: item.planId,
        productId: item.productId,
        productTitle: item.productTitle,
        invoiceStatus: item.invoiceStatus,
        amountPaid: item.amountPaid,
        validUntil: item.validUntilRaw,
      });
      setItems((prev) =>
        prev.map((current) =>
          current.uid === item.uid ? { ...current, status: nextStatus } : current
        )
      );
      toast.success(`Assinatura de ${item.aluno} atualizada para ${statusLabel(nextStatus).toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar a assinatura.");
    } finally {
      setUpdatingUid(null);
    }
  };

  return (
    <AdminShell
      title="Assinaturas & Faturas"
      subtitle={
        loading
          ? "Carregando..."
          : `${items.length.toLocaleString("pt-BR")} assinatura(s) · ${faturas.length.toLocaleString("pt-BR")} fatura(s)`
      }
      actions={
        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filtrar por aluno, e-mail, plano..."
            aria-label="Filtrar"
            className="w-full md:w-72"
          />
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className={buttonStyles({ variant: "primary" })}
          >
            <Plus size={15} aria-hidden="true" /> Nova assinatura
          </button>
        </div>
      }
    >
      {showModal && <NovaAssinaturaModal onClose={() => setShowModal(false)} />}

      {/* Tabs */}
      <div className="mb-3 flex w-fit gap-0.5 rounded-[10px] bg-[#EFEDF5] p-[3px] dark:bg-vinke-navy-card">
        {(
          [
            { value: "assinaturas", label: "Assinaturas" },
            { value: "faturas", label: "Faturas" },
          ] as { value: Tab; label: string }[]
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTab(opt.value)}
            className={cn(
              "rounded-[8px] px-4 py-[7px] text-xs transition",
              opt.value === tab
                ? "bg-white font-bold text-vinke-ink shadow-[0_1px_3px_rgba(11,10,33,0.08)] dark:bg-vinke-navy-sel dark:text-white"
                : "font-semibold text-vinke-ink3"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {tab === "assinaturas" ? (
        <div className="overflow-hidden rounded-[13px] border border-vinke-line/70 bg-white dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="border-b border-vinke-line2 dark:border-vinke-navy-line">
                <tr>
                  {["Aluno", "Origem", "Plano", "Validade", "Status", "Ação rápida", ""].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-vinke-ink3 ${h === "" ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-vinke-line3 dark:divide-vinke-navy-line/60">
                {loading ? (
                  <TableRowSkeleton cols={7} rows={6} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={CreditCard}
                        title={search ? "Nenhuma assinatura encontrada" : "Nenhuma assinatura cadastrada"}
                        description={search ? "Tente outros termos de busca." : "Crie uma assinatura para um aluno existente."}
                        action={
                          !search ? (
                            <button
                              type="button"
                              onClick={() => setShowModal(true)}
                              className={buttonStyles({ variant: "primary", size: "sm" })}
                            >
                              <Plus size={13} /> Nova assinatura
                            </button>
                          ) : undefined
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.uid} className="transition hover:bg-vinke-sel dark:hover:bg-vinke-navy-sel/50">
                      <td className="px-5 py-4">
                        <div className="font-bold text-vinke-ink dark:text-slate-200">{item.aluno}</div>
                        <div className="mt-0.5 text-xs text-vinke-ink3">{item.email}</div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs uppercase text-vinke-ink3">
                        {item.origem}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-vinke-ink2 dark:text-slate-300">{item.plano}</div>
                        <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-vinke-ink4">
                          {planoOrigemLabel(item.planoOrigem)}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-vinke-ink2 dark:text-slate-400">{item.validade}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={item.status === "ativo" ? "primary" : "secondary"}
                            loading={updatingUid === item.uid}
                            onClick={() => void quickUpdateStatus(item, "ativo")}
                          >
                            Ativar
                          </Button>
                          <Button
                            size="sm"
                            variant={item.status === "pendente" ? "primary" : "secondary"}
                            loading={updatingUid === item.uid}
                            onClick={() => void quickUpdateStatus(item, "pendente")}
                          >
                            Pendente
                          </Button>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/admin/assinaturas/${item.uid}/fatura`}
                            className={buttonStyles({ variant: "secondary", size: "sm" })}
                          >
                            Gerenciar
                          </Link>
                          <Link
                            href={`/admin/assinaturas/${item.uid}`}
                            className={buttonStyles({ variant: "primary", size: "sm" })}
                          >
                            Editar
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[13px] border border-vinke-line/70 bg-white dark:border-vinke-navy-line dark:bg-vinke-navy-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-vinke-line2 dark:border-vinke-navy-line">
                <tr>
                  {["Aluno", "Serviço", "Total", "Data", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-vinke-ink3 ${h === "" ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-vinke-line3 dark:divide-vinke-navy-line/60">
                {faturasLoading ? (
                  <TableRowSkeleton cols={6} rows={6} />
                ) : filteredFaturas.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={CreditCard}
                        title={search ? "Nenhuma fatura encontrada" : "Nenhuma fatura registrada"}
                        description={
                          search
                            ? "Tente outros termos de busca."
                            : "As faturas aparecem aqui quando houver cobranças registradas."
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredFaturas.map((item) => (
                    <tr key={item.uid} className="transition hover:bg-vinke-sel dark:hover:bg-vinke-navy-sel/50">
                      <td className="px-5 py-4">
                        <div className="font-bold text-vinke-ink dark:text-slate-200">{item.aluno}</div>
                        <div className="mt-0.5 text-xs text-vinke-ink3">{item.email}</div>
                      </td>
                      <td className="px-5 py-4 text-vinke-ink2 dark:text-slate-400">{item.productTitle}</td>
                      <td className="px-5 py-4 font-display font-bold text-vinke-ink dark:text-slate-200 [font-variant-numeric:tabular-nums]">
                        {formatMoney(item.total)}
                      </td>
                      <td className="px-5 py-4 text-vinke-ink2 dark:text-slate-400">{item.createdAt}</td>
                      <td className="px-5 py-4">
                        <FaturaStatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/admin/assinaturas/${item.uid}/fatura`}
                          className={buttonStyles({ variant: "primary", size: "sm" })}
                        >
                          Gerenciar
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Faixa de métricas */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-[13px] border border-vinke-line/70 bg-white px-5 py-3.5 dark:border-vinke-navy-line dark:bg-vinke-navy-card">
        <Metric label="Ativas" value={loading ? "…" : String(metrics.ativas)} tone={metrics.ativas > 0 ? "green" : undefined} />
        <Metric label="Pendentes" value={loading ? "…" : String(metrics.pendentes)} tone={metrics.pendentes > 0 ? "amber" : undefined} />
        <Metric label="Vencidas / inativas" value={loading ? "…" : String(metrics.vencidas)} tone={metrics.vencidas > 0 ? "red" : undefined} />
        <Metric
          label="Total faturado"
          value={faturasLoading ? "…" : formatMoney(metrics.faturado)}
        />
      </div>
    </AdminShell>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "amber" | "red";
}) {
  return (
    <span className="text-[11px] font-semibold text-vinke-ink2 dark:text-slate-400">
      {label}{" "}
      <strong
        className={cn(
          "ml-1 font-display text-sm font-bold [font-variant-numeric:tabular-nums]",
          tone === "green"
            ? "text-vinke-green-text dark:text-vinke-green"
            : tone === "amber"
              ? "text-vinke-amber dark:text-vinke-amber-bar"
              : tone === "red"
                ? "text-vinke-red dark:text-vinke-red-dark"
                : "text-vinke-ink dark:text-white"
        )}
      >
        {value}
      </strong>
    </span>
  );
}

function FaturaStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const cls =
    normalized === "emitida" || normalized === "ativo" || normalized === "paga"
      ? "bg-vinke-green-soft text-vinke-green-text dark:bg-vinke-green/15 dark:text-vinke-green"
      : normalized === "pendente"
        ? "bg-vinke-amber-soft text-vinke-amber dark:bg-vinke-amber/15 dark:text-vinke-amber-bar"
        : "bg-vinke-line2 text-vinke-ink2 dark:bg-vinke-navy-sel dark:text-slate-300";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase ${cls}`}>
      {status || "pendente"}
    </span>
  );
}

export default function AssinaturasPage() {
  return (
    <Suspense>
      <AssinaturasFaturasContent />
    </Suspense>
  );
}
