---
caso: 169
titulo: R25 pide que una unidad partida se cierre diciendo en qué se partió, y el único lugar de cierre que hay significa otra cosa
estado: resuelto
resuelto-en: 0.95.0
prioridad: alta
version-detectada: 0.95.0
---

# 169 — Una unidad partida no tiene dónde cerrarse

**🟢 resuelto en 0.95.0** · detectado en 0.95.0 · prioridad **alta** (subida al medirlo) — el lugar donde
se cierra es la épica, no `DONE`; y no se perdía en silencio: dejaba `check` en rojo

## Resumen

**R25** dice: «Partir una unidad es otra cosa y no la toca: las partes son unidades nuevas, con
identificadores nuevos, y la original **se cierra diciendo en qué se partió**».

Hoy no se cierra: se borra. La rama de `needsSplit` de `autobuild` reemplaza la línea del BACKLOG por las
subtareas, y con eso el slug original deja de existir en las dos puntas. Quien dentro de tres meses busque
qué pasó con esa tarea no encuentra nada — ni en la cola, ni en lo hecho, ni en ningún lado.

Salió del caso **163**, que arregló la otra mitad del mismo hueco: ahí el reclamo quedaba puesto sobre el
slug borrado. El reclamo ya se suelta; lo que sigue sin existir es el cierre.

## Por qué no se hizo junto con el 163

Porque no es un arreglo, es una decisión sobre qué significa `DONE`, y esa decisión cambia el producto.

El 163 proponía escribir una entrada en `done/` con `commit: n/a — partida`. La forma es válida —el
contrato de una entrada ya admite `n/a — razón`, y `contracts.js:74-75` la valida— así que **el obstáculo
no es el formato**. El obstáculo es el significado: `DONE` hoy quiere decir *trabajo entregado*, y una
unidad partida no se entregó.

Y `DONE` no lo lee sólo una persona. Verificado recorriendo sus consumidores en el motor:

- `engine/cli/validate.js:203` lo cuenta como «N terminada(s)», que es lo que `check` le informa a quien
  lo corre.
- `engine/core/repos.js:111` toma la fecha más nueva de `done.entries` como el punto desde el que mide los
  commits sin entrada (OPS-001). Una entrada de partición con fecha de hoy **mueve esa ventana** y deja de
  avisar por commits anteriores.
- `engine/planning/recurring.js:110` deriva de los slugs de DONE qué períodos de una recurrencia ya se
  cumplieron.
- `engine/planning/inbox.js:29` y `engine/cli/validate.js:122` lo usan para decidir si algo sigue vivo.

O sea que meter ahí una unidad que no se entregó no es una anotación: cambia tres cuentas que hoy
significan otra cosa.

## Las salidas posibles, sin elegir

1. **Entrada en `done/` con `commit: n/a — partida`.** La más barata y la que el 163 proponía. Cierra el
   cruce y le da a `check` con qué contrastar. El precio es el de arriba: `DONE` pasa a mezclar entregado
   con resuelto, y los cuatro lectores heredan la mezcla sin que nadie se lo diga.
2. **Un campo en la propia entrada que distinga cerrada-por-entrega de cerrada-por-partición**, y que los
   lectores que cuentan trabajo lo saltéen. Más caro, y deja los dos significados separados.
3. **Otra superficie de cierre**, fuera de `DONE`. La más limpia conceptualmente y la que más contrato
   agrega para un caso que ocurre pocas veces.
4. **Que R25 no aplique acá y se diga.** La regla habla de unidades de trabajo en general; puede ser que
   para una tarea del BACKLOG partida por el propio recorrido, la línea reemplazada por sus subtareas
   **sea** el rastro suficiente. Es una respuesta legítima y hoy es la que rige de hecho, sin que nadie la
   haya escrito.

## Reproducción

No hace falta correr nada para verlo, y por eso lo que se reprodujo es el estado resultante. Sobre el banco
`tarea`, con la reserva soltada como la deja 163:

```
$ node engine/cli/ops.js check .cauce-eval/_medicion/tarea/planning
✓ planning válido: 0 épica(s), 2 tarea(s) en cola, 0 terminada(s)
```

Dos tareas en cola —las subtareas— y **cero terminadas**. `tarea-medida` no está en ninguna de las dos
cuentas: se fue sin dejar nada. Eso es exactamente lo que R25 dice que no tiene que pasar, y el verde no lo
nota porque no hay nada que contrastar contra una unidad que ya no existe.

## Prioridad

**Media.** No rompe una corrida ni deja `planning` en rojo —eso lo cerró el 163—. Lo que se pierde es la
trazabilidad de una unidad que existió, y se pierde en silencio: nadie va a extrañar un slug que no está.

## Contexto de descubrimiento

