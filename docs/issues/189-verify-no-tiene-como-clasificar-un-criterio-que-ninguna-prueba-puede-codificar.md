---
caso: 189
titulo: Verify no tiene cómo clasificar un criterio que ninguna prueba puede codificar, así que una tarea de decisión no se puede cerrar
estado: resuelto
resuelto-en: 0.99.0
prioridad: alta
version-detectada: 0.98.0
---

# 189 — La tarea cuyo entregable es una decisión escrita muere en Verify

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **alta**. El contrato de DONE acepta `tests: n/a — razón`; el
recorrido no tiene por dónde emitirlo, así que para siempre.

## Resumen

Verify contrasta cada criterio de aceptación contra las aserciones de los tests y pone en `uncovered` el que
ninguno codifica. Su esquema admite **dos** causas: `missing-test` —el test falta o no asercia la propiedad— y
`ambiguous` —el criterio no dice qué habría que aserciar—. Falta la tercera: **el criterio no tiene superficie
ejecutable**.

Con eso, una tarea cuyo entregable es una decisión escrita —un ADR, una política, un inventario de esquema— no
se puede cerrar. `ambiguous` no aplica, porque el criterio dice con toda precisión qué tiene que quedar escrito;
así que cae en `missing-test`, el recorrido manda a escribir «las pruebas que faltan», el agente no puede
escribir ninguna que no sea una tautología sobre el texto del documento, la segunda pasada vuelve a reportar el
mismo criterio y la corrida termina en `verify-hollow`.

El contrato de una entrada de DONE ya contempla exactamente este caso: «`tests:` … usa `n/a — razón` si no
existe una superficie ejecutable». O sea que el protocolo sabe que estas tareas existen y el recorrido no.

## Reproducción

Con una tarea cuya aceptación pide un documento y ningún cambio de código:

1. Promover una tarea así. La observada: «queda escrito en `api/docs/` qué destino tiene cada una de las cuatro
   tablas muertas del catálogo y la columna viva que las apunta: un veredicto del vocabulario cerrado
   revivir|absorber|borrar por elemento, con su razón … sin cambio de código, `make test` y `make lint` siguen
   verdes».
2. `/autobuild`. Build escribe el documento; Review lo aprueba; los gates del servicio salen en verde.
3. Verify: el diff no trae un solo `_test.go`, así que sus tres criterios van a `uncovered`.
4. El recorrido pide «escribí sólo las pruebas que faltan», y la segunda pasada devuelve lo mismo.

### Sin agentes, con el arnés de fases

El recorrido se puede correr entero con los subagentes simulados: `test/support/autobuild-harness.js`
(`runFlow`) ejecuta el `autobuild.js` renderizado con cada respuesta guionada. El guion que reproduce la
corrida real cambia cuatro piezas del camino feliz —aceptación de sólo documento, plan que toca
`api/docs/adr/003-legacy.md`, Build con `redFirst: []` y Verify que devuelve los tres criterios como
`missing-test` con `make test` y `make lint` en 0— y deja el resto como está. El script vive fuera del
repositorio (`<scratchpad>/189/repro.js`, 2026-09-23, Node 24) y se corre con `node repro.js`:

```
result: {"stopped":true,"reason":"verify-hollow","detail":"sin test que lo codifique: Queda escrito en api/docs/ el
destino de cada tabla; La decisión nombra la estructura canónica; la tarea siguiente no puede crear un modelo
paralelo"}
verify turns: 2
asked in Verify: [ 'Verify|verify', 'Verify|missing-tests', 'Verify|verify' ]
missing-tests prompt: …Escribí sólo las pruebas que faltan en T-1, con el mismo rojo previo, y no toques el
código de producción: Queda escrito en api/docs/ …
reached Done: false
exit=0
```

