"""Recorta as alternativas de uma questão como IMAGEM.

Serve para as questões cujas alternativas são fórmulas: o PDF as desenha com
glifos posicionados, e a extração de texto devolve caracteres de controle e
números soltos ("1 2" no lugar de 1/2). Renderizar a região preserva o que o
aluno vê de fato na prova.

Uso: python render_alts.py <prova.pdf> <questoes.json> <dir_imgs> 150,155,...
"""
import fitz, json, re, sys, os

RODAPE = 730.0

def fundo_do_conteudo(pag, topo, limite):
    """Última altura ocupada por conteúdo entre topo e limite.

    Cortar no y da próxima letra garante o denominador inteiro da fração, mas
    traz um fio da alternativa seguinte. Medindo onde o conteúdo DESTA
    alternativa realmente termina, o recorte fica justo nos dois casos.
    """
    fundos = []
    for bl in pag.get_text("dict")["blocks"]:
        if bl["type"] == 1:
            continue
        for ln in bl.get("lines", []):
            y0, y1 = ln["bbox"][1], ln["bbox"][3]
            if y0 >= topo and y0 < limite - 0.5:
                fundos.append(min(y1, limite))
    for dr in pag.get_drawings():
        r = dr["rect"]
        if r.y0 >= topo and r.y0 < limite - 0.5:
            fundos.append(min(r.y1, limite))
    return (max(fundos) + 1.5) if fundos else None


def faixa_coluna(pag, x0, topo=None, base=None):
    """Extremo direito do recorte.

    Assumir a largura da coluna corta alternativa que atravessa o meio da
    página (acontece quando a questão ocupa a largura toda). Quando a faixa
    vertical é conhecida, medimos até onde o conteúdo realmente vai.
    """
    meio = pag.rect.width / 2
    limite = pag.rect.width - 20
    if topo is None or base is None:
        return (meio - 6) if x0 < meio else limite
    caixas = []
    for bl in pag.get_text("dict")["blocks"]:
        if bl["type"] == 1:
            continue
        for ln in bl.get("lines", []):
            caixas.append((ln["bbox"][1], ln["bbox"][0], ln["bbox"][2]))
    for dr in pag.get_drawings():
        r = dr["rect"]
        caixas.append((r.y0, r.x0, r.x1))
    na_faixa = [(bx0, bx1) for y0, bx0, bx1 in caixas
                if topo <= y0 < base and bx0 >= x0 - 2]
    esquerda = x0 < meio
    # Medir "até onde o conteúdo vai" sem olhar a divisa das colunas fazia o
    # recorte da coluna ESQUERDA engolir o que estivesse na direita na mesma
    # altura (a fórmula saía com um pedaço da ilustração vizinha colado).
    # Só ultrapassa a divisa se algum conteúdo de fato a ATRAVESSA — que é o
    # caso real de alternativa larga, quando a questão ocupa a página toda.
    atravessa = any(bx0 < meio - 6 and bx1 > meio + 6 for bx0, bx1 in na_faixa)
    teto = limite if (not esquerda or atravessa) else meio - 6
    direita = x0
    for bx0, bx1 in na_faixa:
        if esquerda and not atravessa and bx0 >= meio - 6:
            continue                      # conteúdo da outra coluna: ignora
        direita = max(direita, bx1)
    return min(max(direita + 6, x0 + 60), teto)

def topo_visual(pag, y_letra, piso, x_ini, x_fim):
    """Topo REAL do bloco de uma alternativa.

    Numa fração o numerador é desenhado ACIMA da linha da letra. Usar o y da
    letra seguinte como fim da alternativa anterior deixava esse numerador
    colado no fim dela (a alternativa saía "R = L/raiz(pi)" e logo abaixo um
    "L" solto, que é o numerador da seguinte).
    """
    topo = y_letra
    for bl in pag.get_text("dict")["blocks"]:
        if bl["type"] == 1:
            continue
        for ln in bl.get("lines", []):
            y0, bx0 = ln["bbox"][1], ln["bbox"][0]
            # tem de COMEÇAR indentado: testar sobreposição deixava passar a
            # linha larga do comando, que cruza a faixa mas nasce na margem.
            if not (x_ini <= bx0 <= x_fim):
                continue
            if piso < y0 < y_letra:
                topo = min(topo, y0)
    for dr in pag.get_drawings():
        r = dr["rect"]
        if not (x_ini <= r.x0 <= x_fim):
            continue
        if piso < r.y0 < y_letra:
            topo = min(topo, r.y0)
    return topo

