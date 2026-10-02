---
caso: 236
titulo: workspace.md no tiene dónde declarar credenciales ni guards propios
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 236 — El molde de `workspace.md` no trae tablas para las credenciales ni para los guards propios de la instancia

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: es forma, y la instancia lo agregó sola.

## Resumen

conorbi-ops agregó a `organization/workspace.md` una tabla «Credenciales» (servicio, variable, para qué) y una «Guards propios» (guard, qué frena, pruebas). El molde menciona las credenciales en prosa y no tiene dónde listar guards propios.

## Reproducción

Verificado leyendo `template/organization/workspace.md` contra el de conorbi.

## Síntoma

Cada instancia inventa dónde anotarlo, o no lo anota.

## Causa raíz

`template/organization/workspace.md`.

## Fix propuesto

Las dos tablas vacías en el molde.

## Tradeoffs

- Ninguno: es molde.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 223 — los guards propios.
