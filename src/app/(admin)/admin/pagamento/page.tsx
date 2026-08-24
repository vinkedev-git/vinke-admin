import Link from "next/link";
import AdminShell from "@/components/AdminShell";

function StatusPill({
  active,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase",
        active ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
      ].join(" ")}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

function ShortcutCard({
  title,
  desc,
  href,
}: {
  title: string;
  desc: string;
  href: string;
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

export default function PagamentoPage() {
  const hasEduzzToken = Boolean(
    process.env.EDUZZ_USER_TOKEN ||
      process.env.EDUZZ_PERSONAL_TOKEN ||
      process.env.EDUZZ_API_TOKEN
  );
  const hasFirebaseAdmin = Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );

  return (
    <AdminShell
      title="Pagamento"
      subtitle="Centralize a operação financeira do painel e valide os serviços necessários para cobrança."
      actions={
        <Link
          href="/admin/planos"
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] transition hover:border-slate-800 hover:bg-slate-800"
        >
          Gerir planos
        </Link>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-5">
            <div className="text-2xl font-black text-slate-900">Saúde da integração</div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-800">Token da Eduzz</div>
                <StatusPill
                  active={hasEduzzToken}
                  activeLabel="configurado"
                  inactiveLabel="pendente"
                />
              </div>
              <div className="text-sm text-slate-500">
                Necessário para sincronizar produtos na página de planos.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-800">Firebase Admin</div>
                <StatusPill
                  active={hasFirebaseAdmin}
                  activeLabel="ativo"
                  inactiveLabel="pendente"
                />
              </div>
              <div className="text-sm text-slate-500">
                Necessário para faturamento, criação de admins e importações no servidor.
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
              O fluxo financeiro do admin se distribui entre `Planos`, `Assinaturas` e `Faturas`.
              Esta tela concentra o estado operacional para facilitar suporte e auditoria.
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ShortcutCard
            title="Assinaturas"
            desc="Ative, pause e audite o acesso dos alunos."
            href="/admin/assinaturas"
          />
          <ShortcutCard
            title="Faturas"
            desc="Abra a cobrança individual, gere nota interna e veja histórico."
            href="/admin/faturas"
          />
          <ShortcutCard
            title="Planos"
            desc="Sincronize produtos da Eduzz e ajuste catálogos."
            href="/admin/planos"
          />
          <ShortcutCard
            title="Importador / Exportador"
            desc="Faça backup ou processamento em massa do banco de questões."
            href="/admin/importador"
          />
        </div>
      </div>
    </AdminShell>
  );
}
