"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/Button";

type SettingsPayload = {
  enabled: boolean;
  apiBaseUrl: string;
  contactsEndpointPath: string;
  nfseEndpointPath: string;
  serviceCode: string;
  serviceDescription: string;
  serviceNature: string;
  serviceListItem: string;
  cnae: string;
  series: string;
  issRate: string;
  defaultComment: string;
  autoCreateContact: boolean;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasClientCredentials: boolean;
};

const DEFAULT_FORM: SettingsPayload = {
  enabled: false,
  apiBaseUrl: "https://api.bling.com.br",
  contactsEndpointPath: "/Api/v3/contatos",
  nfseEndpointPath: "",
  serviceCode: "",
  serviceDescription: "",
  serviceNature: "",
  serviceListItem: "",
  cnae: "",
  series: "",
  issRate: "",
  defaultComment: "",
  autoCreateContact: false,
  hasAccessToken: false,
  hasRefreshToken: false,
  hasClientCredentials: false,
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{children}</div>
  );
}

export default function BlingSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [form, setForm] = useState<SettingsPayload>(DEFAULT_FORM);
  const [accessTokenDraft, setAccessTokenDraft] = useState("");
  const [refreshTokenDraft, setRefreshTokenDraft] = useState("");
  const [pendingAuthorizeUrl, setPendingAuthorizeUrl] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    const blingStatus = searchParams.get("bling");
    const rawMessage = searchParams.get("message");

    if (blingStatus === "connected") {
      setSuccessMsg("Conexão com o Bling concluída com sucesso.");
      setErrorMsg(null);
      void load();
      return;
    }

    if (blingStatus === "error") {
      const message = rawMessage || "";
      const translated =
        message === "estado_invalido"
          ? "Falha na autorização do Bling: o estado da sessão expirou ou não confere. Inicie a conexão novamente."
          : message === "callback_sem_code"
            ? "Falha na autorização do Bling: o callback não retornou o código OAuth."
            : `Falha na autorização do Bling${message ? `: ${message}` : "."}`;
      setErrorMsg(translated);
      return;
    }
  }, [searchParams]);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch("/api/admin/configuracoes/bling", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        settings?: Record<string, unknown>;
      };

      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Não foi possível carregar a configuração do Bling.");
      }

      setForm({
        enabled: Boolean(data.settings.enabled),
        apiBaseUrl: String(data.settings.apiBaseUrl ?? DEFAULT_FORM.apiBaseUrl),
        contactsEndpointPath: String(
          data.settings.contactsEndpointPath ?? DEFAULT_FORM.contactsEndpointPath
        ),
        nfseEndpointPath: String(data.settings.nfseEndpointPath ?? ""),
        serviceCode: String(data.settings.serviceCode ?? ""),
        serviceDescription: String(data.settings.serviceDescription ?? ""),
        serviceNature: String(data.settings.serviceNature ?? ""),
        serviceListItem: String(data.settings.serviceListItem ?? ""),
        cnae: String(data.settings.cnae ?? ""),
        series: String(data.settings.series ?? ""),
        issRate:
          data.settings.issRate == null || data.settings.issRate === ""
            ? ""
            : String(data.settings.issRate),
        defaultComment: String(data.settings.defaultComment ?? ""),
        autoCreateContact: Boolean(data.settings.autoCreateContact),
        hasAccessToken: Boolean(data.settings.hasAccessToken),
        hasRefreshToken: Boolean(data.settings.hasRefreshToken),
        hasClientCredentials: Boolean(data.settings.hasClientCredentials),
      });
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : "Não foi possível carregar a configuração do Bling."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const persistSettings = async ({
    showSuccess = true,
    includeDraftTokens = true,
  }: {
    showSuccess?: boolean;
    includeDraftTokens?: boolean;
  } = {}) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Sessão inválida. Faça login novamente.");

    const res = await fetch("/api/admin/configuracoes/bling", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        enabled: form.enabled,
        apiBaseUrl: form.apiBaseUrl,
        contactsEndpointPath: form.contactsEndpointPath,
        nfseEndpointPath: form.nfseEndpointPath,
        serviceCode: form.serviceCode,
        serviceDescription: form.serviceDescription,
        serviceNature: form.serviceNature,
        serviceListItem: form.serviceListItem,
        cnae: form.cnae,
        series: form.series,
        issRate: form.issRate,
        defaultComment: form.defaultComment,
        autoCreateContact: form.autoCreateContact,
        accessToken: includeDraftTokens ? accessTokenDraft : "",
        refreshToken: includeDraftTokens ? refreshTokenDraft : "",
      }),
    });

    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Não foi possível salvar a configuração do Bling.");
    }

    if (includeDraftTokens) {
      setAccessTokenDraft("");
      setRefreshTokenDraft("");
    }

    if (showSuccess) {
      setSuccessMsg("Dados salvos com sucesso.");
      await load();
    }
  };

  const save = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await persistSettings();
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : "Não foi possível salvar a configuração do Bling."
      );
    } finally {
      setSaving(false);
    }
  };

  const startOAuth = async () => {
    setAuthorizing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await persistSettings({ showSuccess: false, includeDraftTokens: false });

      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Sessão inválida. Faça login novamente.");

      const res = await fetch("/api/admin/configuracoes/bling/oauth/authorize", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        authorizeUrl?: string;
        redirectUri?: string;
      };

      if (!res.ok || !data.ok || !data.authorizeUrl) {
        throw new Error(data.error || "Não foi possível iniciar a autorização do Bling.");
      }

      setPendingAuthorizeUrl(data.authorizeUrl);
      setSuccessMsg("Redirecionando para o Bling...");
      window.location.assign(data.authorizeUrl);
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : "Não foi possível iniciar a autorização do Bling."
      );
      setAuthorizing(false);
    }
  };

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
        <div className="text-2xl font-black text-slate-900">Bling (NFS-e)</div>
        <div className="mt-1 text-sm text-slate-500">
          Configure a geração manual de nota fiscal a partir da tela de faturas.
        </div>
      </div>

      <div className="space-y-5 p-5">
        {loading ? (
          <div className="text-sm text-slate-500">Carregando...</div>
        ) : null}

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

        {pendingAuthorizeUrl ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            Se o redirecionamento não abrir sozinho, continue por este link:
            {" "}
            <a
              href={pendingAuthorizeUrl}
              className="font-semibold underline"
            >
              Autorizar no Bling
            </a>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <FieldLabel>Integração</FieldLabel>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-800">
                {form.enabled ? "Ativa" : "Desativada"}
              </span>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    enabled: e.target.checked,
                  }))
                }
              />
            </div>
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <FieldLabel>Token de acesso</FieldLabel>
            <div className="text-sm font-semibold text-slate-800">
              {form.hasAccessToken ? "Configurado" : "Pendente"}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <FieldLabel>Refresh / client</FieldLabel>
            <div className="text-sm font-semibold text-slate-800">
              {form.hasRefreshToken && form.hasClientCredentials
                ? "Pronto para renovação"
                : "Configuração incompleta"}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <FieldLabel>OAuth do Bling</FieldLabel>
              <div className="text-sm text-slate-600">
                Use esta ação para gerar e salvar automaticamente o access token e o refresh token.
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => void startOAuth()}
              disabled={authorizing || saving || loading}
            >
              {authorizing ? "Redirecionando..." : "Conectar Bling"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>API base</FieldLabel>
            <input
              value={form.apiBaseUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, apiBaseUrl: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <FieldLabel>Endpoint de contatos</FieldLabel>
            <input
              value={form.contactsEndpointPath}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, contactsEndpointPath: e.target.value }))
              }
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div>
          <FieldLabel>Endpoint de NFS-e</FieldLabel>
          <input
            value={form.nfseEndpointPath}
            onChange={(e) => setForm((prev) => ({ ...prev, nfseEndpointPath: e.target.value }))}
            placeholder="Ex.: /Api/v3/nfse"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <FieldLabel>Código do serviço</FieldLabel>
            <input
              value={form.serviceCode}
              onChange={(e) => setForm((prev) => ({ ...prev, serviceCode: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <FieldLabel>Item da lista</FieldLabel>
            <input
              value={form.serviceListItem}
              onChange={(e) => setForm((prev) => ({ ...prev, serviceListItem: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <FieldLabel>CNAE</FieldLabel>
            <input
              value={form.cnae}
              onChange={(e) => setForm((prev) => ({ ...prev, cnae: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <FieldLabel>Natureza da operação</FieldLabel>
            <input
              value={form.serviceNature}
              onChange={(e) => setForm((prev) => ({ ...prev, serviceNature: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <FieldLabel>Série</FieldLabel>
            <input
              value={form.series}
              onChange={(e) => setForm((prev) => ({ ...prev, series: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <FieldLabel>Alíquota ISS</FieldLabel>
            <input
              value={form.issRate}
              onChange={(e) => setForm((prev) => ({ ...prev, issRate: e.target.value }))}
              placeholder="Ex.: 2"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div>
          <FieldLabel>Descrição padrão do serviço</FieldLabel>
          <input
            value={form.serviceDescription}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, serviceDescription: e.target.value }))
            }
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <FieldLabel>Observação padrão</FieldLabel>
          <textarea
            value={form.defaultComment}
            onChange={(e) => setForm((prev) => ({ ...prev, defaultComment: e.target.value }))}
            rows={3}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <input
            type="checkbox"
            checked={form.autoCreateContact}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                autoCreateContact: e.target.checked,
              }))
            }
          />
          <span className="text-sm font-semibold text-slate-800">
            Tentar criar/atualizar o contato no Bling antes da emissão
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <FieldLabel>Novo access token</FieldLabel>
            <input
              value={accessTokenDraft}
              onChange={(e) => setAccessTokenDraft(e.target.value)}
              type="password"
              placeholder={form.hasAccessToken ? "Mantido. Cole apenas se quiser trocar." : "Cole o token atual"}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <FieldLabel>Novo refresh token</FieldLabel>
            <input
              value={refreshTokenDraft}
              onChange={(e) => setRefreshTokenDraft(e.target.value)}
              type="password"
              placeholder={
                form.hasRefreshToken
                  ? "Mantido. Cole apenas se quiser trocar."
                  : "Cole o refresh token"
              }
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          O token é salvo para uso server-side. O painel não exibe o valor já salvo por segurança. Se o
          endpoint de NFS-e do seu app do Bling variar, ajuste o caminho acima.
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={() => void save()} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar configuração do Bling"}
          </Button>
        </div>
      </div>
    </div>
  );
}
