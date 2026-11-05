---
caso: 493
titulo: Ninguna prueba comprueba que los subcomandos de ops citados en la documentación existan
estado: abierto
prioridad: baja
version-detectada: 0.119.0
---

# 493 — Ninguna prueba comprueba que los subcomandos de ops citados en la documentación existan

**🔴 abierto** · detectado en 0.119.0 · prioridad **baja**: hoy no hay ninguno inventado en lo vivo. Ya pasó una vez (caso 012), y la prueba hermana para `make` existe.

## Resumen

Hay dos pruebas que fallan si un documento cita un target de `make` que no existe (`test/agents/agents.test.js:132`, `test/repo/repo.test.js:20`). Para `ops <subcomando>` no hay ninguna. Un cargo, un recorrido o el molde que cite un subcomando renombrado o retirado no rompe nada hasta que alguien lo escribe. Es la falta de comparador que describe R27.

## Reproducción

Medido el 2026-11-05, sin modelo. Se juntaron los subcomandos citados como `tools/ops.js <x>`, `ops.js <x>` o `npm run ops -- <x>` en `agents/`, `flows/`, `template/`, `README.md` y `docs/issues/`, y se cruzaron contra los que lista `node engine/cli/ops.js --help`:

```
no en USAGE: de    -> agents/roles/system/data-engineer/evaluations/results/2026-08-22.md
no en USAGE: run   -> (sólo en docs/issues)
no en USAGE: team  -> agents/roles/system/engineering-manager/evaluations/results/2026-08-22.md
```

- `de` es prosa («ops.js de sólo lectura»).
- `team` aparece en un registro histórico de eval y en el caso 012, que es justamente el precedente: el Makefile del molde llamaba a `ops team`, que no existía.
- En los contratos vivos no hay ninguno inventado.

## Causa raíz

No hay prueba. `engine/cli/ops.js` despacha los subcomandos sin exponer una lista consultable desde las pruebas, salvo el texto de `USAGE`.

## Fix propuesto

Una prueba en `test/repo/` hermana de la de `make`:

- Sale de los subcomandos que acepta `ops.js`. Mejor de una lista exportada que de parsear el texto de ayuda.
- Recorre los documentos vivos y excluye los registros históricos (`evaluations/results/`, `docs/issues/`, `CHANGELOG.md`), que citan lo que existía cuando se escribieron.
- Mutación: citar `ops team` en un cargo pone la prueba en rojo.

## Tradeoffs

- **La regex agarra prosa** como `de`. El patrón exige backtick o inicio de línea, como la de `make`.
- **Excluir los registros históricos** es una lista. Por R27 se declara con su razón en la misma prueba.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa: los ejemplos de sus skills son entradas que se ejecutaron contra la versión declarada, y cada orden citada tiene que existir en la política de la CLI.

## Relacionados

- Caso 012: el Makefile del molde llamaba a un comando que no existía.
