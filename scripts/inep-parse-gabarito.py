"""Lê o gabarito oficial do ENEM (PDF de 1 página do INEP).

A página traz duas tabelas lado a lado (uma por área). Cada linha é
"número da questão" + "resposta", e no 1º dia as questões 1 a 5 têm DUAS
respostas, uma para inglês e outra para espanhol. Casamos número e resposta
pela coordenada y (mesma linha) e escolhemos a coluna pela proximidade em x.

Uso: python parse_gabarito.py <gabarito.pdf>
"""
import fitz, re, sys, json

def spans(pdf):
    d = fitz.open(pdf)
    out = []
    for p in d:
        for bl in p.get_text("dict")["blocks"]:
            if bl["type"] == 1: continue
            for ln in bl.get("lines", []):
                for s in ln["spans"]:
                    t = s["text"].strip()
                    if t:
                        out.append((s["bbox"][0], s["bbox"][1], t))
    return out

def ler(pdf):
    sp = spans(pdf)
    numeros = [(x, y, int(t)) for x, y, t in sp if re.fullmatch(r'\d{1,3}', t) and 1 <= int(t) <= 180]
    respostas = [(x, y, t) for x, y, t in sp if re.fullmatch(r'[A-E]|Anulado', t)]
    gab = {}
    for xq, yq, n in numeros:
        # respostas na MESMA linha (tolerância de 4pt) e à direita do número
        linha = sorted([(x, t) for x, y, t in respostas if abs(y - yq) < 4 and x > xq])
        if not linha: continue
        # só as da mesma tabela (até 180pt à direita; depois já é a outra)
        linha = [(x, t) for x, t in linha if x - xq < 180]
        if not linha: continue
        gab[n] = [t for _, t in linha]
    return gab

if __name__ == "__main__":
    g = ler(sys.argv[1])
    print(f"{sys.argv[1].split('/')[-1]}: {len(g)} questões")
    duplas = {n: v for n, v in g.items() if len(v) > 1}
    print("  com 2 respostas (inglês/espanhol):", duplas)
    anuladas = [n for n, v in g.items() if "Anulado" in v]
    print("  anuladas:", anuladas or "nenhuma")
    faltando = [n for n in range(min(g), max(g)+1) if n not in g]
    print("  faltando na faixa:", faltando or "nenhuma")
    print("  amostra:", {n: g[n] for n in sorted(g)[:8]})
    json.dump({str(k): v for k, v in g.items()},
              open(sys.argv[1].replace(".pdf", ".json").replace("raw/", ""), "w"))
