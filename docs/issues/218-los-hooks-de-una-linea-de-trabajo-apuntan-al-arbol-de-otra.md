---
caso: 218
titulo: los hooks de una línea de trabajo apuntan al árbol de otra
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 218 — Con dos líneas en paralelo, un guard mergeado a `main` no rige en la sesión que todavía no lo trajo

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: si se confirma, un guard nuevo —una defensa— no rige donde se cree que rige, y eso no avisa.
Reportado por la instancia y **sin reproducir todavía**: es lo primero que hay que hacer.

## Resumen

Según el reporte del caso 212, en `roax-ops` los hooks de `.claude/` de una sesión apuntaban por enlace al árbol
principal del repositorio ops, que estaba en la rama de la otra sesión. Un guard mergeado a `main` no regía para
esta sesión hasta que la otra trajera `main`.

## Reproducción

Pendiente. Hay que armar una instancia con dos líneas en worktrees separados, instalar el runner, mergear un guard
a `main` desde una y ver qué ejecuta la otra.

## Síntoma

Pendiente de la reproducción.

## Causa raíz

Pendiente. La hipótesis es que `automation install` enlaza los hooks al árbol donde se instaló, y no al de cada
sesión.

## Fix propuesto

Pendiente de la reproducción.

## Contexto de descubrimiento

`roax-ops`, Cauce 0.99.2, 2026-10-01, nombrado como problema vecino en el caso 212 y partido de él al mejorarlo.

## Relacionados

- 212 — la misma situación de líneas en paralelo.
