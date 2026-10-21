---
caso: 391
titulo: reanudar tras una aprobación de gobernanza repite las fases ya pagadas
estado: aplazado
reabrir-si: varias reanudaciones por commit-needs-approval en un mes en las instancias, o una sola en full con un costo que pese, contadas en los journal.jsonl de las corridas
prioridad: baja
version-detectada: 0.109.0
---

# 391 — Una tarea que paró en el Commit por `commit-needs-approval` vuelve a pasar por Verify, y en `full` por Review y QA, al reanudarla con la aprobación escrita

**⏸ aplazado** · detectado en 0.109.0 · prioridad **baja** — limitación aceptada a propósito al cerrar el caso 383. Se
hace cuando se cumpla lo de «Qué lo reabriría»; hasta entonces no se lista entre lo que queda.

## Resumen

Desde el caso 383, una tarea cuyo commit frena el guard de gobernanza para con `commit-needs-approval`. El trabajo
queda verificado y stageado, y el WIP y el reclamo siguen puestos. Una persona aprueba las rutas en
`planning/.ops-approval` y reanuda. La corrida retoma desde el WIP: saltea la llamada de Build, porque todos sus pasos
están tildados, pero vuelve a correr Verify, y en `full` también Review y QA, antes de llegar al Commit. Esas fases
ya habían pasado sobre el mismo árbol.

## Reproducción

Corridas reales de `/autobuild` del 2026-10-16, registradas en el cierre del 383. Sobre un banco `ops bench suelto` fuera del
repositorio, con una tarea `express` que crea `automatization/tests/humo.test.js`:

1. La primera corrida paró con `commit-needs-approval` y `needsApproval: ["automatization/tests/humo.test.js"]`.
2. Con la ruta escrita en `planning/.ops-approval`, la reanudación dijo que «siguió desde Verify». Después commiteó,
   cerró la tarea en `done/` y escribió el checkpoint.

Costo de la reanudación: USD 2,46 y 2,87 en las dos tandas. En `express` lo que se repite es Verify. En `full` se
repetirían Review, Verify y QA; es una estimación del orden de 1 a 2 M de tokens, y no está medida.

## Cuándo ocurre

Poco, desde el 383. Lo común es que el plan nombre el archivo protegido, y entonces la corrida para antes de Build
con `governance-approval-needed`, donde no hay nada que repetir. A `commit-needs-approval` llegan sólo:

- las tareas mecánicas (`express`, `directo`), cuyo plan no trae archivos y no pasan por `ops governed`;
- las tareas cuya construcción toca un archivo protegido que el plan no nombró.

## Por qué no se arregló en el 383

Se le preguntó a Manuel y eligió no hacerlo. Saltar al Commit al reanudar pide dos cosas:

- guardar en el WIP que Review, Verify y QA pasaron, con su evidencia, porque `done/` la necesita;
- comprobar que el árbol stageado es exactamente el que se verificó.

Si esa comprobación falla de una forma no prevista, el recorrido commitea algo que nadie verificó. Es una quita de
verificación para ahorrar una corrida poco frecuente, y R9 pide probarla al revés.

## Qué lo reabriría

Que en las instancias aparezca seguido: varias reanudaciones por `commit-needs-approval` en un mes, o una sola en
`full` con un costo que pese. Se cuenta en los `journal.jsonl` de las corridas, buscando un `commit-needs-approval`
seguido de una corrida de la misma tarea que retoma desde el WIP.

## Fix propuesto (si se reabre)

- Al parar con `commit-needs-approval`, escribir en el WIP el resultado de Review, Verify y QA, y la huella del árbol
  stageado.
- Al reanudar, si la huella coincide, saltar al Commit con esa evidencia; si no coincide, correr las fases como hoy.
- La aceptación tiene que pedir una mutación que haga coincidir una huella sobre un árbol distinto y vea a la corrida
  repetir Verify igual.

## Relacionados

- [383](./383-un-guard-de-gobernanza-frena-el-commit-del-subagente-y-la-corrida-termina.md) — de donde sale, y donde
  están las corridas reales.

## Por qué se aplaza

El 2026-10-21 el dueño pidió sacarlo de la lista de lo que queda —«o lo hacemos o si lo dejamos pendiente seria un estado
que diga cuando realmente tengamos que hacerlo»—, y se midió primero si ya tocaba. No toca. En los registros de corridas
de esta máquina desde el 2026-10-16, cuando el 383 creó la parada, hay dos paradas reales con `"reason":
"commit-needs-approval"`, y las dos son las corridas de prueba del propio 383. Las instancias con corridas de `/autobuild`
en esos días —tres, con 27, 37 y 44 registros de workflow— no tienen ninguna; los otros archivos que nombran la parada la
traen dentro del script del recorrido, no como resultado.

El arreglo, además, le saca verificación al recorrido para ahorrar una vuelta, y R9 pide probarlo al revés. Hacerlo para
algo que no ocurrió ninguna vez en uso real es pagar ese riesgo por nada. Por eso `aplazado` y no `abierto`: la decisión ya
está y la condición también, y lo que falta es que se cumpla.

Cómo se mira, para reabrirlo con el número:

```bash
grep -rlo '"reason":"commit-needs-approval"' ~/.claude/projects/ | grep -v cauce
```

Cada archivo es una parada real; si se cuentan varias en un mes, o una en `full`, el caso vuelve a `abierto` con ese
conteo en «Contexto de descubrimiento» y se toma con el «Fix propuesto» de arriba.
