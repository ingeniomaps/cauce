---
caso: 346
titulo: Verify no tiene vuelta de corrección propia
estado: resuelto
resuelto-en: 0.106.0
prioridad: media
version-detectada: 0.104.1
---

# 346 — Verify no tiene vuelta de corrección propia: un criterio que aparece recién en la segunda pasada y un gate en rojo que Build corrige en un paso frenan la corrida entera

**🟢 resuelto en 0.106.0** · detectado en 0.104.1 · prioridad **media**.

**Prioridad media**: las dos formas se vieron una vez cada una, y cada una costó la corrida entera por algo
que se arreglaba en un paso. Sube a alta si alguna se repite con el 345 arreglado, porque entonces sería la
causa principal de las paradas de Verify que no son por el trabajo.

Este caso junta dos reportes de la misma tanda, que llegaron separados porque cada uno cuenta la parada que
vio: `verify-hollow` por un criterio nuevo y `verify-failed` por un error de formato. Son el mismo hueco
—el cierre de Verify no tiene con qué corregir— sobre las mismas veinte líneas, y la decisión que piden es
una sola: cuántas vueltas compra Verify y qué puede pedir en cada una. El segundo se había numerado 351 y
no llegó a publicarse.

## Resumen

Review puede devolverle a Build un hallazgo corregible y volver a revisar, hasta dos veces. Verify tiene
un solo reintento, y es angosto: cuando falta una prueba, el paso `missing-tests` escribe **las de la lista
de la primera pasada** y Verify corre de nuevo. Todo lo demás frena. De ahí salen dos paradas:

1. **Un criterio que aparece recién en la segunda pasada.** Las dos pasadas son dos veredictos
   independientes sobre la misma aceptación y nada las ata: la segunda puede devolver sin cubrir un
   criterio que la primera dio por cubierto. El recorrido para con `verify-hollow`, aunque ese criterio
   nunca se le haya pedido a `missing-tests`.
2. **Un gate en rojo que Build corrige en un paso.** Si un gate sale distinto de cero, la corrida para con
   `verify-failed`. En una corrida real lo único que falló fue el lint, por tres errores de formato en un
   archivo de pruebas que la propia tarea había agregado; todo lo demás estaba verde y cada criterio tenía
   su prueba.

## Reproducción

Ninguna de las dos se reprodujo desde un directorio vacío: dependen del veredicto de un modelo.

- Para la primera hace falta una tarea con tres condiciones o más, donde la primera pasada devuelva una
  sola en `uncovered` y la segunda no coincida.
- Para la segunda, una tarea cuyo Build deje un archivo nuevo sin pasar por el formateador, en un servicio
  cuyo lint lo exija.

## Síntoma

**Criterio nuevo en la segunda pasada.** Tarea `lint-del-script-igual-al-ci`, tres condiciones, leído del
resultado estructurado de cada pasada:

```
verify (1ª)     passed=true  uncovered=[missing-test «3. La entrada «npm run lint sin la variable da un
                verde más laxo» de docs/RIESGOS.md sale en el mismo cambio»]
missing-tests   «Escribí sólo las pruebas que faltan en lint-del-script-igual-al-ci… : 3. La entrada «npm
                run lint sin la variable da un verde más laxo» de docs/RIESGOS.md sale en el mismo cambio»
verify (2ª)     passed=true  uncovered=[missing-test «2. El script sigue sin --fix y con el mismo patrón
                de archivos: lo único que cambia es la variable»]
result          {"stopped": true, "reason": "verify-hollow", "detail": "sin test que lo codifique: 2. El
                script sigue sin --fix y con el mismo patrón de archivos: lo único que cambia es la variable"}
```

La condición 2 se podía probar, y se probó a mano después con un caso de cuatro líneas. La corrida había
gastado 8,3 millones de tokens, según el propio recorrido, y tenía tres tareas cerradas antes de parar.

**Gate en rojo corregible.** Corrida del 2026-10-08: 16 agentes, 18 minutos y 2,36 millones de tokens,
según el recorrido. Quien retomó corrió el formateador sobre el archivo y relanzó.

