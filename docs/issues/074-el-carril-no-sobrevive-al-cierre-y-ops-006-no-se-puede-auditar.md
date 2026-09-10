---
caso: 074
titulo: El carril no sobrevive al cierre, así que OPS-006 no se puede auditar sobre el registro
estado: resuelto
resuelto-en: 0.76.0
prioridad: media
version-detectada: 0.74.0
---

# 074 — La entrada de DONE no registra el carril, y es el dato que decidió qué fases corrieron

**🟢 resuelto en 0.76.0** · detectado en 0.74.0 · prioridad **media** — no rompía nada; hacía que la ADR que gobierna cuánta ceremonia recibe cada tarea fuera la única que no se puede comprobar después

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

## Cierre

**Resuelto en 0.76.0.** El campo es el que este caso proponía; lo que cambió al implementarlo es dónde se
pierde el carril, que no era un lugar sino tres.

### El recorrido de lo que este caso enumeró

- **`lane:` en el contrato de DONE — se hizo**, con el vocabulario que el caso proponía: los cuatro
  carriles más `sin clasificar`. Está en `PROTOCOL.md`, en el molde de `done/README.md` y en el parser.
- **«Opcional al principio para no invalidar lo ya escrito» — se hizo, y de una forma que el caso no
  precisaba.** Ausente **avisa con su cuenta** y no frena; escrito mal **sí** frena. Son dos cosas
  distintas y sólo la segunda es un valor que alguien puso: exigir el campo pondría en rojo el `check` de
  cada instancia que actualiza por algo que nadie puede arreglar, y un aviso que cuenta se lee bajar.
- **«`check` puede además avisar lo que hoy nadie ve: una entrada `full` sin verificación, una `express`
  con cinco condiciones» — no se hizo, y sale como su propia unidad.** Es un juicio sobre el contenido de
  la entrada, no sobre su forma, y necesita el campo poblado para no ser ruido: hoy toda entrada existente
  cae en `sin clasificar`. **Sale como el
  [076](076-el-carril-registrado-no-se-contrasta-contra-lo-que-recibio.md)**, que es lo que corresponde:
  una dimensión que le toca a otra unidad no se queda adentro de un caso cerrado.
- **Tradeoff «un campo más que se puede olvidar» — se paga, y menos de lo que parecía.** `autobuild` ya
  tenía el dato en la mano al cerrar —pasaba `lane=` al agente como un hecho— y no tenía dónde ponerlo;
  ahora lo pide como campo. Quien cierra a mano sí puede olvidarlo, y para eso está el aviso.
- **Tradeoff «las entradas existentes quedan sin el campo» — se acepta tal cual**, y por eso el aviso
  cuenta en vez de listar: al principio son todas.
- **La analogía con `fecha:` que este caso usó no se sostiene, y conviene decirlo.** `fecha:` no llegó
  «opcional al principio»: llegó **obligatoria**, dentro de la mudanza de `DONE.md` a `done/<slug>.md` que
  ya obligaba a reescribir cada entrada a mano. Acá no hay migración que lo acompañe, así que el precedente
  no existía y hubo que decidirlo de nuevo.

### Lo que apareció y el caso no preveía: el carril se pierde en tres lugares, no en uno

1. **El contrato de DONE no tiene el campo** — el que el caso nombra.
2. **El WIP tampoco lo tenía.** Una corrida que se reanuda arma la tarea desde `wip/<runner>.md`, y
   `currentTask` le ponía `tier: ''`. **Medido**: con la tarea fuera de la cola y sólo el WIP, el carril
   que veía el cierre era `""`. O sea que el campo en DONE, solo, habría escrito `sin clasificar` sobre
   tareas que sí tenían carril, exactamente en el caso en que más importa saberlo.
3. **Y el productor ya lo tenía.** `autobuild` le pasaba `lane=` al agente que cierra, dentro de los
   hechos. No faltaba el dato: faltaba dónde ponerlo.

El 3 es lo que vuelve barato el arreglo, y el 2 es lo que lo vuelve correcto.

### Qué se corrió

- **La pérdida al reanudar, medida contra el motor** antes de tocar nada: `currentTask` con la tarea fuera
  de la cola y sólo el WIP devolvía `tier: ""`. Con el WIP declarándolo, devuelve `"express"`.
- **`ops check` corrido de verdad** sobre un `planning/` desechable, en las tres formas: con el campo
  puesto no dice nada; con dos entradas sin él avisa «2 entrada(s) sin lane:» y **sale en 0**; con
  `lane: rapido` falla nombrando el vocabulario entero.
- **Siete mutaciones, las siete en rojo**: que la entrada de DONE deje de leer el campo; que el WIP deje
  de leerlo; que reanudar vuelva a perder el carril —la regresión exacta—; que un carril inventado deje de
  frenar; que el aviso deje de contar; que el WIP se escriba sin carril; y que el cierre deje de pedirlo.
- **La puerta entera**: 648 pruebas, 0 fallos.
- **Lo que no se pudo correr, y se dice**: la medición que originó el caso —0 de 79 entradas— es de la
  instancia sidecar y no se puede rehacer desde acá. Lo que sí se comprobó es lo estructural, que es de
  donde salía ese cero: el campo no existía en ningún contrato ni en ningún parser.
