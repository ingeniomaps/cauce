---
name: onboard
description: Escanea el repositorio y deja escrito el contexto de la empresa y la primera épica.
---

Es el arranque de una instancia recién creada: `init` la instaló, pero nadie le explicó todavía qué es
este proyecto. Antes de empezar comprobá que siga vacía —`{{OPS_DIR}}organization/company.md` con sus
«Por completar» y `{{OPS_DIR}}planning/roadmap/` sin épicas—: reescribir un contexto que alguien ya
corrigió no deja rastro de lo que se perdió.

Inventariá los subproyectos con manifiesto propio, sin entrar en la raíz ops ni en `node_modules`. De cada
uno tomá su ruta, para qué sirve y los comandos de test, lint y build que él mismo declara. **Corré esos
comandos**: un mapa copiado del README envejece sin avisar y el primer Verify de una tarea real descubre
que el comando no existe. Nunca corras migraciones, deploys ni publicaciones, aunque un script se llame
así.

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
