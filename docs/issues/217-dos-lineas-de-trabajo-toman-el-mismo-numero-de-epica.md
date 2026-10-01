---
caso: 217
titulo: dos líneas de trabajo toman el mismo número de épica
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 217 — «El próximo NNN libre» se calcula sobre un árbol que no ve la otra línea

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: `check` lo detecta al traer la otra línea, así que no pasa en silencio. Lo que cuesta es
renumerar una épica que ya citan sus tareas (`(epic: NNN)`). Sube a media si una instancia con varias líneas lo
sufre más de una vez por mes.

## Resumen

`flow` escribe la épica «tomando el próximo NNN libre» de su árbol. Dos líneas en paralelo que crean una épica el
mismo día toman el mismo número, porque ninguna ve la de la otra hasta traerla. En `roax-ops` dos sesiones tomaron
la 055 el mismo día (caso 212).

## Reproducción

Instancia creada con `ops init`, dos épicas `epic-001-pagos.md` y `epic-001-envios.md` —lo que deja el merge de
dos líneas que tomaron el mismo número—, y `ops check planning`.

## Síntoma

```
✗ roadmap/epic-001-pagos.md: número de épica duplicado 001
```

Los nombres de archivo distintos hacen que git no choque: el duplicado entra en el merge y lo ve recién `check`.

## Causa raíz

`automatization/workflows/flow.js:505` — el prompt que escribe la épica pide «el próximo NNN libre» del árbol.

## Fix propuesto

Dos salidas, a decidir: un prefijo por línea en el número, o asignar el número definitivo al mergear a `main`
y trabajar antes con el slug. Es la misma carrera que `docs/issues/README.md` nombra para los casos (el 164).

## Tradeoffs

- Cualquiera de las dos cambia cómo se cita una épica, que hoy es por número.

## Contexto de descubrimiento

Partido del caso 212 al mejorarlo, el 2026-10-01.

## Relacionados

- 212, 216 — la misma situación: varias líneas sobre archivos compartidos.
