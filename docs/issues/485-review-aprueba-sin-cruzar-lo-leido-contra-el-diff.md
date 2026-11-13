---
caso: 485
titulo: Review aprueba con consulted no vacío, sin cruzarlo contra los archivos que el diff toca
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 485 — Review aprueba con consulted no vacío, sin cruzarlo contra los archivos que el diff toca

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: R14 pide cruzar lo consultado contra lo afirmado, y el motor sólo comprueba que la lista no esté vacía. La frecuencia en Cauce no está medida.

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

## Cierre

Review recibe la lista exacta de archivos que toca el diff y contesta en `opened`, un campo nuevo, cuáles abrió. El
motor resta como conjuntos: si falta alguno, Review tiene una pasada más sobre esos archivos, que se suma a la primera,
y si siguen faltando la corrida para con `review-unbacked` y la lista. La lista la saca un clerk:
`git status --porcelain` en el árbol, o `git show --name-status` de los commits cuando revisa otra sesión. Se resta lo
que ya estaba sin commitear antes de Build, y lo que el proyecto declara en `reviewExempt`.

La sonda del caso, antes y después:

```
antes:   RESULT done:T-1            LLEGO A VERIFY: true   REVIEWS: 1
después: RESULT review-unbacked :: aprobó sin declarar que abrió api/alta.go, que el diff toca
                                    LLEGO A VERIFY: false  REVIEWS: 2
```

La prueba con modelo: el prompt real de la primera Review, sacado del arnés, por `claude -p` en un repo con
`api/alta.go` modificado. Devolvió `"opened": ["api/alta.go"]`, escrito igual que la lista, a USD 0,32.

Y un `/autobuild` real en un banco `sidecar` instalado, con el motor congelado (2026-11-13, USD 7,81). La tarea cambió
`src/venta.js` y su prueba. La foto de antes de Build devolvió `files: []`, el clerk del diff
`["src/venta.js", "test/venta.test.js"]`, y Review contestó `opened` con exactamente esos dos. El cruce dio cero
faltantes, sin pasada de más, y la corrida siguió por Verify, QA y Commit.

La conducta, con el caso nuevo `flows/system/change-review/evaluations/cases/10-el-pr-de-renombres`: un PR de siete
archivos presentado como «sólo renombres», con un `total > 0` que pasa a `total >= 0` en uno. **Pasa.** El recorrido
encontró el cambio, dijo por qué el verde no lo muestra, nombró los siete archivos y no aprobó. Costó 1,43M tokens.

Contra el caso:

- **Fix 1, el cruce en el motor:** se hizo distinto, con la razón. El caso proponía cruzar `consulted` contra
  `git diff --name-only`. La primera versión hizo eso, leyendo las rutas de la prosa de `consulted`, y la revisión
  independiente le encontró falsos positivos y negativos en cada vuelta: `--stat`, `HEAD:archivo`, `origin/main`,
  backticks, rutas con espacios. Es lo que el 464 pagó con ocho revisiones, así que se cambió el protocolo y no la
  heurística. Review recibe la lista y contesta `opened`, y `consulted` sigue siendo el manifiesto libre de siempre.
- **Fix 1, relanzar una vez:** se hizo, como una pasada que se **suma** a la primera. La primera versión la reemplazaba,
  y la revisión mostró que así se perdía un `bloqueado`, las decisiones de la primera pasada y las condiciones de la
  crítica.
- **Fix 2, el caso de eval:** se hizo y pasó, arriba.
- **Tradeoff, los generados:** decidido por quien firma (2026-11-13) con una lista declarable ya. La llave nueva es
  `reviewExempt`, con patrones glob; `validate` rechaza un patrón vacío y uno que casa con todo.
- **Tradeoff, el cruce es por nombre:** sigue igual, y ahora con una forma más débil que conviene decir. `opened` lo
  declara el propio revisor, y como recibe la lista, copiarla entera pasa el cruce sin abrir nada. El motor exige la
  declaración, no la lectura. Lo que sí cambió es que omitir un archivo ahora es una omisión explícita y no un
  silencio.
- **Tradeoff, una pasada más:** cuesta una pasada, sólo sobre lo que faltó.

Encontrado y no previsto:

- **Con `runner.commitPerTask` apagado**, el árbol trae el diff de las tareas anteriores de la corrida. Antes de Build se
  saca una foto de lo que ya estaba sin commitear y se resta. No se saca al retomar, porque el árbol ya tiene el trabajo
  de esta tarea.
- **El arnés devuelve un diff vacío por defecto**, para que las pruebas de `autobuild` que no miden esto no tengan que
  contestar `opened`. El cruce lo ejerce `test/workflows/autobuild-review-coverage.test.js`.
- **El caso 498 tiene que clasificar `reviewExempt`:** es una llave que afloja (agregar un patrón saca archivos de la
  revisión) y nace sin protección, como las que ese caso enumera.
- **Anotado, sin caso:**
  - Una tarea que vuelve a tocar un archivo que una anterior dejó sucio lo pierde en la resta.
  - Con `--role review` sin hash no hay foto.
  - La re-revisión del 484 no cruza los archivos que la corrección agrega.
  - El glob del recorrido y `path.matchesGlob` difieren en `***`, `{a,b}` y `[ab]`. Nadie los escribe haciendo su
    trabajo.

### Lista de cierre

1. hecho: la sonda del caso (`done:T-1`, una Review) y 312/312 en las pruebas de workflows, antes de tocar el código.
2. hecho: la misma rama que el 484, `fix/484-re-review-checks-what-it-asked`, a pedido.
3. hecho: `test/workflows/autobuild-review-coverage.test.js` y las pruebas de `reviewExempt` en
   `test/planning/contract.test.js`, en rojo con el código anterior y en verde después.
4. hecho: mutaciones en una copia, todas en rojo: cruce contra `consulted` en vez de `opened`, `opened` sin limpiar,
   la lista fuera del prompt, la pasada de más reemplazando a la primera, sin restar lo previo, la foto al retomar,
   ignorar `reviewExempt`, el glob sin carpeta, `validate` aceptando vacío o «todo» y el contrato sin la llave.
5. hecho: la sonda antes y después, lado a lado arriba. La aserción de ausencia es que la tarea ya no llega a Verify,
   vista en rojo con el código anterior.
6. hecho: el `/autobuild` real en un banco instalado, que pasó por la foto, el clerk del diff y el cruce con el código
   final; el prompt real por `claude -p`; y el recorrido real de `change-review` con `flow-eval`. La corrida real tuvo
   un revisor que abrió todo, así que no ejercitó la pasada de más: ésa la cubren el arnés y el caso de eval.
7. hecho: lo que depende de un modelo, que Review llene `opened` con las rutas de la lista, se corrió con uno en el
   `/autobuild` y en `claude -p`.
8. hecho: arnés, sonda, `claude -p`, `flow-eval` y `/autobuild`, sobre el código final. La pasada de comentarios
   posterior no toca código que se ejecute.
9. hecho: diffs de uno, dos y tres archivos; los dos caminos (árbol y commits de otra sesión); con y sin foto previa.
10. hecho: cuatro pruebas de `autobuild` asumían el primer paso de Review o la lista de pasos de oficina y se
    ajustaron. `validate`, el schema y `contract` llevan la llave. El 498 la tiene que clasificar.
11. hecho: cinco pasadas independientes. La primera y la segunda encontraron defectos que impedían entregar, y
    obligaron al rediseño de arriba; la tercera, la cuarta y la quinta, nada que impida entregar. Lo menor quedó
    anotado.
12. hecho: pasada uno por uno sobre la versión final, y el tokenizador de `test/repo/comments.test.js` a 0,22 sobre
    lo que agrega el diff. Quitó cinco razones repetidas: la de «conjuntos y no prosa» estaba en tres lugares, el
    comentario de `DIFFED` repetía el del clerk, y tres comentarios de prueba transcribían el código.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.120.0, la versión abierta, con su entrada en el CHANGELOG.

**Sin probar:** la pasada de más dentro de un `/autobuild` real, porque el revisor real abrió todo y una omisión no
se puede forzar; y la resta de la foto con un árbol sucio de verdad. Tampoco Done en esa corrida: `claude -p` cortó el
workflow a los 10 minutos, después de commitear. Se probó por partes: el recorrido con el arnés, `opened` con
`claude -p` y la conducta con `flow-eval`.