```
{"stopped":true,"reason":"verify-failed","detail":"No pasa: el lint de backend-auth sale con 1 por tres
errores de formato en un archivo de pruebas que la tarea agregó. Todo lo demás está verde y los cuatro
criterios tienen pruebas que los asercian.
- `src/client/service/auto-login-link-race-risk-claims.spec.ts` tiene 3 errores `prettier/prettier`
  (11:14, 17:18, 22:12). Son sólo de formato, corregibles con prettier sobre ese archivo. No lo toqué:
  corregirlo es de Build.
- Suite unitaria completa: exit 0, 52 suites y 303 pruebas. `tsc --noEmit`: exit 0. `npm run lint`: exit 1"}
```

## Causa raíz

`automatization/workflows/autobuild.js:1706-1724`, el cierre de Verify:

- `:1709-1711` — `missing-tests` recibe `lacking()` de la primera pasada.
- `:1712` — `verified` se reemplaza entero por la segunda pasada.
- `:1715` — `if (!verified.passed || !verified.commands.length) return halt('verify-failed', …)`. No hay
  vuelta: un gate en rojo frena sea cual sea.
- `:1723` — el `halt('verify-hollow')` mira `lacking()` otra vez, ya sobre el veredicto nuevo, sin comparar
  contra la lista que se mandó a cubrir. Un criterio que aparece recién ahí frena igual que uno que se
  intentó cubrir y no se pudo.
- `:1523-1530` — Review sí tiene la vuelta: `ROUNDS = 2`, con `review-fix` entre una pasada y la siguiente.

## Fix propuesto

Es una propuesta: **una** vuelta de corrección para Verify, con tope de una y con la misma disciplina que
la de Review. Lo que quede después de esa vuelta frena como hoy.

1. Guardar los criterios que se mandaron a `missing-tests`. Lo que estaba en esa lista y sigue sin cubrir
   frena; lo que aparece recién en la segunda pasada compra una vuelta de `missing-tests` sólo para eso.
2. Cuando Verify devuelve `passed=false` porque falló un gate y no porque falte cubrir un criterio, se le
   pasa a Build «corregí sólo esto» y Verify corre de nuevo.
3. Las dos comparten el tope: una tarea no compra una vuelta por cada motivo. Hay que decidir si el tope es
   una vuelta en total o una por motivo; con una por motivo el peor caso son cuatro pasadas de Verify.

Alternativa más barata para el punto 1: pasarle a la segunda pasada el `covered` de la primera, con sus
`file` y `name`, para que sólo vuelva a abrir lo que cambió.

Y un punto que hay que mirar antes de cerrar, porque es lo que arregla de verdad la segunda forma: que
Build corra el formateador del servicio antes de entregar. Es del contrato de Build y no de Verify; si se
decide hacerlo, sale como caso propio.

## Tradeoffs

- La vuelta extra son dos agentes más en el peor caso. Contra eso, la parada cuesta rehacer Review y
  Verify de la tarea al retomar.
- Si la primera pasada era la que estaba mal y la segunda tiene razón, la vuelta extra lo arregla; si la
  segunda es la que alucina un hueco, se escribe una prueba de más. No está medido cuál de las dos pasa.
- La alternativa barata ancla la segunda pasada en la primera y puede esconder una prueba que el paso
  `missing-tests` rompió al escribir la otra.
- Una vuelta ciega sobre un gate puede esconder un defecto: un lint que falla por una regla real,
  «corregido» desactivándola. La vuelta de Review tiene quien juzgue el arreglo; ésta tendría sólo el gate.
- Verify dice en su detalle si el fallo es de formato, pero es texto: para decidir sola haría falta que lo
  devolviera clasificado, y esa clasificación la haría un modelo.

## Revisión del 2026-10-09

Las citas se abrieron contra el fuente de 0.105.0 y coinciden. Dos cosas que el enunciado no decía:

