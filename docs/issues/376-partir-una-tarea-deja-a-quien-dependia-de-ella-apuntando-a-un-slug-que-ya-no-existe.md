---
caso: 376
titulo: partir una tarea deja a quien dependía de ella apuntando a un slug que ya no existe
estado: resuelto
resuelto-en: 0.108.0
prioridad: media
version-detectada: 0.106.1
---

# 376 — Decompose parte una tarea y no reapunta los `(depende: …)` que la nombraban: la cola queda con una dependencia a un slug inexistente y `check` en rojo

**🟢 resuelto en 0.108.0** · detectado en 0.106.1 · prioridad **media** — la partición reapunta a quien dependía de la
tarea a **todas** las partes nuevas, y se vio hacerlo con un agente real.

## Resumen

Cuando el recorrido parte una tarea en varias, retira su línea y escribe las partes, pero no recorre la cola
buscando otras tareas que declaran `(depende: <slug-partido>)`. Esas quedan esperando algo que ya no va a
existir nunca: ni en la cola ni en `done/`. La corrida termina, y lo descubre el `check` siguiente o una
persona.

## Reproducción

En la instancia sidecar `acme-ops`, hito `cuenta-como-ancla`:

1. `2ba5f0f` (escrito a mano) deja `cuenta-acceso-dueno-es-la-cuenta` con
   `(depende: cuenta-acceso-canal-explicito, cuenta-sesion-entrega-la-cuenta)`.
2. La corrida de autobuild `wf_1412ea67-dd0` toma `cuenta-sesion-entrega-la-cuenta`, Decompose la parte en
   cuatro, y el commit de cierre de la primera parte (`6e5edfe docs(planning): close
   cuenta-sesion-resolutores-traen-la-cuenta`) retira la línea original y escribe las otras partes.
3. Ese commit no toca la línea de `cuenta-acceso-dueno-es-la-cuenta`.

## Síntoma

Al terminar la corrida, `ops check planning` en rojo por la dependencia a un slug inexistente. Se reparó a
mano en `bc3cc47` (`docs(planning): point cuenta-acceso-dueno-es-la-cuenta at its parts`), apuntándola a la
última parte de la partición:

```
-(depende: cuenta-acceso-canal-explicito, cuenta-sesion-entrega-la-cuenta)
+(depende: cuenta-acceso-canal-explicito, cuenta-sesion-altas-de-investigacion-y-retiro-del-puente)
```

## Causa raíz

No localizada en el motor. Lo observable: la fase que escribe la partición no busca dependientes del slug
que retira. R25 dice que la tarea original «se cierra diciendo en qué se partió», pero nada propaga eso a
quien la esperaba.

## Fix propuesto

Al partir, buscar en la cola toda línea con `(depende: …)` que nombre el slug retirado y reemplazarlo por la
parte que cierra la partición (o por todas las partes, si no hay una que cierre las demás). Si no se puede
decidir cuál, no terminar la fase: dejarlo como acción humana en vez de dejar la cola rota.

Alternativa mínima: que `check` corra al final de Decompose y la corrida pare ahí si queda rojo.

## Qué podría salir mal

- Reemplazar por «la última parte» supone que las partes van en cadena. Si son paralelas, el dependiente
  tiene que esperar a todas; elegir una sola lo dejaría arrancar antes.

## Contexto de descubrimiento

Instancia sidecar `acme-ops`, Claude Code, 2026-10-13/14, revisando la corrida `wf_1412ea67-dd0` (93
agentes, cuatro tareas cerradas).

## Relacionados

- [377](./377-el-escriba-commitea-el-estado-de-planning-sin-el-scope-del-proyecto.md) y
  [378](./378-el-plan-sigue-con-la-aceptacion-vieja-despues-de-que-la-corrida-la-corrigio.md) — misma corrida.

## Cierre

**Resuelto en 0.108.0.** La causa raíz, que el caso dejaba «no localizada en el motor», está en la consigna de la
partición (`automatization/workflows/autobuild.js`, fase Decompose, `label: 'split'`): reemplazaba la tarea y
actualizaba la historia de la épica, y de `(depende: …)` no decía nada. Ahora dice que toda tarea de la cola
que nombre a la partida pasa a depender de todas las subtareas nuevas, conservando los demás slugs que ya
declaraba.

**Lo que se corrió para saber que funciona.**

- Arnés: `test/workflows/autobuild-queue.test.js`, «partir una tarea reapunta a quien dependía de ella, a todas
  las partes». En rojo antes del cambio y en verde después. Mutación en copia: la consigna diciendo «ninguna
  tarea» en vez de «toda tarea» la pone en rojo.
- El paso real, solo: el prompt exacto de `split` que arma el recorrido —volcado desde el arnés, con dos
  subtareas con aceptación y service— corrido con `claude -p` el 2026-10-14 sobre un banco `suelto` cuya cola
  tenía `T-1` y `T-2 … (depende: T-1)`. Lo que quedó escrito:

  ```
  - [ ] **T-1a** [lite] — Hacer uno (primera mitad). _Aceptación: la primera mitad de uno es visible._ (service: app)
  - [ ] **T-1b** [lite] — Hacer uno (segunda mitad). _Aceptación: la segunda mitad de uno es visible._ (service: app)
  - [ ] **T-2** [lite] — Hacer dos. _Aceptación: dos visible._ (service: app) (depende: T-1a, T-1b)
  ```

  `ops check planning` → `✓ planning válido: 0 épica(s), 3 tarea(s) en cola`; `ops context planning --json`
  ofrece `T-1a` y deja a `T-2` esperando. Antes del cambio, el mismo paso dejaba `(depende: T-1)` y `check` en
  rojo, que es lo que el caso reproduce.

**Recorrido de lo que el caso enumeraba.**

- **Reapuntar al partir — se hizo distinto**: a todas las partes, no a la última. Era el riesgo que el propio
  caso nombraba: partes paralelas y un dependiente que arranca antes. Esperar a todas espera de más y nunca
  de menos, y si las partes van en cadena el resultado es el mismo.
- **«Si no se puede decidir cuál, acción humana» — no aplica**: con «todas» no hay cuál decidir.
- **Alternativa mínima, `check` al final de Decompose — se decidió que no**: habría frenado la corrida con la
  cola ya rota, que es lo que se quería evitar, no detectarlo antes de terminar. La partición ya relee la cola
  y se niega si la tarea sigue ofrecida; lo que faltaba era la consigna, no una puerta más.

**Revisión del PR 819.** La consigna sola no era observable: si el agente reemplazaba la tarea y no reapuntaba a
nadie, la corrida seguía. `context` ahora viaja con `waiting`, y después de partir, si alguien sigue dependiendo
de la tarea partida, la corrida para en `split-left-dependents` nombrando a quién. Prueba en el arnés; mutación
sin la guarda, en rojo.
