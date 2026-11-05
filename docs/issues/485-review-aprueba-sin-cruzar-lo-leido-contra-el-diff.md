---
caso: 485
titulo: Review aprueba con consulted no vacío, sin cruzarlo contra los archivos que el diff toca
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 485 — Review aprueba con consulted no vacío, sin cruzarlo contra los archivos que el diff toca

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: R14 pide cruzar lo consultado contra lo afirmado, y el motor sólo comprueba que la lista no esté vacía. La frecuencia en Cauce no está medida.

## Resumen

Review tiene que enumerar en `consulted` lo que abrió de verdad. El motor frena sólo si la lista viene vacía. Un revisor que abrió 1 de 10 archivos del diff y lo declara aprueba igual: el manifiesto existe, y nadie lo compara con lo que había que leer.

## Reproducción

Reproducido el 2026-11-05 con el arnés de `autobuild`, sin modelo. En la tarea del arnés, el plan toca `api/alta.go`. Review aprueba declarando sólo un archivo que no está en el plan:

```js
const { result, asked } = await runFlow({
  [KEY.review]: () => ({ verdict: 'aprobado', consulted: ['README.md'], concerns: [] }),
})
```

## Síntoma

```
RESULT {"done":["T-1"],"count":1,"hito":"H1",…}
LLEGO A VERIFY: true
```

La tarea llega a `done/` con una revisión que no declaró haber abierto el único archivo que cambia.

La conducta real, si un modelo aprueba leyendo parcial, se mide aparte con un caso de eval de `change-review` (ver Fix).

## Causa raíz

- `automatization/workflows/autobuild.js:197-199`: el comentario dice que `consulted` es «lo único que separa al que miró del que aprobó de memoria».
- `:567`: `MANIFEST` pide enumerarlo.
- `:2008`: la única comprobación es `if (!review.consulted.length) return halt('review-unbacked', …)`.
- R14 (`template/planning/rules/system/conduct.md:151-157`) pide que quien recibe cruce lo consultado contra lo afirmado. Ese cruce no lo hace nadie.

## Fix propuesto

1. **En el motor:** cruzar `consulted` contra `git diff --name-only` de lo que se revisa (el commit de la tarea o el árbol, según `runner.commitPerTask`). Si falta alguno, relanzar Review una vez nombrando los que faltan. Si persiste, parar con `review-unbacked` y la lista de archivos no abiertos.
2. **En la conducta:** un caso de eval en `flows/system/change-review/evaluations/cases/` que tiente a aprobar habiendo abierto uno de N archivos.

## Tradeoffs

- **Diffs grandes:** un diff de 40 archivos con cambios generados haría fallar el cruce. Hay que decidir si se excluyen los generados (lockfiles, snapshots) y con qué lista. Por R27, la lista se declara y no se deduce.
- **El cruce es por nombre:** no prueba que el archivo se haya leído bien, igual que hoy. Es la asimetría que el comentario de `:197` ya acepta.
- **Una vuelta más de Review** cuando falta algo: cuesta lo que una pasada.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Su herramienta de revisión de PR hace que cada revisor declare los archivos leídos y los cruza contra los que le asignó y contra las herramientas que midió el harness. Según sus propios commits, un revisor había devuelto cero hallazgos habiendo abierto 1 de 22 archivos, y relanzado encontró tres. Ese número es de ellos y no se reprodujo.

## Relacionados

- Caso 484: el mismo Review, otro eje (qué se corrigió).
