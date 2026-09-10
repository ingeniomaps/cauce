---
caso: 075
titulo: El arreglo del 056 llegó a `context` y `tree`; `claim`, `release`, `recurring` y `evidence` siguen afirmando sobre un planning que no existe
estado: resuelto
resuelto-en: 0.76.0
prioridad: alta
version-detectada: 0.75.0
---

# 075 — Cuatro comandos contestan un hecho seguro y falso cuando no encuentran el planning, y uno de ellos manda a una persona a arreglar lo que ya está bien

**🟢 resuelto en 0.76.0** · detectado en 0.75.0 · prioridad **alta** — frenaba una corrida con un diagnóstico equivocado, y la acción que proponía no tocaba la causa

## Resumen

El [caso 056](056-un-planning-inexistente-se-lee-como-cola-vacia.md) estableció que `ops context` sobre
un planning inexistente devolvía cola vacía con exit 0, y que eso era indistinguible de «terminaste
todo». 0.71.0 lo arregló: hoy nombra la ruta resuelta y sale con 2.

**Ese arreglo llegó a dos comandos de siete.** Medido en 0.75.0, con la misma ruta inexistente:

| comando | qué contesta | ¿honesto? |
|---|---|---|
| `context` | `no existe el planning en …/venotal-ops/venotal-ops/planning (ruta resuelta)` | sí |
| `tree` | idem | sí |
| `check` | `⚠ no existe ../ops.config.json` | confuso, pero no afirma de más |
| `claim` | `<slug> no está en BACKLOG: sólo se toma trabajo ya promovido.` | **no** |
| `release` | `<slug> no está tomada por nadie.` | **no** |
| `recurring` | `este planning no declara trabajo recurrente` | **no** |
| `evidence` | `DONE no tiene ninguna entrada` | **no** |

Los cuatro últimos no dicen «no pude leer»: dicen un **hecho concreto sobre el contenido** de un
directorio que no existe. Es la misma clase que el 056 nombró, sobreviviendo en otro lado.

## Reproducción

Instancia `sidecar` cuya raíz de ops es `<empresa>-ops/`, parada **dentro** de esa raíz:

```
$ ls -d <empresa>-ops/planning
ls: no se puede acceder … No existe el archivo o el directorio

$ node tools/ops.js context <empresa>-ops/planning
no existe el planning en …/<empresa>-ops/<empresa>-ops/planning (ruta resuelta).
Comprobá desde dónde estás invocando.                                    exit 2

$ node tools/ops.js claim <empresa>-ops/planning <slug-que-SÍ-está-en-backlog>
<slug> no está en BACKLOG: sólo se toma trabajo ya promovido.             exit 2
```

Con la ruta correcta, el mismo `claim` sobre el mismo slug toma la tarea sin objeción.

## Síntoma

El daño no es el mensaje: es **la acción que el mensaje induce**.

En una corrida real de `autobuild` (0.75.0, una sola tarea, medición controlada), el recorrido paró con
`claim-stuck` —el freno nuevo funcionando— y su detalle decía:

> No es un conflicto de reclamo con otro runner: el CLI rechaza el claim porque el slug no figura en
> `BACKLOG.md`, es decir la tarea no está promovida. […] Para desbloquear hace falta que **una persona
> promueva la tarea al BACKLOG** (BR-OPS-002).

La tarea **estaba** promovida —`grep` la encuentra en `BACKLOG.md`, y `context`, corriendo en la misma
corrida, la ofrecía—. O sea que el recorrido le pidió a una persona que arreglara lo único que estaba
bien, con una cita a la regla correcta y una conclusión falsa.

`release` es peor en potencia: «no está tomada por nadie» sobre una ruta ilegible puede leerse como
permiso para que otro la tome.

## Causa raíz

