---
caso: 541
titulo: una escritura por MCP a un sistema ajeno no la frena ningún guard, y R12 la deja a una persona
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 541 — una escritura por MCP a un sistema ajeno no la frena ningún guard, y R12 la deja a una persona

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**: R12 dice que todo sistema externo es real y de producción,
y que sin aprobación no se publica, no se mandan mensajes ni se escribe ahí. Por shell el motor frena parte de eso. Por
MCP, que es como un agente escribe hoy en Jira, Confluence, Slack o GitHub, no frena nada salvo un caso. Una instancia
real construyó seis guards propios sobre sus servidores de Jira.

## Resumen

El único guard sobre MCP es `jira-adf` (caso 229): frena editar en markdown la descripción de una tarjeta. Es una
protección de formato, no de permiso. El grupo `pre-mcp` lo trae a él solo (`engine/hooks/run.js:110`), y el runner de
Claude lo registra con el matcher `mcp__.*__editJiraIssue` (`automatization/runners/claude/settings.json:23`). Cualquier
otra herramienta MCP ni siquiera llega al motor.

Las consecuencias:
- crear una tarjeta, comentarla, moverla de estado, publicar una página o mandar un mensaje pasa sin freno;
- un servidor MCP de GitHub que mergea un PR saltea `delivery` entero (casos 225 y 539).

## Reproducción

Sin modelo, con el arnés de guards: `executeAll(hookGroups['pre-mcp'], { tool_name, tool_input })`, que es lo más que
llega hoy. En la sesión real ni eso, porque el matcher no deja pasar estas herramientas al hook.

```
FRENA mcp__atlassian__editJiraIssue          (descripción en markdown: el caso 229)
PASA  mcp__atlassian__createJiraIssue
PASA  mcp__atlassian__addCommentToJiraIssue
PASA  mcp__atlassian__transitionJiraIssue
PASA  mcp__atlassian__createConfluencePage
PASA  mcp__slack__slack_send_message
PASA  mcp__github__merge_pull_request
PASA  mcp__atlassian__getJiraIssue           (lectura: tiene que seguir pasando)
```

Los nombres de herramienta son los que expone cada servidor. Los de Atlassian están en la lista de herramientas de
esta misma sesión, con otro nombre de servidor; los de Slack y GitHub son de ejemplo y el guard no depende de ellos.

## Síntoma

El agente escribe en un sistema de otro equipo sin que nadie lo apruebe, y lo que queda no se revierte: el comentario
notifica, la tarjeta creada existe, el mensaje llegó. Es la misma clase que el PR mal apuntado de R10, por otro canal.

La instancia lo cubrió con guards propios sobre su servidor de Jira:
- uno que frena toda escritura salvo orden del turno: lo que no reconoce como lectura es escritura, así que una
  herramienta nueva del servidor nace frenada;
- cinco sobre cómo crea y edita tarjetas en cada uno de sus sitios, que son reglas de su Jira.

Lo general es el primero, y sin su forma de destrabar: lee la orden del turno con una lista de verbos de escritura,
que es lo que AGENTS.md dice que un guard de Cauce no hace. Los otros cinco se quedan allá.

## Causa raíz

El 229 abrió `pre-mcp` para un problema de formato, y nadie lo pensó como la puerta de R12. R12 se escribió como
regla de conducta, sin mecanismo, y el 225 sólo llevó a guard lo que R10 nombra por shell.

## Fix propuesto

Un guard `mcp-writes` en `pre-mcp`, y el matcher del runner de Claude ampliado a `mcp__.*`:

- **Qué es una lectura:** una herramienta cuyo nombre, sin el prefijo `mcp__<servidor>__`, empieza con un verbo de
  lectura (`get`, `list`, `search`, `lookup`, `fetch`, `read`, `query`). Todo lo demás es escritura y frena. Una
  herramienta que el servidor agrega mañana nace frenada (R27).
- **El ítem:** `mcp <servidor> <herramienta>`. Se aprueba como el resto: por el diálogo, por el chat (lo que la persona
  pidió directo no se reconfirma) o con la línea en `.ops-approval`.
- **Lo declarable**, en `ops.config.json`:
  - los servidores que son un sandbox y no se frenan, que es la excepción por nombre que R12 ya prevé;
  - las herramientas de lectura que el prefijo no reconoce.
