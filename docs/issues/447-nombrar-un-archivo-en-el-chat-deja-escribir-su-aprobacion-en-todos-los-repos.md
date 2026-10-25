---
caso: 447
titulo: Nombrar un archivo por su nombre en el chat deja al agente escribirse la aprobación de ese archivo en todos los repositorios
estado: abierto
prioridad: media
version-detectada: 0.116.0
---

# 447 — Nombrar un archivo en el chat deja escribir su aprobación en todos los repos

**🔴 abierto** · detectado en 0.116.0 · prioridad **media** — sidecar con más de un repositorio, o con líneas de
trabajo; hace falta que la persona pida escribir la aprobación nombrando el archivo sólo por su nombre.

## Resumen

Desde el 445 una línea de `.ops-approval` nombra un archivo de un checkout, entera. Pero cuando la persona pide en el
chat que se agregue una aprobación nombrando el archivo por su nombre —«agregá package.json a .ops-approval»—,
`self-approval` deja que el agente se escriba **las rutas enteras de todos los repositorios** que tengan ese nombre:
compara cada línea contra el mensaje también por su basename. La persona nombró un archivo y el resultado aprueba
todos los que se llamen igual.

No es una regresión del 445: antes la misma frase dejaba escribir `package.json` relativo, que aprobaba todos. Es el
mismo cruce que el 445 cerró por archivo, ahora por la vía del chat.

## Reproducción

Sidecar con `api` y `web` (`node <cauce>/engine/cli/ops.js init ops --mode sidecar --runner claude --no-install`), una
sesión con el mensaje «agregá package.json a .ops-approval», y un Write del agente a `ops/planning/.ops-approval` con
las dos rutas enteras, pasado por `workspace-boundary` como lo llama el runner:

```bash
printf '{"hook_event_name":"UserPromptSubmit","session_id":"s","prompt":"agregá package.json a .ops-approval"}' \
  | OPS_ROOT="$WS/ops" CLAUDE_PROJECT_DIR="$WS" node <cauce>/engine/hooks/run.js chat
# luego un Write con contenido "$WS/api/package.json\n$WS/web/package.json\n" y session_id "s"
```

## Síntoma

Medido el 2026-10-25 con el motor de la rama del 445 y el 446:

```
== las dos rutas enteras
  → exit 0
== una ruta que no se nombró ($WS/api/pnpm-lock.yaml)
BLOQUEADO: …/ops/planning/.ops-approval es …
  → exit 2
```

## Causa raíz

- `engine/hooks/self-approval.js:135` — las líneas que no son un push se preguntan con `CHAT.authorized` y el criterio
  por defecto, que es `mentions`.
- `engine/hooks/chat.js:124` — `mentions` compara el ítem entero **y su basename** contra el mensaje. Para una ruta
  absoluta, el basename es lo único que una persona escribe, así que cualquier ruta con ese nombre cuenta como pedida.

## Fix propuesto

Que una línea de ruta entera cuente como pedida sólo si el mensaje la distingue de las otras que el agente escribe:
si el basename nombrado coincide con más de una línea nueva de repositorios distintos, frenar y mostrarlas, para que
la persona confirme cuáles. Es la forma más angosta y no toca cómo `mentions` sirve a los otros guards.

Alternativa: que `self-approval` compare el sufijo más largo que el mensaje nombre (`api/package.json`) en vez del
basename. Cuesta tocar `mentions`, que usan todos los guards con chat.

## Tradeoffs

- Una persona que de verdad quiere aprobar el archivo en todos los repositorios tendría que confirmarlo una vez más.
- Tocar `mentions` cambia qué cuenta como pedido en todos los guards; por eso la propuesta lo deja quieto.

## Contexto de descubrimiento

La revisión de código de la rama del 445 y el 446, el 2026-10-25, lo señaló leyendo `self-approval.js`; se midió con
el script de arriba antes de escribirlo.

## Relacionados

- 445 — la misma pregunta por archivo: una aprobación nombra un archivo de un checkout.
- 446 — lo mismo para los comandos y para lo concedido en el chat.
- 202 — por qué la persona puede pedirle al agente que escriba una línea permanente.
