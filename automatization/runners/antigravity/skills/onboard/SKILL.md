---
name: onboard
description: Escanea el repositorio y deja escrito el contexto de la empresa y la primera épica.
---

Es el arranque de una instancia recién creada: `init` la instaló, pero nadie le explicó todavía qué es
este proyecto.

Empezá por `node {{OPS_DIR}}tools/ops.js onboard`, que es instantáneo y te dice tres cosas: si la
instancia sigue vacía, qué hay en el workspace y con qué pregunta empezar. Si ya tiene contexto escrito,
no la pises: reescribir lo que alguien corrigió no deja rastro de lo que se perdió.

La conversación empieza por una sola pregunta —de qué trata el proyecto, la primera línea que ese comando
imprime— y la hacés antes de mirar el inventario, sea el workspace vacío, un monorepo o diez repos.
Sigue según lo que conteste: hasta tres más, formuladas con las palabras de ese proyecto, hasta cubrir
las dimensiones que el comando haya listado. Una por vez, esperando respuesta. El inventario ya viene
resuelto: no recorras el árbol ni leas código para completarlo. No des por sentado que vende algo: puede sostenerse con
donaciones, presupuesto interno o trabajo voluntario, y preguntarle a un proyecto libre quién le paga es
empezar por una respuesta que nadie dio.

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

El arranque tiene tres objetivos y ninguno más: entender qué es el proyecto, dejar la instancia correcta
para él y que la primera tarea pueda empezar. El análisis profundo viene después, cuando la persona pida
algo concreto.

Cerrá escribiendo la épica en `{{OPS_DIR}}planning/roadmap/`: su resultado es que una tarea pueda
atravesar el ciclo entero, y sus criterios salen de lo que hoy falta —contexto sin supuestos, cada
comando en verde, el guard de límites probado en las dos direcciones, una tarea piloto en DONE—.
**Nunca promuevas al BACKLOG**: esa firma es humana.

## Antes de decir que terminaste

Esta lista no es un resumen de lo de arriba: es lo que se comprueba mirando el disco. Una corrida real
falló los cinco puntos sin darse cuenta, y todos del mismo lado —lo que no produce un archivo visible—.

1. **Una pregunta por vez.** Si mandaste dos o más juntas, numeradas, hiciste un formulario. La segunda
   pregunta depende de la primera respuesta: por eso se hacen de a una.
2. **`epic-NNN-<slug>.md`**, con slug en el nombre y `status: open`. `epic-001.md` no lo lee nadie: ni
   `check`, ni `tree`, ni el runner que busca trabajo. Existe y no existe a la vez.
3. **Las secciones de `{{OPS_DIR}}organization/` son las del molde.** Escribí adentro de ellas; agregá las tuyas
   abajo si hacen falta. Reemplazar la estructura pierde dimensiones que nadie va a reclamar después,
   porque el archivo se lee completo.
4. **`HUMAN_ACTIONS.md` tiene filas.** Una por credencial nombrada en el inventario, una por sistema
   externo o MCP, una por la autoridad de push. Si quedó vacío, no es que no hubiera nada: es que lo que
   no te corresponde se perdió en vez de quedar escrito para alguien.
5. **`ops` no es un servicio del producto.** No va en el mapa real: es la instancia desde la que trabajás.

Recién ahí, `node {{OPS_DIR}}tools/ops.js check planning`. Si sale con advertencias, leelas: son
exactamente estas cosas.
