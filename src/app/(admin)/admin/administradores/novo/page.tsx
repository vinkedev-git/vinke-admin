"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import AdminShell from "@/components/AdminShell";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/apiClient";

export default function NovoAdministradorPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg("Informe o nome do administrador.");
      return;
    }

    if (!email.trim()) {
      setErrorMsg("Informe o e-mail do administrador.");
      return;
    }

    if (password.length < 6) {
      setErrorMsg("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("A confirmação da senha não confere.");
      return;
    }

    setSaving(true);

    try {
      await api.post("/api/admin/administradores", { name, email, password });

      setSuccessMsg("Cadastro criado com sucesso.");
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Erro ao criar administrador.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="Novo Administrador"
      subtitle="Cadastre um novo usuário com acesso ao painel administrativo."
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
              placeholder="Nome do administrador"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">E-mail</div>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="admin@empresa.com"
            />
          </label>

          <div />

          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">Senha</div>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Mínimo de 6 caracteres"
            />
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-700">Confirmar senha</div>
            <Input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              placeholder="Repita a senha"
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
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </AdminShell>
  );
}
