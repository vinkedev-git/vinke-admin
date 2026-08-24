import Link from "next/link";
import AdminShell from "@/components/AdminShell";
import BlingSettingsCard from "@/components/admin/BlingSettingsCard";
import ThemeSettingsCard from "@/components/admin/ThemeSettingsCard";

function ConfigItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function Shortcut({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:bg-slate-50"
    >
      <div className="text-base font-black text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-500">{desc}</div>
      <div className="mt-4 text-xs font-semibold text-blue-700">Abrir →</div>
    </Link>
  );
}

export default function ConfiguracoesPage() {
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || "não configurado";
  const hasEduzz = Boolean(
    process.env.EDUZZ_USER_TOKEN ||
      process.env.EDUZZ_PERSONAL_TOKEN ||
      process.env.EDUZZ_API_TOKEN
  );
  const hasBlingClient = Boolean(
    process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET
  );

  return (
    <AdminShell
      title="Configurações"
      subtitle="Integrações, parâmetros fiscais e atalhos de manutenção do gestor."
    >
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
              <div className="text-2xl font-black text-slate-900">Ambiente</div>
            </div>

            <div className="grid gap-4 p-5">
              <ConfigItem label="Ambiente atual" value={environment} />
              <ConfigItem label="Projeto Firebase" value={projectId} />
              <ConfigItem
                label="Integração Eduzz"
                value={hasEduzz ? "Token configurado" : "Token pendente"}
              />
              <ConfigItem
                label="Bling OAuth (client)"
                value={hasBlingClient ? "Client ID/Secret configurados" : "Client ID/Secret pendentes"}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Shortcut
              href="/admin/administradores"
              title="Administradores"
              desc="Controle de acessos ao dashboard."
            />
            <Shortcut
              href="/admin/pagamento"
              title="Pagamento"
              desc="Estado financeiro e integrações."
            />
            <Shortcut
              href="/admin/faturas"
              title="Faturas"
              desc="Acompanhe cobranças e emita notas manualmente."
            />
            <Shortcut
              href="/admin/importador"
              title="Importador / Exportador"
              desc="Backup e atualização do banco de questões."
            />
          </div>
        </div>

        <BlingSettingsCard />
        <ThemeSettingsCard />
      </div>
    </AdminShell>
  );
}
