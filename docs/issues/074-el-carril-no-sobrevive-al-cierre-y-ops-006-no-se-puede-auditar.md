---
caso: 074
titulo: El carril no sobrevive al cierre, así que OPS-006 no se puede auditar sobre el registro
estado: abierto
prioridad: media
version-detectada: 0.74.0
---

# 074 — La entrada de DONE no registra el carril, y es el dato que decidió qué fases corrieron

**🔴 abierto** · detectado en 0.74.0 · prioridad **media** — no rompe nada hoy; hace que la ADR que gobierna cuánta ceremonia recibe cada tarea sea la única que no se puede comprobar después

## Resumen

`OPS-006` decide que **el carril fija qué fases corren**: `express` se salta Ready, Plan y QA; `full`
las corre todas. Es la ADR que más consecuencias tiene sobre una corrida concreta.

El carril viaja en la línea del BACKLOG. Al cerrar, esa línea **se borra** y la evidencia se escribe en
`done/<slug>.md`, cuyo contrato —`PROTOCOL.md`— exige `acept:`, `fecha:`, `done:`, `qa:`, `tests:`,
`commit:` y opcionalmente `decisions:`. Ninguno es el carril.

Medido en una instancia real: **0 de 79 entradas de DONE registran el carril.**

Consecuencia concreta: no hay forma de contestar, desde el registro, si una tarea `full` recibió su
Review, ni si una `express` se saltó algo que no le correspondía saltarse. La pregunta «¿estamos
siguiendo OPS-006?» sólo se puede responder desde la memoria de quien estuvo en la sesión, que es
exactamente aquello para lo que existe `planning/` según OPS-001.

## Reproducción

```
$ ls planning/done/*.md | grep -vE 'README|human-actions' | wc -l
79
$ grep -lE '\[(express|directo|lite|full)\]' planning/done/*.md | wc -l
0
```

## Síntoma

No hay síntoma. Ése es el punto: la entrada de DONE se lee completa —tiene aceptación, fecha, qué se
hizo, qué se verificó y con qué commit— y nada indica que falte una dimensión. Es la forma que R15
describe: *«una entrega puede estar incompleta; lo que no puede es parecer completa»*.

## Causa raíz

`PROTOCOL.md`, contrato de DONE. La lista de campos se diseñó alrededor de **qué entregó** la tarea, y
el carril no es eso: es **cuánto proceso recibió**. Como no encaja en la pregunta que el contrato hace,
quedó afuera sin que nadie lo decidiera.

**Y no es recuperable de forma pareja.** En una instancia que adoptó Cauce desde el principio,
`git log -S'**<slug>** ['` sobre `BACKLOG.md` encuentra el commit que promovió la tarea y ahí está el
carril. Pero eso es arqueología, no registro: exige saber que hay que buscarlo, tener el repositorio, y
que la tarea haya pasado por un BACKLOG con carril. En la instancia medida, **72 de las 79 entradas
devuelven cero commits** en esa búsqueda: vienen de antes de la adopción, migradas desde un `DONE.md`.
Para esas, el carril no existió nunca y tampoco se puede decir que existió.

## Fix propuesto

Un campo, opcional al principio para no invalidar lo ya escrito:

```diff
  - DONE: un archivo por tarea cerrada, `done/<slug>.md`, con su entrada `[x]` y los campos
-   `acept:`, `fecha:` …, `done:`, `qa:`, `tests:` y `commit:`.
+   `acept:`, `fecha:` …, `done:`, `qa:`, `tests:`, `commit:` y `lane:`.
+   `lane:` repite el carril con el que la tarea corrió —`express|directo|lite|full`— o
+   `sin clasificar` cuando la línea no lo declaraba. Es lo que permite comprobar después que
+   la ceremonia que recibió fue la que su superficie pedía (OPS-006).
```

Con eso, `check` puede además avisar lo que hoy nadie ve: una entrada `full` cuyo `qa:` no menciona
ninguna verificación, o una `express` con cinco condiciones de aceptación —que es la señal de que el
carril se eligió por el tamaño del diff y no por la superficie, el error que la propia ADR advierte.

## Tradeoffs

- Un campo más por entrada, escrito a mano en el momento de cerrar. Es barato, pero es una cosa más que
  se puede olvidar; conviene que `check` lo exija sólo para entradas nuevas y acepte `sin clasificar`.
- Las entradas existentes quedan sin el campo. Rellenarlas por arqueología es posible sólo donde el
  BACKLOG lo tuvo, así que lo honesto es dejarlas como están y que el dato empiece a existir de acá en
  adelante — igual que hizo `fecha:` cuando se introdujo.

## Contexto de descubrimiento

Instancia real (sidecar, 0.74.0), 2026-09-10. Salió de una auditoría pedida por el operador: revisar
las seis ADRs del sistema y decir si se están siguiendo. Cinco se pudieron contestar con evidencia del
propio repositorio —sin estado paralelo, dependencia fijada, cero forks del catálogo, integraciones
deshabilitadas, evidencia con códigos de salida—. OPS-006 fue la única que no, y no porque se estuviera
incumpliendo: porque el registro no guarda el dato con el que se comprueba.

## Relacionados

- **OPS-006** — es la ADR que este caso vuelve inauditable.
- **OPS-001** — dice que `planning/` es la fuente de verdad operativa. Un dato que sólo vive en la
  memoria de la sesión o en la historia de git no está en esa fuente.
- **R15** — la entrada de DONE se lee entera y no lo está. Es el modo de fallo que esa regla nombra.
