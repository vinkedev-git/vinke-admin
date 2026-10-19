"""Recorta uma TABELA do enunciado como imagem.

Numa página de 2 colunas, a tabela larga tem suas colunas da direita lidas
depois das alternativas e acaba descartada. Em vez de reordenar a página
inteira (o que quebra as alternativas que ficam em 2 colunas), recortamos a
tabela como figura: é o que o aluno vê na prova, sem risco de reordenação.

Uso: python render_tabela.py <prova.pdf> <questoes.json> <dir> <num> <y0> <y1> <pos> <qtd>
"""
import fitz, json, sys, os

def run(pdf, arq, dir_imgs, num, y0, y1, pos, qtd):
    doc = fitz.open(pdf); qs = json.load(open(arq))
    q = next(x for x in qs if x["numero"] == num)
    alvo = next((p for p in range(doc.page_count)
                 if f"Questão {num}" in doc[p].get_text()), None)
    if alvo is None:
        print(f"Q{num}: página não encontrada"); return
    pag = doc[alvo]
    rect = fitz.Rect(20, y0, pag.rect.width - 20, y1) & pag.rect
    pix = pag.get_pixmap(clip=rect, dpi=200)
    nome = f"tabela_q{num}.png"
    pix.save(os.path.join(dir_imgs, nome))
    q["paragrafos"] = (q["paragrafos"][:pos]
                       + [{"tipo": "img", "arquivo": nome}]
                       + q["paragrafos"][pos + qtd:])
    q["tabelaRenderizada"] = True
    json.dump(qs, open(arq, "w"), ensure_ascii=False, indent=1)
    print(f"Q{num}: tabela recortada {pix.width}x{pix.height}, {qtd} parágrafo(s) substituído(s)")

if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]),
        float(sys.argv[5]), float(sys.argv[6]), int(sys.argv[7]), int(sys.argv[8]))
