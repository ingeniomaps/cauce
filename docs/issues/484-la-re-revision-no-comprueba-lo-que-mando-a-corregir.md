---
caso: 484
titulo: La re-revisión de autobuild no comprueba lo que mandó a corregir, y done/ lo registra como corregido
estado: resuelto
resuelto-en: 0.120.0
prioridad: alta
version-detectada: 0.119.0
---

# 484 — La re-revisión de autobuild no comprueba lo que mandó a corregir, y done/ lo registra como corregido

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **alta**: `done/` afirma una corrección que nadie vio, y de ese registro salen las lecciones (`ops lessons`).

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

## Cierre

La re-revisión recibe cada bloqueante que se mandó a corregir con un id por vuelta (`r1-B1`, `r2-B1`) y contesta en
`previous`, por cada uno, si sigue, con la línea que lo muestra. `done/` registra como `corregido:` sólo lo confirmado
con `fixed: true` y evidencia. Lo no confirmado vuelve a corregirse con su id y con el motivo que dio el revisor, y al
tope de dos vueltas la corrida frena con `review-failed` nombrándolo.

La sonda del caso, sobre el mismo escenario, antes y después:

```
antes:   RE-REVISION LLEVA B1: false
         DONE: review=aprobado por software-architect, sobre api/alta.go · corregido: B1-el-handler-no-valida-el-monto
después: RE-REVISION LLEVA B1: true
         RESULT: review-failed :: r1-B1 sin confirmar corregido: B1-el-handler-no-valida-el-monto
         DONE: (no se escribe)
```

Con lo que lee `ops lessons`, corrido de verdad en un banco `suelto`. Antes: dos tareas con la entrada que escribía el
motor anterior, un `corregido:` de la misma regla que nadie confirmó. Después: con el motor nuevo, esas dos corridas
paran en `review-failed` y no escriben `done/`.

```
antes:   reforzar-commits-r8  planning/rules/system/commits.md#R8 — 2 tareas: alta, baja
después: = ninguna regla se corrigió en 2 tareas o más sin lección
```

Cuando la re-revisión confirma, el formato de `corregido:` es el mismo y `ops lessons` lo lee igual
(`test/planning/lessons.test.js` sin cambios).

La prueba con un modelo: el prompt real de la re-revisión, sacado del arnés, por `claude -p` en dos repos con el mismo
`api/alta.go` base. En A el diff agrega la validación del monto, en B cambia otra cosa. Repetida después del último
cambio al prompt:

```
A: {"id":"r1-B1","fixed":true,"evidence":"api/alta.go:10-11 `if v.Monto <= 0 { return ErrMontoInvalido }` …"}
B: {"id":"r1-B1","fixed":false,"evidence":"api/alta.go:7 `return guardar(v)` — Alta todavía no valida que v.Monto > 0 …"}
```

En B el modelo no repitió el hallazgo en `concerns`, que es lo que el prompt pide. Las dos corridas costaron USD 1,05
en total.

Contra el caso:

- **Fix propuesto, la lista con id y la respuesta por cada uno:** se hizo. `fixed` ahora sólo lleva lo confirmado.
- **Borde, id por vuelta:** se hizo; los nuevos de la vuelta 2 son `r2-…`, y lo no confirmado conserva su id.
- **Borde, disputa:** se hizo como el caso proponía, sin vía nueva. El revisor discute con `decision` o con
  `verified=false` en `concerns`, como antes.
- **Tradeoff, el prompt crece:** acotado por el tope de dos vueltas, que no cambió.
- **Tradeoff, cambia lo que `done/` registra:** comparado lado a lado arriba, en `done/` y en lo que cuenta
  `corrected()`.
- **Tradeoff, las entradas viejas de `done/`:** no se reescriben, y el CHANGELOG lo dice.
- **Relacionado 492:** ahora `corregido:` significa corregido, que es lo que el 492 necesitaba.

Encontrado y no previsto:

- **Desde el 343, comprar una segunda vuelta pedía bloqueantes nuevos `fixable`.** Ahora también la compra lo que la
  re-revisión no confirmó, aunque apruebe: su corrección ya estaba pedida. Está en el comentario de las vueltas.
- **Lo anotado sin bloquear se perdía en una pasada que después se re-revisaba**, y también la sospecha de una
  re-revisión intermedia: `noted` leía sólo la última pasada. Ya pasaba antes, y con este cambio las segundas vueltas
  son más frecuentes, así que se arregló acá. Lo anotado de cada pasada llega al INBOX.
- **Un id escrito con otra mayúscula** compraba una vuelta sobre trabajo correcto. Se compara sin mayúsculas.
- **Pedir que lo que sigue no se repita en `concerns`** dejaba el motivo nuevo («falta X») sólo en `evidence`. Ahora
  viaja al que corrige como `(sigue: …)`. A `done/` va el hallazgo, no el motivo.