- **`jira-adf` sigue** como está, y corre antes: su mensaje dice cómo escribir sin aplanar, que es más útil que «pedí
  permiso».

## Decisión

**Por defecto, ¿se frenan todos los servidores o sólo los declarados?**

1. **Todos, con los sandbox declarados como excepción.** Es lo que R12 dice («todo sistema externo se considera real
   … mientras no se lo nombre explícitamente como sandbox») y lo que R27 pide. Cambia lo que vive cada instancia con
   MCP: la primera escritura de cada herramienta frena hasta que alguien la apruebe.
2. **Sólo los servidores que la instancia declara.** No cambia nada para quien no lo configure, pero deja abierto todo
   servidor nuevo, que es la lista que R27 dice que no se escriba.

**Decidido: la 1** (Manuel, 2026-11-22, sobre esta recomendación). R12 ya prometió eso, y hoy es prosa sin mecanismo. El costo es una aprobación la primera vez,
y lo que la persona pidió en el chat se confirma con un «sí» (ver el cierre).

## Tradeoffs

- **El prefijo de lectura es una lista**, y AGENTS.md prohíbe que un guard decida con una lista de palabras permitidas.
  Esa regla es sobre leer la intención de la persona. Ésta clasifica el nombre de una herramienta, que se comprueba
  sin interpretar, y el error va hacia el lado seguro: una lectura que no reconoce frena de más, no deja pasar nada.
  Igual se dice en el encabezado del guard, para que nadie la amplíe como salida a un freno.
- **Las anotaciones de MCP** (`readOnlyHint`) dirían si una herramienta escribe sin adivinar por el nombre. Que el
  payload del hook de Claude Code las traiga es **hipótesis**: se comprueba en la documentación de hooks antes de
  construir, y si llegan se usan.
- **Costo por llamada:** con `mcp__.*` cada llamada MCP lanza un proceso de node para el grupo. Se mide en el banco
  cuánto agrega por llamada.
- **Otros runners:** los `hooks.json` de Codex y de agy no registran nada para MCP (`automatization/runners/codex/hooks.json`
  y `…/antigravity/hooks.json` sólo nombran shell y archivos). Que sus hooks puedan ver una llamada MCP no está
  comprobado. La instancia dice que en agy no corre ningún hook sobre MCP, y eso es lo que ella reporta, no algo medido
  acá. Se comprueba en la documentación de cada runner; lo que no tenga cómo, se dice en el README del runner.
- **Es un freno nuevo para todas las instancias** con la opción 1. La aserción es que las lecturas sigan pasando y que
  `jira-adf` siga diciendo su mensaje.
- **Prueba real:** una sesión de `claude -p` en un banco con un servidor MCP de prueba (uno local que exponga una
  lectura y una escritura, sin sistema ajeno detrás). Mide que la escritura frena, que la lectura pasa y que una orden
  en el chat la destraba. Menos de USD 1, y se pregunta antes.

## Contexto de descubrimiento

Paso 3 de la auditoría de una instancia (2026-11-21), ítem 10 del nivel 2: «escrituras MCP a sistemas ajenos (llave de
patrones en `pre-mcp`; hoy sólo `jira-adf`)».

## Relacionados

- 229: `jira-adf` y el grupo `pre-mcp`; su cierre comprobó en la documentación que el matcher es una expresión regular
  sin anclar.
- 225 y 539: `delivery`, que un merge por un servidor MCP de GitHub saltea.
- 221: la confirmación por chat que destraba un freno.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto: un guard `mcp-writes` en `pre-mcp` y el matcher ampliado a `mcp__.*`** — se hizo, en
  `engine/hooks/mcp-writes.js`, tras `jira-adf` en el grupo. El runner de Claude registra `mcp__.*` →
  `guard-mcp.sh`. Cada viñeta:
  - qué es una lectura: hecho. Es la primera palabra del nombre (partido en `_`, `-`, `.` o mayúscula), salvo que repita
    el nombre del servidor (`slack_get_…`, `notion-search`). Se hizo distinto en la lista de verbos: `get`, `list`,
    `search`, `lookup`, `fetch`, `read`, `query`, `find`, `describe`, `view`, `show`, `diff` y `download`. `log` y
    `status` entraron y salieron, porque también nombran escrituras (`log_work`, `status_update`). Todo lo demás frena,
    también una herramienta que no existía ayer.
  - el ítem `mcp <servidor> <herramienta>`: hecho, y se aprueba por el diálogo, por el chat o con la línea en
    `.ops-approval`.
  - lo declarable: hecho, `mcpSandbox` y `mcpReads` en `ops.config.json`, con validación, schema y su regla en
    `config-keys.js`. Que un agente se los escriba solo frena, como el resto de lo que afloja un guard (caso 498).
  - `jira-adf` sigue y corre antes: hecho; su mensaje sale primero.