- **La primera forma cuelga del 345.** En su única observación, lo que la primera pasada trajo sin cubrir
  era una condición de documento. Con el 345 arreglado esa condición no habría ido a `missing-tests` y no
  habría habido segunda pasada. El hueco existe igual —se lee en `:1712` y `:1723`—, pero no hay un segundo
  ejemplar: se arregla el 345 primero y se mira si ésta reaparece antes de construirle la vuelta.
- **La segunda forma no depende del 345**, y es la que tiene un ejemplar limpio.

Las dos conclusiones eran de lectura y la medición del cierre las dio vuelta: la primera forma tiene doce
ejemplares y la segunda, uno.

## Cierre

**Resuelto en 0.106.0**, la mitad por construcción y la mitad por decisión. Lo que aparece recién en la
segunda pasada compra una vuelta más de pruebas faltantes y una tercera pasada; el gate en rojo sigue
frenando, y se decidió con el número al lado.

Antes de construir se midió sobre los diarios de corridas de esta máquina, 302, de los que 101 tienen fase
Verify y suman 126 tareas verificadas:

```
segunda pasada                                   39
  quedó limpia                                   22
  quedó sin cubrir lo mismo que se había pedido   5
  quedó sin cubrir sólo algo nuevo                8
  quedó algo nuevo junto a algo ya pedido         4
terminó con un gate en rojo                       3
  y con todos los criterios cubiertos             1
```

«Nuevo» es un criterio que no se parece a ninguno de los mandados a `missing-tests`, comparado por palabras
con la misma regla que ya usa el recorrido para lo declarado fuera de verify. De los 17 criterios nuevos, 7
figuraban como cubiertos en la primera pasada.

**Valor**: 12 de 39 segundas pasadas paraban por algo que nunca se le pidió a nadie; la vuelta alcanza a las
8 donde lo nuevo venía solo. **Riesgo que se tomó**: una pasada más de Verify y un agente más en esas
tareas, y una prueba de más si la segunda pasada inventó el hueco.

### El recorrido de lo que este caso enumeró

- **Fix 1, guardar lo mandado y darle una vuelta a lo nuevo — se hizo.** `VERIFY_ROUNDS = 2`: la primera es
  la de siempre y la segunda es sólo para lo que apareció.
- **Fix 2, una vuelta de Build para el gate en rojo — se decidió que no.** Es 1 de 126, y la corrección
  ocurriría después de Review: código de producción cambiado que nadie revisó, juzgado sólo por el gate que
  estaba en rojo. El costo de esa parada es una corrida; el de un lint «arreglado» apagando la regla no
  tiene tope.
- **Fix 3, el tope compartido — queda sin objeto**: hay una sola clase de vuelta.
- **Alternativa, pasarle a la segunda pasada el `covered` de la primera — se decidió que no.** Ancla un
  veredicto en el otro, y 7 de los 17 criterios nuevos son justamente lo que la primera dio por cubierto.
- **«Que Build corra el formateador antes de entregar» — se miró y no sale como caso.** Es un ejemplar, y el
  formateador es del proyecto: un `AGENTS.md` que lo pida ya llega a Build por el preámbulo. Vuelve si los
  diarios muestran más de uno.
- **«Lo que estaba en la lista y sigue sin cubrir frena como hoy» — se hizo**, y también cuando viene junto
  a uno nuevo: esa prueba ya se intentó escribir, y la vuelta no la iba a salvar.
- **Tradeoff «dos agentes más en el peor caso» — se paga** sólo en las tareas que antes paraban.
- **Tradeoff «no está medido cuál de las dos pasadas se equivoca» — sigue sin medir.** La vuelta sirve en
  los dos sentidos, y en el peor queda una prueba de más.
- **Tradeoffs de la vuelta sobre el gate — no aplican**: no se construyó.

### Lo que este caso encontró y no preveía

La revisión del 2026-10-09, más arriba, decía que la primera forma colgaba del 345 y que la que tenía un
ejemplar limpio era la segunda. Los diarios dicen lo contrario, y sin medirlos se habría construido la vuelta
del gate y dejado la otra para después.

