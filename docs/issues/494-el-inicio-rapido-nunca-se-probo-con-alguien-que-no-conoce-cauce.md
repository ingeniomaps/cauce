---
caso: 494
titulo: El inicio rápido nunca se recorrió a ciegas, con alguien que sólo tiene la documentación
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 494 — El inicio rápido nunca se recorrió a ciegas, con alguien que sólo tiene la documentación

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: medido el 2026-11-05, una corrida a ciegas no pudo usar `/autobuild` en su primera sesión, y el primer commit de la instancia pide aprobar 54 rutas sin que el README lo avise.

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

## Cierre

La medición se corrió una vez (2026-11-05) y se contrastó contra su `.jsonl` el 2026-11-13. De los 12 pasos del
informe, tres salieron como caso propio, uno de ellos juntando dos pasos. Los demás quedan anotados acá. Repetirla antes
de cada minor que toque `init`, `onboard` o el README quedó como regla de este repositorio en `AGENTS.md` («La corrida a
ciegas antes de una minor»), por decisión de quien firma (2026-11-13).

Contra la tabla, paso por paso:

- **6 → caso 502.** Confirmado en el `.jsonl`: `agent type 'cauce-clerk' not found` a las 20:08:27, con `init`
  instalado a las 20:05:44. **El informe se equivocaba en «más tarde aparecieron solos»:** aparecieron en la
  reanudación, que es un proceso nuevo. Una sonda en Claude Code 2.1.323 lo midió: en una sesión interactiva, el turno
  siguiente a crear el agente sigue diciendo `not found`; un proceso nuevo y `--resume` lo encuentran.
- **9 y 12 → caso 503.** Son el mismo defecto: el pedido anterior a `init` no queda registrado y los dos guards eximen
  sólo con `CHAT.said`. Reproducidos sobre una copia de la instancia: `plan-first` y la gobernanza dan `exit=2` sin
  mensaje registrado y `exit=0` con él. Las rutas a aprobar eran **53, no 54**.
- **11 → caso 504.** Reproducido: el aviso no nombra el commit, tampoco con `--json`. Al reproducirlo apareció algo que
  el informe no traía: la ventana compara por día, y el commit que contaba era `d05d25f chore: initial`, anterior a
  Cauce y del mismo día.
- **1, confirmado y anotado:** `init` avisa que falta ignorar `.claude/workflows/` sin dar la línea.
- **2, confirmado y anotado:** `/onboard` invocado como skill en una sesión abierta dio un error sin mensaje; como
  workflow anduvo. Comparte causa con el 502 (registro al abrir la sesión) y no se le abrió caso aparte.
- **4, confirmado y anotado:** `check` avisa sobre el `workspace.md` que `onboard` acaba de escribir (las «Excepciones
  de autonomía» con «Por definir»; se ve en la salida `--json` del 504).
- **8, confirmado y anotado:** `ops claim` pide «commiteá y empujá» sin remoto y con `allowPush: false`.
- **5 y 7, sólo narración:** el `.jsonl` no muestra un error ni un bloqueo, sólo la duda de la sesión. Se anotan y no
  sostienen un caso.
- **3 y 10, del diseño de la prueba:** las preguntas de `onboard` las contestó el agente porque el pedido era de punta
  a punta. Quien revisó en `lite` fue la misma sesión, porque `/autobuild` no corrió, y eso se resuelve con el 502.

Contra el resto del caso:

- **Fix 1, correr y abrir un caso por paso:** se hizo, y quien firma decidió el 2026-11-13 abrir sólo los de peso (6, 9,
  11, 12) y anotar los menores acá.
- **Fix 2, decidir si se repite:** se decidió que sí, antes de cada minor que toque `init`, `onboard` o el README.
- **Tradeoff, cuesta una corrida:** USD 3,03 la corrida y unos centavos las sondas de Haiku del 502.
- **Tradeoff, un modelo no es una persona:** sigue en pie. La regla nueva lo dice: el resultado es el `.jsonl`
  contrastado, no el informe.
