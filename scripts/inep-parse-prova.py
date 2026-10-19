"""Extrai questões dos cadernos oficiais do ENEM (PDF do INEP).

O caderno é de 2 colunas. A ordem de leitura é coluna esquerda inteira,
depois a direita. Cada questão começa num marcador "Questão NN" em
Calibri-Bold 11 — detectar por FONTE é confiável; por bloco de texto não é,
porque às vezes o marcador vem grudado no parágrafo seguinte.

Uso: python parse_prova.py <prova.pdf> <saida.json>
"""
import fitz, re, json, sys, hashlib, os

# Fronteira entre as colunas: o meio da página. A coluna esquerda começa em
# x≈23 e a direita em x≈286, numa página de 567pt — 283 separa com folga.
# (Valor fixo de 291 jogava o topo da coluna direita para a esquerda e
# embaralhava a ordem das questões.)
RODAPE = 730.0        # abaixo disso é rodapé
TOPO = 60.0           # acima disso é cabeçalho
MARCADOR = re.compile(r'^\s*Quest[ãa]o\s*(\d{1,3})\s*$')
# "Texto para as Questões de 06 a 10." — um texto único que serve a várias
# questões; aparece UMA vez no caderno e as questões seguintes só trazem o
# comando. Sem isto, essas questões ficam sem enunciado.
COMPARTILHADO = re.compile(
    r'Texto\s+para\s+as?\s+Quest(?:ões|ão)\s+(?:de\s+)?(\d{1,3})(?:\s*(?:a|e)\s*(\d{1,3}))?', re.I)
ALTERNATIVA = re.compile(r'^([A-E])\t(.*)$', re.S)
# Alternativa cujo conteúdo é uma FIGURA: a letra vem sozinha na linha e a
# imagem aparece logo depois (comum em gráficos, estruturas e heredogramas).
ALTERNATIVA_IMG = re.compile(r'^\s*([A-E])\s*$')
# Lixo da diagramação que o extrator traz junto: marca d'água repetida ao
# longo da página e o código do caderno impresso.
LIXO = re.compile(r'^(?:\*[0-9A-Z]{6,}\*|[\s\ufffc]*)$')
# Blocos do caderno que NÃO são questão: a partir deles, nada mais pertence à
# questão anterior. Sem isso, os textos motivadores da redação (cartaz, gráfico)
# grudavam na última questão de Linguagens.
TERMINADOR = re.compile(
    r'^(?:PROPOSTA DE REDA[ÇC][ÃA]O|INSTRU[ÇC][ÕO]ES PARA A REDA[ÇC][ÃA]O'
    r'|REDA[ÇC][ÃA]O|CI[ÊE]NCIAS (?:HUMANAS|DA NATUREZA)[^\n]*'
    r'|MATEM[ÁA]TICA E SUAS[^\n]*|LINGUAGENS, C[ÓO]DIGOS[^\n]*)$', re.I)
# Fórmula desenhada com glifos posicionados: a extração devolve caracteres de
# controle soltos. Um "parágrafo" só de glifo não carrega nada legível.
SO_GLIFO = re.compile(r'^[\x00-\x08\x0b-\x1f\ue000-\uf8ff\s]+$')
CARIMBO = re.compile(r'(?:ENE[MN]\s?\d{4}){2,}')  # marca d'água (o PDF tem "ENEN" com N)
SO_CARIMBO = re.compile(r'^(?:ENE[MN]\s?\d{4})+$')  # sobra isolada da marca

def coluna(x0, meio):
    return 0 if x0 < meio else 1

def numeros_de_margem(linhas):
    """Textos longos do ENEM vêm com numeração de linha na margem. O número
    fica à ESQUERDA do corpo, na mesma altura da linha que numera — então
    some no meio do texto e quebra o parágrafo a cada linha. Um número só é
    de margem quando existe texto de verdade na mesma altura, à sua direita."""
    descartar = set()
    numericas = [(i, x0) for i, (x0, y0, txt) in enumerate(linhas)
                 if re.fullmatch(r'\d{1,3}', txt.strip())]
    for i, x0 in numericas:
        y0 = linhas[i][1]
        for j, (xj, yj, tj) in enumerate(linhas):
            if j != i and abs(yj - y0) < 2.5 and xj > x0 + 8 and len(tj.strip()) > 12:
                descartar.add(i)
                break
    # a numeração forma uma coluna própria: todo número nessa faixa de x é dela
    if len(descartar) >= 3:
        faixa = [linhas[i][0] for i in descartar]
        lo, hi = min(faixa) - 3, max(faixa) + 3
        for i, x0 in numericas:
            if lo <= x0 <= hi:
                descartar.add(i)
    return descartar