- **Anotado, sin caso:** el camino `--role review` → `handBack` tampoco pasa a la sesión que vuelve a revisar, con id,
  lo que se devolvió. No infla `corregido:`, porque por ese camino `fixed` sale vacío, pero es el mismo hueco con roles
  separados. Lo constatado (`proposes: false`) de una pasada anterior sigue sin llegar a «constató». El motivo de la
  parada nombra el hallazgo y no el `(sigue: …)`. Un id que no está en la lista se ignora sin aviso. Una nota repetida
  con otras palabras en dos pasadas puede ocupar dos lugares del tope del INBOX. Las cinco cosas son anteriores o
  menores y no cambian lo que el caso cuida.

### Lista de cierre

1. hecho: la sonda del caso (`RE-REVISION LLEVA B1: false`, `corregido: B1…`) y 49/49 en las pruebas de review, refs y
   lessons, antes de tocar el código.
2. hecho: `fix/484-re-review-checks-what-it-asked`.
3. hecho: `test/workflows/autobuild-review-verify.test.js`, 4 en rojo con el código anterior y en verde después; las
   que se sumaron después de la revisión, vistas en rojo por mutación.
4. hecho: 9 mutaciones en una copia, todas en rojo: `fixed` sumando lo mandado, la lista fuera del prompt, ids que
   reusan `r1`, evidencia vacía aceptada, id con mayúscula, el aviso de no repetir, lo anotado de pasadas previas, las
   sospechas de una re-revisión intermedia y el motivo fuera del pedido. Dos sobrevivieron en su primera tanda
   (`fixed` sumando lo mandado, sospechas intermedias) y cada una sumó su caso.
5. hecho: aserción de ausencia («un bloqueante que la re-revisión no confirma no se registra como corregido»), vista en
   rojo con el código anterior, y la salida de antes y después lado a lado, arriba.
6. hecho: `ops lessons` real en un banco, antes y después, arriba; el prompt real por `claude -p` en dos
   repos; y un `/autobuild` real en un banco instalado (2026-11-13, USD 7,81) que corrió Review → Verify → QA → Commit
   con este código. Esa corrida no ejercitó la re-revisión: Review no encontró nada que corregir, y un bloqueante no
   se puede forzar en un modelo real. La re-revisión con `previous` quedó probada por partes: el recorrido con el
   arnés, la respuesta del modelo con `claude -p`.
7. hecho: lo que depende de un modelo, que la re-revisión conteste `previous`, se corrió con uno por `claude -p` sobre
   el prompt real. Lo que no se pudo provocar en el `/autobuild` real queda en «Sin probar».
8. hecho: corrieron el arnés, la sonda, `ops lessons`, `claude -p` y `/autobuild`. La prueba con modelo y el
   `/autobuild` corrieron sobre el código final; la pasada de comentarios posterior no toca código que se ejecute.
9. hecho: dos repos (corregido y sin corregir), y escenarios de una y dos vueltas con dos bloqueantes.
10. hecho: cuatro archivos de pruebas afirmaban la re-revisión sin `previous` y se actualizaron; `lessons.js` lee el
    mismo formato; ningún documento describe la re-revisión. El camino `--role review` se revisó: no cambia.
11. hecho: tres pasadas independientes. La primera dejó cuatro puntos, arreglados; la segunda, uno, arreglado; la
    tercera, nada que impida entregar. Lo que quedó está anotado arriba.
12. hecho: pasada uno por uno sobre la versión final, y el tokenizador de `test/repo/comments.test.js` a 0,22 sobre
    lo que agrega el diff. Quitó dos razones repetidas: el comentario de `fixed` transcribía el del caso 207 de
    `autobuild-refs.test.js`, a 0,44, y dos comentarios de prueba repetían el porqué del código.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.120.0, la versión abierta, con su entrada en el CHANGELOG.

El arnés no valida las respuestas contra los schemas, así que `REREVIEWED` se probó aparte contra el runtime real: un
workflow mínimo con `DECISION`, `REVIEWED` y `REREVIEWED` copiados textualmente de `autobuild.js` y un agente que
contesta con ese schema (`wf_a315749e-203`). El runtime lo aceptó y devolvió `previous` con sus dos respuestas.

**Sin probar:** la re-revisión dentro de un `/autobuild` real, porque la corrida no encontró bloqueantes y no se
pueden forzar. Tampoco la escritura de `done/` en esa corrida: `claude -p` cortó el workflow a los 10 minutos, después
de commitear. Se probó por partes: el recorrido con el arnés, la respuesta del modelo con `claude -p`, el schema contra
el runtime real y `ops lessons` en un banco.
