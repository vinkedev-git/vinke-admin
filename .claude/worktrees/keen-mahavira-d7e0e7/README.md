This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Regra de alternativas (simulados)

Padrão operacional definido:

- O aluno visualiza alternativas em ordem fixa `A, B, C, D, E`.
- Não embaralhar alternativas na renderização do simulado.
- A variação de letra correta entre questões ocorre na ordem salva no banco/importação.

## Limpeza automática de simulados vencidos

Para reduzir espaço no Firestore, existe uma rotina automática que remove histórico de simulados de alunos com assinatura vencida há `N` dias:

- Rota: `/api/maintenance/simulados-cleanup`
- Cron (Vercel): diário às 04:00 (`vercel.json`)
- Carência padrão: `30` dias (`graceDays=30`)
- Remove:
  - `users/{uid}/sessions/*` + `answers`
  - `users/{uid}/attempts/*` + `answers`
- Mantém cadastro e assinatura do aluno (`users`, `profile`, `entitlements`)

### Segurança

A rota aceita somente token por header:

- `Authorization: Bearer <token>` ou `x-maintenance-key: <token>`
- Variáveis aceitas:
  - `SIMULADOS_CLEANUP_SECRET` (recomendado)
  - `CRON_SECRET` (compatível com Vercel Cron)

### Teste manual (dry-run)

```bash
curl -H "Authorization: Bearer SEU_TOKEN" \
  "https://SEU_DOMINIO/api/maintenance/simulados-cleanup?graceDays=30&dryRun=1"
```

### Execução manual real

```bash
curl -X POST -H "Authorization: Bearer SEU_TOKEN" \
  "https://SEU_DOMINIO/api/maintenance/simulados-cleanup?graceDays=30&dryRun=0"
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
