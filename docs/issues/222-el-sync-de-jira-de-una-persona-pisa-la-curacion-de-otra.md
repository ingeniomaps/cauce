---
caso: 222
titulo: el sync de Jira de una persona pisa la curación de otra
estado: abierto
prioridad: alta
version-detectada: 0.99.2
---

# 222 — Con `candidateAssigneeEnv`, el sync de una persona regenera los borradores que otra ya curó

**🔴 abierto** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**: pierde trabajo de una persona sin avisar, en toda instancia con la integración de Jira encendida y más de una persona sincronizando sobre el mismo staging.

## Resumen

Un ítem es `candidate` para quien está asignado y `context` para los demás. Un `context` se regenera en cada sync aunque su borrador tenga cambios locales. Si el staging se comparte —el molde no lo excluye de git—, el sync de la segunda persona convierte en `context` lo que la primera curó y lo reescribe.

## Reproducción

Corrido el 2026-10-01 contra `main` en un banco `suelto`, con el fixture `test/support/fixtures/jira-search.json`:

```
✓ jira: 1 items · 1 nuevos · 0 refrescados · 0 curados preservados      # JIRA_ME=abc (Ada)
# se agrega «CURADO POR ADA» a staging/stories/DEMO-42/draft.md
✓ jira: 1 items · 0 nuevos · 1 refrescados · 0 curados preservados      # JIRA_ME=otra-persona
curación de Ada que sobrevive: 0
el .gitignore de la instancia no excluye el staging
```

Control: si vuelve a sincronizar Ada, sale `1 curados preservados` y la curación queda.

## Síntoma

La curación desaparece y el resumen lo cuenta como «refrescado», sin nada que diga que se perdió algo.

## Causa raíz

- `engine/integrations/registry.js:265`: `const regenerate = role === 'context' || !locallyChanged`.
- `engine/integrations/state.js`, `roleOf`: el rol sale de una sola variable de entorno.
- `template/gitignore` no menciona `integrations/`.

## Fix propuesto

Lo que roax-ops hizo en `2bf6c9e` (`integrations/jira/config.js`, `.gitignore:68-71`): el staging fuera de git y la identidad en un `config.local.json` por persona. En Cauce: gitignorear `integrations/*/staging/` en el molde, y no regenerar un `context` con cambios locales —preservarlo y avisarlo— por si el staging se comparte igual.

## Tradeoffs

- Sacar el staging de git cambia lo que ve un compañero: cada uno sincroniza el suyo, que es lo que roax eligió.
- Una instancia ya instalada no recibe el `.gitignore` nuevo (`upgrade` no lo toca): el CHANGELOG tiene que decirle qué agregar.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. Lo encontró la lectura de la integración de Jira de roax contra la de Cauce.

## Relacionados

- 226 — el modo por agente, que también lee por persona.
- 209 — el mismo reparto entre lo compartido y lo de cada máquina.
