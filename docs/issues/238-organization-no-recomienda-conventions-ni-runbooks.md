---
caso: 238
titulo: organization no recomienda conventions ni runbooks
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 238 — El molde de `organization/` recomienda dos documentos, y la instancia multi-repo necesitó más

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: es forma.

## Resumen

globex-ops trajo de su esquema anterior dos formas que se repiten: `conventions/`, con un canónico y una tabla de divergencias por repositorio que marca si cada una es intencional o deriva, y `runbooks/`, con pasos que citan su fuente, un checklist y los huecos conocidos.

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

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `globex-ops/organization/docs/conventions/` y `runbooks/`.

## Relacionados

- `template/planning/delivery/multi-repo.md`.

## Cierre

Resuelto en 0.100.0.

- **Sumar `conventions/` y `runbooks/` a «Recomendados, sin molde»** — se hizo, en
  `template/organization/README.md`, con una línea de qué lleva cada uno. `conventions/` lleva el canónico y la
  tabla de qué repositorio se aparta y si es intencional, que es lo que lo vuelve útil con varios
  repositorios. `runbooks/` lleva pasos con su fuente, un checklist y los huecos conocidos.
- **Sin moldes nuevos** — se respetó: es una recomendación, como `architecture.md` y `risks.md`.

Prueba real: no hay comportamiento que correr, porque es una línea de documentación. Se corrió `npm run ci`
con el README cambiado y salió en verde.
