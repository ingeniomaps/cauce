---
caso: 086
titulo: Una migración recién creada se frena como si fuera historial, y ninguna herramienta la completa
estado: resuelto
resuelto-en: 0.79.0
prioridad: alta
version-detectada: 0.78.0
---

# 086 — `migrations` confunde «existe en disco» con «ya viajó»

**🟢 resuelto en 0.79.0** · detectado en 0.78.0 · prioridad **alta** — frena el flujo normal de escribir una
migración, ninguna herramienta lo esquiva, y la única salida a la vista apaga también la protección
contra SQL destructivo

## Resumen

El chequeo que protege una migración ya aplicada decide por `fs.existsSync` y nada más. No mira si el
archivo está versionado, ni si la migración corrió, ni si nació en esta misma sesión — así que **frenar
la segunda escritura de un archivo creado hace dos segundos es indistinguible de frenar la reescritura
de una migración de hace un año**.

El flujo normal de escribir una migración son dos pasos: crear el archivo y completarlo. El primero pasa
—no existe—; el segundo se bloquea. Y el mensaje afirma sobre él algo que el dato no sostiene: «en vez
de reescribir historial», sobre un archivo que ningún commit contiene y que ninguna base corrió.

Le pega a cualquier proyecto, no sólo a los de un ecosistema: `.sql` lo sufre igual desde siempre. Se
volvió visible al declarar `migrations.extensions` (caso 077), que es lo que puso el chequeo a mirar los
archivos que un agente sí escribe en dos pasos.

## Reproducción

Verificada en un banco desechable con `planning/` y `ops.config.json` —`findOpsRoot` exige los dos, y
sin ellos el guard no resuelve las extensiones declaradas y el `.ts` ni siquiera entra al filtro—:

```sh
printf '{"tool_name":"Write","tool_input":{"file_path":"%s/migrations/17890000000-Nueva.ts",…}}' \
  | node <cauce>/engine/hooks/run.js migrations
```

```
--- .ts  paso 1 (no existe):             exit 0
--- .ts  paso 2 (existe, sin commitear): exit 2 · BLOQUEADO: … es una migración existente
--- .sql paso 1 (no existe):             exit 0
--- .sql paso 2 (existe, sin commitear): exit 2 · BLOQUEADO: … es una migración existente
```

## Síntoma

```
BLOQUEADO: …/migrations/1789069868571-AddConfirmationSubscriptionEventTypes.ts es una migración
existente. Crea una nueva en vez de reescribir historial.
exit: 2
```

**Ninguna herramienta lo esquiva**, y eso es lo que lo vuelve un bloqueo y no una molestia:

```
Write → exit 2      Edit → exit 2      MultiEdit → exit 2
```

Y de los dos bloqueos que tiene este guard, **éste es el único que no dice cómo salir**. El de SQL
destructivo imprime `AP.HOW('OPS_MIGRATIONS_OVERRIDE')` —la salida angosta: escribir la ruta en
`planning/.ops-approval`—; éste no imprime nada. La salida angosta existe y funciona —verificado:
con la ruta absoluta en ese archivo, exit 0— pero nadie se la nombra a quien la necesita.

Lo único que queda a la vista es `OPS_MIGRATIONS_OVERRIDE=1`, que apaga el guard entero **incluida la
protección contra SQL destructivo**, para toda la sesión. Es exactamente la salida ancha que el
comentario de ese mismo archivo dice que un guard mal puesto enseña a usar. Por eso esta corrida
terminó escribiendo una fila en `HUMAN_ACTIONS` en vez de resolverse sola.

## Causa raíz

`engine/hooks/files.js:236-238`

```js
const file = path.resolve(cwdOf(input), raw)
if (fs.existsSync(file)) {
  block(`${raw} es una migración existente. Crea una nueva en vez de reescribir historial.`)
}
```

`fs.existsSync` contesta «hay un archivo ahí», que no es la pregunta. La que el guard quiere hacer es
«¿esto ya viajó a otra copia?», y eso lo sabe git. Sin preguntárselo, un stub de hace dos segundos y una
migración publicada hace un año dan la misma respuesta.

## Fix propuesto

Tres piezas, y las tres hacen falta.

**1. Preguntar por `HEAD`, no por el índice.** La pregunta es si ya viajó, y un archivo apenas
`git add`eado no viajó a ninguna parte. Medido sobre el mismo archivo en tres estados:

