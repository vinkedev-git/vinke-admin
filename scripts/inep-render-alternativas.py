"""Recorta as alternativas de uma questão como IMAGEM.

Serve para as questões cujas alternativas são fórmulas: o PDF as desenha com
glifos posicionados, e a extração de texto devolve caracteres de controle e
números soltos ("1 2" no lugar de 1/2). Renderizar a região preserva o que o
aluno vê de fato na prova.

Uso: python render_alts.py <prova.pdf> <questoes.json> <dir_imgs> 150,155,...
"""
import fitz, json, re, sys, os

RODAPE = 730.0
SUSPEITAS = []

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
    divisa = (meio - 6) if esquerda else limite
    # Regra: o recorte nunca é mais largo do que a PRÓPRIA tinta exige.
    # Mede-se só o que NASCE nesta coluna; se isso termina antes da divisa,
    # para aí e pronto — não importa o que exista do outro lado. Antes, um
    # bloco qualquer que cruzasse a divisa liberava a travessia e a coluna
    # vizinha (às vezes de outra questão) entrava no recorte.
    proprios = [(bx0, bx1) for bx0, bx1 in na_faixa if bx0 <= divisa]
    if not proprios:
        return min(max(x0 + 60, divisa), limite)
    direita = max(bx1 for _, bx1 in proprios)
    if direita <= divisa:
        return min(max(direita + 6, x0 + 60), divisa)
    # a tinta desta coluna de fato atravessa: é alternativa larga mesmo
    return min(max(direita + 6, x0 + 60), limite)

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

def blocos_de_tinta(pag, x_ini, x_fim, y_ini, y_fim, folga=5.0):
    """Agrupa o conteúdo da coluna em blocos contíguos de tinta.

    A régua anterior (topo da letra + janela fixa acima) só servia para
    alternativa de UMA linha. Quando a alternativa é uma FIGURA, a letra fica
    no meio do desenho e partes dele caem fora da janela: a alternativa saía
    decepada e o pedaço perdido aparecia colada na vizinha.

    Aqui medimos onde há tinta de verdade e juntamos o que está a menos de
    `folga` de distância. Cada alternativa é o bloco que contém a sua letra —
    serve igual para fração de duas linhas e para diagrama alto.
    """
    caixas = []
    for bl in pag.get_text("dict")["blocks"]:
        if bl["type"] == 1:
            r = bl["bbox"]
            caixas.append((r[1], r[3], r[0], r[2]))
            continue
        for ln in bl.get("lines", []):
            r = ln["bbox"]
            caixas.append((r[1], r[3], r[0], r[2]))
    for dr in pag.get_drawings():
        r = dr["rect"]
        caixas.append((r.y0, r.y1, r.x0, r.x1))
    dentro = [(y0, y1) for y0, y1, bx0, bx1 in caixas
              if bx1 > x_ini and bx0 < x_fim and y1 > y_ini and y0 < y_fim
              and (y1 - y0) < 400]
    if not dentro:
        return []
    dentro.sort()
    blocos = [list(dentro[0])]
    for y0, y1 in dentro[1:]:
        if y0 <= blocos[-1][1] + folga:
            blocos[-1][1] = max(blocos[-1][1], y1)
        else:
            blocos.append([y0, y1])
    return blocos

def linhas_brancas(pag, x0, x1, y0, y1, dpi=100):
    """Alturas (pt) das linhas SEM tinta na faixa, medidas no pixel.

    Agrupar caixas de texto/desenho não separa alternativas cuja tinta se
    toca — fração composta alta, tabela com moldura, diagrama encostado no
    seguinte. O papel, porém, sempre deixa um vão: medi-lo direto no raster
    acha o corte real, por menor que seja.
    """
    rect = fitz.Rect(x0, y0, x1, y1) & pag.rect
    if rect.height < 2 or rect.width < 2:
        return [], rect
    pix = pag.get_pixmap(clip=rect, dpi=dpi, colorspace=fitz.csGRAY)
    esc, s, w, h = 72.0 / dpi, pix.samples, pix.width, pix.height
    # Uma régua VERTICAL (filete de tabela, marca de corte na borda da
    # mancha) tem tinta em toda linha e faria o vão sumir: nenhuma linha
    # seria branca e o corte cairia no meio da fórmula. Colunas inkadas em
    # quase toda a altura são estrutura, não conteúdo — saem da conta.
    inkadas = [sum(1 for yy in range(h) if s[yy * w + xx] <= 200) for xx in range(w)]
    uteis = [xx for xx in range(w) if inkadas[xx] < 0.9 * h]
    if not uteis:
        return [], rect
    brancas = [rect.y0 + yy * esc
               for yy in range(h)
               if all(s[yy * w + xx] > 200 for xx in uteis)]
    return brancas, rect

