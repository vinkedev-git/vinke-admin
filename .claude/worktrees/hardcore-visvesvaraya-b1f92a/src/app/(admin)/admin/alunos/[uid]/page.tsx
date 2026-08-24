"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/apiClient";

type AlunoForm = {
  uid: string;
  email: string;
  password: string;
  confirmPassword: string;
  profile: {
    name: string;
    document: string;
    phone: string;
    cellphone: string;
    address: {
      street: string;
      number: string;
      neighborhood: string;
      complement: string;
      zipCode: string;
      city: string;
      state: string;
    };
  };
};

const ESTADOS = [
  "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", "Distrito Federal",
  "Espírito Santo", "Goiás", "Maranhão", "Mato Grosso", "Mato Grosso do Sul",
  "Minas Gerais", "Pará", "Paraíba", "Paraná", "Pernambuco", "Piauí",
  "Rio de Janeiro", "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia",
  "Roraima", "Santa Catarina", "São Paulo", "Sergipe", "Tocantins",
];

const ESTADO_POR_UF: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

const ESTADO_NORMALIZADO_MAP = new Map(
  ESTADOS.map((estado) => [
    estado.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
    estado,
  ])
);

function normalizeEstado(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (ESTADO_POR_UF[upper]) return ESTADO_POR_UF[upper];
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ESTADO_NORMALIZADO_MAP.get(normalized) || raw;
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function cpfDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0 dark:border-slate-800">
      <div className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
        {children}
      </div>
    </div>
  );
}