### Lo que encontró la revisión independiente

Un subagente revisó el diff sin partir de que estaba bien, con sondas sobre el arnés. De este caso, dos cosas:

- **Un criterio `ambiguous` que aparecía recién en la segunda pasada compraba la vuelta**, y a Build se le
  pedía una prueba para algo que no dice qué aserciar. Corregido: la vuelta extra la compra sólo
  `missing-test`; lo demás frena como en 0.105.0. Con su prueba y su mutación en rojo.
- **La vuelta no alcanza al criterio nuevo que se parece a uno ya pedido.** «El alta rechaza un email vacío»
  después de haber pedido «el alta rechaza un duplicado» comparte dos palabras de tres y se toma por el
  mismo: frena sin vuelta, que es la conducta anterior y no una regresión. Queda así: el error barato es
  éste, y bajar el umbral manda a reescribir pruebas que ya se intentaron.

### Qué se corrió

- La medición de arriba: un guion que recorre cada `journal.jsonl`, agrupa las pasadas de Verify por tarea y
  compara lo que quedó sin cubrir contra lo que se había pedido.
- La corrida real que originó el caso, en el arnés y con sus textos: primera pasada con la condición 3,
  segunda con la 2. Antes del cambio, `verify-hollow`; después, una segunda vuelta que pide sólo la 2 y la
  tarea sigue.
- Cinco mutaciones en `test/workflows/autobuild-verify-rounds.test.js`. Cuatro en rojo a la primera: el tope
  en uno, lo ya pedido que compra vuelta, la vuelta que pide todo en vez de lo nuevo. La del tope en 99
  sobrevivió: el criterio «nuevo» del caso se parecía a uno ya pedido, así que frenaba por eso y no por el
  tope. Se cambió el criterio y se puso en rojo.
- Regresión: `test/workflows/autobuild-surface.test.js`, que fija la parada cuando lo pedido sigue faltando.

Lo que no se corrió: una corrida real donde dos pasadas no coincidan. Depende del veredicto de un modelo y no
se puede provocar; lo que hay es el diario de las que ya pasó. En la corrida de punta a punta del 2026-10-09
Verify cerró en una sola pasada, así que la vuelta tampoco se ejerció ahí.

### Lo que encontró la revisión del conjunto (2026-10-09)

La revisión del diff entero de la rama, antes del PR. Dos hallazgos sobre el bucle:

- **Un criterio ambiguo que aparecía en la segunda pasada paraba como `verify-hollow`**, «sin test que lo
  codifique», y la acción humana pedía una prueba donde hacía falta una definición. Ahora para como el de la
  primera pasada, `acceptance-ambiguous`, salvo que la pasada haya salido en rojo, que manda. Dos mutaciones
  en rojo: sin releer la causa después del bucle, y releyéndola aunque la pasada esté en rojo.
- **«Ya se pidió» se decide por palabras, y dos criterios casi gemelos se confunden** —«devuelve 404 cuando
  falta el usuario» y «devuelve 403 cuando falta el permiso»—: el segundo no compra su vuelta. **Se decidió
  que no se cambia.** Verify reescribe el criterio entre pasadas, así que una comparación exacta dejaría de
  reconocer el mismo; y el error cae del lado que frena y pregunta, que es lo que la corrida hacía siempre
  antes de este caso. Cuántas veces pasa se midió después, más abajo: ninguna.

### Corrida real del criterio ambiguo en la segunda pasada (2026-10-09)

Una corrida entera de `/autobuild` sobre un banco con la instancia y el producto al lado, el motor congelado
en el commit de la rama y el runner instalado. La aceptación traía dos condiciones: una conducta, y «responde
en un tiempo razonable con números grandes».

**El veredicto de Verify estaba guionado, y hay que decirlo**: con agentes reales no hay forma de forzar que
la causa cambie entre pasadas, así que el banco traía una regla de proyecto que mandaba informar ese criterio
como `missing-test` mientras su prueba no existiera y como `ambiguous` después. Lo demás fue real: el
recorrido, los agentes, lo que se escribió y dónde paró.