def corridas_brancas(brancas, passo, minimo=2.0):
    """Agrupa linhas brancas em VÃOS contíguos de pelo menos `minimo` pt.

    Vãos de 1pt aparecem dentro da própria fórmula (entre o numerador e o
    traço da fração); só um vão de verdade separa duas alternativas.
    """
    if not brancas:
        return []
    runs, ini, ant = [], brancas[0], brancas[0]
    for y in brancas[1:]:
        if y - ant > passo * 1.6:
            # o vão tem (ant-ini) de distância MAIS a altura da última linha;
            # sem somar `passo`, um vão real de 3pt media 2,16 e era descartado
            if ant - ini + passo >= minimo: runs.append((ini, ant))
            ini = y
        ant = y
    if ant - ini + passo >= minimo: runs.append((ini, ant))
    return runs

def maior_vao(runs, lo, hi):
    """O vão MAIS LARGO entre lo e hi — a fronteira entre duas alternativas.

    Parar no primeiro vão encontrado a partir da letra funciona enquanto a
    fórmula for contígua, mas numa fração cujo numerador fica separado da
    barra por um vãozinho o corte subia pouco e o numerador ficava de fora
    (saía só "—3"). Entre duas letras o vão mais largo é sempre o que separa
    as alternativas; os de dentro da fórmula são menores.
    """
    c = [(b - a, a, b) for a, b in runs if lo < (a + b) / 2 < hi]
    if not c:
        return None
    larg, a, b = max(c)
    return (a + b) / 2

def vao_acima(runs, y, lo):
    """Fronteira acima de y: meio do vão mais largo entre lo e y."""
    return maior_vao(runs, lo, y)

def vao_abaixo(runs, y, hi):
    """Fronteira abaixo de y: meio do vão mais largo entre y e hi."""
    return maior_vao(runs, y, hi)

def corte_no_vao(brancas, alvo, lo, hi):
    """Linha branca mais próxima de `alvo` dentro de (lo, hi); senão `alvo`."""
    cands = [y for y in brancas if lo < y < hi]
    return min(cands, key=lambda y: abs(y - alvo)) if cands else alvo

def apara(brancas, topo, base, folga=2.0):
    """Encolhe [topo, base] até a primeira e a última linha COM tinta."""
    dentro = [y for y in brancas if topo <= y <= base]
    t, b = topo, base
    for y in dentro:
        if y <= t + 0.5: t = y
        else: break
    for y in reversed(dentro):
        if y >= b - 0.5: b = y
        else: break
    # A folga fica presa ao retângulo: soltá-la para ganhar respiro trazia
    # um fio da alternativa vizinha, porque o vão entre elas costuma ter
    # menos de 2pt. Recorte justo e COMPLETO é melhor que recorte com sobra.
    return max(topo, t - folga), min(base, b + folga)

