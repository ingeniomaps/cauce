---
caso: 214
titulo: lo que la revisión corrige una y otra vez no vuelve como lección
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 214 — Una regla que la revisión hace cumplir en cada tarea no le avisa a nadie que no se cumple sola

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe nada; cuesta una vuelta de corrección por tarea mientras dure, y la señal de
que una regla no se entiende o no se ve existe desde 0.100.0 en `done/` sin que nada la lea.

## Resumen

Desde el caso 207 la entrada de `done/` registra qué mandó a corregir el Review y con qué regla. Si la misma
regla se corrige en muchas tareas, la regla existe y no se cumple de antemano —le falta un ejemplo,
claridad o visibilidad—, y eso es una lección sobre cómo trabajamos. Nada la junta ni la propone.

## Reproducción

```bash
grep -rn "corregido" engine/ | grep -v "^engine/planning/lessons.js"
```

## Síntoma

Antes de este caso, la búsqueda no devolvía ningún lector: el campo se escribía y no lo consumía nadie.

## Causa raíz

No existía el lector: ni un comando que agrupe lo corregido por regla, ni un paso que lo lleve al INBOX.

## Fix propuesto

Decidido con Manuel el 2026-10-01 (idea A del plan de adopción), en dos mitades:

1. **Un comando determinista**, `ops lessons`, que lee `corregido:` de `done/`, agrupa por regla y propone las
   corregidas en dos tareas o más.
2. **El cierre de `autobuild`** las anota como Lecciones en el INBOX, sin promover, y deja su fila en un
   registro, `planning/LESSONS.md`, para no volver a proponer lo que ya está propuesto, aplicado o
   rechazado sin evidencia nueva.

El registro es un archivo con el estado escrito en cada fila (R28), y no la presencia de la entrada en el
INBOX: una persona elimina la entrada al decidir, y sin el registro la lección volvería en la corrida
siguiente.

## Tradeoffs

- Un archivo más en `planning/`, que llega por `upgrade`.
- Las correcciones de criterio no se agrupan solas; salen como caso propio (215).

## Contexto de descubrimiento

Revisión de los repositorios de Dropi del 2026-10-01: `pr-lessons` aprende de los hallazgos aceptados,
cuenta repeticiones entre PRs con umbral y no vuelve a proponer lo rechazado sin evidencia nueva
(`dropi-tools-skills`, rama `feature/TECH-1663-…`, `skills/pr-lessons/references/curation.md:78-90` y `:145`).

## Relacionados

- 207 — escribe el dato que este caso lee.
- 215 — las correcciones de criterio que se repiten.

## Cierre

Recorrido contra el caso entero:

- **Fix 1, `ops lessons`** → se hizo: `engine/planning/lessons.js` y el comando, con `--json`.
- **Fix 2, el cierre anota y registra** → se hizo, con el tope del INBOX y sin una llamada extra: el agente
  que corre `check` trae también las lecciones.
- **El registro con estado escrito** → se hizo: `propuesta`, `aplicada` y `rechazada`, con `check`
  rechazando cualquier otro valor; llega a las instancias existentes por `upgrade`.
- **Tradeoff, el criterio** → salió como caso propio, el 215.
- **Lo que el caso no preveía:** el prompt textual del cierre, sacado antes de la corrida real, mostró dos
  defectos que el arnés tapaba: la fecha llegaba como `undefined` —la relectura que cierra la cola no trae
  `today`— y la entrada se cortaba a mitad de palabra. Los dos se corrigieron con su prueba y su mutación.

**Probado corriendo.**
- Arnés y motor: `test/planning/lessons.test.js` y los casos del cierre en
  `test/workflows/autobuild-refs.test.js`. Mutaciones vistas en rojo: umbral en uno, criterio contado como
  regla, registro ignorado —ésta sobrevivió primero y faltaba el caso de una tarea nueva sobre una
  propuesta—, rechazada que vuelve siempre, vocabulario abierto, cierre sin anotar, cierre sin tope, fecha de
  la última lectura y entrada demasiado larga.
- **Corrida real** sobre un banco fuera del árbol con dos tareas cerradas que corrigieron la misma regla:
  `ops lessons` devolvió `reforzar-commits-r8 … — 2 tareas: alta, baja` y listó aparte los dos de criterio.
  El paso del cierre, corrido con su prompt textual (`claude -p`, USD 0,29), dejó la entrada entera en
  Lecciones con su origen y fecha, y la fila `| planning/rules/system/commits.md#R8 | propuesta | alta, baja |
  2026-10-01 |`. `check` pasa, y una segunda pasada de `ops lessons` ya no la propone.
