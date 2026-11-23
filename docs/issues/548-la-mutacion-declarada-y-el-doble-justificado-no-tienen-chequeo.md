---
caso: 548
titulo: la mutación declarada de R29 y el doble justificado de R18 no tienen chequeo, ni siquiera opcional
estado: aplazado
reabrir-si: otra instancia pide comprobar la mutación declarada o el doble justificado, o una eval de un cargo muestra que los agentes omiten la declaración que R29 pide
prioridad: baja
version-detectada: 0.124.0
---

# 548 — la mutación declarada de R29 y el doble justificado de R18 no tienen chequeo, ni siquiera opcional

**⏸ aplazado** · detectado en 0.124.0 · prioridad **baja**: las dos reglas viajan a cada agente y se sostienen sólo
leyéndolas. Una empresa que quiera una puerta tiene que escribírsela, y una ya lo hizo.

## Decisión del 2026-11-22

Aplazado, a pedido de Manuel. Las dos formas posibles comprueban la forma escrita y no la intención —un
`// mutación: x` vacío pasa, y la mutación declarada que nunca se corrió no se ve—, y la B obliga a cambiar R29 en
`proof.md` para todas las instancias. Hoy lo pide una sola instancia, así que se espera a la condición de
`reabrir-si`; el diseño de abajo queda como punto de partida.

## Resumen

R29 pide que la mutación que una prueba cuida «se declara por escrito, en la aceptación que la pide»
(`template/planning/rules/system/proof.md:20`), y R9 lo carga como una de las cuatro cosas que no admiten excepción
(`template/planning/rules/system/commits.md:44`). R18 pide que «todo doble de prueba —mock, stub, fake, spy— declara en
una línea por qué existe» (`template/planning/rules/system/code-shape.md:69`). Ninguna de las dos tiene mecanismo en
`engine/`: ni un guard de commit, ni una comprobación de `check` sobre la aceptación.

La regla de R11 ya tiene ese mecanismo como opción, con `comments` en `ops.config.json` (`engine/hooks/comments.js:8`).
Este caso propone lo mismo para R29 y R18: un chequeo de **forma escrita**, apagado salvo que se declare.

## Reproducción

Un banco en el scratchpad de la sesión (`case548/repro-548.js`). Arma un repositorio embebido con `ops.config.json`, un
`package.json` con `test: node -e 0` y un `pay.js`. Commitea la base y corta la rama `test/pay`, para que `live-commit`
no frene por la rama viva. Después stagea una prueba nueva:

```js
const pay = require('../pay')
test('cobra el monto', () => {
  const gw = { charge: jest.fn() }
  pay(gw, 10)
  expect(gw.charge).toHaveBeenCalledWith(10)
})
```

Corre `git commit -m "test: cover pay"` por `execute()` de `engine/hooks/run.js` contra cada guard del grupo
`pre-shell` (`engine/hooks/run.js:107`), y después el commit real. Lo hace dos veces: sin `comments` y con
`"comments": {}`.

## Síntoma

```
== sin-comments: ops.config.json {}
staged: test/pay.test.js
  destructive: pasa
  git-add: pasa
  dependencies: pasa
  governance: pasa
  live-commit: pasa
  ai-signature: pasa
  comments: pasa
  verify: pasa
  shell-boundary: pasa
  secrets-shell: pasa
  test-evidence-shell: pasa
  ops-config-shell: pasa
  runtime-shell: pasa
  test-workers: pasa
commit real: da05e71 test: cover pay |  test/pay.test.js | 6 ++++++ |  1 file changed, 6 insertions(+)
== con-comments: ops.config.json {"comments":{}}
staged: test/pay.test.js
  (los catorce guards: pasa)
commit real: 449a477 test: cover pay |  test/pay.test.js | 6 ++++++ |  1 file changed, 6 insertions(+)
```

`exit=0`. Una prueba sin mutación declarada y un `jest.fn()` sin razón entran sin un aviso, con `comments` o sin él.
`comments` no lo ve porque la prueba no agrega ningún comentario, y no tiene por qué verlo: mide R11, no R29.

