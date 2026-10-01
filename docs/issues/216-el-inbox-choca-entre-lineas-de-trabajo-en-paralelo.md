---
caso: 216
titulo: el INBOX choca entre líneas de trabajo en paralelo
estado: abierto
prioridad: media
version-detectada: 0.99.2
---

# 216 — `INBOX.md` es un archivo por instancia, y dos líneas que anotan en la misma sección chocan

**🔴 abierto** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: no pierde nada —git frena—, pero los recorridos anotan en el INBOX en cada corrida (Review,
Build, el cierre con las lecciones), así que dos líneas en paralelo chocan seguido; en `roax-ops` pasó 1 de 4
veces. Sale del caso 212, que resolvió la cola y dejó éste aparte porque el INBOX tiene otra vida: entradas
sueltas, sin orden.

## Resumen

Las entradas nuevas van al final de su sección. Dos líneas que anotan en la misma sección escriben la misma zona
del mismo archivo, y al traer una a la otra choca.

## Reproducción

Con git 2.43.0, en un repo descartable: `planning/INBOX.md` con `## Propuestas` y `## Lecciones` vacías; la rama
`work/a` agrega `- **cache-de-precios** — …` bajo Propuestas, la rama `work/b` agrega `- **reintentos-pagos** — …`
en el mismo lugar; `main` trae `work/a` y `work/b` trae `main`.

## Síntoma

```
CONFLICTO (contenido): Conflicto de fusión en planning/INBOX.md
Fusión automática falló; arregle los conflictos y luego realice un commit con el resultado.
```

## Causa raíz

`engine/planning/parser.js`, `inboxSections`: un solo `INBOX.md`. Y `automatization/shared/inbox.js`: los
recorridos piden agregar ahí.

## Fix propuesto

El mismo patrón del 212: un archivo por entrada (`inbox/<sección>/<slug>.md`) o por sección y línea, con
`INBOX.md` leído primero como hasta hoy. Antes de construirlo hay que decidir la forma, porque cambia lo que
una persona lee para promover: una sección hoy se lee de un vistazo en un archivo.

## Tradeoffs

- Leer el INBOX deja de ser abrir un archivo; `tree` ya lo resume, pero promover pide verlo entero.

## Contexto de descubrimiento

Partido del caso 212 al mejorarlo, el 2026-10-01.

## Relacionados

- 212 — la cola partida por hito.
