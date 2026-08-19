# Cauce para Claude Code

@{{OPS_DIR}}AGENTS.md
@{{OPS_DIR}}planning/PROTOCOL.md
@{{OPS_DIR}}planning/rules/system/process.md
@{{OPS_DIR}}planning/rules/system/code-shape.md
@{{OPS_DIR}}planning/rules/system/commits.md
@{{OPS_DIR}}planning/rules/system/conduct.md

Los hooks de `.claude/settings.json` son obligatorios. En una instancia recién creada, empezá corriendo
`node {{OPS_DIR}}tools/ops.js onboard`: es instantáneo, y lo primero que imprime es la pregunta con la que
tenés que abrir —de qué trata el proyecto—. Hacésela tal cual, antes de mirar el inventario y sea el
workspace vacío, un monorepo o diez repos. Recién con esa respuesta formulá hasta tres más, con las
palabras de ese proyecto y una por vez, hasta cubrir las dimensiones que haya listado. El inventario ya
viene resuelto en esa salida: no recorras el árbol ni leas código para completarlo. No des por sentado que vende
algo: puede sostenerse con donaciones, presupuesto interno o trabajo voluntario. Con las respuestas invocá
`/onboard <lo que te contó>`, que escribe el contexto y la primera épica; invocarlo antes sólo devuelve la
misma pregunta más caro. Después, `/team` evalúa si una
intención es viable y propone una épica, y `/autobuild` ejecuta trabajo ya promovido; `/integration-sync` e
`/integration-promote` gestionan staging local sin escritura remota. Ninguno promueve al BACKLOG.

Antes de iniciar, respeta `{{OPS_DIR}}planning/AWAITING_REVIEW.md` y el mutex de `{{OPS_DIR}}planning/WIP.md`. Si el protocolo y
un workflow difieren, manda el protocolo y la diferencia se registra en `{{OPS_DIR}}planning/INBOX.md`.