```
sin trackear   ls-files=1   cat-file HEAD=128
staged         ls-files=0   cat-file HEAD=128   ← ls-files lo daría por historial
commiteada     ls-files=0   cat-file HEAD=0
```

`git cat-file -e HEAD:<ruta>` es el que contesta lo que el guard pregunta. Necesita la ruta relativa a
la raíz del repositorio, así que son dos invocaciones: `rev-parse --show-toplevel` y después `cat-file`.

**2. Distinguir «git no pudo contestar» de «no está en HEAD», y degradar en el primero.** Los dos dan
128 y confundirlos es el mismo error de origen: decidir por la respuesta equivocada. Lo que separa los
casos es si `rev-parse --show-toplevel` resolvió una raíz. Sin raíz —proyecto sin git, `cwd` que no
existe— se degrada a la conducta de hoy, `existsSync`, en vez de dejar pasar. Es el mismo criterio con
que `check` degrada a mirar sólo la fecha cuando no puede resolver el repositorio de un servicio
(`engine/core/repos.js:41`).

**3. El mensaje dice lo que se puede afirmar, y cómo salir.** Son dos mensajes distintos porque son dos
hechos distintos: con repositorio, que el archivo está en `HEAD`; sin repositorio, que existe y que acá
no hay con qué saber si viajó. Y los dos llevan `AP.HOW('OPS_MIGRATIONS_OVERRIDE')`, que es lo que el
bloqueo hermano ya hace.

## Tradeoffs

- **Dos `spawnSync` de git por archivo de migración en el payload**, y sólo para los que pasaron el
  filtro de ruta y extensión **y** ya existen en disco. `existsSync` se queda como primera compuerta:
  si no hay archivo no hay nada que reescribir, y no se le pregunta nada a git.
- **Una migración que ya está en `HEAD` sigue frenándose.** Lo que deja de frenarse es el stub de la
  sesión. La protección real —no reescribir lo que otro ya tiene— queda intacta.
- **Un repositorio sin ningún commit** (`HEAD` sin nacer) deja pasar la reescritura. Es correcto por el
  criterio: no viajó a ninguna parte. Y no se confunde con un fallo de git, porque la raíz sí resolvió.
- **Un proyecto sin git conserva la conducta de hoy**, con sus falsos positivos. Cambiarla ahí exigiría
  una fuente de verdad que no existe —la tabla de migraciones de la base—, y bloquear de más es el lado
  correcto para equivocarse cuando no se puede saber.

## Qué cambió de la primera redacción de este caso

El diagnóstico se sostuvo entero; el fix no, y las tres correcciones salieron de medirlo.

**El diff que proponía contradecía a su propia prosa.** El texto pedía degradar a `existsSync` sin
repositorio resoluble; el diff —`spawnSync(...).status === 0`— hacía lo contrario, porque fuera de un
repo git sale 128 y eso daba `trackeado = false`, o sea **no bloquear**. Un proyecto sin git perdía la
protección entera.

**Y no era teórico.** Aplicado tal cual en un clon desechable, las dos pruebas que fijan esta conducta
se ponen en rojo, porque sus bancos no son repositorios git:

```
✖ guard-migrations protege historial y SQL destructivo        — Missing expected exception
✖ guard-files lee el sobre de apply_patch aunque llegue como command
   test/wiring/hooks.test.js:699 y :931
```

**Y `git ls-files` contestaba otra pregunta que la que el caso se hacía** —está en el índice, no ha
viajado—, según la tabla de tres estados de arriba.

Se agregaron además dos hechos que la primera redacción no tenía y que cambian la prioridad de media a
alta: que `Edit` y `MultiEdit` se bloquean igual que `Write`, y que este bloqueo es el único de los dos
que no nombra la salida angosta.

## Contexto de descubrimiento

Apareció el 2026-09-10 en la primera corrida de `autobuild` sobre una instancia sidecar real. El propio
recorrido lo registró en `HUMAN_ACTIONS.md` como decisión abierta, con el `archivo:línea` ya
identificado —la fase Build tuvo que completar la migración que ella misma había creado un paso antes—.

Se confirmó después contra el archivo real que quedó de esa corrida:
`migrations/1789069868571-AddConfirmationSubscriptionEventTypes.ts`, sin trackear, bloqueado al
reescribirse.

## Relacionados

