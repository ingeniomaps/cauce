---
caso: 376
titulo: partir una tarea deja a quien dependía de ella apuntando a un slug que ya no existe
estado: abierto
prioridad: media
version-detectada: 0.106.1
---

# 376 — Decompose parte una tarea y no reapunta los `(depende: …)` que la nombraban: la cola queda con una dependencia a un slug inexistente y `check` en rojo

**🔴 abierto** · detectado en 0.106.1 · prioridad **media**.

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