Tres cosas que esto establece y la corrida real sólo sugería: Build con `redFirst` vacío **no** frena
(llega a Review y a Verify); el rebote gasta exactamente un agente (`missing-tests`) más una segunda pasada
de Verify; y la parada es la misma cadena que la de `wf_d9cca829-812`. Lo que el arnés no puede decir es
qué contesta un Verify real ante un ADR —si elige `missing-test` o `ambiguous`—: eso lo afirma la corrida
real y no esta reproducción. `test/workflows/autobuild-evidence.test.js:99` ya fija la misma parada con un
criterio de código; ningún caso la ejerce con un diff sin superficie ejecutable.

## Síntoma

Parada real, corrida `wf_d9cca829-812` del 2026-09-23 (Cauce 0.98.0):

```
{"stopped":true,"reason":"verify-hollow","detail":"sin test que lo codifique: Queda escrito en `api/docs/`
qué destino tiene cada una de las cuatro tablas muertas …; La decisión nombra cuál estructura sostiene el
ítem canónico y cuáles quedan fuera …; «...de modo que la tarea siguiente no pueda crear un modelo
paralelo con dos verdades sobre precio y existencia»."}
```

Lo que había en disco en ese momento: `docs/adr/003-*.md` escrito y aprobado por dos revisores, `make test`
exit 0 y `make lint` exit 0. El WIP queda con sus once pasos tildados y la tarea reclamada: todo el trabajo
hecho y ninguna forma de cerrarlo por el recorrido.

## Causa raíz

Contrastado contra el fuente el 2026-09-23 (`main` en `83fc8698`, Cauce 0.98.0):

- **`automatization/workflows/autobuild.js:192-213`, esquema `VERIFY`**: `uncovered[].cause` en la línea
  203 es `enum: ['missing-test', 'ambiguous']`. El comentario de 196-198 declara el diseño en dos causas
  «que piden cosas opuestas»: la tercera no está ni descartada, no se pensó.
- **El prompt de Verify, `autobuild.js:1086-1101` (`VERIFY_ASK`)**: pide abrir «el fuente de los tests que
  la tarea agregó o cambió» y contrastar «cada criterio de aceptación contra sus aserciones», con las dos
  causas definidas en 1089-1090. No hay salida para un criterio cuyo entregable no se ejecuta.
- **El despacho, `autobuild.js:1109-1131`**: `ambiguous` va a HUMAN_ACTIONS y para con
  `acceptance-ambiguous` (1109-1114); cualquier otro `uncovered` dispara el rebote `label: 'missing-tests'`
  (1117-1119), que pide «escribí sólo las pruebas que faltan … con el mismo rojo previo, y no toques el
  código de producción» sin mirar qué produjo la tarea; la segunda pasada (1120) y, si sigue habiendo
  `uncovered`, `stop('verify-hollow', …)` en 1130-1131. La condición de 1130 es `uncovered.length`, sin
  distinguir causa.
- **El cierre, `autobuild.js:1162-1171` (fase Done)**: el agente de Done recibe como hechos `lane`,
  `review`, `fases`, `build`, `verify=${JSON.stringify(verified.commands)}`, `qa` y `commit`. **No recibe
  `uncovered` ni ningún mapeo criterio → prueba**, así que aunque el recorrido llegara hasta ahí, hoy no hay
  un hecho del que el `tests: n/a — razón` pueda salir: el agente lo tendría que deducir solo.
- **El contrato, `template/planning/PROTOCOL.md:29-31`**: «`tests:` enlaza cada criterio mediante
  `CN → prueba`; usa `A → prueba` cuando no hay épica o `n/a — razón` si no existe una superficie
  ejecutable». `check` lo acepta: `validateDoneEntry` (`engine/planning/contracts.js:62-73`) con
  `tests: 'n/a — el entregable es un ADR, sin superficie ejecutable'` y la historia citando `C1` devuelve
  `[]` — comprobado con `node -e` sobre ese módulo; el cruce de criterios citados de 70-73 sólo corre si
  hay trazas, y `n/a` no produce ninguna (`engine/core/evidence.js:56-57` lo dice del mismo modo).