- **«Lo que no prueba»:** sigue sin medirse un monorepo, otro runner, y `embedded` frente a `sidecar`. La corrida fue
  `sidecar` con `ops/` dentro del repo.

### Lista de cierre

1. hecho: la línea de base es la propia corrida a ciegas del 2026-11-05 y su informe, sin contrastar.
2. hecho: en la rama `fix/484-re-review-checks-what-it-asked`, la de la tanda, a pedido.
3. no aplica: no hay código ni prueba nueva. Los casos 502 a 504 traen la suya para cuando se construyan.
4. no aplica: no hay código que mutar.
5. no aplica: no se quita ni se reemplaza nada.
6. hecho: la corrida real con `claude -p` en un proyecto fuera del árbol; las reproducciones con los hooks reales
   sobre una copia de su instancia; la sonda de agentes en una sesión interactiva real.
7. hecho: lo que depende del runner (el registro de agentes) se midió en Claude Code 2.1.323, en interactivo, en `-p`
   y con `--resume`.
8. hecho: corrieron la corrida a ciegas (2026-11-05), el contraste del `.jsonl`, las reproducciones de 9, 11 y 12 con
   el motor 0.119.0 y el de esta rama, y la sonda. No corrió otro runner ni otro modo de instancia.
9. no aplica: no coordina nada.
10. hecho: lo que cambió es la regla en `AGENTS.md` y tres casos. Nadie depende de ellos; `issues.test.js` y
    `foreign-names.test.js` pasan con los casos nuevos.