def apara_direita(pag, rect, vao_min=10.0, dpi=100):
    """Encolhe a direita do recorte no primeiro vão BRANCO largo.

    O extrator às vezes junta as duas colunas numa única "linha" de texto;
    aí a medida por caixas acha que a alternativa atravessa a página e o
    recorte sai com a coluna vizinha (de outra questão) dentro. Uma coluna
    de papel em branco com `vao_min` de largura separa as duas de fato.
    """
    r = rect & pag.rect
    if r.width < 40:
        return rect
    pix = pag.get_pixmap(clip=r, dpi=dpi, colorspace=fitz.csGRAY)
    esc, sm, w, h = 72.0 / dpi, pix.samples, pix.width, pix.height
    cheia = [any(sm[yy * w + xx] <= 200 for yy in range(h)) for xx in range(w)]
    ini = None
    for xx in range(w):
        if not cheia[xx]:
            if ini is None: ini = xx
        else:
            if ini is not None and (xx - ini) * esc >= vao_min and ini > 0:
                return fitz.Rect(r.x0, r.y0, r.x0 + ini * esc + 4, r.y1)
            ini = None
    return rect

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
        anterior, prev_letra = {}, {}
        for L in letras:
            antes = [M for M in letras
                     if grupo(M) == grupo(L) and pos[M][1][1] < pos[L][1][1]]
            if antes:
                M = max(antes, key=lambda M: pos[M][1][1])
                anterior[L], prev_letra[L] = pos[M][1][1], M
            else:
                anterior[L], prev_letra[L] = None, None
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
            # --- recorte pelos VÃOS BRANCOS medidos no raster ---
            # Régua principal. As anteriores (janela fixa acima da letra;
            # agrupamento de caixas) falhavam quando a tinta de alternativas
            # vizinhas se toca: fração composta de 3 linhas, tabela com
            # moldura, diagrama encostado no de baixo. O papel sempre deixa
            # um vão — achá-lo no pixel separa os casos todos pelo mesmo
            # critério.
            x_ini_b = bx0 - 3   # 6pt pegava o filete de corte na borda da mancha
            x_fim_b = faixa_coluna(pag, bx0)
            # Topo da REGIÃO das alternativas desta coluna: acima da 1ª letra
            # só pertence à alternativa o que estiver INDENTADO (o comando da
            # questão nasce na margem, como a letra).
            topo_reg = None          # sempre definido pelo vão, abaixo
            if proxima[L]:
                base_reg = None          # definido pelo corte com a seguinte
            else:
                base_reg = min(by1 + passo * 1.5, 742.0)
                tq = teto_proxima_questao(pag, by1, bx0, x_fim_b)
                if tq:
                    base_reg = min(base_reg, tq - 4)
            jan_ini = (anterior[L] - 4) if anterior[L] is not None else by0 - passo * 1.3
            jan_fim = (proxima[L] + passo) if proxima[L] else base_reg
            brancas, _ = linhas_brancas(pag, x_ini_b, x_fim_b,
                                        jan_ini - 4, jan_fim + 4)
            runs = corridas_brancas(brancas, 72.0 / 100)
            # Âncora é o CENTRO da letra, não o topo: as caixas de linha se
            # sobrepõem (a de A termina depois de começar a de B), então
            # andar a partir do topo pulava o vão certo e parava no anterior,
            # trazendo a linha da alternativa de cima para dentro do recorte.
            centro_L = (by0 + by1) / 2
            if anterior[L] is not None:
                lim = (anterior[L] + pos[prev_letra[L]][1][3]) / 2
                topo_reg = vao_acima(runs, centro_L, lim)
                if topo_reg is None:        # tinta contígua: não há vão
                    topo_reg = corte_no_vao(brancas, (anterior[L] + by0) / 2,
                                            anterior[L] + 2, by0 - 1)
            else:
                # 1ª alternativa: o vão acima dela a separa do COMANDO da
                # questão (e da figura do enunciado). A régua por indentação
                # que havia aqui alcançava a figura inteira e trazia o
                # enunciado junto; o vão resolve pelo mesmo critério das
                # demais.
                # Na PRIMEIRA alternativa vale o vão MAIS PRÓXIMO, não o
                # mais largo: acima dela está o comando da questão, e o vão
                # que separa comando de enunciado costuma ser maior que o
                # que separa comando de alternativa — pegar o maior trazia o
                # comando inteiro para dentro do recorte.
                acima = [b for a, b in runs if by0 - passo * 1.3 < b < centro_L]
                topo_reg = max(acima) if acima else None
                if topo_reg is None:
                    topo_reg = min(topo_visual(pag, by0, by0 - 16,
                                               bx0 + 10, x_fim_b), by0) - 3
            if base_reg is None:
                prox_centro = (pos[prox_letra[L]][1][1] + pos[prox_letra[L]][1][3]) / 2
                base_reg = vao_abaixo(runs, centro_L, prox_centro)
                if base_reg is None:
                    base_reg = corte_no_vao(brancas, (by1 + proxima[L]) / 2,
                                            by1 + 1, proxima[L] - 2)
            else:
                # ÚLTIMA alternativa: sem letra seguinte, a estimativa por
                # espaçamento esticava a faixa até alcançar a questão de
                # baixo — e aí um bloco de largura inteira de lá liberava a
                # travessia das colunas, trazendo a coluna vizinha junto.
                # O maior vão abaixo dela é a borda real.
                fim = vao_abaixo(runs, centro_L, base_reg)
                if fim: base_reg = fim
            topo_reg, base_reg = apara(brancas, topo_reg, base_reg)
            if base_reg - topo_reg >= 8:
                # A LARGURA é medida numa faixa um pouco mais alta que o
                # recorte: aparar a vertical até o pixel de tinta deixava o
                # bbox da linha começando ACIMA do corte, ela saía da conta
                # da largura e o texto era decepado à direita.
                rect = fitz.Rect(x_ini_b, topo_reg,
                                 faixa_coluna(pag, bx0, topo_reg - 6, base_reg + 6),
                                 base_reg) & pag.rect
                rect = apara_direita(pag, rect)
                if rect.height >= 8 and rect.width >= 20:
                    pix = pag.get_pixmap(clip=rect, dpi=200)
                    nome = f"alt_q{q['numero']}_{L}.png"
                    pix.save(os.path.join(dir_imgs, nome))
                    novas[L] = nome
                    continue
            SUSPEITAS.append(f"Q{q['numero']}{L}:regua-antiga")
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
    if SUSPEITAS: print("SUSPEITAS:", " ".join(SUSPEITAS))

if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2], sys.argv[3],
           {int(n) for n in sys.argv[4].split(",")})