def itens_da_pagina(doc, pno, dir_img):
    """Devolve (coluna, y, tipo, conteudo) de cada linha de texto e imagem.

    Uma passada só: coleta as linhas já filtradas, decide numeração de margem
    e orientação da página sobre ESSA lista, e só então emite. (Com duas
    passadas e filtros diferentes os índices dessincronizavam e o filtro de
    numeração acabava descartando a linha errada — sumiu uma questão inteira.)
    """
    pag = doc[pno]
    meio = pag.rect.width / 2

    linhas, imagens = [], []
    for ibl, bl in enumerate(pag.get_text("dict")["blocks"]):
        bx0, by0, bx1, by1 = bl["bbox"]
        if by0 > RODAPE or by1 < TOPO:
            continue
        if bl["type"] == 1:
            imagens.append((bx0, by0, bl["bbox"]))
            continue
        for ln in bl.get("lines", []):
            lx0, ly0, lx1 = ln["bbox"][0], ln["bbox"][1], ln["bbox"][2]
            if ly0 > RODAPE or ly0 < TOPO:
                continue
            bruto = "".join(sp["text"] for sp in ln["spans"])
            texto = CARIMBO.sub("", bruto).strip()
            if not texto or LIXO.match(texto) or SO_CARIMBO.match(texto) \
               or SO_GLIFO.match(texto):
                continue
            negrito11 = any(sp["font"] == "Calibri-Bold" and abs(sp["size"] - 11) < 0.6
                            for sp in ln["spans"])
            linhas.append({"x": lx0, "y": ly0, "x1": lx1, "texto": texto,
                           "bloco": (pno, ibl), "bbox": ln["bbox"], "negrito11": negrito11})

    descartar = numeros_de_margem([(l["x"], l["y"], l["texto"]) for l in linhas])
    # Duas colunas de verdade exigem DOIS sinais: uma fatia relevante das
    # linhas começando à direita E essa metade cobrindo boa parte da altura
    # da página. Só a fatia não basta — a coluna da direita de uma TABELA
    # larga também começa à direita, mas ocupa poucos centímetros de altura,
    # e tratá-la como coluna jogava os dados da tabela para depois das
    # alternativas, onde eram descartados (a Q142 perdeu as velocidades).
    dir_ys = [l["y"] for l in linhas if l["x"] > meio]
    todos_ys = [l["y"] for l in linhas]
    frac = len(dir_ys) / len(linhas) if linhas else 0
    altura = (max(todos_ys) - min(todos_ys)) if len(todos_ys) > 1 else 0
    cobertura = ((max(dir_ys) - min(dir_ys)) / altura) if len(dir_ys) > 1 and altura else 0
    coluna_unica = not (frac >= 0.15 and cobertura >= 0.5)
    col = lambda x: 0 if coluna_unica else coluna(x, meio)

    itens = []
    for x0, y0, bbox in imagens:
        itens.append({"c": col(x0), "y": y0, "tipo": "img", "cont": (pno, bbox)})
    for i, l in enumerate(linhas):
        if i in descartar:
            continue
        mc = COMPARTILHADO.search(l["texto"])
        m = MARCADOR.match(l["texto"])
        base = {"c": col(l["x"]), "y": l["y"]}
        if TERMINADOR.match(l["texto"].strip()):
            itens.append({**base, "tipo": "fim", "cont": None})
        elif mc and l["negrito11"]:
            ini_q = int(mc.group(1)); fim_q = int(mc.group(2) or mc.group(1))
            itens.append({**base, "tipo": "compartilhado", "cont": (ini_q, fim_q)})
        elif m and l["negrito11"]:
            itens.append({**base, "tipo": "marcador", "cont": int(m.group(1))})
        else:
            itens.append({**base, "tipo": "texto",
                          "cont": (l["texto"], l["bloco"], (pno, l["bbox"]))})
    itens.sort(key=lambda t: (t["c"], t["y"]))
    return [(t["c"], t["y"], t["tipo"], t["cont"]) for t in itens]


def salva_imagem(doc, pno, bbox, dir_img, seq):
    """Recorta a região da imagem em PNG (evita lidar com xref/máscara)."""
    pag = doc[pno]
    # 4pt de folga: sem isso, rótulo colado na borda da figura sai cortado.
    rect = fitz.Rect(bbox) + (-4, -4, 4, 4)
    rect = rect & pag.rect
    pix = pag.get_pixmap(clip=rect, dpi=200)
    nome = f"p{pno+1:02d}_{seq:03d}.png"
    caminho = os.path.join(dir_img, nome)
    pix.save(caminho)
    return nome, pix.width, pix.height

def paragrafos(seq):
    """Agrupa linhas do mesmo bloco num parágrafo; imagem é item próprio."""
    out, buf, bloco_atual = [], [], object()
    def fecha():
        if buf:
            out.append({"tipo": "p", "texto": " ".join(buf).strip()})
            buf.clear()
    for tipo, cont, bloco, *_ in seq:
        if tipo == "img":
            fecha(); out.append({"tipo": "img", "arquivo": cont}); bloco_atual = object()
            continue
        if bloco != bloco_atual:
            fecha(); bloco_atual = bloco
        buf.append(cont.strip())
    fecha()
    return [o for o in out if o["tipo"] == "img" or o["texto"]]


