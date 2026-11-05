---
caso: 484
titulo: La re-revisión de autobuild no comprueba lo que mandó a corregir, y done/ lo registra como corregido
estado: abierto
prioridad: alta
version-detectada: 0.119.0
---

# 484 — La re-revisión de autobuild no comprueba lo que mandó a corregir, y done/ lo registra como corregido

**🔴 abierto** · detectado en 0.119.0 · prioridad **alta**: `done/` afirma una corrección que nadie vio, y de ese registro salen las lecciones (`ops lessons`).

## Resumen

Cuando Review encuentra bloqueantes, `autobuild` manda a corregirlos y vuelve a revisar. La segunda pasada no recibe la lista de lo que se mandó a corregir: revisa el diff entero de nuevo. Un bloqueante que la segunda pasada no vuelve a encontrar, porque se corrigió o porque esta vez no lo vio, se registra igual en `done/` como `corregido:`. Hay dos daños:

1. **Una afirmación sin registro (R14).** `corregido:` dice que se corrigió, y lo único que consta es que se pidió.
2. **Lecciones contaminadas.** `ops lessons` cuenta reglas por lo que `done/` dice que se corrigió. Una corrección que no ocurrió suma igual hacia el umbral de lección.

## Reproducción

Reproducido el 2026-11-05 con el arnés de `autobuild` (`test/support/autobuild-harness.js`), sin modelo. Es una sonda de `node --test` desde la raíz del repositorio:

```js
const B1 = { detail: 'B1-el-handler-no-valida-el-monto', blocking: true, verified: true, decision: false }
let turn = 0
const { prompts, written } = await runFlow({
  [KEY.review]: () => (++turn === 1
    ? { verdict: 'con-condiciones', consulted: ['api/alta.go'], concerns: [B1] }
    : { verdict: 'aprobado', consulted: ['api/alta.go'], concerns: [] }),
})
// ¿la segunda Review lleva B1?, y la línea review= de lo escrito en done/
```

En la sonda, `review-fix` es el stub del arnés y no toca nada. La re-revisión aprueba sin mencionar `B1`.

## Síntoma

```
RE-REVISION LLEVA B1: false
DONE: review=aprobado por software-architect, sobre api/alta.go · corregido: B1-el-handler-no-valida-el-monto
```

`done/` afirma que se corrigió algo que nadie tocó ni volvió a mirar.

## Causa raíz

- `automatization/workflows/autobuild.js:1940`: `const fixed = [...blockers(review)]` toma los bloqueantes en el momento en que se mandan a corregir, no cuando se comprueba que se corrigieron.
- `:1984-1986`: la re-revisión pide «Volvé a revisar el diff corregido … contra su aceptación» y no lleva la lista de bloqueantes anteriores.
- `:1999`: cada vuelta suma a `fixed` lo que manda a corregir.
- `:2052-2054`: `fixed` se escribe en `done/` como `corregido: …`.
- `engine/planning/lessons.js:34-37` (`corrected()`) lee ese segmento `corregido:` para contar lecciones.

## Fix propuesto

Que la re-revisión reciba cada bloqueante anterior con un id y devuelva, por cada uno, si sigue o no. `fixed` sólo incluye los confirmados como corregidos.

Hay dos bordes que conviene dejar decididos antes de construir:

- **El id es por vuelta** (`r1-B1`), no reiniciado en cada pasada: si no, con dos vueltas el mismo id nombra dos hallazgos distintos.
- **Un bloqueante que la re-revisión da por no corregido y que alguien discute** no se convierte en un bloqueo sin salida: va por `decision` o por `verified=false`, que ya existen (`:1943`, `:1992`).

## Tradeoffs

- El prompt de la re-revisión crece con la lista. Con tope de 2 vueltas (`:1978`) el costo está acotado.
- **Cambia lo que `done/` registra**, y las lecciones lo leen: es una quita. Hace falta comparar, lado a lado y sobre el mismo caso, la entrada de `done/` y la salida de `ops lessons` antes y después (R29).
- **Las entradas viejas de `done/` siguen diciendo `corregido:`** con el significado de antes. No se reescriben; hay que decirlo en el CHANGELOG.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa que usa agentes. Su herramienta de revisión de PR agregó un modo verificar: quien construyó no es quien dice «resuelto». Un verificador recibe cada hallazgo anterior y contesta cuáles siguen, y el veredicto lo calcula el código. Al contrastarlo con Cauce apareció este hueco. Lo que esa herramienta hace mal y no conviene copiar: falla cerrado sin vía de disputa.

## Relacionados

- Caso 485: el mismo Review, otro eje (qué se leyó).
- Caso 492: las lecciones desde la review humana. Depende de que `corregido:` signifique corregido.
- Caso 207: por qué `fixed` llega a `done/`.
