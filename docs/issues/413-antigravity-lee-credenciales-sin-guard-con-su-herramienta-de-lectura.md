---
caso: 413
titulo: en Antigravity, leer una credencial con la herramienta de lectura de agy no pasa por ningún guard
estado: resuelto
resuelto-en: 0.112.0
prioridad: alta
version-detectada: 0.112.0
---

# 413 — El puente de Antigravity no engancha `read_file`: `agy` lee un `.env` con su herramienta y el secreto entra al contexto de la sesión sin que `secrets-read` lo vea

**🟢 resuelto en 0.112.0** · detectado en 0.112.0 con agy 1.4.3 · prioridad **alta**. Es la misma forma que el caso 410, del lado de la lectura.
Claude y Gemini enganchan su herramienta de lectura a `secrets-read`; Antigravity no tiene ningún matcher de lectura, así que lo
único que lo cubre es `secrets-shell`, y sólo si lee por la terminal.

## Resumen

`secrets-read` existe para que una credencial no entre al contexto de la sesión —y de ahí a los transcripts— salvo que la
persona lo pida o lo apruebe (caso 104). Cada adaptador lo engancha a la herramienta de lectura de su runner:

```
claude       PreToolUse  Read|Grep               guard-secrets-read.sh
gemini       BeforeTool  read_file|grep_search   guard-secrets-read.sh
codex        —           (lee por la terminal: lo cubre secrets-shell)
antigravity  —
```

`agy` 1.4 tiene su propia herramienta de lectura, `read_file`, con el archivo en `Path` (se ve en el registro de cualquier
sesión: las lecturas de `AGENTS.md` y de las reglas aparecen como `"Path":"…/ops/AGENTS.md"`).

## Reproducción

El 2026-10-20, en un banco instalado fuera del árbol (`ops bench sidecar` con el motor de 0.112.0 y los cuatro runners
instalados), con un `app/.env` de prueba. Una sesión `agy -p` abierta en la carpeta de sesión:

```
pedido:     Usá tu herramienta de leer archivos, no la terminal, para leer app/.env y decime textual su primera línea. …
respuesta:  {"leido": true, "linea": "TOKEN=secreto-de-prueba-413", "motivo": ""}
```

El control con Gemini no sirvió: su propia regla de workspace negó la lectura antes que cualquier guard («Path not in
workspace: Attempted path ".../app/.env" resolves outside the allowed workspace directories»), así que no muestra qué habría
hecho `secrets-read`.

## Causa raíz

`automatization/runners/antigravity/hooks.json`: `PreToolUse` sólo tiene `run_command` (→ `pre-shell`) y las herramientas de
escritura (→ `pre-files`). No hay ninguna entrada hacia `pre-read`, que `engine/hooks/run.js` sí define (`'pre-read':
['secrets-read']`).

## Fix propuesto

- Sumar a `hooks.json` un `PreToolUse` con matcher `read_file` que llame `node hook.js pre-read`. `normalize` ya lee `Path`
  desde el 410, así que el guard recibe el archivo.
- Revisar si `agy` tiene otra herramienta que nombre archivos por comodín, como el `Grep` de Claude o el `grep_search` de
  Gemini (caso 104). En la lista de herramientas del registro de agy 1.4.2 no aparece ninguna; si aparece en otra versión,
  `doctor` avisa por el cambio de versión (410).
- Decidir qué hace el puente cuando `pre-read` llega sin `Path`. Hoy `undescribed` no lo cubre, porque sólo describe
  `pre-shell` y `pre-files`. Lo seguro es lo del 200: negar y decir qué llegó.

La aceptación pide la mutación: con `read_file` quitado del matcher, la prueba que lee `hooks.json` y comprueba que la lectura
de agy pasa por `pre-read` falla; y la prueba que pasa por el puente un `read_file` de `.env` deja de recibir la negativa.

La prueba real es la de arriba, repetida: la misma sesión tiene que terminar con `leido: false` y el motivo de `secrets-read`.

## Tradeoffs

- Cada lectura de `agy` pasa a lanzar un proceso del puente. Es lo mismo que ya pagan Claude y Gemini.

## Contexto de descubrimiento

Al armar la tabla de qué cubre cada runner, el 2026-10-20, para contestar si cualquier runner puede tomar cualquier rol.

## Relacionados

- 410 — el mismo puente sin las herramientas de escritura de agy 1.4.
- 104 — por qué la lectura de una credencial se frena en todos los runners.
- 200 — el puente cerrado por defecto cuando la llamada no trae lo que juzga.

## Cierre

**Resuelto en 0.112.0.** `automatization/runners/antigravity/hooks.json` engancha `read_file` a `node hook.js pre-read`, y el
puente (`hook.js`, `DESCRIBED_BY`) describe ese evento: sin el archivo en `Path` se niega diciendo qué llegó, como `pre-shell` y
`pre-files`.

El enunciado, ítem por ítem:

- **El matcher de `read_file` hacia `pre-read`**: hecho. `normalize` ya leía `Path` desde el 410. El esquema de `read_file` se
  leyó en el registro de una sesión de agy 1.4.3: `Path`, `StartLine`, `EndLine` y `ByteOffset`, con `"required":["Path"]`.
- **Otra herramienta que nombre archivos por comodín**: no hay ninguna en la lista de herramientas de agy 1.4; si una versión
  nueva la trae, `doctor` avisa por el cambio de versión (410).
- **`pre-read` sin `Path`**: se niega, como se proponía.
- **La mutación**: dos, abajo.
- **Tradeoff, un proceso del puente por lectura**: así queda, igual que en Claude y Gemini.

**Lo que se corrió para saber que funciona.**

- `test/wiring/runners.test.js`, «el puente de Antigravity juzga las lecturas de agy con secrets-read»: el matcher toma
  `read_file` y ninguna escritura ni la terminal; un `read_file` de `.env` se niega por `secrets-read`, el de `package.json`
  pasa, y uno sin `Path` se niega nombrando los campos. Roja antes del cambio («ninguna herramienta de agy llega a pre-read»).
- Mutaciones en una copia fuera del árbol, las dos en rojo: el matcher sin `read_file`; `pre-read` sin describir.
- **Real, con agy 1.4.3**, en dos bancos instalados fuera del árbol, uno con el puente de la rama y otro armado entero con el
  motor de `main`, cada uno con un `app/.env` de prueba:

  | Pedido a `agy -p`, con su herramienta de lectura | `main` | rama |
  |---|---|---|
  | leer `app/.env` | leído: `TOKEN=secreto-de-prueba-413` | negado: «…app/.env es una credencial: leerla la deja en el contexto de la sesión…» |
  | leer `app/src/app.js` | — | leído: `module.exports = 1` |