- **Decisión: todos los servidores, salvo los sandbox** — decidido por Manuel el 2026-11-22.
- **Decisión que llegó construyendo: cuánto vale una aprobación** — decidida por Manuel el 2026-11-22: por sesión. Con
  el diálogo, cada llamada al navegador pedía su clic, y una tarea de QA eran decenas de diálogos. Aprobada una vez, la
  herramienta vale el resto de la sesión en la conversación principal, y un «pará» la revoca. El diálogo no le avisa
  nada al guard, así que se agregó `mcp-granted` en un grupo nuevo, `post-mcp`. Corre en `PostToolUse` y deja concedida
  la herramienta que el guard frena y que igual corrió. Un subagente la vuelve a pedir, porque no hereda lo concedido.
- **Tradeoffs: el prefijo de lectura es una lista** — se mantuvo, y el encabezado del guard lo dice: clasifica un nombre,
  frena de más y no se amplía para callar un freno, que para eso está `mcpReads`.
- **Tradeoffs: las anotaciones de MCP** — se comprobó y no llegan. En la sesión real, el servidor de prueba declaraba
  `readOnlyHint`, y el payload de `PreToolUse` trajo `session_id`, `transcript_path`, `cwd`, `prompt_id`,
  `permission_mode`, `effort`, `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id` y `mcp_server` (`name`,
  `source`), sin las anotaciones. Por eso se clasifica por el nombre.
- **Tradeoffs: costo por llamada** — no se midió por separado. Cada llamada MCP lanza ahora dos procesos de node: el
  grupo antes de la herramienta y `post-mcp` después. En las sesiones reales no se notó; medirlo en milisegundos queda
  en «Sin probar».
- **Tradeoffs: otros runners** — comprobado en el fuente: los `hooks.json` de Codex y de Antigravity y el
  `settings.json` de Gemini no registran nada para MCP. El README de hooks y R12 lo dicen.
- **Tradeoffs: un freno nuevo para todas las instancias** — hecho, con sus aserciones: las lecturas pasan y `jira-adf`
  dice su mensaje. Una instancia instalada recibe el hook nuevo al reinstalar el runner. `automation install` reemplaza
  `guard-jira-adf.sh` por `guard-mcp.sh` y suma `guard-mcp-granted.sh`: lo comprobó la revisión con las funciones del
  motor, no con un `upgrade` real. El CHANGELOG dice qué hacer.
- **Tradeoffs: prueba real** — hecho, abajo.
- **Lo que el enunciado no preveía:**
  - El caso decía que lo pedido en el chat no se reconfirmaba («ni eso»), y no es así. El guard no lee intención: «creá
    la tarjeta» frena, y pasa con el diálogo, un «sí» o la línea en `.ops-approval`.
  - Las lecturas de Notion, de un servidor de git y de descargas frenaban hasta que el verbo se leyó por palabra.
  - Las sesiones de `claude -p` del banco cargan los servidores MCP globales de la máquina, incluido uno de Atlassian
    real. La prueba corrió con `--strict-mcp-config` para que sólo existiera el servidor de prueba.

Lo que se corrió:

- Línea de base, en «Reproducción»: seis escrituras pasaban y `editJiraIssue` en markdown frenaba.
- `test/hooks/mcp-writes.test.js`, 6 pruebas, en rojo sin el guard y en verde después. Ajustadas por el matcher, el
  grupo y las llaves: `jira-adf.test.js`, `project-guards.test.js` y `ops-config-keys.test.js`.