O sea: el destino existe y pasa la puerta; lo que falta es el camino desde Verify hasta él.

## Fix propuesto

1. **Una tercera causa, `no-surface`**, en el esquema y en el prompt: el criterio se cumple en un artefacto que
   no se ejecuta —un documento, una decisión, un inventario— y por eso ninguna prueba lo codifica.

   ```diff
   -cause: { enum: ['missing-test', 'ambiguous'] },
   +cause: { enum: ['missing-test', 'ambiguous', 'no-surface'] },
   ```

2. **`no-surface` no frena: viaja.** Los criterios así marcados llegan al paso Done y se escriben en la entrada
   como `tests: n/a — <razón>`, que es la forma que el contrato ya define. La corrida sigue.

3. **Y no se cree sola.** `no-surface` sólo se acepta si el diff de la tarea no toca ningún archivo ejecutable;
   con código en el diff, un criterio sin test sigue siendo `missing-test`. La comprobación es determinista
   —`git diff --name-only` contra el árbol del servicio— y no la decide el modelo que quiere cerrar.

4. **El pedido de escribir las pruebas faltantes se saltea** cuando todos los `uncovered` son `no-surface`: hoy
   gasta un agente en una tarea imposible antes de parar.

### Lo que el fix, tal como está, no cierra

Revisado contra el fuente el 2026-09-23. Los cuatro puntos van en la dirección correcta; tres tienen huecos.

- **Punto 2 necesita un hecho nuevo en Done, no sólo que la corrida siga.** Done arma la entrada con un
  prompt de escritura (`autobuild.js:1163-1171`) cuyos hechos no traen `uncovered` (ver Causa raíz). Hay
  que pasarle los criterios `no-surface` con su razón —p. ej. `sin-superficie=${JSON.stringify(...)}`—
  para que `tests:` no salga de memoria. Y el despacho de 1130 tiene que filtrar por causa
  (`uncovered.filter((e) => e.cause !== 'no-surface')`), no sólo el esquema.
- **Punto 3 no es implementable en el workflow tal como está escrito.** El script corre sin shell: el
  runtime le inyecta `agent, phase, log, parallel, pipeline, workflow, args, budget` y nada más
  (`test/support/workflow.js:18`, que monta el archivo con la misma firma que el runner). Todo lo que
  «mira el diff» en `autobuild` lo hace un agente —Review en 986, Commit en 1153—, así que «determinista y
  no lo decide el modelo» exige que la comprobación viva en el motor (un subcomando de `ops` o un guard),
  no en el recorrido. Tampoco sabe el árbol: `task.service` es la ruta que declara la línea del BACKLOG, y
  qué repositorio git es dueño de ese servicio lo averigua el agente de Commit (1153, «Encontrá el
  repositorio git dueño de…»).
- **Y `git diff --name-only` no ve lo que una tarea de decisión produce.** En Verify nada está commiteado
  todavía (Commit corre después, 1151), y el entregable típico es un archivo **nuevo**. Comprobado en un
  repositorio desechable con git 2.43.0: con `docs/003.md` recién creado y sin stagear, `git diff
  --name-only` devuelve vacío (exit 0) y `git status --porcelain` devuelve `?? docs/`. La consecuencia es
  peor que un falso negativo: un `.go` nuevo sin stagear tampoco aparece, así que la puerta aceptaría
  `no-surface` sobre una tarea con código nuevo. Lo que hace falta es `git status --porcelain
  --untracked-files=all` (o diff contra `HEAD` más los no rastreados), acotado a la ruta del servicio.
- **«Ejecutable» no está definido, y la lista a favor falla abierta.** Un `.sql` de migración, un
  workflow de CI en YAML, un `Dockerfile`, un `.json` de configuración o un `Makefile` se ejecutan sin ser
  «código» en sentido estricto. Una lista de extensiones ejecutables deja afuera todo lo que venga después
  (R27). Lo que cierra por defecto es lo inverso: `no-surface` se admite sólo si **todos** los archivos
  cambiados están en una lista corta de no ejecutables declarada en un solo lugar (`.md`, `.txt`, `.adoc`,
  quizás imágenes), y cualquier otra extensión lo vuelve `missing-test`.