La comprobación de existencia del planning se agregó donde el 056 dolía —`context`, y `tree` que
comparte lector— y no en la entrada común. Cada comando resuelve su ruta y consulta lo suyo: `claim`
busca el slug en el BACKLOG, `evidence` recorre `done/`, `recurring` abre `RECURRING.md`. Sobre un
directorio ausente, **cada uno encuentra vacío y lo reporta como un hecho del dominio**.

Es exactamente lo que 0.63.0 arregló para el índice de git —«un índice que no se puede leer deja de
autorizar el commit», porque `stagedFiles` devolvía vacío tanto si estaba vacío como si falló— y lo que
056 arregló para `context`. Tres apariciones de la misma clase, arregladas de a una.

## Fix propuesto

En la resolución de la ruta, no en cada comando:

```diff
  resolvePlanningDir(dir)
+   Si el directorio no existe o no se puede leer, error con la ruta RESUELTA y exit != 0,
+   antes de que ningún comando consulte su contenido. Vale para todos: el comando que no
+   pudo leer no afirma sobre lo que no leyó.
```

Ponerlo ahí es lo que cierra la clase en vez de la instancia. Si además cada comando quiere afinar su
mensaje, que sea sobre un planning que ya se sabe legible.

## Tradeoffs

- Algún script que hoy trate «vacío» como «nada que hacer» va a empezar a fallar. Es el mismo tradeoff
  que 0.67.0 y 0.71.0 ya aceptaron, y en la misma dirección: un comando que no pudo leer no responde
  como si hubiera leído.
- `check` queda distinto de los demás: hoy avisa por `ops.config.json` y no por el planning. Unificarlo
  es deseable pero es otro cambio.

## Contexto de descubrimiento

Instancia real (sidecar, 0.75.0), 2026-09-10. La corrida era una **medición controlada** pedida por el
operador: una sola tarea, para ver si el recorrido cerraba y a qué costo, después de que 0.75.0 cerrara
los casos 070, 071 y 072.

El freno del 071 funcionó como se diseñó —paró en **4 agentes y 270 k tokens**, contra los 28 agentes y
2,7 M de la corrida que originó ese caso—. Lo que la medición no pudo contestar es si el recorrido
cierra una tarea, porque nunca llegó a construir: se lo impidió este caso, en un comando distinto del
que el 056 arregló.

## Relacionados

- **056** — la misma clase, arreglada en `context`. Este caso es lo que quedó afuera.
- **0.63.0, «Un índice que no se puede leer deja de autorizar el commit»** — la primera aparición
  documentada de la clase, en otro subsistema.
- **071** — su freno es lo que hizo esta corrida barata de diagnosticar. Sin él, este caso habría vuelto
  a costar veintiocho agentes en vez de cuatro.

## Cierre

**Resuelto en 0.76.0**, y con el arreglo que este caso pedía: en la resolución de la ruta, no en cada
comando. Lo que cambió al medirlo es el tamaño de la superficie.

### Eran cuatro comandos deshonestos de siete; son ocho de once

El caso midió los siete que tenía a mano. Barridos todos los que reciben un planning, la tabla queda así
—medida sobre una ruta inexistente, antes de tocar nada:

| comando | exit | qué contestaba | ¿honesto? |
|---|---|---|---|
| `context` | 2 | no existe el planning en … | sí |
| `tree` | 2 | idem | sí |
| `check` | 1 | ⚠ no existe ../ops.config.json · ✗ falta BACKLOG.md | a medias |
| `claim` | 2 | no está en BACKLOG | **no** |
| `release` | 2 | no está tomada por nadie | **no** |
| `worktree` | 2 | no está en BACKLOG | **no** |
| `evidence` | 2 | DONE no tiene ninguna entrada | **no** |
| `recurring` | **0** | este planning no declara trabajo recurrente | **no** |
| `runners` | **0** | ningún runner tiene trabajo abierto | **no** |
| `archive human-actions` | **0** | no hay filas resueltas | **no** |
| `adopt` | **0** | no hay nada que exentar: todas cumplen | **no** |

