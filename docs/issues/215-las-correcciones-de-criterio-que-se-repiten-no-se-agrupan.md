---
caso: 215
titulo: las correcciones de criterio que se repiten no se agrupan
estado: abierto
prioridad: baja
version-detectada: 0.99.2
---

# 215 — `ops lessons` agrupa por regla y deja sueltas las correcciones de criterio

**🔴 abierto** · detectado en 0.99.2 · prioridad **baja**.

**Prioridad baja**: hoy no hay con qué medirlo. Sube a media cuando una instancia real tenga al menos un mes
de entradas de `done/` con `corregido:`, que es lo que permite ver si el agrupamiento acierta.

## Resumen

Una corrección de criterio —un hallazgo que no cita ninguna regla— que se repite en varias tareas es la
señal más valiosa de las dos: dice que falta una regla. `ops lessons` las lista pero no las agrupa, porque
dos frases distintas que hablan del mismo defecto sólo se juntan con juicio, y un agrupamiento sin medir
llenaría el INBOX de lecciones falsas o callaría las verdaderas.

## Reproducción

```bash
node tools/ops.js lessons planning
```

sobre una instancia con dos tareas que corrigieron «falta el índice en alta» y «falta el índice en baja».

## Síntoma

```
2 corrección(es) de criterio, sin regla: ver si alguna se repite
  alta: falta el índice en alta
  baja: falta el índice en baja
```

No se propone ninguna lección por ellas.

## Causa raíz

`engine/planning/lessons.js`, `candidates`: el criterio va a `criteria` y nunca a `proposals`. Es una decisión
del caso 214, no un descuido.

## Fix propuesto

Un paso con juicio —en el cierre de `autobuild` o en un recorrido— que reciba la lista y proponga una regla
nueva sólo cuando el mismo defecto aparece en dos tareas o más, con el registro de `LESSONS.md` para no
insistir. Antes de escribirlo: medir con datos reales cuántas correcciones de criterio hay y cuántas se
repiten de verdad.

## Tradeoffs

- Una llamada con juicio en cada corrida que tenga criterios, o un recorrido aparte.

## Contexto de descubrimiento

Partición del caso 214, el 2026-10-01: lo determinista entró; lo que pide juicio espera datos.

## Relacionados

- 214 — el lector por regla.