- **Punto 4 es correcto pero incompleto con causas mezcladas.** Si una tarea trae un criterio
  `missing-test` y otro `no-surface`, el rebote de 1117-1119 tiene que listar sólo los primeros; hoy lista
  todo `uncovered`.
- **La pared siguiente es QA, y no está medida.** Con el fix, una tarea `lite` o `full` pasa a QA
  (`autobuild.js:1137-1149`), cuyo prompt pide «ejercitá el comportamiento real» o «la comprobación de
  aceptación real más barata» y para en `qa-failed` si `passed` es falso. Qué contesta un QA real ante un
  ADR es **hipótesis**: no se puede establecer sin lanzar un agente. En el arnés pasa porque el guion lo
  contesta. Hay que decidir si `no-surface` en todos los criterios también saltea QA o le cambia el pedido.

### Decisiones para el dueño

1. **Dónde vive la comprobación determinista del punto 3.** Opciones: (a) un subcomando de `ops` que un
   agente corre y cuya salida el recorrido lee con schema —sigue pasando por un modelo, pero la cuenta la
   hace el motor—; (b) la puerta a posteriori en `check`: una entrada de DONE con `tests: n/a` cuyo
   `commit:` toca archivos fuera de la lista no ejecutable es un error; (c) confiar en el agente de Verify.
   **Recomendación**: (b) como puerta real —es la única que no depende de lo que un agente relate, y
   `check` ya corre en Closing (1184-1186, aunque ahí lo lanza un agente) y lo corre también el guard
   `planning-drift` (`autobuild.js:388` lo nombra), fuera de todo agente— más la lista de no ejecutables en el prompt de Verify como guía.
   (c) es lo que el tradeoff de abajo dice que no hay que hacer.
2. **Qué cuenta como no ejecutable.** **Recomendación**: lista cerrada y chica (`.md`, `.txt`, `.adoc`),
   todo lo demás es superficie; ampliarla es un cambio declarado con su razón (R27).
3. **Qué hace QA con una tarea toda `no-surface`.** **Recomendación**: no saltearla en silencio; pedirle
   que compruebe que el documento existe y cubre los elementos que la aceptación enumera, y registrar eso
   en `qa:`. Es una decisión porque cambia qué significa QA en el protocolo.

## Tradeoffs

- **Una causa más es una escapatoria más.** Por eso el punto 3: lo que la habilita es el diff, no la palabra
  del agente. Sin esa puerta, `no-surface` se convierte en la forma barata de cerrar cualquier tarea sin tests.
- **La aceptación de una tarea de decisión sigue sin poder comprobarse automáticamente.** Es verdad y es el
  límite del caso: lo que se pide acá es que la corrida lo **declare** en la evidencia, no que lo simule con
  una prueba que lea el documento y afirme que dice lo que dice.
- **Alguien puede querer justamente esa prueba** —un test que verifique que un ADR nombra los cinco elementos—.
  Sigue siendo posible escribirla; lo que cambia es que deja de ser obligatoria para poder cerrar.

## Prioridad

Alta. No es un borde: el hito `catalog-item` de una instancia real arranca con una tarea de decisión, y la
misma forma aparece cada vez que una épica pide decidir antes de construir —que es lo que el propio protocolo
recomienda—. Hoy toda esa familia termina cerrándose a mano, y cerrar a mano es donde se pierden los campos
que nadie vuelve a mirar.

## Contexto de descubrimiento

Instancia `gouduet-ops` (Cauce 0.98.0), corrida `wf_d9cca829-812`, tarea `catalog-item-legacy-model-decision`,
primera del hito `catalog-item`. La tarea existe porque una crítica anterior partió una unidad más grande y
separó «decidir el destino del modelo viejo» de «crear la tabla»: la partición fue correcta y produjo,
justamente, una tarea que el recorrido no puede cerrar. Se cerró a mano, con `tests: n/a` y su razón.

