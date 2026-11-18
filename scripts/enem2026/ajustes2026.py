# Correções pontuais do ENEM 2026 depois do parser (cada uma conferida no caderno).
# Uso: python ajustes2026.py <dir com out_2026_d1.json e out_2026_d2.json>
import json, os, re, sys

DIR = sys.argv[1]
d1p, d2p = os.path.join(DIR, "out_2026_d1.json"), os.path.join(DIR, "out_2026_d2.json")
d1, d2 = json.load(open(d1p)), json.load(open(d2p))
feitos = []

def q2(n): return next(q for q in d2 if q["numero"] == n)

def refaz_enunciado(q):
    q["enunciado"] = "\n".join(p["texto"] if p.get("tipo") != "img" else f"[[IMG:{p['arquivo']}]]" for p in q["paragrafos"])

# Q106 (caderno 5, p. 6): as cargas ficam numa linha própria, acima do íon, e o
# parser as pendurava na alternativa anterior. Texto conferido na página.
q = q2(106)
q["alternativas"] = {"A": "NH₃ e NH₄⁺", "B": "NO₂ e NO₂⁻", "C": "N₂O e NO₃⁻", "D": "NH₃ e NO₃⁻", "E": "NO₂ e NH₄⁺"}
antes = len(q["paragrafos"])
q["paragrafos"] = [p for p in q["paragrafos"] if (p.get("texto") or "").strip() != "+"]
refaz_enunciado(q); feitos.append(f"Q106: cargas dos íons; {antes - len(q['paragrafos'])} parágrafo '+' removido")

# Q171: o radical é desenho, não texto ("aproximação para 3" -> √3)
q = q2(171)
for p in q["paragrafos"]:
    if p.get("texto") and "aproximação para 3." in p["texto"]:
        p["texto"] = p["texto"].replace("aproximação para 3.", "aproximação para √3."); feitos.append("Q171: √3")
refaz_enunciado(q)

# Q101: espaço que sobrou no nome do periódico
q = q2(101)
for p in q["paragrafos"]:
    if p.get("texto") and "Data M ining" in p["texto"]:
        p["texto"] = p["texto"].replace("Data M ining", "Data Mining"); feitos.append("Q101: Data Mining")
refaz_enunciado(q)

# Dia 1
espanhol = {}
for i, q in enumerate(d1):
    if q["numero"] <= 5 and i >= 5: espanhol[q["numero"]] = q
    mudou = False
    for p in q["paragrafos"]:
        t = p.get("texto")
        # "Menino de engenho": a capitular M ficou de fora (texto compartilhado Q09-Q13)
        if t and re.search(r"(?<![A-Za-zÀ-ú])enino de engenho", t):
            p["texto"] = re.sub(r"(?<![A-Za-zÀ-ú])enino de engenho", "Menino de engenho", t); mudou = True
    if mudou: refaz_enunciado(q); feitos.append(f"Q{q['numero']:03d}: Menino de engenho")

# Q003 espanhol: o "¿" é desenhado como "?" numa linha à parte
q = espanhol[3]
novos = []
for p in q["paragrafos"]:
    t = p.get("texto")
    if t is not None and t.strip() == "?": continue
    if t and t.startswith("quién es aquí el invasor?"):
        p["texto"] = "¿" + t
    novos.append(p)
q["paragrafos"] = novos; refaz_enunciado(q); feitos.append("Q003_ESPANHOL: ¿quién")

# Referência grudada no comando: quebra o parágrafo onde a referência termina
# (ano, "(adaptado)." ou "(fragmento).") e começa uma frase nova, só quando o
# trecho anterior tem cara de referência.
# frase nova = maiúscula seguida de minúscula OU de espaço ("O sucesso", "A partir");
# nunca "Cidade: Editora" (é a continuação da própria referência)
FIM_REF = re.compile(r"((?:\((?:adaptado|fragmento)\)|\b(?:19|20)\d{2})\.)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ](?:[a-záéíóúâêôãõç]|\s))(?![A-ZÁÉÍÓÚ][\wÀ-ú]*(?: [\wÀ-ú]+){0,3}: )")
TEM_REF = re.compile(r"Disponível em|Acesso em|[A-ZÁÉÍÓÚÂÊÔ]{3,}, [A-ZÁÉÍÓÚ]|Rio de Janeiro:|São Paulo:|Belo Horizonte:|Porto Alegre:")
for dia, lista in (("d1", d1), ("d2", d2)):
    for q in lista:
        novos, mudou = [], False
        for p in q["paragrafos"]:
            t = p.get("texto")
            if not t: novos.append(p); continue
            partes, ini = [], 0
            for m in FIM_REF.finditer(t):
                if TEM_REF.search(t[max(ini, m.start() - 220):m.end()]):
                    partes.append(t[ini:m.end()].strip()); ini = m.end()
            if partes:
                partes.append(t[ini:].strip()); mudou = True
                feitos.append(f"{dia} Q{q['numero']}: quebra após referência → '…{partes[0][-40:]}' | '{partes[1][:40]}…'")
                novos.extend({"tipo": "p", "texto": x} for x in partes if x)
            else:
                novos.append(p)
        if mudou: q["paragrafos"] = novos; refaz_enunciado(q)

json.dump(d1, open(d1p, "w"), ensure_ascii=False, indent=1)
json.dump(d2, open(d2p, "w"), ensure_ascii=False, indent=1)
for f in feitos: print(f)
