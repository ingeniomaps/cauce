---
name: onboard
description: Escanea el repositorio y deja escrito el contexto de la empresa y la primera épica.
---

Es el arranque de una instancia recién creada: `init` la instaló, pero nadie le explicó todavía qué es
este proyecto.

Empezá por `node {{OPS_DIR}}tools/ops.js onboard`, que es instantáneo y te dice tres cosas: si la
instancia sigue vacía, qué hay en el workspace y qué preguntas quedan sin responder. Si la instancia ya
tiene contexto escrito, no la pises: reescribir lo que alguien corrigió no deja rastro de lo que se
perdió. Si quedan preguntas, **hacéselas a la persona una por una** y esperá sus respuestas antes de
escribir nada: son lo que ningún escaneo puede deducir, y adivinarlas produce una empresa inventada.

El inventario no lo hagas a mano: `node {{OPS_DIR}}tools/ops.js scan --json` devuelve los subproyectos con
manifiesto propio, su runtime y los comandos que cada uno declara, con el archivo del que salieron.
Recorrer directorios es determinista y cuesta milisegundos; explorarlo vos cuesta minutos y encuentra lo
mismo. No corras ningún comando del proyecto: el mapa dice lo que está declarado y de dónde, y
verificarlo corriéndolo es una historia de la épica, con dueño y tiempo asignado.

Con eso escribí `{{OPS_DIR}}organization/company.md` y `product.md`, la sección «Mapa real» de
`{{OPS_DIR}}AGENTS.md` con el resultado que obtuviste por comando, y las raíces reales en
`workspaceRoots` de `{{OPS_DIR}}ops.config.json`, que es lo que un guard usa para bloquear una escritura
fuera de lugar. Lo deducido va marcado `(supuesto)` y lo que nada sostiene queda «Por definir»: no
inventes clientes, ingresos ni objetivos.

Credenciales, MCP y el permiso de push no te corresponden. Cada uno va como fila en
`{{OPS_DIR}}planning/HUMAN_ACTIONS.md` con la acción concreta que lo desbloquea y sin proponer ningún
valor; las preguntas abiertas, a la sección Ideas de `{{OPS_DIR}}planning/INBOX.md`.

Cerrá escribiendo `epic-001` en `{{OPS_DIR}}planning/roadmap/`: su resultado es que una tarea pueda
atravesar el ciclo entero, y sus criterios salen de lo que hoy falta —contexto sin supuestos, cada
comando en verde, el guard de límites probado en las dos direcciones, una tarea piloto en DONE—. Validá
con `node {{OPS_DIR}}tools/ops.js check planning`. **Nunca promuevas al BACKLOG**: esa firma es humana.