11. no aplica: no hay código. Los tres casos nuevos pasan por la revisión de casos antes de construirse.
12. no aplica: no se agregan comentarios de código.
13. hecho: `npm run ci` con los archivos nuevos stageados.
14. hecho: recorrido arriba, paso por paso y contra Fix, Tradeoffs y «Lo que no prueba».
15. hecho: lo corrido y lo que devolvió está arriba y en los casos 502 a 504, con lo no previsto (la ventana por día,
    el «aparecieron solos» falso, 53 rutas).
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`. No lleva entrada en el CHANGELOG porque nada de
    esto viaja en el paquete: `docs/` y `AGENTS.md` no están en `files`.

**Sin probar:** la corrida en otro runner, en un monorepo y en una instancia `embedded`; y si una persona adivina
distinto que el modelo en los pasos 5 y 7.

## Corrida del 2026-11-15, antes de 0.121.0

Repetida por la regla de `AGENTS.md`, con el paquete de la rama `fix/e2e-120-findings` empaquetado con `npm pack`
—0.121.0 no estaba publicada— en `/var/tmp/ciego-121`, un proyecto Node de dos archivos con git. La consulta de control
con `--setting-sources project,local` contestó que no conocía Cauce. USD 2,20, 79 turnos, unos 6 minutos. Instaló en
`ops/` (sidecar dentro del repositorio) y llevó «filtrar notas por texto» de punta a punta, con la prueba vista en rojo,
evidencia en DONE y commit en rama. El informe quedó en `ops/planning/reports/2026-11-15-informe-ciego.md` del banco.

Contrastado contra su `.jsonl` y contra el README del paquete:
- **Lo nuevo anduvo:** `automation install` dejó `.claude/workflows/` en el bloque de Cauce del `.gitignore` (caso 513) y
  `check` no avisó; `install` le dijo que abriera una sesión nueva y repitiera el pedido (502 y 503).
- **Bloqueos del diseño de la prueba:** el commit de la instancia lo frenó la gobernanza y el informe en la raíz,
  `plan-first`, porque siguió en la sesión en que instaló; con `-p` no puede abrir otra. El `.jsonl` muestra el aviso de
  `install`. Su paso 4 lee mal el README: dice que prometía una sesión sin guards, y el README (línea 150 del paquete)
  dice que le faltan los subagentes y lo pedido antes.
- **Instalar desde un tarball:** artefacto de la prueba, por no estar publicado.
- **Repetidos de la corrida anterior, y arreglados en esta misma rama:** el nombre del archivo del WIP, que tuvo que
  sacar leyendo el motor, y `ops claim` pidiendo «commiteá y empujá» sin remoto y con `allowPush` apagado. `claim` ahora
  imprime la ruta del plan y dice quién empuja.
- **Repetido, y arreglado después en la misma rama:** el aviso OPS-001 contaba el commit inicial, anterior a Cauce y del
  mismo día. Ahora cuenta desde que existe la instancia; sobre este banco, `check` ya no lo da, y en un clon con un
  commit nuevo sin registrar lo sigue dando.
- **No volvieron a aparecer:** `/onboard` como skill (no la usó) y el `.gitignore` sin la línea.


## Corrida del 2026-11-24, antes de 0.124.0

Repetida por la regla de `AGENTS.md`, con el paquete de la rama `fix/cases-from-an-instance-audit` empaquetado con
`npm pack` —0.124.0 no estaba publicada y `package.json` todavía decía 0.123.1, así que el tarball se llamó así— en
`/var/tmp/ciego-124`, un proyecto Node de dos archivos con git. La consulta de control con `--setting-sources
project,local --strict-mcp-config` contestó que no conocía Cauce. Claude Code 2.1.331, USD 1,85, 67 turnos, 4,2 minutos.
Instaló en `ops/` (sidecar dentro del repositorio) y llevó «fijar con pruebas el contrato de `notas.js`» de punta a
punta: épica, promoción, reclamo, WIP, prueba con dos mutaciones vistas en rojo, commit en rama, `ops done` y `check` en
verde. El informe quedó en `/tmp/INFORME-CIEGO.md` del banco, con 10 puntos.

Contrastado contra su `.jsonl` y contra el README del paquete:
- **Lo nuevo anduvo:** `ops done` cerró la tarea en una llamada —DONE, backlog, épica cerrada, WIP en IDLE y reclamo
  soltado (casos 537 y 538)—, y `evidence` encontró cada criterio en la prueba.
- **Confirmado, menor:** una épica escrita con `status: active` y sin ninguna tarea en el backlog pasa `check` en verde y
  recién `promote` la rechaza («sólo se promueve una épica open»). Reproducido con el motor de la rama sobre la épica que
  escribió la sesión: `✓ planning válido: 1 épica(s), 0 tarea(s) en cola`, exit 0. El molde trae `status: template` y
  `roadmap/README.md` sí enumera los estados; la sesión no lo leyó antes de adivinar. Costó un reintento, y el mensaje
  de `promote` dice la salida. Sale como caso propio sólo si vuelve a aparecer o si un `active` huérfano aparece por otro
  camino.
- **Sin documentar en el README, y menor:** tres guards que la sesión encontró al commitear —la firma de IA (R8), que
  Claude Code agrega por defecto; `git add` y `git commit` en un mismo comando; y el archivo de `ops done --fields` fuera
  de las raíces—. Los tres frenaron con un mensaje que decía la salida, y la sesión la tomó a la primera.
- **Bloqueos del diseño de la prueba, repetidos:** el commit de la instalación lo frenó la gobernanza (unas 60 rutas) y
  el informe en la raíz, `plan-first`, porque siguió en la sesión en que instaló. El README (línea 152 del paquete) dice
  que lo pedido antes de instalar no cuenta y que hay que abrir una sesión nueva; con `-p` no puede. Igual que en las
  dos corridas anteriores.
- **Artefactos de la prueba:** instalar desde un tarball (el README sólo documenta el registro), el `file:` que quedó en
  `ops/package.json`, y que `npm view` mostrara 0.123.1 publicada, que es el nombre que le dio `npm pack`.
- **No es defecto:** `--runner claude` sin `--install` no dejó el wiring puesto, y la salida lo dijo
  (`siguiente: node tools/ops.js automation install . claude`), que es lo que el README promete en la línea 104.