## Relacionados

- **180**: la otra parada de la misma corrida. Aquélla dejaba seguir de más; ésta no deja seguir de menos.
- El contrato de DONE en `template/planning/PROTOCOL.md:29-31` (en una instancia, `planning/PROTOCOL.md`),
  que ya define `tests: n/a — razón` y es la forma que este caso pide poder emitir.
- **140** y la salida `(fuera de verify: <razón>)`: `check` la reconoce en una condición
  (`engine/planning/contracts.js:174` y 193-205) pero **el prompt de Verify no la menciona** —`grep -rn
  "fuera de verify" automatization/` no devuelve nada—, así que una condición marcada así llega igual a
  Verify y puede terminar en `uncovered`. Es otro defecto, con otra causa, y no se arregla con
  `no-surface`. Abierto como **195**, que además explica por qué la marca no alcanza como salida para
  este caso.
- Hallazgo lateral, también candidato a caso propio: en el camino feliz Done tampoco recibe el mapeo
  criterio → prueba (`autobuild.js:1167-1170` sólo pasa `verified.commands`), así que el `tests: CN →
  prueba` de toda entrada escrita por el recorrido lo compone el agente de Done sin un hecho que lo
  respalde. `engine/core/evidence.js` contrasta después que el artefacto exista, no de dónde salió.

## Cierre

**Resuelto en 0.99.0, con la puerta determinista en `check` (decisión 1b del dueño) y no en el recorrido.**
Recorriendo lo que enumeró:

- **Fix 1, tercera causa `no-surface` → se hizo** en el esquema `VERIFY` (con `reason`) y en `VERIFY_ASK`, que
  la define y le pasa a Verify la lista de no ejecutables como guía: con cualquier otro archivo en el diff es
  `missing-test`.
- **Fix 2, `no-surface` no frena y viaja → se hizo.** El rebote y el `verify-hollow` miran
  `uncovered.filter((e) => e.cause !== 'no-surface')` —por exclusión, para que una causa desconocida siga
  frenando (R27)—. Done recibe `sin-superficie=[{criterion, reason}]` y la instrucción de escribirlos como
  `tests: n/a — <razón>`.
- **Fix 3, «no se cree sola» → se hizo distinto: en `check`, sobre el commit.** El recorrido no tiene shell
  (lo decía el propio caso), así que la comprobación vive en el motor: `surfaceWithoutTests`
  (`engine/planning/contracts.js`) juzga, y `commitFiles` (`engine/core/repos.js`) lista con
  `git diff-tree --root` los archivos del sha que nombra `commit:`, buscado en los repositorios de
  `workspaceRoots` —la entrada no dice de cuál es—. Una entrada cuyo `tests:` es todo `n/a` y cuyo commit
  toca algo fuera de `.md`, `.txt`, `.adoc` es **error**. Mirar el commit y no el árbol de Verify esquiva el
  hueco de `git diff --name-only` con archivos nuevos: el commit ya los contiene.
- **Fix 4, saltear el rebote cuando todo es `no-surface` → se hizo.**
- **«Punto 2 necesita un hecho nuevo en Done» → se hizo** (`sin-superficie=`), y el despacho filtra por causa.
- **«Punto 3 no es implementable en el workflow» → confirmado**, y por eso la puerta es de `check`. Corre en
  Closing (`autobuild` para en `planning-check-failed` si sale en rojo, aunque ahí lo lanza un agente) y en el
  guard `planning-drift`, fuera de todo agente.
- **«`git diff --name-only` no ve lo que una tarea de decisión produce» → cerrado por construcción**: se lee
  el commit, no el árbol sin commitear.
- **«Ejecutable no está definido» → lista cerrada** `NON_EXECUTABLE = ['.md', '.txt', '.adoc']`, en un solo
  lugar (`automatization/shared/acceptance.js`) con su razón; la misma la leen `check` y el prompt de Verify.
  Un `Makefile` sin extensión cuenta como superficie, y hay prueba de eso.
