---
caso: 229
titulo: editar una descripción de Jira en markdown aplana la tarjeta
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 229 — Un agente que edita por MCP una descripción existente en markdown pierde menciones, tablas y casillas

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: Cauce no escribe en Jira (`writeBack: false`), pero un agente sí puede hacerlo por MCP, y en roax es el camino real.

## Resumen

Reenviar una descripción en markdown aplana lo que el ADF tenía. roax-ops agregó un guard que frena `editJiraIssue` con una descripción que no es ADF (commits `edf8a67` y `23ed094`).

## Reproducción

No se reproduce acá: hacerlo exige escribir en un Jira real (R12). Queda como dato de roax, verificado en esa instancia.

## Síntoma

Una tarjeta pierde estructura que nadie pidió cambiar.

## Causa raíz

No hay guard en Cauce sobre herramientas MCP de Jira. El conversor ADF del motor (`engine/integrations/providers/jira.js:63,65`) también pierde menciones y tablas; hoy no daña porque no se escribe.

## Fix propuesto

Una decisión pura en el motor y un hook sobre `mcp__*__editJiraIssue`, con el nombre del servidor tomado de la config y no escrito a mano: en roax el guard no corre para quien nombró distinto su servidor.

## Tradeoffs

- Depende del runner (nombres de herramientas MCP).
- Vale mientras un agente edite Jira a mano; si un día existe un ejecutor de escritura, primero va el contrato que roax dejó en su README (líneas 251-292).

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `roax-ops/automatization/bin/roax-jira-adf-check.js`.

## Relacionados

- 223 — cómo se perdió este mismo guard en roax.
- 226.