```
Verify|verify         uncovered: criterio 2, missing-test
Verify|missing-tests  escribe app/test/tiempo.test.js
Verify|verify         uncovered: criterio 2, ambiguous
Verify|verify-human   → human/<tarea>.md
parada: acceptance-ambiguous
```

Antes del arreglo esa secuencia paraba como `verify-hollow`, «sin test que lo codifique». La acción humana que
quedó escrita pide lo que corresponde: qué magnitud cuenta como «números grandes», qué cota es «razonable», o
si el criterio se retira. No pide una prueba. `check` pasó sobre lo que dejó, `ops human` muestra la fila y
el bloqueo quedó commiteado. Nueve minutos.

### El límite de «ya se pidió», medido (2026-10-09)

Había quedado dicho sin medir que la comparación por palabras puede juntar dos criterios casi gemelos. Contado
en los diarios de corridas de esta máquina: 318 diarios, 108 corridas con Verify, 69 segundas pasadas, 18 con
criterios sin cubrir en las dos. En ésas la comparación juntó 13 pares. Nueve son el mismo texto; los otros
cuatro se leyeron uno por uno y son el mismo criterio reescrito o una parte suya —el mismo número de
condición, la misma cita recortada—. **Ninguno junta dos criterios distintos.** El caso de los gemelos sigue
siendo posible y no apareció ninguna vez.

### Lo que encontró la segunda revisión del conjunto (2026-10-09)

Un hallazgo: **las dos pasadas no contestaban lo mismo.** La primera para por un criterio ambiguo antes de
mirar si los gates pasaron; la segunda sólo lo hacía con los gates en verde, y con un criterio ambiguo y los
gates en rojo terminaba en `verify-failed`, sin pregunta para nadie. Se había escrito así a propósito —«con
la pasada en rojo manda el rojo»— y estaba mal: lo que falta sigue siendo la definición. Ahora las dos paran
igual. La prueba fija también la primera pasada, y la mutación que restituye la condición está en rojo.

### Lo que encontró la tercera revisión (2026-10-09)

Un hallazgo: al parar por un criterio ambiguo con los gates en rojo se perdía el detalle de los gates, y
quien definía el criterio se enteraba del rojo recién al relanzar. La parada sigue siendo
`acceptance-ambiguous`, en las dos pasadas, y ahora dice además que los gates no pasaron y con qué. Con los
gates en verde no agrega nada. Mutación en rojo.

## Contexto de descubrimiento

Instancia `acme-ops`, la misma tanda del
[345](./345-una-condicion-que-se-cumple-en-un-documento-va-a-missing-test-si-el-diff-toca-codigo.md), el
2026-10-08 con 0.104.1 y 0.105.0, sobre un servicio NestJS con `prettier` dentro del lint. La primera forma
se leyó al principio como «el paso de pruebas faltantes no cubre todas las condiciones»; los registros
muestran que cubrió la única que le pidieron. La segunda es una de las tres paradas de dos días que no eran
por el trabajo; las otras son el 345 y el 350.

## Relacionados

- [345](./345-una-condicion-que-se-cumple-en-un-documento-va-a-missing-test-si-el-diff-toca-codigo.md) —
  la condición que la primera pasada sí trajo era de las de ese caso. Va antes.
- [343](./343-una-segunda-revision-con-condiciones-para-el-recorrido-con-review-failed.md) — la vuelta de
  corrección de Review, que es el molde de lo que se propone.
- [289](./289-una-parada-que-no-registra-fila-deja-planning-sin-commitear.md) — nombra `verify-hollow` como
  la parada real que no registraba fila.
- [350](./350-edge-unproven-frena-cuando-el-borde-nombra-su-salida-y-el-rojo-lleva-un-parentesis-en-el-medio.md)
  — otra parada de la misma tanda por algo que no era el trabajo.
