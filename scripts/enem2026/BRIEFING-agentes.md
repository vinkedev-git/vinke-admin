# ENEM 2026 — classificar, resolver e conferir um lote de questões

Você está ajudando a publicar a prova oficial do ENEM 2026 (aplicada em 8 e 15/11/2026) numa plataforma de estudo para o ENEM. As questões foram extraídas dos PDFs oficiais do INEP por um parser. Seu lote tem de 11 a 15 questões, todas da mesma área.

## Entrada

`loteNN-in.json` (nesta pasta). Cada item:
- `id`, `areaId`, `lingua` (`ingles`/`espanhol` ou null), `gabarito` (letra oficial do INEP)
- `enunciado`: lista de blocos `{texto}` ou `{imagem: caminho .png}`
- `alternativas`: A–E, cada uma `{texto}` ou `{imagem}`
- `paginasDoCaderno`: imagens das páginas do caderno oficial onde a questão aparece (a última pode ser só a página seguinte)

Abra TODAS as imagens com a ferramenta Read (figuras, gráficos e tabelas fazem parte da questão) e olhe a página do caderno de cada questão.

`taxonomia.json` (nesta pasta) lista, por área, as disciplinas (`disciplinaId`) e os assuntos já existentes.

## O que fazer em cada questão

1. **Conferir a extração.** Compare o enunciado e as alternativas extraídos com a página do caderno. Relate em `problemasExtracao` (lista de frases curtas) qualquer diferença que um estudante perceberia: trecho faltando, texto de outra questão grudado, ordem trocada, tabela desmontada, fórmula ou símbolo estragado, imagem cortada ou faltando, alternativa errada. NÃO relate diferenças de quebra de linha, hifenização ou espaçamento. Lista vazia se estiver tudo certo. Não corrija o texto: só relate.
2. **Resolver.** Resolva por conta própria ANTES de olhar o gabarito. Depois compare. Se a sua resposta divergir do gabarito oficial, NÃO force a explicação: preencha `divergencia` com o seu raciocínio em 1–2 frases e escreva a resolução para o gabarito oficial só se, revendo, você se convencer dele. Senão, deixe `html` vazio.
3. **Classificar.** `disciplinaId` tem de ser uma das disciplinas da área da questão em `taxonomia.json`. `assunto`: use EXATAMENTE o nome de um assunto existente daquela disciplina sempre que algum servir. Crie um nome novo só se nenhum servir (até 45 caracteres, estilo dos existentes). Questões de língua estrangeira: `disc-ingles` + "Interpretação de texto em inglês" ou `disc-espanhol` + "Interpretação de texto em espanhol".

## Regras da resolução (`html`)

- Português do Brasil, 2 a 4 parágrafos `<p>…</p>`. Pode usar `<strong>` e `<em>`. Nada de markdown, títulos, listas ou outras tags.
- Explique o raciocínio de um jeito que um estudante de ensino médio acompanhe: o que a questão pede, o dado ou trecho decisivo, a conta ou a interpretação, e por que os distratores mais tentadores estão errados.
- **NUNCA cite letra ou posição de alternativa**: o app embaralha a ordem. Proibido "alternativa A", "letra C", "(B)", "primeira/segunda/última alternativa", "a de cima". Refira-se à alternativa pelo CONTEÚDO ("a alternativa correta é a que traz 36%", "a que fala em responsabilidade ética").
- Contas com unidade e verificação quando couber. Não invente dados que não estão na questão.
- Questão com alternativas em imagem (gráficos, figuras): descreva a correta pelo que ela mostra ("o gráfico que decresce sem tocar o eixo").

Exemplo do tom e do formato (outra prova):

```html
<p>A questão pede a probabilidade de, escolhido ao acaso um internauta brasileiro, ele ser <strong>homem e acessar redes sociais</strong>. O infográfico traz duas informações encadeadas: 90% dos internautas acessam redes sociais, e, entre os que acessam, 60% são mulheres.</p>
<p>Se 60% dos que acessam são mulheres, os homens são 40% desse grupo. Como a probabilidade pedida é a de uma coisa <em>e</em> a outra, multiplique: 90/100 × 40/100 = 36/100, isto é, 36%.</p>
<p>A alternativa correta é a que traz 36/100. Os distratores vêm de erros típicos: 40/100 considera só os homens entre os que acessam e esquece que só 90% estão no grupo.</p>
```

## Saída

Escreva `loteNN-out.json` nesta mesma pasta com a ferramenta Write: um array JSON com UM item por questão, na MESMA ordem e quantidade da entrada:

```json
[{"id": "ENEM2026_Q091", "disciplinaId": "disc-fisica", "assunto": "Eletricidade", "html": "<p>…</p>", "suaResposta": "C", "divergencia": "", "problemasExtracao": []}]
```

Antes de terminar, releia o arquivo e confira:
- JSON válido, mesma quantidade e ordem de ids da entrada;
- nenhum `html` contém `alternativa [A-E]`, `letra [A-E]`, `([A-E])` nem "primeira/segunda/terceira/quarta/quinta/última alternativa";
- todo `disciplinaId` é da área da questão.

Não grave em nenhum outro lugar e não acesse banco de dados nem internet. Na resposta final, diga em poucas linhas: quantas questões, quantas divergências de gabarito e quais problemas de extração encontrou (com o id).