export default function EditarAlunoPage() {
  const params = useParams<{ uid: string }>();
  const router = useRouter();
  const { dialog: confirmDialog, confirm } = useConfirm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<AlunoForm>({
    uid: "", email: "", password: "", confirmPassword: "",
    profile: {
      name: "", document: "", phone: "", cellphone: "",
      address: { street: "", number: "", neighborhood: "", complement: "", zipCode: "", city: "", state: "" },
    },
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await api.get<{
          aluno?: { uid: string; user?: Record<string, unknown>; profile?: Record<string, unknown> };
        }>(`/api/admin/alunos/${params.uid}`);

        if (!data.aluno) throw new Error("Não foi possível carregar o aluno.");

        const user = data.aluno.user ?? {};
        const profile = data.aluno.profile ?? {};
        const address = (profile.address ?? {}) as Record<string, unknown>;

        if (!active) return;
        setForm({
          uid: data.aluno.uid,
          email: String(user.email ?? ""),
          password: "",
          confirmPassword: "",
          profile: {
            name: String(profile.name ?? ""),
            document: formatCpf(String(profile.document ?? "")),
            phone: String(profile.phone ?? ""),
            cellphone: String(profile.cellphone ?? profile.phone ?? ""),
            address: {
              street: String(address.street ?? profile.street ?? ""),
              number: String(address.number ?? profile.number ?? ""),
              neighborhood: String(address.neighborhood ?? profile.neighborhood ?? ""),
              complement: String(address.complement ?? profile.complement ?? ""),
              zipCode: String(address.zipCode ?? profile.zipCode ?? ""),
              city: String(address.city ?? profile.city ?? ""),
              state: normalizeEstado(address.state ?? profile.state ?? ""),
            },
          },
        });
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Erro ao carregar aluno.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [params.uid]);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!form.email.trim() || !form.profile.name.trim()) return false;
    if (form.password || form.confirmPassword) {
      return form.password.length >= 6 && form.password === form.confirmPassword;
    }
    return true;
  }, [form, saving]);

  const patchProfile = (patch: Partial<AlunoForm["profile"]>) =>
    setForm((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));

  const patchAddress = (patch: Partial<AlunoForm["profile"]["address"]>) =>
    setForm((prev) => ({ ...prev, profile: { ...prev.profile, address: { ...prev.profile.address, ...patch } } }));

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/alunos/${params.uid}`, {
        email: form.email,
        password: form.password,
        profile: {
          name: form.profile.name,
          document: cpfDigits(form.profile.document),
          phone: form.profile.phone,
          cellphone: form.profile.cellphone,
          address: form.profile.address,
        },
      });
      setForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
      toast.success("Dados salvos com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar aluno.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    const emailLabel = form.email.trim() || "este aluno";
    const ok = await confirm({
      title: `Excluir ${emailLabel}?`,
      description: "Essa ação remove autenticação e dados do aluno e não pode ser desfeita.",
      confirmLabel: "Excluir aluno",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      await api.delete(`/api/admin/alunos/${params.uid}`);
      toast.success("Aluno excluído.");
      router.replace("/admin/alunos");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir aluno.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminShell
      title="Editar aluno"
      subtitle={form.email ? `Aluno ${form.email}` : "Carregando dados do aluno"}
      breadcrumb={[
        { label: "Alunos", href: "/admin/alunos" },
        { label: loading ? "..." : (form.profile.name || form.email || params.uid) },
      ]}
      actions={
        <div className="flex gap-2">
          <Button variant="danger" size="sm" loading={deleting} disabled={loading || saving} onClick={() => void onDelete()}>
            Excluir aluno
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.push("/admin/alunos")}>
            Voltar
          </Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!canSave} onClick={() => void onSave()}>
            Salvar
          </Button>
        </div>
      }
    >
      {confirmDialog}

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        {loading ? (
          <div className="text-sm text-slate-500">Carregando...</div>
        ) : loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            {loadError}
          </div>
        ) : (
          <div className="space-y-6">
            <SectionTitle>Informação principal</SectionTitle>
            <div className="grid gap-4 md:grid-cols-1">
              <Field label="Nome" value={form.profile.name} onChange={(v) => patchProfile({ name: v })} placeholder="Nome completo do aluno" />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="CPF" value={form.profile.document} onChange={(v) => patchProfile({ document: formatCpf(v) })} placeholder="000.000.000-00" />
              <Field label="Celular" value={form.profile.cellphone} onChange={(v) => patchProfile({ cellphone: v })} placeholder="(00) 9 9999-9999" />
              <Field label="Telefone" value={form.profile.phone} onChange={(v) => patchProfile({ phone: v })} placeholder="(00) 9999-9999" />
            </div>

            <SectionTitle>Localização</SectionTitle>
            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]">
              <Field label="Endereço" value={form.profile.address.street} onChange={(v) => patchAddress({ street: v })} />
              <Field label="Número" value={form.profile.address.number} onChange={(v) => patchAddress({ number: v })} />
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
              <Field label="Bairro" value={form.profile.address.neighborhood} onChange={(v) => patchAddress({ neighborhood: v })} />
              <Field label="Complemento" value={form.profile.address.complement} onChange={(v) => patchAddress({ complement: v })} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="CEP" value={form.profile.address.zipCode} onChange={(v) => patchAddress({ zipCode: v })} />
              <Field label="Cidade" value={form.profile.address.city} onChange={(v) => patchAddress({ city: v })} />
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Estado</div>
                <select
                  value={form.profile.address.state}
                  onChange={(e) => patchAddress({ state: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Selecione</option>
                  {ESTADOS.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
                </select>
              </div>
            </div>

            <SectionTitle>Dados de acesso</SectionTitle>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Email" value={form.email} onChange={(v) => setForm((prev) => ({ ...prev, email: v }))} type="email" placeholder="aluno@exemplo.com" />
              <Field label="Senha" value={form.password} onChange={(v) => setForm((prev) => ({ ...prev, password: v }))} type="password" placeholder="Nova senha (opcional)" />
              <Field label="Confirmar senha" value={form.confirmPassword} onChange={(v) => setForm((prev) => ({ ...prev, confirmPassword: v }))} type="password" placeholder="Repita a senha" />
            </div>

            {(form.password || form.confirmPassword) && form.password !== form.confirmPassword ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                As senhas precisam ser idênticas.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
