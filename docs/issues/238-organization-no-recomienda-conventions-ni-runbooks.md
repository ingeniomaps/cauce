---
caso: 238
titulo: organization no recomienda conventions ni runbooks
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 238 — El molde de `organization/` recomienda dos documentos, y la instancia multi-repo necesitó más

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: es forma.

## Resumen

conorbi-ops trajo de su esquema anterior dos formas que se repiten: `conventions/`, con un canónico y una tabla de divergencias por repositorio que marca si cada una es intencional o deriva, y `runbooks/`, con pasos que citan su fuente, un checklist y los huecos conocidos.

## Reproducción

No hace falta: es la ausencia de una recomendación.

## Síntoma

Una instancia multi-repo no tiene dónde anotar qué repositorio se aparta de la convención y por qué.

## Causa raíz

`template/organization/README.md` recomienda sólo `architecture.md` y `risks.md`, y dice que la lista no es cerrada.

## Fix propuesto

Sumar `conventions/` y `runbooks/` a «Recomendados, sin molde», con una línea de qué lleva cada uno. Sin moldes nuevos.

## Tradeoffs

- Ninguno: es una recomendación.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `conorbi-ops/organization/docs/conventions/` y `runbooks/`.

## Relacionados

- `template/planning/delivery/multi-repo.md`.
