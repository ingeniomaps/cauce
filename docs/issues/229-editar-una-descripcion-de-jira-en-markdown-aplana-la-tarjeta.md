---
caso: 229
titulo: editar una descripción de Jira en markdown aplana la tarjeta
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 229 — Un agente que edita por MCP una descripción existente en markdown pierde menciones, tablas y casillas

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: Cauce no escribe en Jira (`writeBack: false`), pero un agente sí puede hacerlo por MCP, y en acme es el camino real.

## Resumen

Reenviar una descripción en markdown aplana lo que el ADF tenía. acme-ops agregó un guard que frena `editJiraIssue` con una descripción que no es ADF (commits `edf8a67` y `23ed094`).

## Reproducción

No se reproduce acá: hacerlo exige escribir en un Jira real (R12). Queda como dato de acme, verificado en esa instancia.

## Síntoma

Una tarjeta pierde estructura que nadie pidió cambiar.

## Causa raíz

No hay guard en Cauce sobre herramientas MCP de Jira. El conversor ADF del motor (`engine/integrations/providers/jira.js:63,65`) también pierde menciones y tablas; hoy no daña porque no se escribe.

## Fix propuesto

Una decisión pura en el motor y un hook sobre `mcp__*__editJiraIssue`, con el nombre del servidor tomado de la config y no escrito a mano: en acme el guard no corre para quien nombró distinto su servidor.

## Tradeoffs

- Depende del runner (nombres de herramientas MCP).
- Vale mientras un agente edite Jira a mano; si un día existe un ejecutor de escritura, primero va el contrato que acme dejó en su README (líneas 251-292).

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `acme-ops/automatization/bin/acme-jira-adf-check.js`.

## Relacionados

- 223 — cómo se perdió este mismo guard en acme.
- 226.

## Cierre

Resuelto en 0.100.0.

- **Una decisión pura en el motor** — se hizo: el guard `jira-adf` (`engine/hooks/jira.js`). Frena
  `editJiraIssue` sólo cuando la edición toca la descripción y no viene en ADF: un texto, con
  `contentFormat: "markdown"` o sin `contentFormat`, porque el esquema del MCP dice que el default «varía
  según la herramienta». Pasan:
  - un documento ADF (objeto) o `contentFormat: "adf"`;
  - `description: null`, que la borra;
  - la edición de otros campos;
  - `createJiraIssue`, porque no hay estructura que aplanar.

  Se aprueba como el resto: el diálogo de Claude Code (caso 221) o la línea `jira <clave> description` en
  `.ops-approval`.
- **Un hook sobre `mcp__*__editJiraIssue`, con el servidor tomado de la config y no escrito a mano** — se hizo
  distinto. El matcher es `mcp__.*__editJiraIssue`, sin ningún nombre de servidor, así que no hay nada que
  configurar ni que quede desactualizado. Es lo que fallaba en acme, que escribía `mcp__atlassian-acme__…` y
  no corría para quien había nombrado distinto su servidor. Va en el grupo nuevo `pre-mcp`, con su shim
  `guard-jira-adf.sh`.
- **Tradeoff: depende del runner** — se mantiene. Sólo Claude Code lo instala; Codex y Gemini no tienen ese
  hook. Está dicho en `automatization/hooks/README.md`.
- **Tradeoff: el contrato de escritura de acme va antes que un ejecutor** — sigue vigente: Cauce sigue sin
  escribir en Jira (`writeBack: false`).

Prueba real:

- **Sin escribir en ningún Jira** (R12): una sesión que intentara la edición real escribiría en producción si
  el guard fallara.
  - **El guard instalado:** se instaló Cauce desde esta rama en un banco con `automation install . claude`. El
    `settings.json` instalado registra `{"matcher":"mcp__.*__editJiraIssue", … guard-jira-adf.sh}`.
  - **Con forma real:** al shim instalado se le pasó una llamada con la forma real de Claude Code
    (`tool_name: mcp__atlassian-acme__editJiraIssue`, `fields.description` en texto). Respondió
    `permissionDecision: "ask"` con el motivo. La misma llamada editando `summary` salió vacía, y pasa.
- **Que el matcher alcanza a cualquier servidor** está documentado (code.claude.com/docs/en/hooks.md): con
  caracteres especiales el matcher es una expresión regular de JavaScript sin anclar, y la página da
  `mcp__.*__write.*` como ejemplo para cualquier servidor.
- **Seis mutaciones en una copia, cada una en rojo por `test/hooks/jira-adf.test.js`:**
  - El ADF como objeto frena.
  - `contentFormat: "adf"` frena.
  - El servidor escrito fijo en el guard.
  - Sin salida.
  - El matcher con el servidor fijo.
  - Cualquier campo frena.
