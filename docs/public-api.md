# API pública de Cauce

**Firmada por @ingeniomaps (Manuel Pinzon) el 2026-11-15**, al aprobar la review del PR que trae esta línea. Desde la
1.0.0, un cambio que rompe algo de lo que esta página nombra saca una
versión mayor; lo demás cambia en minor o patch, como hasta ahora. Lo que no está acá no es API, aunque se pueda usar.

## Lo que es API

### 1. Los comandos del CLI

Lo que imprime `node tools/ops.js --help` (desde la instancia) o `ops --help`: 54 comandos a la 0.122.0.

- **El nombre del comando y de cada subcomando**, sus argumentos posicionales y sus banderas.
- **Los códigos de salida**: `0` sí, `1` se llegó a la pregunta y la respuesta es que no, `2` no se llegó a la
  pregunta (comando inexistente, argumento faltante, raíz que no es lo que dice ser).
- **La forma de la salida `--json`**: los campos que trae y su tipo. Sumar campos no rompe; quitar o renombrar uno, o
  cambiar su tipo, sí.

No es API el texto de la salida para personas: los mensajes cambian en cualquier versión.

### 2. El esquema de `ops.config.json`

`engine/schemas/ops-config.schema.json`: 34 campos a la 0.122.0, con `project`, `mode`, `workspaceRoots` y `runner`
obligatorios. Lo mismo vale para `ops.config.local.json`.

- **Rompe**: quitar o renombrar un campo, volver obligatorio uno que no lo era, cambiar su tipo o los valores que acepta,
  o cambiar lo que significa un valor que ya se acepta.
- **No rompe**: un campo nuevo opcional, o un valor nuevo para uno que ya existe.

### 3. El formato de `planning/`

Los contratos de la sección «Contratos» de `planning/PROTOCOL.md`: épica, hito, tarea, `done/`, reclamos, WIP,
checkpoints y acciones humanas, con sus campos y su sintaxis.

- **La garantía**: un `planning/` que `ops check` da por válido en una 1.x sigue siendo válido en toda 1.y posterior.
  Un aviso nuevo (`⚠`) no rompe; un error nuevo (`✗`) sobre algo que antes pasaba, sí.
- Los archivos que el motor escribe solo —`.cauce/`, el WIP, los rastros locales— no son API: su forma la cuida el
  motor, y `upgrade` la migra.

### 4. El camino de `upgrade`

- **La garantía**: desde cualquier 1.x, instalar la versión nueva del paquete, correr `ops upgrade <ops-root>` y
  reinstalar el adaptador del runner (`ops automation install <ops-root> <runner>`) deja la instancia al día, sin tocar
  `planning/`, `organization/` ni lo propio (cargos y recorridos forkeados, reglas propias).
- Lo que el `upgrade` reemplaza entero —`system/`, el molde de `planning/rules/system/`— no es API: es lo que viaja
  con cada versión, y el CHANGELOG dice qué cambió.

### Lo que también es API, por cómo se usa

- **`require.resolve('@ingeniomaps/cauce/engine/cli/ops.js')`**: es como `tools/ops.js` de cada instancia encuentra el
  motor. Por eso `package.json` no tiene `exports`; agregarlo, o mover ese archivo, rompe toda instancia instalada.

## Lo que no es API

- **El texto de los cargos** (`agents/roles/**/SKILL.md`), sus casos y sus evaluaciones: el ciclo mensual los cambia.
- **El texto de los recorridos** (`flows/`) y de los workflows de cada runner (`automatization/workflows/`): sus
  prompts, fases y mensajes.
- **Lo que decide cada guard.** Un guard puede frenar algo que antes dejaba pasar, en cualquier versión: es para lo que
  existe. Lo que sí se mantiene es que todo freno tenga su salida —la confirmación de la persona o la línea en
  `.ops-approval`— y que el CHANGELOG lo diga.
- **Las reglas del sistema** (`planning/rules/system/`): cambian en minor, y por eso suben minor aunque no toquen código.
- **El wiring de cada runner** (`.claude/`, `.codex/`, `.gemini/`, `.agents/`): lo rehace `automation install`.
- **Lo interno del motor**: todo `engine/` salvo `engine/cli/ops.js`, y los archivos que el motor escribe solo.

## Qué tan estable ya es (medido el 2026-11-15)

Comparando la 0.100.0 (2026-10-02) con la 0.122.0, 37 versiones después:

| Superficie | Lo que cambió | Rompió algo |
|---|---|---|
| Comandos del CLI | 46 → 54 comandos: 8 nuevos, ninguno quitado | no se midieron banderas ni la forma de `--json` uno por uno |
| `ops.config.json` | 22 → 34 campos: 12 nuevos, ninguno quitado, ningún obligatorio nuevo, ningún tipo cambiado | no |
| `planning/` | un `planning/` escrito con la 0.100.0 (épica, hito, tarea en cola y una en `done/`) pasa `check` con el motor de hoy | no: dos avisos, que el `upgrade` resuelve |
| `upgrade` | de la 0.100.0 a la 0.122.0 publicada: `upgrade` actualizó 37 rutas, no tocó `planning/` ni `organization/`, `check` en verde, el adaptador reinstaló sin advertencias | no |

Cómo se midió: el listado de comandos del `--help` de la 0.100.0 contra el de hoy; el esquema de la 0.100.0 contra el
de hoy, campo por campo; y una instancia creada con `npx @ingeniomaps/cauce@0.100.0 init`, en un banco desechable,
pasada por `check` con el motor de hoy y después actualizada con la 0.122.0 publicada.

## Los cuatro criterios de la 1.0.0

Fijados al publicar la 0.100.0: se saca después del ensamblaje del 2026-11-01 si se cumplen los cuatro.

| Criterio | Estado | Por qué |
|---|---|---|
| 1. Un ciclo mensual completo sin intervención a mano | **no se cumple** | El ensamblaje del 2026-11-01 corrió solo y el caso 242 funcionó: 14 propuestas «sin cambio» se archivaron solas. Pero hubo que arreglar a mano el CI de #955 y #962, y declinar #943 y #971 cerrándolos no los archivó (se arregló en #987). El siguiente ciclo para medirlo es el del 2026-12-01. |
| 2. La versión usada en las instancias reales, sin regresiones | **a medias** | Se mide en las instancias que usan Cauce, fuera de este repositorio, por los casos que traen. Desde la 0.100.0 hay 271 casos, 91 salidos de una instancia; 11 se describen como regresión de un cambio de Cauce (por el texto, sin revisarlos uno por uno), todos cerrados. Falta que una versión reciente corra un tiempo en ellas sin casos de regresión nuevos. |
| 3. Una definición escrita de qué es API pública | **se cumple** | Esta página, firmada el 2026-11-15. |
| 4. Ningún caso abierto de prioridad alta | **se cumple** | No hay casos abiertos; el único reciente, el 517, quedó aplazado con prioridad baja. |

**Veredicto: todavía no.** El contrato ya se comporta como uno estable —en 37 versiones no se quitó ni un comando ni
un campo, y una instancia de la 0.100.0 se actualiza limpia—, y la definición está firmada. Falta lo que sólo da el
tiempo: que el ciclo del 2026-12-01 cierre sin arreglos a mano, y que las instancias trabajen con la versión nueva sin
regresiones.
