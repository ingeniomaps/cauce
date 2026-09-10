---
caso: 079
titulo: El trabajo que no es una tarea no tiene camino, así que sale por la escotilla de excepción
estado: resuelto
resuelto-en: 0.77.0
prioridad: media
version-detectada: 0.76.0
---

# 079 — «Voy a mejorar esto rápido» no tiene carril, y lo que queda es apagar un guard

**🟢 resuelto en 0.77.0** · detectado en 0.76.0 · prioridad **media** — medido, la escotilla no se usa nunca
y el 76 % del trabajo entra sin registro por un camino donde ningún guard mira

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
carril se paga solo.

El dato está en la historia de git de `planning/.ops-approval`, y el comando exacto es éste —desde la raíz
ops de la instancia:

```sh
git log --follow --format='%ad' --date=short -- planning/.ops-approval | sort | uniq -c
git log --follow -p -- planning/.ops-approval | grep -E '^\+[^+#]' | sort | uniq -c | sort -rn | head -20
```

El primero da cuántas veces se tocó y cuándo; el segundo, qué rutas se aprobaron y cuáles se repiten. Una
ruta que aparece muchas veces no es trabajo suelto: es una tarea que nadie escribió.

## Lo que se hizo en 0.77.0, y lo que no cerró

**Se nombró el camino, y apareció que la documentación ofrecía el peor.** `template/AGENTS.md` tiene una
sección entera —«Cuando un guard te frena con razón»— con la tabla de qué ruta aprobar según qué te frenó.
`plan-first` **no estaba en esa tabla**. Sí estaba, en cambio, en la tabla de abajo: la de las variables
que apagan un guard **para toda la sesión**.

O sea que quien se topaba con este freno encontraba documentada la escotilla ancha y no la angosta. Es
exactamente el desenlace que este caso predecía en su último tradeoff, escrito en el propio molde.

Ahora la fila está, con la pregunta que va antes —«¿esto es trabajo de una tarea?»— y con lo que cuesta
tomarla: el cambio entra **sin entrada de DONE**, así que no tiene aceptación, ni evidencia, ni carril, ni
revisión.

**Lo que no cierra**: eso último. El trabajo suelto sigue sin dejar registro, y cuál de las dos vías que
quedan —una entrada de DONE sin tarea previa, o un carril propio— depende del número de arriba.

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

## Cierre

**Resuelto en 0.77.0**, y el caso se cierra con una decisión de no construir, sostenida por dos números que
se midieron en instancias reales y que desmienten su propia hipótesis.

### La escotilla no se usa. Nunca.

El caso decía que la salida de excepción se estaba volviendo el camino habitual. Medido sobre dos
instancias reales —`venotal-ops`, en 0.76.0 y con `guard-files` cableado, y `gouduet-ops` en 0.66.0—:

```
commits que tocaron planning/.ops-approval:  0   ·  0
```

Y el cero es visible, no invisible: `git check-ignore` confirma que el archivo **no está gitignoreado** en
ninguna de las dos, así que si se hubiera usado estaría en la historia.

### Por qué no se usa, y es lo que el caso no vio

**`plan-first` corre en `PreToolUse`.** Gobierna las llamadas de herramienta **del agente**, y nada más.
Verificado en el `settings.json` de la instancia: los guards de archivos cuelgan de `PreToolUse` y
`planning-drift` de `Stop`.

O sea que una persona que abre su editor, corrige el typo y commitea **no se topa con ningún guard**. El
escenario que originó este caso —«alguien dice voy a hacer esto, lo hace y lo sube»— no sale por la
escotilla: no pasa cerca de ella. La escotilla es del agente, y el agente casi siempre trabaja desde una
tarea, que es por lo que nunca la necesitó.

### El registro que falta es mucho más grande que el trabajo suelto

Si el problema fuera la escotilla, sería de cero. Medido por el otro lado —cuántos commits quedan
registrados en una entrada de DONE, cruzando los `commit:` de `planning/done/` contra la historia de cada
repositorio de trabajo:

| repositorio | commits | registrados en DONE |
|---|---|---|
| `dashboard` | 248 | **75** |
| `venotal-storefront` | 43 | **0** |
| `creative-studio` | 21 | **0** |
| **total** | **312** | **75 (24 %)** |

Los 248 de `dashboard` son **todos** posteriores a la primera entrada de DONE —2026-07-09— y ninguno es un
merge, así que no es historia previa a la adopción. Y el contrato dice que una tarea registra **todos** sus
commits separados por `;`: de 80 entradas, **una sola** lo hace, así que la brecha tampoco se explica por
tareas que produjeron varios commits.

**Tres cuartas partes del trabajo de una instancia real no dejan entrada en `planning/`.**

### Qué se decide, y por qué no es ninguna de las dos vías que quedaban

- **«Una entrada de DONE sin tarea previa» — se decide que no.** Está pensada para el trabajo que sale por
  la escotilla, y por ahí no sale nada. Construirla resolvería un caso con cero ocurrencias.
- **«Un carril propio» — se decide que no, y con más razón.** Es el más caro de los tres y atacaría el
  mismo cero. Un quinto contrato entre la prosa, el motor y el workflow para una situación que no ocurre.
- **Lo que sí se hizo —nombrar el camino— era lo correcto y alcanza para lo que este caso podía cubrir.**
  La fila del `plan-first` está en la tabla de aprobaciones, con la pregunta que va antes y con lo que
  cuesta. Si algún día la escotilla empieza a usarse, ahora se ve en git y `check` lo avisa.

### Lo que este caso encontró y no le tocaba arreglar

El 76 % de arriba es otro problema, más grande y de otra clase: no es que el trabajo suelto no tenga
camino, es que **el flujo entero se saltea en la mayoría de los commits**, y ningún guard mira ahí porque
`PreToolUse` no ve a una persona. Eso no se arregla con un carril ni con un campo: pide decidir si el
registro tiene que cubrir todo lo que entra al repositorio, y con qué mecanismo —el commit, no la edición—.

**Sale como el [082](082-tres-de-cada-cuatro-commits-no-dejan-entrada-en-planning.md)**, con estos números
adentro. Dejarlo escrito acá, dentro de un caso cerrado, es la forma en que R15 dice que una dimensión se
pierde.

### Qué se corrió

- **La historia de `.ops-approval`** en dos instancias reales: cero commits, y el archivo no gitignoreado.
- **El evento de los guards**, leído del `settings.json` de la instancia: `PreToolUse` y `Stop`.
- **El cruce de 312 commits contra 80 entradas de DONE**, con los tres descartes hechos: ninguno es merge,
  todos son posteriores a la adopción, y una sola entrada registra más de un commit.
- **Lo que no se pudo medir, y se dice**: cuánto de esos 237 commits sin registro es trabajo que debía
  tener tarea y cuánto es el arreglo suelto que este caso describe. Distinguirlos pide leer los mensajes
  de commit uno por uno, y es parte de lo que el 082 tiene que hacer.
