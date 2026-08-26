// Popula a coleção `taxonomia` com a estrutura oficial do ENEM:
// área → disciplina → assunto. Idempotente: roda por merge, não duplica.
// Uso: npm run seed:taxonomia

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key]) continue;
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: requiredEnv("FIREBASE_ADMIN_PROJECT_ID"),
          clientEmail: requiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
          privateKey: requiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
        }),
      });

const db = getFirestore(app);

// ─── Estrutura oficial do ENEM ───────────────────────────────────────────────
// Assuntos são um ponto de partida editável no admin — não uma lista fechada.

const AREAS = [
  {
    id: "linguagens",
    nome: "Linguagens, Códigos e suas Tecnologias",
    sigla: "LC",
    disciplinas: [
      {
        id: "portugues",
        nome: "Língua Portuguesa",
        assuntos: [
          "Interpretação de texto",
          "Gêneros e tipologias textuais",
          "Funções da linguagem",
          "Variação linguística",
          "Norma culta e gramática",
          "Semântica e figuras de linguagem",
        ],
      },
      {
        id: "literatura",
        nome: "Literatura",
        assuntos: [
          "Escolas literárias",
          "Modernismo brasileiro",
          "Poesia e prosa contemporâneas",
          "Literatura e sociedade",
        ],
      },
      {
        id: "ingles",
        nome: "Inglês",
        assuntos: ["Interpretação de texto em inglês"],
      },
      {
        id: "espanhol",
        nome: "Espanhol",
        assuntos: ["Interpretação de texto em espanhol"],
      },
      {
        id: "artes",
        nome: "Artes",
        assuntos: ["Movimentos artísticos", "Arte e cultura brasileira"],
      },
      {
        id: "educacao-fisica",
        nome: "Educação Física",
        assuntos: ["Corpo, saúde e movimento"],
      },
    ],
  },
  {
    id: "humanas",
    nome: "Ciências Humanas e suas Tecnologias",
    sigla: "CH",
    disciplinas: [
      {
        id: "historia",
        nome: "História",
        assuntos: [
          "Brasil Colônia",
          "Brasil Império",
          "Primeira República",
          "Era Vargas",
          "Ditadura Militar",
          "Idade Média",
          "Idade Moderna",
          "Revoluções industriais",
          "Guerras Mundiais e Guerra Fria",
        ],
      },
      {
        id: "geografia",
        nome: "Geografia",
        assuntos: [
          "Urbanização",
          "Geografia agrária",
          "Geopolítica",
          "Meio ambiente e sustentabilidade",
          "Cartografia",
          "Indústria e energia",
          "Migrações e demografia",
        ],
      },
      {
        id: "filosofia",
        nome: "Filosofia",
        assuntos: [
          "Filosofia antiga",
          "Filosofia moderna",
          "Filosofia contemporânea",
          "Ética e moral",
          "Filosofia política",
        ],
      },
      {
        id: "sociologia",
        nome: "Sociologia",
        assuntos: [
          "Cultura e sociedade",
          "Trabalho e sociedade",
          "Movimentos sociais",
          "Cidadania e direitos",
        ],
      },
    ],
  },
  {
    id: "natureza",
    nome: "Ciências da Natureza e suas Tecnologias",
    sigla: "CN",
    disciplinas: [
      {
        id: "fisica",
        nome: "Física",
        assuntos: [
          "Cinemática",
          "Dinâmica",
          "Trabalho e energia",
          "Termologia",
          "Ondas",
          "Óptica",
          "Eletricidade",
          "Eletromagnetismo",
        ],
      },
      {
        id: "quimica",
        nome: "Química",
        assuntos: [
          "Tabela periódica e ligações",
          "Estequiometria",
          "Soluções",
          "Termoquímica",
          "Eletroquímica",
          "Reações químicas",
          "Química orgânica",
          "Química ambiental",
        ],
      },
      {
        id: "biologia",
        nome: "Biologia",
        assuntos: [
          "Ecologia",
          "Citologia",
          "Genética",
          "Evolução",
          "Fisiologia humana",
          "Botânica",
          "Zoologia",
          "Microbiologia e imunologia",
        ],
      },
    ],
  },
  {
    id: "matematica",
    nome: "Matemática e suas Tecnologias",
    sigla: "MT",
    disciplinas: [
      {
        id: "matematica",
        nome: "Matemática",
        assuntos: [
          "Porcentagem e matemática financeira",
          "Razão e proporção",
          "Grandezas e unidades",
          "Funções",
          "Progressões",
          "Trigonometria",
          "Geometria plana",
          "Geometria espacial",
          "Análise combinatória",
          "Probabilidade",
          "Estatística",
        ],
      },
    ],
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const col = db.collection("taxonomia");
  const batchLimit = 400;
  let writes = [];
  let total = 0;

  const push = (ref, data) => {
    writes.push({ ref, data });
  };

  AREAS.forEach((area, areaIdx) => {
    push(col.doc(`area-${area.id}`), {
      tipo: "area",
      nome: area.nome,
      sigla: area.sigla,
      ordem: areaIdx + 1,
      ativo: true,
    });

    area.disciplinas.forEach((disc, discIdx) => {
      push(col.doc(`disc-${disc.id}`), {
        tipo: "disciplina",
        nome: disc.nome,
        areaId: `area-${area.id}`,
        ordem: discIdx + 1,
        ativo: true,
      });

      disc.assuntos.forEach((assunto, assIdx) => {
        push(col.doc(`ass-${disc.id}-${slugify(assunto)}`), {
          tipo: "assunto",
          nome: assunto,
          areaId: `area-${area.id}`,
          disciplinaId: `disc-${disc.id}`,
          ordem: assIdx + 1,
          ativo: true,
        });
      });
    });
  });

  while (writes.length > 0) {
    const chunk = writes.splice(0, batchLimit);
    const batch = db.batch();
    for (const { ref, data } of chunk) {
      batch.set(
        ref,
        {
          ...data,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
    total += chunk.length;
  }

  const areas = AREAS.length;
  const discs = AREAS.reduce((n, a) => n + a.disciplinas.length, 0);
  const assuntos = AREAS.reduce(
    (n, a) => n + a.disciplinas.reduce((m, d) => m + d.assuntos.length, 0),
    0
  );
  console.log(
    `Taxonomia ENEM: ${areas} áreas, ${discs} disciplinas, ${assuntos} assuntos (${total} docs gravados).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Falha no seed:", err);
    process.exit(1);
  });
