---
caso: 426
titulo: ops lines no muestra una línea declarada sin repositorios, ni sus hitos
estado: resuelto
resuelto-en: 0.113.1
prioridad: media
version-detectada: 0.113.0
---

# 426 — Una línea que nace vacía (caso 421) desaparece del panorama de `ops lines`, con toda su cola

**🟢 resuelto en 0.113.1** · detectado en 0.113.0 · prioridad **media**. No rompe ningún trabajo: `context --line` la sigue viendo. Pero el
panorama, que es donde la persona mira qué hace cada línea, la omite sin decir nada.

## Resumen

El caso 421 permitió declarar una línea sin repositorios (`"lines": { "piloto": [] }`). `ops lines` arma la parte de líneas
declaradas en `declaredStatus` (`engine/planning/lines.js:184-220`): parte de `LT.trees(ops)` (`:186`), devuelve
`{ declared: [] }` si no hay ningún árbol (`:187`) y saca los nombres de línea de esos árboles (`:193`). `LT.trees`
(`engine/core/line-trees.js:51-57`) hace `flatMap` sobre los repos de cada línea, así que una línea con `[]` no aporta ningún
árbol y, con eso, ni su nombre ni su cola llegan al informe. `status` (`:139`) además omite la clave `declared` entera cuando
la lista sale vacía, por eso tampoco aparece en `--json`.

## Reproducción

Se vio el 2026-10-21 en una instancia sidecar con Cauce 0.113.0: con `"lines": { "piloto": [] }` y cuatro hitos
`line: piloto` en `planning/backlog/` (20 tareas), `ops lines .` mostraba sólo la principal. Con la misma línea declarada
sobre un repositorio, un minuto antes, salía `piloto  (línea declarada)` con sus cuatro hitos en la cola.

Reproducido el mismo día sobre `ops bench sidecar`, con `workspaceRoots: [{ name: "main", path: ".." }]`, un hito
`frente-uno` con `line: piloto` y dos tareas, y `ops line . piloto` (sin repositorios). `check planning` da «planning
válido».

```
$ ops lines .
LÍNEAS  base: master

principal  <banco>/ops  (master)  · 2 sin commitear  ← acá
  cola: medicion (1)
  reclamos: (ninguno)
  en vuelo: (ninguno)
  checkpoints: (ninguno)

$ ops lines . --json        → claves: base, trees (sin declared)

$ ops context planning --line piloto
TASK   tarea-uno [lite]  service: app  hito: frente-uno
LINE   piloto — de otras líneas, no se ofrecen: medicion

$ ops line . piloto app && ops lines .
…
piloto  (línea declarada)
  app  <banco>/lines/piloto/app  (line/piloto)
  cola: frente-uno (2)
```

La línea existe para `context`, y para `ops lines` aparece recién cuando tiene un repositorio.

## Qué haría falta

- Que `declaredStatus` parta de las líneas declaradas (`LT.declared`, `engine/core/line-trees.js:33`) y no de sus
  árboles, de modo que una línea sin repositorios salga con su cola, sus reclamos, su WIP y sus checkpoints. El `return`
  temprano de `:187` se va con eso: hoy corta también cuando hay líneas pero ninguna tiene árbol.
- Que la salida humana lo diga en el lugar de los árboles. El bloque de `engine/cli/lines.js:280-292` recorre
  `one.repos`, así que con `[]` imprimiría la cola sin ninguna línea que explique por qué no hay árboles. La frase ya
  existe en `ops line` (`engine/cli/lines.js:246`): «la línea piloto todavía no trabaja ningún repositorio: el árbol de
  cada uno se arma cuando una tarea de la línea lo pide (ops worktree --line piloto), o se suma con ops line <ops-root>
  piloto <repo>».
- Que `--json` la traiga en `declared` con `repos: []`.
- Las pruebas: ni `test/wiring/lines.test.js` ni `test/planning/lines.test.js` tienen un caso de `ops lines` con una
  línea declarada vacía (la `feat/vacia` de `test/planning/lines.test.js:143` es una rama, no una línea declarada).

