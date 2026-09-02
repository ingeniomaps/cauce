# Workflows

## Build

`autobuild.js` implementa las fases de `planning/PROTOCOL.md`: checkpoint, recuperación desde WIP, Pick,
Ready, descomposición, Plan, Critique, Build, Review, Verify, QA, Commit, Done y cierre. Persiste WIP antes
de editar código y respeta el checkpoint entre hitos.

El workflow no contiene rutas, servicios ni proveedores de un producto. Lee `ops.config.json`, utiliza el
`service` declarado por cada tarea y limita el trabajo a `workspaceRoots`.

```text
ops.config.json + planning/PROTOCOL.md
                 ↓
automatization/workflows/autobuild.js   (fuente canónica)
                 ↓ automation install
.claude/workflows/autobuild.js          (adaptador ejecutable)
```

Sólo Claude ejecuta este formato. Los otros tres ofrecen los mismos cinco recorridos en el formato que
cada uno entiende —skills en Codex y Antigravity, comandos en Gemini—, con el mismo protocolo y los
mismos hooks, pero recorridos fase por fase en vez de ejecutados: no se anuncia un workflow nativo hasta
que exista una API equivalente.

El nombre del recorrido es el mismo en los cuatro; el prefijo lo pone cada runner —`/onboard` en Claude,
`$onboard` en Codex, `/cauce:onboard` en Gemini y Antigravity—. `automation install` lo imprime al
terminar, y `commands.invocation` de cada `manifest.json` es la fuente.

## Integración externa

`integrations/sync.js` ejecuta `integration check`, luego `integration sync`, valida el resultado y se detiene
para revisión humana. `integrations/promote.js` exige proveedor, clave y un draft `ready`. Ninguno escribe en
el sistema remoto; Jira es actualmente el primer adaptador del contrato general.

```text
integration-sync jira                 con el prefijo del runner
integration-promote jira KEY-123
```

## Aprendizaje de agentes

`agent-eval.js` mide un cargo contra sus controles y casos, `agent-propose.js` consolida una propuesta de
cambio y `agent-promote.js` la aplica una vez aprobada. Generan informes y propuestas; ninguno modifica
un `SKILL.md` por su cuenta. Toda actualización exige evaluación y aprobación humana.

Los tres se instalan sólo en Claude, que es el único con runtime para ejecutarlos, y no figuran entre los
cinco recorridos que todos los runners anuncian.

## Un workflow colgado no avisa

Un `agent()` que no vuelve deja la corrida quieta sin emitir nada: el árbol de progreso queda como estaba, no
hay evento y no hay error, así que silencio y avance se ven idénticos. Pasó el 2026-09-01 con un `agent-eval`
de `growth-marketer` —siete de ocho casos ya juzgados y el octavo trabado dos horas y media en un `WebFetch`
que nunca devolvió—, y lo descubrió quien preguntó, no el sistema.

El aviso no puede vivir acá adentro. Un script de workflow no tiene reloj —`Date.now()`, `new Date()` y
`Math.random()` lanzan a propósito, para no romper el resume— y `agent()` no acepta timeout: sus opciones son
`label`, `phase`, `schema`, `model`, `effort`, `isolation` y `agentType`. Devuelve `null` ante un error
terminal de API, y un cuelgue no lo es. Documentado en la referencia de autoría de workflows de Claude Code,
leída el 2026-09-01.

Así que lo vigila quien lo lanza: junto con la invocación, un monitor sobre la frescura del directorio de
transcript que avise si deja de escribir por más de unos minutos.

```bash
find <transcriptDir> -type f -printf '%T@\n' | sort -rn | head -1
```

Y si se colgó, cortar y reanudar no cuesta la corrida entera. Verificado el 2026-09-01 sobre un `agent-eval`
de ocho casos: el resume replayó desde caché los siete responders ya terminados —la etapa cara, la que
consulta fuentes y escribe en su banco— y volvió a correr los siete jueces más el responder que faltaba. La
cuenta de agentes nuevos no distingue esas dos etapas, y leerla como una corrida entera hace cortar un resume
que iba bien. Cuando lo que falta es un caso suelto sale más barato el filtro que `agent-eval.js` ya trae
—`{agent, cases}`—, componiendo el registro parcial con los veredictos que no se volvieron a medir.
