---
caso: 226
titulo: Jira no se puede leer por un agente, sin token en disco
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 226 — La integración de Jira sólo lee por REST con un token, y roax mantiene un puente propio para no dejar el token en disco

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: roax-ops mantiene unas 1.475 líneas que duplican el motor de Cauce (su ADR-003) sólo para leer por MCP.

## Resumen

La integración exige `auth.tokenEnv` siempre y lee con `fetch`. roax decidió no dejar un token de Jira de larga vida en disco y lee por el servidor MCP de Atlassian desde un workflow: el agente consulta, arma un payload y lo entrega a un script que lo aplica sólo si trae `complete: true`. Eso duplica `state.js`, el `sync` de `registry.js`, `writeback.js` y el guard del snapshot.

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

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/integrations/jira/workflows/jira-sync.js`, `sync-state.js` y `planning/adr/003-puente-jira-por-mcp-y-no-por-token.md`.

## Relacionados

- 222 — el staging por persona.
- 227, 228 y 229 — las piezas chicas de la misma integración.
