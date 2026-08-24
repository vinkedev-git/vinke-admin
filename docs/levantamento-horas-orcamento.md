# Levantamento de horas e orçamento - Anestesia Questoes

Data do levantamento: 2026-05-11

## Metodo usado

Este levantamento usa duas camadas:

1. Evidencia objetiva do Git: commits, dias ativos, periodo de trabalho, linhas atuais de codigo e volume de alteracoes.
2. Estimativa comercial: ajuste sobre o Git para incluir entendimento de regra de negocio, testes, deploy, correcoes em producao, integracoes, UX, revisoes e importacoes de dados.

O Git e um piso, nao o total real. Ele nao mede conversa, debug fora do commit, configuracao em Firebase/Vercel/Eduzz/Bling, validacao em dispositivos, nem ajustes feitos antes de commitar.

## Evidencias por projeto

| Projeto | Periodo no Git | Dias ativos | Commits | Codigo atual aprox. | Alteracoes no Git |
| --- | ---: | ---: | ---: | ---: | ---: |
| portal-admin (`anestesia-admin`) | 12/02/2026 a 24/04/2026 | 31 | 188 | 23.101 linhas | 54.858 insercoes / 12.640 remocoes |
| portal do aluno (`anestesia-questoes-aluno`) | 22/02/2026 a 19/04/2026 | 17 | 109 | 5.934 linhas | 22.761 insercoes / 7.221 remocoes |
| landing page (`anestesiaquestoes`) | 31/03/2026 a 18/04/2026 | 3 | 8 | 1.852 linhas | 6.008 insercoes / 334 remocoes |
| app (`estudo-quiz`) | 07/04/2026 a 23/04/2026 | 3 | 13 | 5.969 linhas | 58.195 insercoes / 1.473 remocoes |

Observacao: no app, o numero de insercoes aparenta estar inflado por arquivos de base/template/dependencias geradas. Por isso, para orcamento, o peso foi avaliado mais pelo escopo funcional do que por linhas adicionadas.

## Estimativa de horas

| Projeto | Horas pelo Git, piso | Horas comerciais recomendadas | Justificativa resumida |
| --- | ---: | ---: | --- |
| portal-admin | 124-185h | 230-320h | Dashboard completo, CRUDs, importador/exportador, TipTap, Firestore, Storage, Eduzz, Bling/NFSe, alunos, assinaturas, faturas, simulados, temas claro/escuro e muitos ajustes mobile/UX. |
| portal do aluno | 82-123h | 130-190h | Login/acesso, banco de questoes, simulados, respostas, erros reportados, consumo Firestore e integracao com entitlement/assinatura. |
| landing page | 10-15h | 20-35h | Site institucional/landing, estrutura visual, responsividade e deploy. |
| estudo-quiz app | 11-17h | 60-100h | App Expo/React Native com Firebase, navegacao, base de quiz e dependencias de IA/assinaturas. Mesmo com menos commits, app nativo exige ciclo extra de teste. |

Total pelo Git: **227-340 horas**.

Total comercial recomendado: **440-645 horas**.

## Orcamento por taxa/hora

| Taxa/hora | Total baixo, 440h | Total medio, 540h | Total alto, 645h |
| ---: | ---: | ---: | ---: |
| R$ 120/h | R$ 52.800 | R$ 64.800 | R$ 77.400 |
| R$ 160/h | R$ 70.400 | R$ 86.400 | R$ 103.200 |
| R$ 220/h | R$ 96.800 | R$ 118.800 | R$ 141.900 |
| R$ 280/h | R$ 123.200 | R$ 151.200 | R$ 180.600 |

## Valor sugerido para cobrar

Para um projeto entregue como pacote, considerando que houve produto, integracoes e iteracoes intensas, a faixa mais defensavel e:

**R$ 85.000 a R$ 120.000**

Uma proposta mais enxuta, para cliente conhecido ou fase inicial, ficaria em:

**R$ 65.000 a R$ 85.000**

Uma proposta senior/agencia, incluindo margem, garantia e complexidade das integracoes, ficaria em:

**R$ 120.000 a R$ 150.000**

## Divisao sugerida por produto

| Produto | Horas sugeridas | Valor a R$ 160/h | Valor a R$ 220/h |
| --- | ---: | ---: | ---: |
| portal-admin | 230-320h | R$ 36.800-R$ 51.200 | R$ 50.600-R$ 70.400 |
| portal do aluno | 130-190h | R$ 20.800-R$ 30.400 | R$ 28.600-R$ 41.800 |
| landing page | 20-35h | R$ 3.200-R$ 5.600 | R$ 4.400-R$ 7.700 |
| estudo-quiz app | 60-100h | R$ 9.600-R$ 16.000 | R$ 13.200-R$ 22.000 |

## O que incluir no texto do orcamento

- Desenvolvimento web admin em Next.js com Firebase, Vercel, Firestore e Storage.
- Portal do aluno com autenticacao, controle de acesso por assinatura e resolucao de questoes.
- Integracao Eduzz para webhooks, alunos, assinaturas, produtos e importacao retroativa.
- Integracao Bling para emissao manual de NFSe via painel.
- Importacao/exportacao de questoes por planilha XLS/XLSX.
- Cadastro e gestao de provas, niveis, temas, alunos, planos, assinaturas, faturas, simulados, midias e administradores.
- Ajustes mobile/iPhone, tema claro/escuro, revisoes de layout, contraste, mensagens de sucesso/erro e fluxo de deploy.

## Observacoes comerciais

Nao incluir no valor fechado, salvo combinado:

- Mensalidade de hospedagem, Firebase, Vercel, Eduzz, Bling, dominios, e-mails/transacionais e APIs.
- Suporte mensal continuado.
- Cadastro manual de conteudo/questoes alem das importacoes combinadas.
- Evolucoes futuras de app store/publicacao mobile, caso o app entre em distribuicao oficial.

## Referencias de mercado usadas

- Lancei, benchmark Brasil 2026: pleno por volta de R$ 160/h e senior por volta de R$ 280/h.
- Glassdoor Brasil 2026: Desenvolvedor Full Stack Senior com faixa mensal aproximada de R$ 8k a R$ 14k, com casos recentes acima disso.
- Glassdoor Brasil 2025/2026: Desenvolvedor Full Stack Pleno com faixa mensal aproximada de R$ 4k a R$ 8k.
