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
    direita = x0
    for bl in pag.get_text("dict")["blocks"]:
        if bl["type"] == 1:
            continue
        for ln in bl.get("lines", []):
            y0, bx0, bx1 = ln["bbox"][1], ln["bbox"][0], ln["bbox"][2]
            if topo <= y0 < base and bx0 >= x0 - 2:
                direita = max(direita, bx1)
    for dr in pag.get_drawings():
        r = dr["rect"]
        if topo <= r.y0 < base and r.x0 >= x0 - 2:
            direita = max(direita, r.x1)
    return min(max(direita + 6, x0 + 60), limite)

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
        proxima = {}
        for L in letras:
            seguintes = [M for M in letras
                         if grupo(M) == grupo(L) and pos[M][1][1] > pos[L][1][1]]
            proxima[L] = min((pos[M][1][1] for M in seguintes), default=None)
        passos = [b - a for L in letras if (a := pos[L][1][1]) and (b := proxima[L])]
        passo = max(passos) if passos else 36
        novas = {}
        for i, L in enumerate(letras):
            pno, (bx0, by0, bx1, by1) = pos[L][0], pos[L][1]
            pag = doc[pno]
            topo = by0 - 1
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
            limite = proxima[L] if proxima[L] else min(by0 + passo * 1.5, 742.0)
            base = fundo_do_conteudo(pag, topo, limite) or limite
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
