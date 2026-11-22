---
caso: 541
titulo: una escritura por MCP a un sistema ajeno no la frena ningún guard, y R12 la deja a una persona
estado: abierto
prioridad: media
version-detectada: 0.124.0
---

# 541 — una escritura por MCP a un sistema ajeno no la frena ningún guard, y R12 la deja a una persona

**🔴 abierto** · detectado en 0.124.0 · prioridad **media**: R12 dice que todo sistema externo es real y de producción,
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
y para lo que la persona pidió en el chat ni eso.

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
