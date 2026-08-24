"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/apiClient";

type AdminDetails = {
  uid: string;
  email?: string;
  name?: string;
};

export default function EditarAdministradorPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const [admin, setAdmin] = useState<AdminDetails | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const { uid } = await params;

        const data = await api.get<{ admin?: AdminDetails }>(`/api/admin/administradores/${uid}`);

        if (!data.admin) {
          throw new Error("Não foi possível carregar o administrador.");
        }

        if (active) {
          setAdmin(data.admin);
          setName(String(data.admin.name ?? ""));
          setEmail(String(data.admin.email ?? ""));
        }
      } catch (error) {
        if (active) {
          setErrorMsg(error instanceof Error ? error.message : "Erro ao carregar administrador.");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!admin) return;

    if (!name.trim()) {
      setErrorMsg("Informe o nome do administrador.");
      return;
    }

    if (!email.trim()) {
      setErrorMsg("Informe o e-mail do administrador.");
      return;
    }

    if (password && password.length < 6) {
      setErrorMsg("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("A confirmação da senha não confere.");
      return;
    }

    setSaving(true);

    try {
      await api.patch(`/api/admin/administradores/${admin.uid}`, { name, email, password });

      setSuccessMsg("Dados salvos com sucesso.");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao salvar administrador.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="Editar Administrador"
      subtitle={admin ? `Administrador ${admin.uid}` : "Carregando administrador..."}
      actions={
        <Link href="/admin/administradores" className={buttonStyles({ variant: "secondary" })}>
          Voltar
        </Link>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="rounded-[28px] border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
          <div className="text-2xl font-black text-slate-900">Dados de acesso</div>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="mb-2 text-sm font-semibold text-slate-700">Nome</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              placeholder="Nome do administrador"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">E-mail</div>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              disabled={loading}
              placeholder="admin@empresa.com"
            />
          </label>

          <div />

          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">Nova senha</div>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              disabled={loading}
              placeholder="Deixe em branco para manter"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">Confirmar nova senha</div>
            <Input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              disabled={loading}
              placeholder="Repita a nova senha"
            />
          </label>
        </div>

        {(errorMsg || successMsg) ? (
          <div className="px-5 pb-5">
            {errorMsg ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMsg}
              </div>
            ) : null}
            {successMsg ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMsg}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-5">
          <Link href="/admin/administradores" className={buttonStyles({ variant: "secondary" })}>
            Cancelar
          </Link>
          <Button type="submit" disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </AdminShell>
  );
}