La ausencia en el motor, verificada en esta corrida:

```
$ grep -rnE "jest\.fn|vi\.mock|vi\.fn|sinon" engine/      → exit=1, sin resultados
$ grep -rnwE "R18|R29" engine/                            → exit=1, sin resultados
$ grep -rlni "mutaci" engine/                             → 11 archivos
```

Los once son comentarios que **nombran** una mutación: que va en una copia (`engine/hooks/input.js:184`,
`engine/cli/copy.js:4`, `engine/hooks/files.js:350`), que una sobrevivió (`engine/cli/contract.js:88`), que se cita por
su marcador al contar condiciones (`engine/planning/parser.js:194`), o la mutación de GraphQL (`engine/hooks/github-api.js:58`).
Ninguno comprueba que una prueba o una aceptación la declare.

## Causa raíz

No hay código que falle: la regla nunca tuvo mecanismo. Es prosa en `proof.md:20` y `code-shape.md:69`, y lo único
que la hace cumplir es el review.

## Fix propuesto

Hay dos lugares posibles para el chequeo. **Elegir entre los dos es la primera decisión**, porque R29 dice dónde vive
la declaración y uno de los dos la mueve.

### A — donde R29 la pone: la aceptación, en `check`

La mutación «se declara por escrito, en la aceptación que la pide» (`proof.md:20`). La forma ya tiene un precedente: el
`(sin partir: <razón>)` de R17. Se lee con `noSplitReason` (`engine/planning/parser.js:82`) y está en la lista de marcas
parentéticas (`engine/planning/parser.js:183`). El precedente pide una marca análoga, `(mutación: <qué se rompe> →
<qué prueba se pone roja>)`, que `check` exigiría en la aceptación de cada tarea **si** se declara la llave.

- No depende del lenguaje ni de reconocer qué es un caso de prueba.
- No cubre R18: un doble vive en el código, no en la aceptación.
- No cubre el trabajo que no pasa por una tarea del BACKLOG, como un commit suelto o un caso de este repositorio.

### B — junto a la prueba, en el commit, con el patrón de `comments.js`

Un guard `proof` en el grupo `pre-shell`, armado con las mismas piezas que `comments`:

- **Opt-in.** El guard vuelve sin mirar si `configOf(root).proof` no está (`engine/hooks/comments.js:186-188`). La llave
  sería `"proof": { "mutation": true, "doubles": true }`, y cada chequeo corre sólo si se declara. Así funcionan
  `language` e `inlineMax` en `comments` (`engine/hooks/comments.js:144-151`).
- **Validación.** Un `validateProof` en `engine/config/validate.js` igual a `validateComments`
  (`engine/config/validate.js:27-41`): llaves conocidas, booleanos. `proof` se suma a la lista de llaves
  (`engine/config/validate.js:61`) y a la llamada (`engine/config/validate.js:120`).
- **Aflojarlo es visible.** Una entrada en `engine/hooks/config-keys.js`, como la de `comments`
  (`engine/hooks/config-keys.js:37-48` y `:63`): quitar `proof`, o pasar `mutation` o `doubles` de `true` a `false`,
  es apagarlo.
- **Registro.** Va en `guards` y en `hookGroups['pre-shell']` (`engine/hooks/run.js:99` y `:107`), con su `purpose`
  (`engine/hooks/run.js:174-177`), su shim `automatization/hooks/guard-proof.sh` y su fila en
  `automatization/hooks/README.md:129`.
- **Qué es nuevo.** Se leen sólo las líneas agregadas, con `addedLines` (`engine/hooks/comments.js:109-124`), que ya
  descuenta lo que trae un merge. Sólo cuentan los archivos que son prueba según `isTestFile`
  (`engine/hooks/files.js:141-148`). Es la misma definición que usan `test-evidence` y `test-evidence-shell`, así que
  lo que se arregle ahí vale para los tres.
