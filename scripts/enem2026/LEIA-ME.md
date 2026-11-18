# ENEM 2026 — como a prova foi importada (18/11/2026)

Cadernos regulares: dia 1 = CD1 (azul), dia 2 = CD5 (amarelo). Q153 anulada pelo INEP.

1. `INEP_SEM_ESPACO_SINTETICO=1 python ../inep-parse-prova.py <pdf> out_2026_dN.json` (dia 1 e 2) e `../inep-parse-gabarito.py` nos gabaritos.
2. `recorte2026.py` (alternativas em grade: Q91, Q141, Q168, Q175), `tabelas2026.py` (7 tabelas + alternativas em fração/radical: Q143, Q167, Q179), `ajustes2026.py` (cargas da Q106, √3 da Q171, ¿ da Q003 espanhol, referências grudadas).
3. `node ../enem2026-import.mjs --inativas` (depois `--atualiza --inativas` para regravar só conteúdo).
4. Agentes (BRIEFING-agentes.md, lotes de `montar_lotes.py`): classificação + resolução + conferência da extração contra a página. 0 divergências de gabarito em 184.
5. `node ../classify-write.mjs <dir dos lotes>` e `node publicar2026.mjs --gravar` / `--ativar`.

Melhorias do parser feitas para 2026 (valem para os próximos anos): marcador com letras espaçadas,
espaços sintéticos (flag), letra de alternativa pela fonte do círculo (BundesbahnPi) com 1 espaço,
letras gregas da fonte Symbol, sobrescrito/subscrito em Unicode.

Limitação conhecida: numeração de linha da margem é descartada (Q011, Q012, Q046–Q050 citam linhas).
Os caminhos dos scripts apontam para o scratchpad da sessão; ajuste DIR ao reaproveitar.
