# Monta os lotes de entrada dos agentes (classificação + resolução + conferência).
import fitz, json, os, re, sys
S = sys.argv[1]; I = f"{S}/inep2026"; R = f"{S}/res2026"
novos = {n["id"]: n["doc"] for n in json.load(open(f"{I}/novos2026.json"))}
AREA = lambda n: "area-linguagens" if n <= 45 else "area-humanas" if n <= 90 else "area-natureza" if n <= 135 else "area-matematica"

# página de cada marcador (dia 1: Q01-05 aparecem 2x, inglês depois espanhol)
paginas = {}
for dia, pdf in ((1, "2026_PV_impresso_D1_CD1.pdf"), (2, "2026_PV_impresso_D2_CD5.pdf")):
    d = fitz.open(f"{I}/{pdf}")
    vistos = {}
    for pn, p in enumerate(d):
        t = p.get_text(flags=fitz.TEXT_INHIBIT_SPACES)
        for m in re.finditer(r"QUEST[ÃA]O\s*(\d{1,3})", t, re.I):
            n = int(m.group(1)); vistos[n] = vistos.get(n, 0) + 1
            suf = ("_INGLES" if vistos[n] == 1 else "_ESPANHOL") if dia == 1 and n <= 5 else ""
            qid = f"ENEM2026_Q{n:03d}{suf}"
            paginas.setdefault(qid, [])
            if pn not in paginas[qid]: paginas[qid].append(pn)
        nome = f"{R}/paginas/d{dia}_p{pn+1:02d}.png"
        if not os.path.exists(nome): p.get_pixmap(dpi=100).save(nome)
    # questão que continua na página seguinte: inclui a próxima também
    for qid, pns in paginas.items():
        pass

def entrada(q, qid, dia):
    imgs = f"{I}/out_2026_d{dia}_imgs"
    paras = []
    for p in q["paragrafos"]:
        if p.get("tipo") == "img": paras.append({"imagem": f"{imgs}/{p['arquivo']}"})
        elif (p.get("texto") or "").strip(): paras.append({"texto": p["texto"].strip()})
    alts = {}
    for L in "ABCDE":
        img = (q.get("alternativasImagem") or {}).get(L)
        alts[L] = {"imagem": f"{imgs}/{img}"} if img else {"texto": (q.get("alternativas") or {}).get(L, "")}
    doc = novos[qid]
    pns = paginas.get(qid, [])
    return {"id": qid, "areaId": AREA(q["numero"]), "lingua": doc.get("enemLanguage"),
            "gabarito": doc["correctOptionId"], "enunciado": paras, "alternativas": alts,
            "paginasDoCaderno": [f"{R}/paginas/d{dia}_p{pn+1:02d}.png" for pn in pns] + ([f"{R}/paginas/d{dia}_p{pns[-1]+2:02d}.png"] if pns else [])}

lista = []
d1 = json.load(open(f"{I}/out_2026_d1.json")); d2 = json.load(open(f"{I}/out_2026_d2.json"))
for i, q in enumerate(d1):
    n = q["numero"]; suf = ("_INGLES" if i < 5 else "_ESPANHOL") if n <= 5 else ""
    lista.append(entrada(q, f"ENEM2026_Q{n:03d}{suf}", 1))
for q in d2:
    if q["numero"] == 153: continue  # anulada pelo INEP: sem resolução
    lista.append(entrada(q, f"ENEM2026_Q{q['numero']:03d}", 2))
# remove página inexistente no fim (última página + 1)
for e in lista:
    e["paginasDoCaderno"] = [p for p in e["paginasDoCaderno"] if os.path.exists(p)]

# 12 lotes, agrupados por área (cada agente fica numa área só)
lotes, atual = [], []
TAM = 16
por_area = {}
for e in lista: por_area.setdefault(e["areaId"], []).append(e)
import math
for area, qs in por_area.items():
    n = math.ceil(len(qs) / TAM); tam = math.ceil(len(qs) / n)
    for k in range(0, len(qs), tam): lotes.append(qs[k:k+tam])
for i, l in enumerate(lotes, 1):
    json.dump(l, open(f"{R}/lote{i:02d}-in.json", "w"), ensure_ascii=False, indent=1)
print(len(lista), "questões em", len(lotes), "lotes:", [ (len(l), l[0]["areaId"][5:], l[0]["id"][9:], l[-1]["id"][9:]) for l in lotes])
print("sem página:", [e["id"] for e in lista if not e["paginasDoCaderno"]])