- **Qué es un caso nuevo, por lenguaje.** Un caso es nuevo cuando la línea que lo abre está entre las agregadas:
  - JS/TS: `test(`, `it(`, `test.each(…)(`, `it.each(…)(` (`node:test`, jest, vitest, mocha).
  - Go: `func TestXxx(t *testing.T)` y `t.Run("…"`.
  - Python: `def test_…` en un archivo de prueba.
  - Otros lenguajes: no se miran, y el encabezado lo dice, como hoy `comments.js:13` dice qué no ve.
- **Qué es una mutación declarada.** Un comentario cuyo texto empieza con `mutación:`, o con `mutation:` si
  `comments.language` es `en`. Va en el bloque inmediatamente anterior a la línea que abre el caso, o en la primera
  línea de su cuerpo, y nombra qué se rompe y qué se pone rojo: `// mutación: pay deja de pasar el monto → este caso`.
  Los bloques se leen con `commentBlocks` (`engine/hooks/comments.js:48-85`), así que valen las mismas marcas de
  comentario por extensión (`STYLES`, `engine/hooks/comments.js:20-23`). **Un solo marcador fijo, no una lista de
  frases.**
- **Qué es un doble, y qué es su razón.** Una llamada agregada a una forma de una lista cerrada por librería:
  - jest: `jest.fn(`, `jest.mock(`, `jest.spyOn(`.
  - vitest: `vi.fn(`, `vi.mock(`, `vi.spyOn(`.
  - node:test: `mock.fn(`, `mock.method(`, `t.mock.`.
  - sinon: `sinon.stub(`, `sinon.spy(`, `sinon.fake(`, `sinon.mock(`.
  - Python: `Mock(`, `MagicMock(`, `patch(`, `mocker.patch(`.
  - Go: `gomock.NewController(` y `NewMock…(`.

  La razón es un comentario en la misma línea, o en el bloque inmediatamente anterior, que empieza con `doble:`.
  Por ejemplo: `{ charge: jest.fn() } // doble: la pasarela cobra de verdad`.
- **Cómo se aprueba.** Igual que lo duro de `comments`: el freno lista `archivo:línea` de cada caso sin mutación y de
  cada doble sin razón, y lo puede aprobar la persona con `AP.pendingNow`/`AP.HOW`
  (`engine/hooks/comments.js:196-205`). Es para el archivo ajeno o la prueba heredada que se toca de pasada. No lleva
  token de una sola vez (`comments.js:207-209`). Ese token prueba que se miró una lista. Acá no hay nada que mirar: o
  la forma está o no está.

### Recomendación

**B**, si la persona acepta que la declaración baje de la aceptación a la prueba. Es lo que la instancia construyó, y
lo único que también cubre R18. Si no lo acepta, A cubre sólo R29 y R18 queda sin chequeo. Si B entra, R29 cambia
en `proof.md:20`: «en la aceptación que la pide, **o** junto al caso que la cuida». Esa línea baja a todas las
instancias en su próximo `upgrade`, así que la decide la persona.

### Pruebas que pediría el arreglo

- Sin `proof` declarado no frena nada: el banco de arriba sigue en `pasa` (ausencia, vista en rojo con la llave puesta).
- Con `mutation: true`, el `test('cobra el monto'…)` de arriba frena nombrando `test/pay.test.js:2`. Con
  `// mutación: …` encima, entra.
- Con `doubles: true`, el `jest.fn()` frena nombrando `test/pay.test.js:3`. Con `// doble: …` en la línea, entra.
- Un caso que ya estaba y cuya línea no cambió no frena, también en un merge.
- **Mutación declarada** (R29): que `addedLines` devuelva todas las líneas del archivo tiene que poner rojo el caso
  «lo que ya estaba no frena». Que el marcador se acepte en cualquier bloque del archivo, y no en el inmediatamente
  anterior, tiene que poner rojo un caso con la mutación declarada en otro `test`.

## Tradeoffs