Los tres que el caso no tenía —`worktree`, `runners`, `adopt`— y `archive`. Y el dato que cambia la
prioridad: **cuatro salían con exit 0**, así que no sólo afirmaban de más, lo afirmaban con éxito. Un
script que mira el código de salida veía que todo estaba bien.

`runners` es el peor por lo que induce: «ningún runner tiene trabajo abierto» sobre una ruta ilegible
invita a arrancar uno nuevo, que es la salida automática que el 0.72.0 vino a frenar.

### El recorrido de lo que este caso enumeró

- **«En la resolución de la ruta, no en cada comando» — se hizo tal cual.** `planningRoot(dir)` en
  `engine/cli/io.js` resuelve **y** comprueba, y los once comandos pasan por ahí. La comprobación que
  vivía suelta en `planning.js` se retiró: no quedó ninguna llamada.
- **«Si además cada comando quiere afinar su mensaje, que sea sobre un planning que ya se sabe legible» —
  no hizo falta afinar ninguno.** Los mensajes de dominio siguen igual y ahora sólo se emiten cuando hay
  un planning de verdad detrás.
- **Tradeoff «algún script que trate vacío como nada que hacer va a empezar a fallar» — se paga y va al
  CHANGELOG**, en la misma dirección que 0.63.0 y 0.71.0.
- **Tradeoff «`check` queda distinto de los demás; unificarlo es otro cambio» — se unificó acá, y es una
  desviación que conviene decir.** Poner la comprobación en la resolución se la da a `check` gratis, y
  dejarlo afuera habría exigido una excepción explícita: exactamente el caso especial por comando que
  este caso vino a cerrar. `check` sobre una ruta inexistente pasa de «⚠ no existe ../ops.config.json ·
  ✗ falta BACKLOG.md» con exit 1 a nombrar la ruta con exit 2.

### Lo que apareció y el caso no preveía

- **La comprobación de existencia era inobservable, y lo mostró una mutación.** Un directorio que no
  existe tampoco tiene `BACKLOG.md`, así que la segunda comprobación tapaba a la primera: sacar el
  `existsSync` de la raíz **no ponía nada en rojo**. Son dos diagnósticos distintos —una ruta mal
  resuelta contra un directorio que no es un planning— y el primero es el que este caso nombra. La prueba
  ahora exige el mensaje, no sólo el fallo.
- **`engine/cli/planning.js` bajó de las 500 líneas** al sacarle la comprobación, así que su entrada en el
  registro de archivos largos se retiró — la puerta lo exige. Con eso se va también la nota de deuda que
  esa entrada llevaba: partir `check` a `planning-check.js`. Ya no la dispara el tamaño, que es lo que R7
  dice que decide.
- **Tres fixtures de `evidence` armaban un planning sin `BACKLOG.md`.** Se les agregó, porque un planning
  real siempre lo trae —lo escribe el molde y lo crea `ops init`—: sin él el fixture no era un planning, y
  la comprobación nueva tiene razón en rechazarlo.

### Qué se corrió

- **Los once comandos, contra una ruta inexistente, antes y después.** Antes: la tabla de arriba. Después:
  los once dicen «no existe el planning en \<ruta resuelta\>» y salen con **2**.
- **Cinco mutaciones**, cuatro en rojo a la primera y una que **sobrevivió** —sacar el `existsSync` de la
  raíz— y que es lo que destapó el hueco de la prueba. Con la aserción del mensaje puesta, las cinco
  matan: sin la comprobación de existencia; sin la de `BACKLOG.md`; y `claim`/`release`, `adopt` y
  `worktree` volviendo cada uno a resolver sin comprobar.
- **La puerta entera**: 648 pruebas, 0 fallos.
- **Lo que no se pudo correr, y se dice**: la corrida de `autobuild` que originó el caso es de la
  instancia sidecar. Acá se reprodujo la causa —el comando afirmando— y no la consecuencia —el recorrido
  mandando a promover lo que ya estaba promovido—, que depende de un agente leyendo ese mensaje.