MARCADOR_Q = re.compile(r'^\s*QUEST[ÃA]O\s*\d{1,3}\s*$', re.I)

def teto_proxima_questao(pag, y_apos, x_ini, x_fim):
    """y do próximo marcador 'QUESTÃO n' abaixo de y_apos, na mesma coluna.

    A ÚLTIMA alternativa não tem letra seguinte para limitar o recorte, e a
    estimativa por espaçamento às vezes passava do fim da questão: o corte
    saía com o cabeçalho da questão seguinte e a marca d'água dentro.
    """
    melhor = None
    for bl in pag.get_text("dict")["blocks"]:
        if bl["type"] == 1:
            continue
        for ln in bl.get("lines", []):
            y0, bx0 = ln["bbox"][1], ln["bbox"][0]
            if y0 <= y_apos or not (x_ini - 20 <= bx0 <= x_fim):
                continue
            txt = "".join(sp["text"] for sp in ln.get("spans", []))
            if MARCADOR_Q.match(txt):
                melhor = y0 if melhor is None else min(melhor, y0)
    return melhor

def render(pdf, arq_json, dir_imgs, numeros):
    doc = fitz.open(pdf)
    qs = json.load(open(arq_json))
    os.makedirs(dir_imgs, exist_ok=True)
    tocadas = 0
    for q in qs:
        if q["numero"] not in numeros:
            continue
        pos = q.get("posAlternativas") or {}
        letras = [L for L in "ABCDE" if L in pos]
        if len(letras) < 2:
            print(f"  Q{q['numero']}: sem posição suficiente, pulada"); continue
        # As alternativas podem se dividir entre as colunas (A,B,C à esquerda e
        # D,E à direita). O fim de uma alternativa é a próxima letra DA MESMA
        # coluna; a última de cada coluna vai até o pé da mancha.
        def grupo(L):
            pno, bb = pos[L][0], pos[L][1]
            return (pno, 0 if bb[0] < doc[pno].rect.width / 2 else 1)
        proxima, prox_letra = {}, {}
        for L in letras:
            seguintes = [M for M in letras
                         if grupo(M) == grupo(L) and pos[M][1][1] > pos[L][1][1]]
            if seguintes:
                M = min(seguintes, key=lambda M: pos[M][1][1])
                proxima[L], prox_letra[L] = pos[M][1][1], M
            else:
                proxima[L], prox_letra[L] = None, None
        # topo visual de cada letra (inclui o numerador desenhado acima dela)
        anterior = {}
        for L in letras:
            antes = [M for M in letras
                     if grupo(M) == grupo(L) and pos[M][1][1] < pos[L][1][1]]
            anterior[L] = max((pos[M][1][1] for M in antes), default=None)
        topo_vis = {}
        for L in letras:
            pno_L, bb_L = pos[L][0], pos[L][1]
            pagL = doc[pno_L]
            # O numerador fica COLADO acima da própria letra. Usar a letra
            # anterior como piso fazia a barra de fração da alternativa de
            # cima ser atribuída a esta, e o corte da anterior subia e
            # decepava o denominador dela. Janela estreita resolve.
            piso = bb_L[1] - 16
            if anterior[L] is not None:
                piso = max(piso, anterior[L] + 2)
            # Só conta como "numerador acima da letra" o que estiver
            # INDENTADO em relação à letra. O comando da questão começa na
            # mesma margem da letra (x~31) e o numerador vem recuado (x~69);
            # sem esse corte, o topo subia e engolia o fim do comando.
            # Só faz sentido procurar numerador ACIMA da letra quando a
            # linha da letra tem altura normal de texto. Em "A \t 1" a linha
            # já vem alta (~21pt) porque o numerador está nela, e aí o que
            # existe acima é a barra de fração da alternativa ANTERIOR —
            # considerá-la puxava o recorte para cima e cada alternativa saía
            # com o rabo da de cima e sem o próprio fim.
            if bb_L[3] - bb_L[1] >= 18:
                topo_vis[L] = bb_L[1]
            else:
                topo_vis[L] = topo_visual(pagL, bb_L[1], piso,
                                          bb_L[0] + 10, faixa_coluna(pagL, bb_L[0]))
        passos = [b - a for L in letras if (a := pos[L][1][1]) and (b := proxima[L])]
        passo = max(passos) if passos else 36
        novas = {}
        for i, L in enumerate(letras):
            pno, (bx0, by0, bx1, by1) = pos[L][0], pos[L][1]
            pag = doc[pno]
            topo = min(by0, topo_vis[L]) - 1
            # Recuo proporcional ao espaçamento: 10pt fixos cortavam demais
            # quando as alternativas são linhas de texto coladas (13pt entre
            # elas), e a região saía degenerada.
            vao = (proxima[L] - by0) if proxima[L] else passo
            # Sem folga: numa fração o denominador desce até a altura exata
            # em que a próxima alternativa começa, e qualquer recuo o cortava.
            # O custo é um fio da anterior no topo da seguinte — melhor que
            # perder conteúdo.
            # Na ÚLTIMA alternativa não há "próxima letra" para servir de
            # limite. O teto de 730 (usado para ignorar rodapé no parser) é
            # conservador demais aqui: o denominador de uma fração cai logo
            # abaixo dele e saía cortado. O rodapé real começa perto de 748.
            if proxima[L]:
                # recorte justo: para antes do numerador da PRÓXIMA alternativa.
                # Em alguns layouts esse topo cai praticamente em cima do
                # início desta, e a região degenera — aí vale o limite antigo
                # (o y da próxima letra), que no pior caso deixa um fio.
                limite = topo_vis[prox_letra[L]] - 1
                if limite - topo < 8:
                    limite = proxima[L]
            else:
                limite = min(by0 + passo * 1.5, 742.0)
                teto = teto_proxima_questao(pag, by1, bx0,
                                            faixa_coluna(pag, bx0))
                if teto and teto - 6 > topo + 8:
                    limite = min(limite, teto - 6)
            # Com 'limite' já apontando para o topo VISUAL da próxima
            # alternativa, ele é a borda certa: medir o fundo do conteúdo
            # passou a atrapalhar, porque a raiz e outros glifos desenhados
            # não aparecem em get_text() e o corte caía em cima deles
            # (a fração saía como "R = L", sem o denominador).
            # Na ÚLTIMA alternativa 'limite' é só uma estimativa, e aí medir
            # o conteúdo continua valendo.
            base = limite if proxima[L] else (fundo_do_conteudo(pag, topo, limite) or limite)
            rect = fitz.Rect(bx0 + 11, topo,
                             faixa_coluna(pag, bx0, topo, base), base) & pag.rect
            if rect.height < 8 or rect.width < 20:
                print(f"  Q{q['numero']} {L}: região degenerada, pulada"); continue
            pix = pag.get_pixmap(clip=rect, dpi=200)
            nome = f"alt_q{q['numero']}_{L}.png"
            pix.save(os.path.join(dir_imgs, nome))
            novas[L] = nome
        if len(novas) == len(letras):
            q["alternativasImagem"] = novas
            q["alternativas"] = {L: "" for L in letras}
            q["alternativasRenderizadas"] = True
            # A fórmula desenhada deixa cacos no fim do enunciado (um "2"
            # solto, p.ex.). Com as alternativas virando imagem, esses restos
            # não têm mais função: caem. Só o rabo — nada no meio do texto,
            # para não apagar linha de tabela legítima.
            paras = q.get("paragrafos", [])
            while paras and paras[-1]["tipo"] == "p" and \
                  len(paras[-1]["texto"].strip()) <= 3 and \
                  not re.search(r'[A-Za-zÀ-ÿ]', paras[-1]["texto"]):
                removido = paras.pop()
                print(f"    Q{q['numero']}: caco removido do fim -> {removido['texto']!r}")
            tocadas += 1
            print(f"  Q{q['numero']}: {len(novas)} alternativas renderizadas")
        else:
            print(f"  Q{q['numero']}: incompleta ({len(novas)}/{len(letras)}), NÃO alterada")
    json.dump(qs, open(arq_json, "w"), ensure_ascii=False, indent=1)
    print(f"questões alteradas: {tocadas}")

if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2], sys.argv[3],
           {int(n) for n in sys.argv[4].split(",")})
