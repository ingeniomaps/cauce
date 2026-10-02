---
caso: 226
titulo: Jira no se puede leer por un agente, sin token en disco
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 226 — La integración de Jira sólo lee por REST con un token, y acme mantiene un puente propio para no dejar el token en disco

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: acme-ops mantiene unas 1.475 líneas que duplican el motor de Cauce (su ADR-003) sólo para leer por MCP.

## Resumen

La integración exige `auth.tokenEnv` siempre y lee con `fetch`. acme decidió no dejar un token de Jira de larga vida en disco y lee por el servidor MCP de Atlassian desde un workflow: el agente consulta, arma un payload y lo entrega a un script que lo aplica sólo si trae `complete: true`. Eso duplica `state.js`, el `sync` de `registry.js`, `writeback.js` y el guard del snapshot.

## Reproducción

Pendiente al tomar el caso: comprobar si la salida de `searchJiraIssuesUsingJql` por MCP tiene la forma `issues[].fields` y entra tal cual por `--fixture`. Si entra, el arreglo se reduce mucho.

## Síntoma

Una instancia que no quiere el token en disco no puede usar la integración de Cauce.

## Causa raíz

- `engine/integrations/providers/jira.js:16`: `if (!config.auth || !config.auth.tokenEnv) errors.push('jira: falta auth.tokenEnv')`.
- `engine/integrations/registry.js:301-306` ya prevé un adaptador que diga «traje una parte».

## Fix propuesto

`integration sync <p> jira --payload <json>` con `complete: true` obligatorio para limpiar ausentes; un `transport: "rest"|"agent"` que no exija `auth` en modo agente; y un workflow que mande al agente leer por la herramienta MCP declarada en la config y entregar el payload.

## Tradeoffs

- Depende del runner: el modo agente necesita un MCP de Atlassian, y en Codex o Gemini no se sabe qué hay.
- El riesgo nuevo es que el agente transcriba mal; la validación de forma y `complete` lo acotan.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `acme-ops/integrations/jira/workflows/jira-sync.js`, `sync-state.js` y `planning/adr/003-puente-jira-por-mcp-y-no-por-token.md`.

## Relacionados

- 222 — el staging por persona.
- 227, 228 y 229 — las piezas chicas de la misma integración.

## Cierre

Resuelto en 0.100.0. La reproducción que el caso dejaba pendiente cambió el tamaño del arreglo.

- **¿La salida del MCP entra tal cual por `--fixture`?** — se averiguó, y la pregunta era otra. El puente de
  acme pide la descripción ya en markdown (`responseContentFormat: "markdown"`) y arma un payload con la forma
  de la API, no con la respuesta cruda. `normalizeIssue` ya aceptaba una descripción en texto, así que ese
  payload entraba sin cambios. Los parámetros del MCP se leyeron de su esquema, sin llamarlo: `cloudId`,
  `jql`, `fields`, `maxResults` (50–100), `nextPageToken` y `responseContentFormat`. `parent` no está entre los
  campos por defecto.
- **`integration sync … --payload` con `complete` obligatorio** — se hizo. Un payload sin `complete` se
  rechaza. Con `complete: false` no corre la limpieza de ausentes, y el CLI lo dice. Por REST se sigue
  limpiando siempre: ese adaptador trae todo o falla.
- **`transport: "rest"|"agent"` que no exija `auth` en modo agente** — se hizo. Sin `transport` es REST, como
  hasta hoy. En modo agente, sincronizar sin payload explica cómo se hace en vez de intentar REST. Se suman
  `mcpServer` y un `cloudId` opcional, porque el sitio de acme sólo tiene UUID. El MCP acepta UUID o URL; sin
  `cloudId` se usa el `baseUrl`.
- **El workflow que manda al agente a leer por MCP** — se hizo distinto: es un procedimiento de cuatro pasos
  en `template/integrations/jira/README.md`, no un workflow. El paso que necesita juicio —leer y transcribir—
  es corto, y el que necesita garantías —qué se borra— lo decide el motor con `complete`. Un workflow pasa a
  valer el día que haga falta repartirlo entre sitios.
- **Tradeoff: depende del runner** — sigue así. Sin un MCP de Atlassian, el modo agente no tiene con qué leer,
  y el REST sigue ahí.
- **Tradeoff: el agente puede transcribir mal** — la forma del payload la valida `normalizeIssue` (clave,
  `summary`). Una transcripción plausible pero equivocada no la detecta nada; el README pide copiar tal cual.

Lo que el caso no preveía:

- **Una respuesta grande del MCP queda en disco.** Claude Code guardó la página entera de 50 ítems en
  `~/.claude/projects/…/tool-results/`, con el email del asignado. Contradice el motivo del modo agente, y el
  README lo dice con su salida: páginas más chicas o borrar ese archivo.

Prueba real:

- **La reproducción**, con el motor de `main`: la configuración en modo agente fallaba con «falta
  auth.tokenEnv», y un payload que trajo sólo DEMO-1 con `complete: false` borró DEMO-2 del staging.
- **Una sesión real** (`claude -p`, USD 0,69), autorizada por Manuel, sobre un banco con Cauce instalado desde
  esta rama, que leyó el Jira de acme por `atlassian-acme`, en sólo lectura. Se le pidió seguir el
  procedimiento del README trayendo sólo la primera página.
  - Pidió los nueve campos en markdown, recibió 50 ítems con `hasNextPage: true` y declaró `complete: false`.
  - Escribió el payload en un temporal propio y lo borró después.
  - El sync dijo `✓ jira: 50 items · 50 nuevos` y `el payload no trajo todo (complete: false): no se borró nada
    de lo ausente`.
  - En el staging quedaron 50 ítems: todos con descripción, 35 con aceptación derivada del encabezado y 41
    con padre. `integration check` salió válido.
  - El banco se borró después. Nada de su contenido se commiteó.
- **Seis mutaciones en una copia, cada una en rojo por `test/wiring/jira-agent.test.js`:**
  - Pedir token siempre.
  - Limpiar aunque el payload sea parcial. La primera versión de esta mutación dejaba un `else` suelto y
    rompía el archivo; se repitió bien hecha.
  - No exigir `complete`.
  - El agente intenta REST.
  - No avisar lo parcial.
  - `transport` libre.