- 26 mutaciones en una copia, las 26 rojas y la copia sin mutar verde: el grupo, el orden con `jira-adf`, la lectura por
  palabra, los verbos, `mcpSandbox` y `mcpReads`, la concesión por sesión, `grantRan`, la validación, las llaves y los
  dos registros del runner. Las que sobrevivieron en el camino sumaron su caso.
- Banco sin modelo con el runner instalado, repetido sobre la versión final: por `guard-mcp.sh`, tres escrituras dieron exit 2, `editJiraIssue` en
  markdown dio el mensaje de `jira-adf`, y dos lecturas dieron exit 0.
- Sesión real de `claude -p` 2.1.330 en `dontAsk` (sesión `bc368df5`, USD 0,21, y dos reanudaciones), con un servidor MCP
  local de prueba y nada más. El servidor anota cada llamada que recibe.
  - `get_note` llegó al servidor; `post_note` lo frenó `guard-mcp.sh` y no llegó. La sesión explicó el freno y ofreció
    las dos salidas.
  - En la reanudación, con «Sí, publicala.», la nota llegó al servidor, y el rastro dice `"via":"dale"`.
  - En la siguiente, «Publicá otra nota…», sin aprobar nada, la segunda llegó: la aprobación de `post_note` seguía
    vigente en la sesión.
- `npm run ci` con los archivos nuevos stageados: 1883 de 1883, exit 0.

**Sin probar:** cuatro cosas.
- La concesión por el diálogo en una sesión interactiva, con `mcp-granted` en `PostToolUse` anotándola. Lo cubren las
  pruebas con el arnés, y en `-p` lo concedido llegó por el chat.
- Cuánto agrega por llamada lanzar los dos procesos.
- `automation install` real sobre una instancia con el hook viejo.
- Un `query` de SQL que escriba (`mcp__postgres__query`) pasa como lectura, y `atlassianUserInfo` frena de más: los dos
  se declaran.

### Lista de cierre

1. hecho: la reproducción de «Reproducción», con la lectura como control.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas en rojo sin el guard y en verde después.
4. hecho: 26 mutaciones en una copia, las 26 rojas; las que sobrevivieron en el camino sumaron su caso.
5. hecho: cambia el matcher que registraba sólo `editJiraIssue`; la prueba del runner afirma el nuevo y se vio en rojo devolviendo el viejo, y `jira-adf` sigue frenando lo mismo.
6. hecho: banco sin modelo por el hook instalado y una sesión real sin dobles en el motor; se midió que la escritura ya no llega al servidor y que la lectura sí.
7. hecho: sesión real de `claude -p` 2.1.330 con un servidor MCP local, en tres turnos: frena la escritura, la destraba un «sí», y la segunda pasa por la aprobación de la sesión.
8. hecho: «Lo que se corrió» enumera los caminos; las mutaciones, la sesión real y el banco sin modelo, repetido al cerrar, corrieron sobre la versión final.
9. hecho: dos servidores en las pruebas (y dos nombres de un mismo servidor), dos herramientas en la concesión por sesión (la aprobada pasa, la otra frena) y dos turnos en la sesión real.
10. hecho: dependían el matcher (`jira-adf.test.js`), los eventos de los guards del proyecto (`project-guards.test.js`), las llaves (`ops-config-keys.test.js`), el README de hooks y el comentario de `jira.js`; todos se corrigieron, y R12 dice dónde se comprueba.
11. hecho: tres pasadas de revisión independiente sobre este caso, junto con el 539 y el 540. Halló lecturas reales que frenaban, `log` y `status` que dejaban pasar escrituras, el costo de un diálogo por llamada (de ahí la decisión) y el texto del CHANGELOG sobre `upgrade`. Todo se arregló. La última no halló nada que impida entregar.
12. hecho: pasada de comentarios; se reescribió el comentario del shim, que la puerta marcó por repetir el de los otros grupos, y se quitaron dos citas entre comillas invertidas que no resolvían.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1883 de 1883, exit 0.
14. hecho: este cierre recorre el Fix propuesto, la Decisión, la que llegó construyendo, los Tradeoffs y lo que el enunciado no preveía.
15. hecho: nombra lo corrido con su salida y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0 («Agregado»).