2026-09-16, arreglando el caso 163. El propio 163 lo nombraba en su «Fix propuesto» como un segundo
párrafo —«Si la partición quiere cumplir R25…»—, que es justo la forma que R15 describe: una línea del tipo
«vale la pena mirar si…» dentro de un caso sobre otra cosa. Sale como unidad propia antes de cerrar el 163
porque elegir entre las cuatro salidas de arriba no le toca a quien está arreglando un reclamo huérfano.

**Consultado para escribir esto**: `engine/planning/contracts.js` (líneas 74-75 y 105),
`engine/cli/validate.js` (122, 189 y 203), `engine/core/repos.js` (111), `engine/planning/recurring.js`
(110), `engine/planning/inbox.js` (29), la rama `needsSplit` de `automatization/workflows/autobuild.js`
(652-676), el texto de R25 en `template/planning/rules/system/process.md`, y la salida de `ops check` sobre
el banco `tarea` después de partir y soltar.

## Relacionados

- **163** (resuelto en 0.95.0) — la otra mitad: el reclamo de la tarea partida quedaba puesto. Ahí se
  arregló lo que rompía una corrida; acá queda lo que decide una persona.
- **R25** — la regla que pide el cierre que hoy no existe.

## Cierre

**Resuelto en 0.95.0, y este caso estaba mal planteado.** Lo escribí yo al cerrar el 163, con la
enumeración de salidas que ahí correspondía; medirlo mostró que la pregunta era otra y que ninguna de las
cuatro era la respuesta. Lo que faltaba mirar era **de dónde viene la tarea**.

Recorriendo lo que enumeró:

- **«Hoy no se cierra: se borra» → cierto, y ésa era la única parte bien vista.**
- **«Se pierde en silencio… nadie va a extrañar un slug que no está» → falso.** Si la tarea viene de una
  épica, la lista de historias de esa épica sigue nombrando el slug borrado, y eso rompe por los dos lados
  según qué escriba el agente que reemplaza la línea. Medido sobre un banco:

  | la partición escribe | `check` al partir | al cerrar la épica |
  |---|---|---|
  | subtareas con `(epic: NNN)` | **rojo**: `✗ BACKLOG <sub>: no existe en epic-001` (×2) | — |
  | subtareas sin la épica | verde | **rojo**: `✗ … closed sin evidencia para integraciones-por-tabla` |

  O sea que no es silencioso: o la puerta se pone roja en el acto, o la épica **no puede cerrar nunca**,
  porque `closed` exige evidencia de cada historia y la original jamás la va a tener.
- **«Prioridad media» → subida a alta.** Una puerta en rojo justo después de partir, o una épica que
  queda sin poder cerrarse, no es fricción.
- **Las cuatro salidas → ninguna se tomó, y las cuatro quedaron superadas.** La 1 —entrada en `done/`—
  contradice lo que ese directorio declara de sí mismo: su README dice «Evidencia de lo terminado… lo que
  esa tarea **entregó**», y una partida no entregó nada. La 2 y la 3 construyen contrato nuevo para un
  problema que no era el que había. Y la 4 —que R25 no aplique— queda refutada por la tabla de arriba.
- **La quinta, que el caso no listó, es la que la evidencia fuerza:** la partición actualiza **también la
  épica**, reemplazando la historia original por las de las subtareas. Ahí es donde la unidad vivía, así
  que ahí es donde se dice en qué se partió — que es exactamente lo que R25 pide, leído por su propósito
  y no por su letra.

Y con eso la pregunta que abría el caso se contesta sola: **para una tarea sin épica no hace falta ningún
cierre.** El cruce que R25 protege —cola, reclamado, hecho— no se rompe cuando una unidad deja de existir
limpiamente; se rompe cuando vive con dos nombres. `DONE` se queda significando lo que su README dice.

### Qué se corrió

- **Las dos variantes de la partición sobre un banco con una épica de una historia**, con las salidas de
  `check` pegadas en la tabla de arriba. Y la tercera: partiendo como la consigna manda ahora —BACKLOG y
  épica— `check` devuelve `✓ planning válido: 1 épica(s), 2 tarea(s) en cola` y no queda ninguna historia
  huérfana.
- **Rojo previo** sobre la consigna: no nombraba la épica.
- **Tres mutaciones, las tres en rojo**: sin la cláusula —el defecto—; mandándola siempre, que haría
  tocar un roadmap a una tarea suelta; y sin nombrar **cuál** épica, que le deja al agente adivinar qué
  archivo abrir.
- `npm run ci` exit 0: **903 pruebas**, 0 en rojo, 0 salteadas.

### Lo que este caso deja dicho sobre sí mismo

Se registró para no tomar solo una decisión de producto, y eso estuvo bien; lo que estuvo mal fue
enumerar las salidas sin haber medido de dónde viene una tarea. Las cuatro opciones estaban bien
razonadas sobre una premisa que nadie había comprobado — la misma forma de fallar que el 166 tuvo con su
hipótesis, dos casos antes, y que acá no reconocí por haberlo escrito yo.
