---
caso: 075
titulo: El arreglo del 056 llegó a `context` y `tree`; `claim`, `release`, `recurring` y `evidence` siguen afirmando sobre un planning que no existe
estado: abierto
prioridad: alta
version-detectada: 0.75.0
---

# 075 — Cuatro comandos contestan un hecho seguro y falso cuando no encuentran el planning, y uno de ellos manda a una persona a arreglar lo que ya está bien

**🔴 abierto** · detectado en 0.75.0 · prioridad **alta** — frena una corrida con un diagnóstico equivocado, y la acción que propone no toca la causa

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