- **«Punto 4 incompleto con causas mezcladas» → se hizo**: el rebote lista sólo lo que no es `no-surface`.
- **«La pared siguiente es QA» → decidido (3 del dueño) y hecho**: con todos los criterios `no-surface` y
  ninguno cubierto, QA no se saltea; se le pide comprobar que el documento existe y cubre cada elemento que
  la aceptación enumera, y eso queda en `qa:`. Qué contesta un QA real ante ese pedido **no está medido**:
  pide lanzar un agente.
- **Decisiones 1, 2 y 3 → tomadas por el dueño** como recomendaba el caso; ver arriba.
- **Tradeoff «una causa más es una escapatoria más» → acotado por la puerta, con dos bordes declarados.**
  (a) La puerta juzga el `n/a` **entero**: en una entrada mixta (`A → prueba; n/a — …`) el código del commit
  es el de los criterios probados y no dice nada del otro, así que ahí un `no-surface` falso no se ve. Juzgar
  también el mixto haría imposible la tarea mixta que el recorrido ahora deja cerrar. (b) Calla si ningún
  repositorio conoce el sha, como el resto de lo que `check` pregunta a git. Qué lista `diff-tree` sobre un
  commit de merge no se comprobó: ninguna prueba lo ejerce.
- **Tradeoffs 2 y 3** (la aceptación de decisión sigue sin comprobarse sola; la prueba que lee el ADR sigue
  siendo posible y deja de ser obligatoria) → quedan como estaban: el arreglo los declara, no los cambia.
- **Hallazgo lateral, Done compone `tests: CN → prueba` sin hecho → se hizo acá** (fold-in pedido por el
  dueño): `VERIFY` exige `covered: [{criterion, test}]` y Done lo recibe como `cubiertos=`. Sigue siendo la
  palabra de Verify; `ops evidence` contrasta después que el artefacto exista.
- **Relacionado 195 → resuelto aparte**, en el mismo cambio; la marca no se estiró para cubrir esto.

**Lo que el caso no preveía: la puerta nueva puede poner en rojo historia vieja.** Una instancia que cerró a
mano tareas con código y `tests: n/a` antes de 0.99.0 recibe el error en su próximo `check`. Lo adoptado
(`.adoption-baseline`) queda exento, pero ese baseline se genera una sola vez, así que no sirve de salida
para una instancia que ya lo tiene. Se resolvió al integrarlo, en el párrafo siguiente.

**Decidido al integrarlo: la puerta rige desde el 2026-09-24.** Una instancia que ya cerró tareas con código y
`tests: n/a` habría visto `check` en rojo con el `upgrade`, y con él el guard que lo corre antes de cada commit,
por entradas que no violaron nada cuando se escribieron y que no se pueden corregir sin reescribir evidencia. Lo
adoptado ya estaba exento por la misma razón, pero el baseline se genera una sola vez y no cubría esto. Ahora
`surfaceWithoutTests` saltea una entrada cuya `fecha:` es anterior (`SURFACE_SINCE`, `engine/planning/contracts.js`),
`PROTOCOL.md` lo dice, y `test/planning/no-surface.test.js` lo fija en las dos direcciones; quitar el corte lo
pone en rojo (mutación corrida en una copia del árbol).

### Qué se corrió

- **Las pruebas nuevas, en rojo sobre el fuente anterior**: las cuatro de
  `test/workflows/autobuild-surface.test.js` (la de sólo documento paraba en `verify-hollow`; la mixta,
  igual) y la de `test/planning/no-surface.test.js` que exige el error.
- **Diez mutaciones en una copia del árbol, las diez en rojo**: `no-surface` frenando otra vez; el rebote
  listando todo `uncovered`; Done sin `sin-superficie`; QA con el pedido de siempre; Done sin `cubiertos`;
  todo contado como no ejecutable; la lista cerrada invertida a una de ejecutables (`.go`, `.js`); la puerta
  juzgando el mixto; `validate` descartando lo que la puerta devuelve; `commitFiles` sin encontrar nada.
