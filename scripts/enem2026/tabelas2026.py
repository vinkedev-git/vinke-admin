# ENEM 2026 (caderno 5, dia 2): tabelas e alternativas que o texto não representa
# bem viram recorte de imagem do caderno.
#  - TABELAS: substitui os parágrafos [i0..i1] do enunciado por uma imagem.
#    O retângulo vem das linhas do PDF cujo texto está nesses parágrafos,
#    ampliado pelos fios (desenhos) da tabela na mesma faixa e coluna.
#  - ALTERNATIVAS: frações empilhadas e radicais (Q143, Q167, Q179) viram imagem.
# Uso: python tabelas2026.py <dir com o pdf e out_2026_d2.json> [--so-mostrar]
import fitz, json, os, re, sys

DIR = sys.argv[1]
SO_MOSTRAR = "--so-mostrar" in sys.argv
doc = fitz.open(os.path.join(DIR, "2026_PV_impresso_D2_CD5.pdf"))
JS = os.path.join(DIR, "out_2026_d2.json")
IMGS = os.path.join(DIR, "out_2026_d2_imgs")
qs = json.load(open(JS)); Q = {q["numero"]: q for q in qs}
FL = fitz.TEXTFLAGS_DICT | fitz.TEXT_INHIBIT_SPACES

TABELAS = {92: (1, 5), 113: (2, 3), 133: (1, 3), 135: (1, 12), 152: (3, 7), 165: (3, 5), 180: (1, 8)}
ALTS_IMG = (143, 167, 179)
# tabelas cujas linhas de números não casam com o texto (já convertido para
# índices): retângulo conferido à mão na página renderizada
RECT_MANUAL = {113: fitz.Rect(283, 403, 545, 498), 152: fitz.Rect(26, 480, 276, 592)}

norm = lambda s: re.sub(r"\s+", "", s)

def pagina(n):
    rx = re.compile(rf"QUEST[ÃA]O\s*{n}\b", re.I)
    return next(p for p in range(doc.page_count) if rx.search(doc[p].get_text(flags=fitz.TEXT_INHIBIT_SPACES)))

def linhas(pn):
    out = []
    for b in doc[pn].get_text("dict", flags=FL)["blocks"]:
        for l in b.get("lines", []):
            t = "".join(s["text"] for s in l["spans"]).strip()
            if t: out.append((fitz.Rect(l["bbox"]), t))
    return out

def marcador_y(pn, n):
    for r, t in linhas(pn):
        if re.match(rf"QUEST[ÃA]O\s*{n}\b", norm(t), re.I) or re.match(rf"QUEST[ÃA]O{n}$", norm(t), re.I):
            return r
    return None

def salva(pn, rect, nome):
    pix = doc[pn].get_pixmap(dpi=200, clip=rect)
    pix.save(os.path.join(IMGS, nome)); return nome

meio = doc[0].rect.width / 2
resumo = []
for n, (i0, i1) in TABELAS.items():
    q = Q[n]; pn = pagina(n)
    alvo = norm(" ".join(p.get("texto", "") for p in q["paragrafos"][i0:i1 + 1]))
    mk = marcador_y(pn, n)
    # coluna da questão: a do marcador (página de 2 colunas) ou a página toda
    lin = [(r, t) for r, t in linhas(pn) if r.y0 > (mk.y1 if mk else 0)]
    hits = [r for r, t in lin if len(norm(t)) >= 4 and norm(t) in alvo and r.y1 < 735]
    # só a faixa contínua logo depois do texto anterior à tabela
    rect = fitz.Rect(hits[0])
    for r in hits[1:]:
        if r.y0 - rect.y1 < 40: rect |= r
    # fios da tabela na mesma faixa vertical (comparados ao texto ORIGINAL, sem
    # encadear; o fio do rodapé fica de fora pelo limite de y)
    base = fitz.Rect(rect)
    for dr in doc[pn].get_drawings():
        rr = dr["rect"]
        if rr.y1 < 735 and rr.y0 >= base.y0 - 25 and rr.y1 <= base.y1 + 25 and rr.intersects(base + (-30, -25, 30, 25)):
            rect |= rr
    rect = (rect + (-5, -5, 5, 5)) & doc[pn].rect
    if n in RECT_MANUAL: rect = RECT_MANUAL[n]
    nome = f"tabela_q{n}.png"
    resumo.append((n, pn, [round(v) for v in rect]))
    if not SO_MOSTRAR:
        salva(pn, rect, nome)
        q["paragrafos"] = q["paragrafos"][:i0] + [{"tipo": "img", "arquivo": nome}] + q["paragrafos"][i1 + 1:]
        q["tabelaRenderizada"] = True

# alternativas como imagem: posição das letras na fonte do círculo
for n in ALTS_IMG:
    q = Q[n]; pn = pagina(n); mk = marcador_y(pn, n)
    letras = {}
    for b in doc[pn].get_text("dict", flags=FL)["blocks"]:
        for l in b.get("lines", []):
            sp = l["spans"][0]
            if "BundesbahnPi" in sp["font"] and sp["text"].strip() in "ABCDE" and sp["text"].strip():
                r = fitz.Rect(sp["bbox"])
                if mk and abs(r.x0 - mk.x0) < 15 and r.y0 > mk.y1:
                    letras.setdefault(sp["text"].strip(), r)
    assert list(sorted(letras)) == list("ABCDE"), (n, letras)
    ys = [letras[L].y0 for L in "ABCDE"]
    xfim = mk.x0 + (meio - 30 if mk.x0 < meio else meio - 30)
    alt, altimg = {}, {}
    # cada alternativa vai até o meio do caminho para as vizinhas (alturas
    # variam: fração empilhada é mais alta que uma linha simples)
    cys = [(letras[L].y0 + letras[L].y1) / 2 for L in "ABCDE"]
    for i, L in enumerate("ABCDE"):
        r = letras[L]; cy = cys[i]
        acima = (cy - cys[i - 1]) / 2 if i else (cys[1] - cys[0]) / 2
        abaixo = (cys[i + 1] - cy) / 2 if i < 4 else (cys[4] - cys[3]) / 2
        rect = fitz.Rect(r.x1 + 1, cy - acima + 1, xfim, cy + abaixo - 1)
        resumo.append((f"{n}{L}", pn, [round(v) for v in rect]))
        if not SO_MOSTRAR:
            altimg[L] = salva(pn, rect, f"alt_q{n}_{L}.png"); alt[L] = ""
    if not SO_MOSTRAR:
        q["alternativas"], q["alternativasImagem"] = alt, altimg

for r in resumo: print(r)
if not SO_MOSTRAR:
    json.dump(qs, open(JS, "w"), ensure_ascii=False, indent=1)
    print("gravado", JS)
