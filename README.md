# Vinke — Portal Admin

Painel administrativo do **Vinke**, plataforma de questões para o ENEM. Gerencia questões, alunos, planos, simulados, flashcards e assinaturas.

Base derivada de um produto anterior da casa, com infraestrutura 100% independente (Firebase, Vercel e integrações próprias).

## Stack

- Next.js (App Router) + React + TypeScript + Tailwind
- Firebase: Firestore, Auth, Storage (client + Admin SDK)
- Resend (e-mails) · Eduzz (pagamentos, futuro)

## Rodando localmente

1. Copie `.env.example` para `.env.local` e preencha com as credenciais do projeto Firebase do Vinke.
2. Instale e rode:

```bash
npm install
npm run dev
```

Acesse http://localhost:3000.

## Scripts de dados

Os scripts em `scripts/` (seed de catálogo, importação de questões via XLSX, manutenção) foram herdados da base original e serão adaptados à taxonomia do ENEM (áreas, disciplinas, ano da prova, competências/habilidades).
