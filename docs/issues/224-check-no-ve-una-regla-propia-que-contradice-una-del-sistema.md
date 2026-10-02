---
caso: 224
titulo: check no ve una regla propia que contradice una del sistema
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 224 — Una regla propia escrita como `## Regla 8` no la lee `check`, y contradice a R8 sin que nada lo diga

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: no rompe nada, pero un agente lee dos reglas opuestas y elige una.

## Resumen

`check` reconoce las reglas por el encabezado `## <letra><número> —`. conorbi-ops escribió las suyas como `## Regla 8` y `## Regla 9`: no entran en la comparación de ids, y su «Regla 8» pide Conventional Commits en español, al revés que R8 del sistema.

## Reproducción

Pendiente de correr al tomar el caso: un archivo de reglas propio con `## Regla 8 — Commits en español` y `ops check`, que se espera verde.

## Síntoma

Una contradicción entre una regla de la empresa y una del sistema que ninguna herramienta ve.

## Causa raíz

`engine/planning/structure.js:114`, `ruleIds`: `/^##\s+([A-Z]\d+)\s+[—-]/gm`. Un encabezado sin esa forma no existe para `check`.

## Fix propuesto

Que `check` avise un encabezado `##` de `rules/` que parece una regla y no tiene la forma (`Regla N`, `R-N`), diciendo cuál es la forma. Detectar la contradicción misma pide juicio y no entra.

## Tradeoffs

- Avisar por forma puede marcar secciones legítimas de un archivo de reglas: acotarlo a encabezados que empiezan con «Regla» o con letra y número.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. En `conorbi-ops/planning/rules/commits-and-release.md` y `ports.md`.

## Relacionados

- 160 — por qué las reglas se pisan por archivo.