## Lo que se miró y no tiene el defecto

Los otros consumidores de `LT.trees` buscan árboles, no enumeran líneas, así que para una línea vacía la lista vacía es
la respuesta correcta: `line-scope.js:115` (la línea sin árboles escribe sólo en la instancia, que es el 422),
`files.js:235`, `input.js:396`, `task-trees.js:130`, `worktree.js:148` (que suma el repositorio si falta, caso 421) y
`lines-join.js:134`. Este último es el retiro, y se corrió sobre el banco con una línea `vacia: []`:

```
$ ops lines join . vacia --apply
RETIRAR la línea vacia  (0 repositorio(s))
✓ retirada: sin árboles, sin line/vacia y fuera de ops.config.json, que hay que commitear
```

## Relacionados

- 421 — la línea que nace sin repositorios.
- 394 — `ops lines` y las líneas declaradas.

## Cierre

**Resuelto en 0.113.1**, a pedido del dueño el 2026-10-21 («arreglalo»). Es un patch: corrige lo que muestra un
comando, sin tocar el protocolo, las reglas ni los guards. Cuando se escribió no había ninguna versión abierta, porque
0.113.0 acababa de salir, así que esta entrada abre la 0.113.1.

`declaredStatus` (`engine/planning/lines.js:188`) saca los nombres de `LT.declared` y no de los árboles. Los
repositorios de cada línea siguen saliendo de `LT.trees`, así que una línea vacía llega con `repos: []` y con su
parte del planning. La salida humana (`engine/cli/lines.js`) dice por qué no tiene árboles, con la misma frase que
`ops line`, que ahora vive en una sola función, `unworked`.

El enunciado, ítem por ítem:

- **Que `declaredStatus` parta de las líneas declaradas**: se hizo, con una condición que el caso no nombraba. Sólo en
  sidecar: fuera de sidecar `ops line` se niega a armar árboles, y mostrar ahí la línea con «se suma con ops line…»
  ofrecía una salida que no existe. Antes eso lo tapaba `LT.trees`, que fuera de sidecar devuelve vacío; ahora se pide
  explícito (`LT.sessionOf`).
- **Que la salida humana lo diga en lugar de los árboles**: se hizo, y la frase no se duplicó: `ops line` y `ops lines`
  la toman de `unworked`.
- **Que `--json` la traiga con `repos: []`**: se hizo.
- **Las pruebas**: van en `test/planning/line-worktree.test.js`, dentro del recorrido de la línea vacía del 421, que
  ya arma ese escenario, y no en `test/wiring/lines.test.js`, que está en 493 de sus 500 líneas.
- **Los otros consumidores de `LT.trees`**: se miraron al mejorar el caso, y ninguno enumera líneas. Está en la
  sección de arriba.

**Lo que se corrió para saber que funciona.**

- La prueba nueva: la línea vacía sale en `--json` con `repos: []` y su hito, y en texto con la frase y `cola: hl (1)`.
  Con el repositorio sumado, sale con su árbol. Fuera de sidecar no hay `declared`. Vista en rojo antes del arreglo:
  `TypeError: Cannot read properties of undefined (reading 'find')`, porque no había `declared`.
- Tres mutaciones en una copia fuera del árbol, las tres en rojo: los nombres sacados otra vez de los árboles, sin
  exigir sidecar, y sin la frase en el panorama.
- La reproducción del caso sobre `ops bench sidecar`, con el motor arreglado. Con `ops line . piloto`, `ops lines .`
  muestra `piloto  (línea declarada)`, la frase y `cola: frente-uno (2)`, y `--json` da `[{"name":"piloto","repos":[],
  "milestones":[{"slug":"frente-uno","tasks":2}],…}]`. Con `app` sumado, el árbol en `lines/piloto/app`. Vuelta a
  vacía y con `claim --line piloto` sobre `tarea-uno`, el reclamo aparece en `reclamos:` de la línea.