- [077](./077-el-guard-de-migraciones-solo-ve-sql-y-calla-el-resto.md) — declarar
  `migrations.extensions` es lo que puso este chequeo a mirar archivos que se escriben en dos pasos. El
  defecto es anterior y afecta también a `.sql`; aquél lo hizo visible.
- [039](./039-el-guard-de-migraciones-bloquea-cualquier-archivo-con-sql-destructivo.md) — el otro
  bloqueo de este mismo guard, y la vez anterior que frenó donde no correspondía. De ahí sale la frase
  que acá vuelve a aplicar: un guard que frena de más enseña a exportar la variable que lo apaga.

## Cierre

**🟢 resuelto en 0.79.0** · `engine/hooks/files.js`, `test/wiring/hooks.test.js`

### Las tres piezas del fix

- **1. Preguntar por `HEAD` y no por el índice** — hecha. `alreadyShipped()` resuelve la raíz con
  `rev-parse --show-toplevel`, arma la ruta relativa y pregunta `cat-file -e HEAD:<ruta>`. La mutación
  que la cambia por `ls-files --error-unmatch` se pone en rojo sobre el estado *staged*, que es
  exactamente el que distingue las dos preguntas.
- **2. Distinguir «git no pudo contestar» de «no está en HEAD»** — hecha, y es lo que mantiene verdes
  las dos pruebas cuyos bancos no son repositorios: sin raíz resoluble se bloquea igual que antes. La
  mutación que devuelve vacío ahí tira dos pruebas.
- **3. El mensaje dice lo que se puede afirmar, y cómo salir** — hecha, en sus dos formas: «ya está en
  el historial del repositorio» cuando hay repositorio, y «existe, y acá no hay repositorio con el que
  saber si ya viajó a otra copia» cuando no. Los dos llevan `AP.HOW('OPS_MIGRATIONS_OVERRIDE')`.

Vale registrar que **el mensaje viejo no era falso, era interpretativo**: «es una migración existente»
describía el hecho correctamente y «en vez de reescribir historial» era la lectura que el dato no
sostenía. Lo que se quitó es la interpretación, no un error.

### Los tradeoffs, contrastados

- **«Dos `spawnSync` por archivo»** — se cumple, y sólo para los que ya existen en disco: `existsSync`
  quedó como primera compuerta dentro de `alreadyShipped`. La mutación que la saca se pone en rojo, que
  es lo que prueba que la compuerta está y no es decorativa.
- **«Una migración que ya está en `HEAD` sigue frenándose»** — comprobado en el cuarto estado del test.
- **«Un repositorio sin ningún commit deja pasar»** — es la consecuencia de la pieza 2 y está cubierta
  por el segundo estado del test: entre `git init` y el primer commit, `HEAD` no existe, la raíz sí
  resuelve y la reescritura pasa.
- **«Un proyecto sin git conserva la conducta de hoy»** — es lo que miden las dos pruebas
  preexistentes, que ahora afirman el mensaje nuevo. Cambiarles la expectativa es una quita, y por eso
  el mensaje viejo tiene su aserción de ausencia: ninguna prueba busca ya «migración existente», y la
  mutación M1 —volver a decidir por `existsSync`— tira tres.

### Qué se corrió

`node --test test/wiring/hooks.test.js` — 61 en verde, con la prueba nueva «una migración se frena por
haber viajado, no por estar en disco», que recorre los cuatro estados del mismo archivo: recién creado,
completado sin commitear, staged y commiteado.

**Seis mutaciones, en un clon desechable bajo `/tmp` (R23), todas en rojo:**

```
M1 vuelve a decidir por existsSync (el defecto original):   fail 3 → ROJA
M2 pregunta por el índice y no por HEAD:                    fail 1 → ROJA
M3 sin repositorio deja pasar en vez de degradar:           fail 2 → ROJA
M4 el bloqueo deja de nombrar la salida angosta:            fail 1 → ROJA
M5 no se comprueba que el archivo exista antes de preguntar: fail 1 → ROJA
M6 la ruta va absoluta a cat-file:                          fail 1 → ROJA
```

Las seis se comprobaron aplicadas antes de contar; M1 falló la primera vez por indentación y se rehízo,
que es la razón por la que el helper imprime cuándo no se aplicó.

`npm run ci`: **670 pruebas, 670 en verde**, cobertura de 57 archivos en su piso o por encima.