- **La reproducción del caso contra el código arreglado** (`repro.js` apuntado al worktree y su variante,
  2026-09-23, Node 24, exit 0):

  ```
  == 189, Verify contesta missing-test
  result: {"stopped":true,"reason":"verify-hollow","detail":"sin test que lo codifique: Queda escrito en api/docs/ …"}
  verify turns: 2 | asked in Verify: [ 'Verify|verify', 'Verify|missing-tests', 'Verify|verify' ]
  reached Done: false
  == 189, Verify contesta no-surface
  result: {"done":["T-1"],"count":1,"hito":"H1","phases":[…,"Verify","QA","Commit","Done","Pick","Closing"]}
  verify turns: 1 | asked in Verify: [ 'Verify|verify' ]
  reached Done: true
  Done, hechos: cubiertos=[]; sin-superficie=[{"criterion":"Queda escrito en api/docs/ el destino de cada tabla",
  "reason":"el entregable es un ADR"},…]; … y los de sin-superficie con tests: n/a — <razón>.
  QA pide: T-1 no tiene superficie ejecutable: comprobá que el documento existe y cubre cada elemento que la
  aceptación enumera, …
  ```

  Con `missing-test` sigue parando, y es correcto: ahí la causa la eligió Verify. Si un Verify real elige
  `no-surface` ante un ADR **no está medido**.
- **`check` de verdad sobre una instancia sidecar con el producto en git** (`proof-check.sh`, git 2.43.0):

  ```
  --- sólo documento (277f9ecc0682)
  ✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 1 terminada(s)
  --- más una con código (f1ae1e5ce7a9)
  ✗ done/alta-sin-pruebas.md alta-sin-pruebas: tests: n/a dice que no hay superficie ejecutable y el commit
  f1ae1e5ce7a9 toca api/alta.go; sólo .md, .txt, .adoc cuentan como no ejecutables, así que esos criterios se
  rastrean con su prueba
  1 error(es), 0 advertencia(s)
  ```
- `npm run ci`, exit 0 (941 pruebas).

### Prueba real en un banco instalado (2026-09-23)

Banco: `ops bench sidecar` copiado fuera del árbol de Cauce con el layout de gouduet —instancia y producto en repositorios hermanos—, `automation install` del runner y los guards invocados por los shims instalados, como los invoca el runner. Control: el mismo input con el motor 0.98.0 de gouduet-ops, cambiando sólo el enlace del banco. **`/autobuild` real** sobre una tarea de sólo decisión (ADR con veredicto por tabla, sin código): Verify devolvió las cinco condiciones como `no-surface` con su razón, QA hizo la revisión documental, Done escribió `tests: A → n/a — …` por criterio, el commit tocó sólo el `.md` y `check` con la puerta nueva pasó. El control con 0.98.0 **no reprodujo** el defecto: su Verify devolvió `uncovered: []` después de armarse un script de comprobación propio, y la tarea cerró. Que Verify marque `missing-test` sobre una tarea así depende del modelo —en gouduet lo hizo, acá no—, y una corrida por motor no estima con qué frecuencia. `check` sobre entradas reales: `n/a` sobre un commit con código y fecha 2026-09-24 es error; con fecha anterior, o sobre un commit de sólo ADR, pasa; 0.98.0 no veía ninguno.

### Revisión del conjunto antes del PR (2026-09-24)

La revisión encontró que la lista cerrada de no ejecutables dejaba afuera los diagramas de un ADR: un commit con `docs/arch.svg` daba error en `check`. Corregido en `6ab4189a`: las imágenes cuentan como no ejecutables; lo que no tiene extensión sigue contando como ejecutable, porque `Makefile` y `Dockerfile` no la tienen. `PROTOCOL.md` y el CHANGELOG nombran la lista nueva.
