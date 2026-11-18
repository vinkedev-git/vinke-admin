# Recorte das alternativas em figura/fração do caderno 5 (2º dia) do ENEM 2026,
# que o inep-render-alternativas.py não cobre: grade 2x3 (Q91, Q168, Q175) e
# frações em lista (Q141). Posições das letras lidas do PDF (fonte BundesbahnPi).
# Uso: python recorte2026.py <dir com o pdf e out_2026_d2.json>
import fitz, json, sys, os

DIR = sys.argv[1]
PDF = os.path.join(DIR, "2026_PV_impresso_D2_CD5.pdf")
JS = os.path.join(DIR, "out_2026_d2.json")
IMGS = os.path.join(DIR, "out_2026_d2_imgs")
FUNDO = 743  # logo acima do pontilhado do rodapé (y≈745)

# página, linhas (y0 da letra por linha), colunas (x0 da letra por coluna), x final, comando
GRADE = {
    91:  dict(pag=1,  ys=[446, 566, 687], xs=[30, 158],  xfim=283, cmd="eletromagnética clássica?"),
    168: dict(pag=24, ys=[472, 580, 687], xs=[23, 151],  xfim=279, cmd="sobre o plano"),
    175: dict(pag=28, ys=[343, 504, 666], xs=[23, 283],  xfim=545, cmd="câmera fica ligada é"),
}
LISTA = {141: dict(pag=16, ys=[591, 622, 653, 685, 716], x0=23, xfim=283, cmd="transferência de dados?")}

doc = fitz.open(PDF)
qs = json.load(open(JS))
por_num = {q["numero"]: q for q in qs}


def salva(pag, rect, nome):
    pix = doc[pag].get_pixmap(dpi=200, clip=rect)
    pix.save(os.path.join(IMGS, nome))
    return nome


def fim_do_comando(pag, cmd):
    """y inferior da linha do comando na página (o recorte começa abaixo dela)."""
    for b in doc[pag].get_text("dict", flags=fitz.TEXTFLAGS_DICT | fitz.TEXT_INHIBIT_SPACES)["blocks"]:
        for l in b.get("lines", []):
            if cmd in "".join(s["text"] for s in l["spans"]):
                return l["bbox"][3] + 2
    raise SystemExit(f"comando não achado: {cmd}")


def corta_enunciado(q, cmd):
    paras = q["paragrafos"]
    corte = None
    for i, p in enumerate(paras):
        if p.get("tipo") != "img" and cmd in (p.get("texto") or ""):
            corte = i
    assert corte is not None, (q["numero"], cmd)
    texto = paras[corte]["texto"]
    # o comando pode vir grudado com sobra das alternativas na mesma linha
    fim = texto.index(cmd) + len(cmd)
    resto = texto[fim:]
    if cmd == "sobre o plano":  # "... sobre o plano a é" (alfa vira 'a')
        fim = texto.index(" é", fim) + 2 if " é" in resto else fim
    paras[corte]["texto"] = texto[:fim]
    q["paragrafos"] = paras[: corte + 1]
    q["enunciado"] = " ".join((p.get("texto") or f"[[IMG:{p.get('arquivo')}]]") for p in q["paragrafos"])


for n, g in GRADE.items():
    q = por_num[n]
    topo = fim_do_comando(g["pag"], g["cmd"])
    passo = g["ys"][1] - g["ys"][0]
    meia = passo / 2
    alt, altimg = {}, {}
    letras = iter("ABCDE")
    for ci, x0 in enumerate(g["xs"]):
        x1 = g["xs"][ci + 1] - 3 if ci + 1 < len(g["xs"]) else g["xfim"]
        for y in g["ys"]:
            if ci == 1 and y == g["ys"][-1]:
                break  # 2ª coluna só tem D e E
            L = next(letras)
            cy = y + 5
            r = fitz.Rect(x0 - 2, max(cy - meia, topo), x1, min(cy + meia, FUNDO))
            altimg[L] = salva(g["pag"], r, f"alt_q{n}_{L}.png")
            alt[L] = ""
    assert list(altimg) == list("ABCDE"), (n, list(altimg))
    q["alternativas"], q["alternativasImagem"] = alt, altimg
    corta_enunciado(q, g["cmd"])

for n, g in LISTA.items():
    q = por_num[n]
    alt, altimg = {}, {}
    for i, (L, y) in enumerate(zip("ABCDE", g["ys"])):
        cy = y + 5  # a letra fica na altura do traço da fração
        r = fitz.Rect(g["x0"] + 14, cy - 14, g["x0"] + 150, cy + 14)
        altimg[L] = salva(g["pag"], r, f"alt_q{n}_{L}.png")
        alt[L] = ""
    q["alternativas"], q["alternativasImagem"] = alt, altimg
    corta_enunciado(q, g["cmd"])

json.dump(qs, open(JS, "w"), ensure_ascii=False, indent=1)
for n in list(GRADE) + list(LISTA):
    q = por_num[n]
    print(n, q["alternativasImagem"], "| fim:", q["enunciado"][-90:])
