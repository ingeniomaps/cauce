---
caso: 494
titulo: El inicio rápido nunca se recorrió a ciegas, con alguien que sólo tiene la documentación
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 494 — El inicio rápido nunca se recorrió a ciegas, con alguien que sólo tiene la documentación

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: medido el 2026-11-05, una corrida a ciegas no pudo usar `/autobuild` en su primera sesión, y el primer commit de la instancia pide aprobar 54 rutas sin que el README lo avise.

## Resumen

El README tiene un «Inicio rápido» (`README.md:22`) y un «Primer ciclo» (`:132`). Los recorren quienes ya conocen Cauce, que saben lo que el texto no dice. Nadie los recorrió sólo con la documentación anotando cada paso donde tuvo que adivinar. Los evals de cargos se responden «a ciegas», pero miden conducta de un cargo, no si la documentación alcanza.

## Reproducción

No es un defecto reproducido: es una medición que falta. Se buscó «a ciegas», «blind» y «nunca vio el repo» en el repositorio; sólo aparecen el eval de cargos (`automatization/workflows/agent-eval.js:12`) y comentarios del motor.

La medición propuesta, en un banco fuera del árbol:

1. Una sesión nueva de `claude -p` con sólo el README publicado en npm y un repositorio de ejemplo vacío.
2. El pedido: «instalá Cauce en este proyecto y llevá una tarea de punta a punta».
3. La sesión anota cada paso donde tuvo que adivinar o salir de la documentación.
4. Se lee el `.jsonl` y no sólo el resumen.

## Medición del 2026-11-05

Corrida una vez, en `/var/tmp/ciego-494`, un proyecto Node de dos archivos con git y fuera de cualquier ruta que nombre Cauce. Comando: `claude -p "<pedido>" --setting-sources project,local --permission-mode acceptEdits --allowedTools … --max-budget-usd 8`. Con `--setting-sources project,local` no se cargan las instrucciones globales del usuario, que mencionan Cauce; se comprobó antes con una consulta de control (sin la bandera: «SI»; con ella, sólo aparecía la ruta del scratchpad, y por eso el banco se movió a `/var/tmp`). Claude Code 2.1.318, Cauce 0.119.0 de npm.

**Resultado:** USD 3,03 en total (2,42 la corrida y 0,61 retomarla para el informe), 37 turnos y 3,5 minutos. Instaló con `npx @ingeniomaps/cauce@latest init --runner claude --install`, corrió `onboard`, promovió y cerró la tarea, con la prueba vista en rojo y la mutación. **No pudo usar `/autobuild`.** El informe (`INFORME-CIEGO.md` en el banco) trae 12 pasos donde la documentación no alcanzó:

| # | Paso | Peso |
|---|---|---|
| 6 | `/autobuild` muere en la sesión donde se corrió `init`: «agent type `cauce-clerk` not found». Los subagentes que instala `init` no aparecen en una sesión abierta antes, y el README no dice que haya que abrir una nueva. Más tarde aparecieron solos. | **alto**: deja el camino principal sin usar en la primera sesión |
| 9 | El primer commit de la instancia (`ops/`, `.claude/`, `CLAUDE.md`) lo frena el guard de gobernanza, con 54 rutas para aprobar, y el README no lo avisa. El mensaje menciona un diálogo de confirmación que en `-p` no aparece. | **alto** |
| 12 | Lo pedido en el chat **antes** de `init` no cuenta para `plan-first`; la documentación no lo dice. | medio |
| 5 | El paso entre la épica que deja `onboard` y la cola: quién escribe la aceptación y el carril. | medio |
| 11 | El aviso OPS-001 («1 commit que ninguna entrada de DONE nombra») no dice cuál, ni con `--json`. Era el commit anterior a Cauce. | medio |
| 1 | `init` avisa que falta ignorar `.claude/workflows/` y no da la línea; la de `ops/.gitignore` no vale en la raíz. | bajo |
| 2 | Cómo invoca un agente `/onboard` en una sesión ya abierta: como skill dio un error sin mensaje; como workflow anduvo. | bajo |
| 4 | `check` avisa sobre `workspace.md` recién escrito por `onboard`. | bajo |
| 7 | Cómo se aplana el id del runner para el nombre del WIP, y `ops` no acepta `--runner`. Que no pudiera exportar `CAUCE_RUNNER` fue por los permisos de esta corrida, no por Cauce. | bajo |
| 8 | `ops claim` pide «commiteá y empujá» sin remoto y con `allowPush: false`. | bajo |
| 10 | Quién revisa en `lite` cuando `/autobuild` no puede correr: la sesión se revisó a sí misma y lo dejó dicho. | sale del 6 |
| 3 | Las preguntas de `onboard` las contestó el agente, porque el pedido era de punta a punta. | del diseño de la prueba |

**Sin contrastar todavía:** la tabla es lo que la sesión escribió. El paso 4, leer su `.jsonl` para confirmar cada punto (el error de `cauce-clerk`, las 54 rutas, el bloqueo de `plan-first`), no se hizo, y cada punto se contrasta antes de abrirle un caso.

**Lo que no prueba:** una sola corrida, de un modelo y un runner; un modelo adivina distinto que una persona. Tampoco dice nada de un monorepo ni de una instancia `sidecar`.

## Causa raíz

No hay una práctica para esto.

## Fix propuesto

1. Correr la medición una vez y abrir un caso por cada paso donde hubo que adivinar.
2. Si rinde, decidir si se repite antes de cada minor que toque `init`, `onboard` o el README. Es una decisión de proceso de este repositorio y no baja a las instancias.

## Tradeoffs

- **Cuesta una corrida real.** Por la referencia de `/autobuild`, del orden de USD 3 a 7. Se pregunta antes de correrla.
- **Un modelo no es una persona nueva:** adivina distinto. Sirve para encontrar huecos, no para afirmar que no los hay.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. En su repositorio de arquitectura, dos tandas de documentación y scripts se corrigieron después de que alguien que nunca había visto el repo siguiera sólo los docs y anotara dónde tuvo que adivinar.

## Relacionados

- Memoria del proyecto «Camino a la 1.0.0».
