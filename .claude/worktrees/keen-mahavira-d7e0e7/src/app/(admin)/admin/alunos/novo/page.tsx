"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/apiClient";

type AlunoForm = {
  email: string;
  password: string;
  confirmPassword: string;
  active: boolean;
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
  "Acre",
  "Alagoas",
  "Amapá",
  "Amazonas",
  "Bahia",
  "Ceará",
  "Distrito Federal",
  "Espírito Santo",
  "Goiás",
  "Maranhão",
  "Mato Grosso",
  "Mato Grosso do Sul",
  "Minas Gerais",
  "Pará",
  "Paraíba",
  "Paraná",
  "Pernambuco",
  "Piauí",
  "Rio de Janeiro",
  "Rio Grande do Norte",
  "Rio Grande do Sul",
  "Rondônia",
  "Roraima",
  "Santa Catarina",
  "São Paulo",
  "Sergipe",
  "Tocantins",
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </div>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
      <div className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {children}
      </div>
    </div>
  );
}

export default function NovoAlunoPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState<AlunoForm>({
    email: "",
    password: "",
    confirmPassword: "",
    active: true,
    profile: {
      name: "",
      document: "",
      phone: "",
      cellphone: "",
      address: {
        street: "",
        number: "",
        neighborhood: "",
        complement: "",
        zipCode: "",
        city: "",
        state: "",
      },
    },
  });

  const canSave = useMemo(() => {
    if (saving) return false;
    return (
      form.email.trim().length > 0 &&
      form.profile.name.trim().length > 0 &&
      form.password.length >= 6 &&
      form.password === form.confirmPassword
    );
  }, [form, saving]);

  const patchProfile = (patch: Partial<AlunoForm["profile"]>) => {
    setForm((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        ...patch,
      },
    }));
  };

  const patchAddress = (patch: Partial<AlunoForm["profile"]["address"]>) => {
    setForm((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        address: {
          ...prev.profile.address,
          ...patch,
        },
      },
    }));
  };

  const onSave = async () => {
    if (!canSave) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const data = await api.post<{ uid?: string }>("/api/admin/alunos", {
        email: form.email,
        password: form.password,
        active: form.active,
        profile: {
          name: form.profile.name,
          document: form.profile.document,
          phone: form.profile.phone,
          cellphone: form.profile.cellphone,
          address: form.profile.address,
        },
      });

      router.push(data.uid ? `/admin/alunos/${data.uid}` : "/admin/alunos");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao criar aluno.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="Novo aluno"
      subtitle="Cadastro manual de aluno para acesso fora do fluxo automático da Eduzz."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => router.push("/admin/alunos")}>
            Voltar
          </Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={!canSave}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    >
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="space-y-6">
          {errorMsg ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMsg}
            </div>
          ) : null}

          <SectionTitle>Informação principal</SectionTitle>
          <div className="grid gap-4 md:grid-cols-1">
            <Field
              label="Nome"
              value={form.profile.name}
              onChange={(value) => patchProfile({ name: value })}
              placeholder="Nome completo do aluno"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="CPF"
              value={form.profile.document}
              onChange={(value) => patchProfile({ document: value })}
              placeholder="000.000.000-00"
            />
            <Field
              label="Celular"
              value={form.profile.cellphone}
              onChange={(value) => patchProfile({ cellphone: value })}
              placeholder="(00) 9 9999-9999"
            />
            <Field
              label="Telefone"
              value={form.profile.phone}
              onChange={(value) => patchProfile({ phone: value })}
              placeholder="(00) 9999-9999"
            />
          </div>

          <SectionTitle>Localização</SectionTitle>
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)]">
            <Field
              label="Endereço"
              value={form.profile.address.street}
              onChange={(value) => patchAddress({ street: value })}
            />
            <Field
              label="Número"
              value={form.profile.address.number}
              onChange={(value) => patchAddress({ number: value })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
            <Field
              label="Bairro"
              value={form.profile.address.neighborhood}
              onChange={(value) => patchAddress({ neighborhood: value })}
            />
            <Field
              label="Complemento"
              value={form.profile.address.complement}
              onChange={(value) => patchAddress({ complement: value })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="CEP"
              value={form.profile.address.zipCode}
              onChange={(value) => patchAddress({ zipCode: value })}
            />
            <Field
              label="Cidade"
              value={form.profile.address.city}
              onChange={(value) => patchAddress({ city: value })}
            />

            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Estado
              </div>
              <select
                value={form.profile.address.state}
                onChange={(e) => patchAddress({ state: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Selecione</option>
                {ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SectionTitle>Dados de acesso</SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Email"
              value={form.email}
              onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
              type="email"
              placeholder="aluno@exemplo.com"
            />
            <Field
              label="Senha"
              value={form.password}
              onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
              type="password"
              placeholder="Senha"
            />
            <Field
              label="Confirmar senha"
              value={form.confirmPassword}
              onChange={(value) => setForm((prev) => ({ ...prev, confirmPassword: value }))}
              type="password"
              placeholder="Confirmar senha"
            />
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-slate-900">Acesso inicial</div>
                <div className="text-xs text-slate-500">
                  Defina se o aluno já entra com acesso ativo ou pendente.
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    active: !prev.active,
                  }))
                }
                className={
                  form.active
                    ? "rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"
                    : "rounded-full border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700"
                }
              >
                {form.active ? "● Ativo" : "○ Pendente"}
              </button>
            </div>
          </div>

          {(form.password || form.confirmPassword) && form.password !== form.confirmPassword ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              As senhas precisam ser idênticas.
            </div>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