def parse(pdf, saida):
    doc = fitz.open(pdf)
    dir_img = os.path.splitext(saida)[0] + "_imgs"
    os.makedirs(dir_img, exist_ok=True)

    fluxo = []
    for pno in range(doc.page_count):
        fluxo += itens_da_pagina(doc, pno, dir_img)

    questoes, atual, seq = [], None, 0
    compartilhados, alvo_compart = [], None
    for col, y, tipo, cont in fluxo:
        if tipo == "compartilhado":
            if atual: questoes.append(atual)
            alvo_compart = cont
            atual = {"numero": None, "faixa": cont, "linhas": [], "imagens": [], "seq": []}
            continue
        if tipo == "fim":
            if atual:
                (compartilhados if atual["numero"] is None else questoes).append(atual)
            atual = None                      # nada mais é da questão anterior
            continue
        if tipo == "marcador":
            if atual:
                (compartilhados if atual["numero"] is None else questoes).append(atual)
            atual = {"numero": cont, "linhas": [], "imagens": [], "seq": []}
            continue
        if atual is None:
            continue                              # capa/instruções antes da 1ª
        if tipo == "img":
            pno, bbox = cont
            if (bbox[2]-bbox[0]) < 40 or (bbox[3]-bbox[1]) < 40:
                continue                          # ícone/filete, não ilustração
            seq += 1
            nome, w, h = salva_imagem(doc, pno, bbox, dir_img, seq)
            atual["imagens"].append({"arquivo": nome, "w": w, "h": h})
            atual["seq"].append(("img", nome, None, None))
        else:
            txt, bloco, pos = cont
            atual["linhas"].append(txt)
            atual["seq"].append(("txt", txt, bloco, pos))
    if atual:
        (compartilhados if atual["numero"] is None else questoes).append(atual)

    # separa enunciado de alternativas
    for q in questoes:
        enun, alts, alts_img, seq_enun = [], {}, {}, []
        letra, bloco_letra, em_alts = None, None, False
        pos_alt = {}
        img_pendente = None            # a figura de uma alternativa vem ANTES
        for tipo, cont, bloco, pos in q["seq"]:            # da letra (letra ao lado)
            if tipo == "img":
                img_pendente = cont
                continue
            m = ALTERNATIVA.match(cont) or ALTERNATIVA_IMG.match(cont)
            if m:
                letra = m.group(1)
                texto_alt = (m.lastindex == 2 and m.group(2) or "").strip()
                em_alts, bloco_letra = True, bloco
                alts[letra] = texto_alt
                if pos: pos_alt[letra] = pos
                if not texto_alt and img_pendente:    # alternativa é a figura
                    alts_img[letra] = img_pendente
                    img_pendente = None
                continue
            if img_pendente:                          # figura do enunciado
                enun.append(f"[[IMG:{img_pendente}]]")
                seq_enun.append(("img", img_pendente, None, None))
                img_pendente = None
            if em_alts and letra and bloco == bloco_letra:
                alts[letra] = (alts[letra] + " " + cont.strip()).strip()
            elif em_alts:
                q.setdefault("descartadas", []).append(cont.strip())
            elif not em_alts:
                enun.append(cont)
                seq_enun.append(("txt", cont, bloco, pos))
        if img_pendente and not em_alts:
            enun.append(f"[[IMG:{img_pendente}]]")
            seq_enun.append(("img", img_pendente, None, None))
        q["seq_enun"] = seq_enun
        q["enunciado"] = "\n".join(enun).strip()
        q["paragrafos"] = paragrafos(q["seq_enun"])
        q["alternativas"] = alts
        q["alternativasImagem"] = alts_img
        q["posAlternativas"] = {k: [v[0], list(v[1])] for k, v in pos_alt.items()}
        del q["linhas"], q["seq"], q["seq_enun"]

    # devolve o texto compartilhado a cada questão da faixa
    for c in compartilhados:
        texto = "\n".join(x for t, x, *_ in c["seq"] if t == "txt").strip()
        paras_c = paragrafos(c["seq"])
        ini, fim = c["faixa"]
        for q in questoes:
            if q["numero"] is not None and ini <= q["numero"] <= fim:
                q["enunciado"] = (texto + "\n" + q["enunciado"]).strip()
                q["imagens"] = c["imagens"] + q["imagens"]
                q["paragrafos"] = paras_c + q["paragrafos"]
                q["textoCompartilhado"] = f"{ini}-{fim}"

    json.dump(questoes, open(saida, "w"), ensure_ascii=False, indent=1)
    return questoes

if __name__ == "__main__":
    qs = parse(sys.argv[1], sys.argv[2])
    print(f"questões extraídas: {len(qs)}")
    nums = [q["numero"] for q in qs]
    print("números:", nums)
    ruins = [q["numero"] for q in qs if len(q["alternativas"]) != 5]
    print("com != 5 alternativas:", ruins or "nenhuma")
    curtas = [q["numero"] for q in qs if len(q["enunciado"]) < 60]
    print("enunciado < 60 chars:", curtas or "nenhuma")
    print("com imagem:", sum(1 for q in qs if q["imagens"]))