- **Comprueba la forma, no la intención.** `// mutación: x` o `// doble: porque sí` pasan. El chequeo prueba que
  alguien escribió una línea en el lugar, no que la mutación se haya corrido ni que el doble haga falta. El modo de
  fallo caro de R29 es la mutación declarada y nunca corrida, y ese sigue igual. Lo sigue sosteniendo el review, y
  el encabezado del guard tiene que decirlo en esas palabras, como `comments.js:5-6` lo dice de su token.
- **Es una lista de formas, y R27 la mira con desconfianza** (`template/planning/rules/system/code-shape.md:79`). La
  lista de dobles nace abierta: una librería nueva (`testdouble`, `nock`, `msw`, un fake escrito a mano) pasa sin aviso.
  La de casos también: `describe.each`, `Deno.test`, `#[test]` de Rust o `@Test` de JUnit. Como B es opt-in, el que
  lo activa elige el recall que acepta, pero el encabezado tiene que enumerar lo que ve. La salida de R27, una prueba
  que recorre lo que existe y falla con lo no clasificado, no aplica: no hay un registro cerrado de librerías de dobles
  contra el cual comparar.
- **La regla del AGENTS.md** «un guard no decide con una lista de palabras permitidas» (`AGENTS.md:554`). Esa regla
  es sobre leer lo que la persona pidió en el chat, y acá no se lee intención. Se exige un marcador fijo escrito en el
  artefacto, como `(sin partir: …)` en R17 o el token de `comments`. Aun así, el guard deja pasar por la presencia de
  una palabra, y eso tiene el mismo límite: no entiende lo que dice la línea. Por eso es **un** marcador y no una lista
  de sinónimos. Agregar «mutation», «muta», «rompe» para que frene menos es justo lo que esa regla prohíbe.
- **Falsos positivos.** Un `jest.fn()` usado como callback trivial (`onClick: jest.fn()`), un `patch(` que no es de
  `unittest.mock`, o una función propia llamada `test(` en un archivo de prueba. Todos frenan y piden una línea o una
  aprobación. Es ruido por commit, como el de `comments`: la cuenta la hace cada empresa, y por eso es opt-in.
- **Sidecar y raíces.** Cuenta lo que `stagedForCommit` resuelve (`engine/hooks/input.js:287`) y vuelve sin mirar en un
  repositorio ajeno (`comments.js:190`), igual que `comments`. No se probó en un sidecar. La prueba del arreglo tiene
  que correr ahí, con dos raíces.
- **Si se elige A**, `check` empieza a frenar tareas viejas sin la marca el día que se declara la llave. La salida
  sería exigirla sólo a lo que se agrega al BACKLOG, que es otra lectura de diff, esta vez en `check`.

## Prioridad

**Baja.** Las dos reglas ya viajan a cada agente (R9 las carga) y el review las sostiene. El chequeo es opcional y
sólo sirve a quien lo active. La instancia que lo quería ya tiene el suyo. Y la falla que más cuesta, la mutación
declarada que nunca se corrió, no la ve ninguna de las dos formas. Sube a **media** si una segunda instancia pide lo
mismo, o si una evaluación muestra que los agentes omiten la declaración aunque la regla ya les llega.

## Contexto de descubrimiento

Ítem 12 de la auditoría del 2026-11-21 sobre una instancia sidecar real. Construyó su propio chequeo y, según la
auditoría, contó hasta 136 casos de prueba sin mutación declarada en un grupo de sus repositorios. **Ese número no se
midió en esta corrida**: lo reporta la auditoría, y su chequeo no se abrió acá. Lo que sí se verificó es la ausencia de
mecanismo en `engine/` y el commit que entra sin aviso.

## Relacionados

- 233: la pasada de comentarios de R11, cuyo patrón (`comments.js`) copia B.
- 294 y 367: `test-evidence-shell` y el renombrado de pruebas, que comparten `isTestFile`.
- 547: el gate que una raíz declara. Es el otro lugar donde un chequeo propio de la empresa queda fuera del motor.
