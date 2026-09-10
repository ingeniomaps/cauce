---
caso: 079
titulo: El trabajo que no es una tarea no tiene camino, así que sale por la escotilla de excepción
estado: abierto
prioridad: media
version-detectada: 0.76.0
---

# 079 — «Voy a mejorar esto rápido» no tiene carril, y lo que queda es apagar un guard

**🔴 abierto** · detectado en 0.76.0 · prioridad **media** — no rompe nada; convierte la salida de
excepción en el camino habitual, que es como una escotilla se termina apagando

## Resumen

Los cuatro carriles —`express`, `directo`, `lite`, `full`— son carriles **de tarea**: los cuatro suponen
una tarea promovida en el BACKLOG. Para el cambio que no es una tarea —un typo en un README, un umbral
que alguien corrige de paso, «esto lo arreglo en dos minutos»— el protocolo **no dice nada**: no hay una
sola línea sobre trabajo sin tarea en `PROTOCOL.md` ni en las reglas del sistema.

Lo que hay es una escotilla: aprobar la ruta para que `plan-first` la deje pasar. Está diseñada para la
excepción —vale para ese conjunto de archivos, deja de valer en cuanto cambien, y `check` avisa hasta que
la borres— y se usa para lo que es habitual.

Y el trabajo que sale por ahí **no deja registro**: no hay entrada de DONE, así que no tiene aceptación,
ni evidencia, ni carril, ni revisión. `OPS-001` dice que `planning/` es la fuente de verdad operativa; un
cambio que entró sin pasar por ahí no está en esa fuente.

## Reproducción

Instancia real creada con `ops init`, con una tarea en cola y ningún WIP —el estado normal de quien no
está construyendo—:

```
$ node engine/cli/ops.js context demo-ops/planning --json
tarea ofrecida: otra-cosa · wip: null

# «voy a mejorar esto rápido»: editar src/app.js
BLOQUEADO · …/src/app.js cambia el producto sin plan. WIP está en IDLE, así que el plan
todavía no está escrito.

# con la ruta escrita en planning/.ops-approval
PASÓ: la edición se deja

$ node engine/cli/ops.js check demo-ops/planning --json
errors: 0 · warnings:
   · planning/.ops-approval: 1 ruta(s) aprobadas y sin borrar; el archivo sigue autorizándolas
```

## Síntoma

Se siente como «no me deja commitear», y no es eso: **lo que frena es la edición, no el commit**.

- `plan-first` corre en `PreToolUse · files` y bloquea el archivo **antes de escribirlo**.
- `planning-drift` corre en `Stop / SessionEnd` y bloquea **cerrar la sesión** con el planning
  desalineado.
- Ningún guard del registro mira el WIP en el commit: `destructive`, `git-add`, `dependencies`,
  `governance` y `verify` deciden por otra cosa.

Los dos frenos están en momentos distintos, y por eso el recuerdo de quien lo sufre no coincide con lo
que pasó. Eso importa para arreglarlo: quien vaya a buscar el bloqueo al commit no lo va a encontrar.

## Causa raíz

No es un defecto de implementación: es una superficie que no existe. La clasificación decide **cuánta
ceremonia** merece una tarea, y su vocabulario no tiene un valor para «esto no es una tarea». `plan-first`
hace lo correcto —exige plan antes de cambiar el producto— y la única salida que ofrece es la de
excepción, porque no hay otra escrita.

## Fix propuesto

Ninguno cerrado, y por eso esto es un caso. Lo que se ve, de menos a más invasivo:

- **Nombrar el camino que ya existe, en el protocolo.** Hoy la escotilla se descubre leyendo el mensaje
  de un guard. Escribir cuándo corresponde aprobar una ruta, y cuándo no, es barato y no cambia el motor.
  No cierra lo del registro.
- **Una entrada de DONE sin tarea previa.** El cambio se hace, y se cierra con su evidencia igual que
  una tarea: aceptación, qué se verificó, commit. Lo que cambia es que no viene del BACKLOG. Deja el
  registro completo y pide decidir qué pasa con `lane:` —¿un quinto valor?, ¿`sin clasificar`?— y con
  `review:`.
- **Un carril propio.** El más caro y el que más promete: un valor que diga «sin tarea» y que fije qué
  fases corren —probablemente Verify y Done y nada más—. Toca el vocabulario, el motor, el workflow y
  las cuatro copias de la prosa, que es el costo que la propia `OPS-006` ya declara.

**Antes de elegir hay que medir una cosa que hoy no se sabe**: cuántas veces se usa la escotilla en una
instancia real, y sobre qué archivos. Si son dos por mes, nombrar el camino alcanza; si son veinte, el
carril se paga solo. El dato está en `planning/.ops-approval` y en su historia de git.

## Tradeoffs

- **Nombrar el camino y nada más** deja el trabajo suelto fuera del registro, que es la mitad del
  problema. Barato y honesto si la frecuencia es baja.
- **Una entrada de DONE sin tarea** rompe una invariante escrita: «una tarea tiene un dueño de estado:
  roadmap → BACKLOG → overlay WIP → DONE». Habría que decidir si esa invariante admite una excepción o
  si el trabajo suelto no es una tarea y por eso no la viola.
- **Un carril propio** es un quinto contrato que mantener alineado entre la prosa, el motor y el
  workflow — el costo que `OPS-006` ya aceptó por cuatro y que crecería a cinco.
- **No hacer nada** tiene el costo que este caso nombra: la escotilla se usa hasta que a alguien le
  molesta el aviso de `check` y exporta `OPS_PLAN_FIRST_OVERRIDE=1`, que apaga el guard para toda la
  sesión. Ahí el freno deja de existir para todo, no sólo para el arreglo suelto.

## Contexto de descubrimiento

Del operador, 2026-09-10: «alguien dice voy a hacer esto, lo hace y lo sube, pero no pasa por todo el
flujo; suele ser habitual en casos básicos o en una mejora rápida». Se buscó entre los casos y no había
ninguno, y se buscó en el protocolo y tampoco.

## Relacionados

- **OPS-006** — decide la ceremonia por carril, y sus cuatro carriles suponen una tarea.
- **OPS-001** — `planning/` como fuente de verdad operativa: es la que el trabajo suelto deja incompleta.
- **R13** — «negarse no es entregar». Un guard que frena sin nombrar el camino correcto deja el pedido
  donde estaba, y acá el camino correcto no está escrito en ningún lado.
