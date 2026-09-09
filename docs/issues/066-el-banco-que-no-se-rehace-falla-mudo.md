---
caso: 066
titulo: El banco que no se rehace falla sin decir por qué, y por eso su causa lleva tres intentos sin establecerse
estado: resuelto
resuelto-en: 0.73.0
prioridad: media
version-detectada: 0.72.0
---

# 066 — El instrumento borraba la evidencia justo cuando importaba

**🟢 resuelto en 0.73.0** · detectado en 0.72.0 · prioridad **media** — bloqueó un release, y su causa
sigue sin establecerse porque nada la dejaba ver

## Resumen

`test/agents/bench.test.js`, «el banco se recrea entero en cada corrida», falla de vez en cuando en CI.
Ya falló «tres veces en un día, en las dos patas de la matriz» según el comentario que dejó una de las
mitigaciones, y el 2026-09-09 volvió a fallar en `ci (current)` del PR de versión de 0.72.0, con
`ci (24)` en verde sobre el mismo árbol.

El comentario de `engine/cli/catalog.js` que lo mitiga dice, textual: **«Por qué algo sobrevive a un
borrado que no lanzó no está establecido.»** Ese es el caso, y la razón por la que sigue sin
establecerse es más simple de lo que parece: **la prueba descarta el resultado de la corrida que
falla.**

```js
run(['evaluate', 'product-manager', '--bench', '07-recreado', '--force'], toolkit)
assert.equal(fs.existsSync(rastro), false, 'la corrida anterior no contamina la siguiente')
```

Cualquier fallo del comando —`EACCES`, `ENOTEMPTY`, `EEXIST`, el que sea— termina en el mismo
`true !== false` sobre el archivo rastro, con el `stderr` tirado. Tres investigaciones miraron ese
mensaje y ninguna pudo pasar de ahí.

## Reproducción

Determinista, y no hace falta esperar a que CI falle:

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce

node -e '
const { run } = require("./test/support/environment")
const path = require("path"), fs = require("fs")
const toolkit = path.resolve(".")
const dir = path.resolve(toolkit,
  run(["evaluate", "product-manager", "--bench", "07-sonda", "--force"], toolkit).stdout.trim())
const rastro = path.join(dir, "planning", "rastro.md")
fs.writeFileSync(rastro, "x\n")
fs.chmodSync(dir, 0o500)                       // el borrado no va a poder completar
const segunda = run(["evaluate", "product-manager", "--bench", "07-sonda", "--force"], toolkit)
fs.chmodSync(dir, 0o755)
console.log("exit de la segunda corrida :", segunda.status)
console.log("stderr que la prueba tira  :", (segunda.stderr || "").trim().split("\n")[0])
console.log("lo que la prueba afirmaría :", fs.existsSync(rastro) ? "true !== false" : "(pasa)")
fs.rmSync(dir, { recursive: true, force: true })'
```

## Síntoma

```
exit de la segunda corrida : 1
stderr que la prueba tira  : EACCES, Permission denied: .cauce-eval/product-manager/07-sonda
lo que la prueba afirmaría : true !== false
```

Y en CI, el 2026-09-09:

```
✖ el banco se recrea entero en cada corrida (289.432357ms)
  AssertionError [ERR_ASSERTION]: la corrida anterior no contamina la siguiente
  true !== false
```

Ningún `stderr`, ningún código, ninguna ruta. Es el mismo mensaje para todas las causas posibles.

## Causa raíz

**Dos, y sólo una está establecida.**

La que sí: la prueba no mira el resultado de la segunda invocación, así que **el fallo del comando y el
archivo que sobrevive se ven idénticos**. Eso es lo que impidió diagnosticar el resto.

La que no: por qué, en CI, un `rmSync(recursive, force, maxRetries: 5)` vuelve **sin lanzar** y deja
archivos. Sigue sin establecerse. Lo que sí se puede decir es que el código lo viene rodeando por
síntoma, tres veces —reintentos en el borrado, `force` en el andamiaje, un `rm` antes del enlace—, y
cada rodeo dejó la corrida siguiendo sobre un banco que no era nuevo.

## Fix propuesto

Dos mitades, y ninguna sustituye a la otra:

- **Que la prueba mire el resultado**, para que la próxima falla llegue con su `stderr` en vez de un
  booleano.
- **Que el motor compruebe que el borrado borró**, y si no, corte nombrando lo que sobrevivió. En el
  caso silencioso el comando **sale 0**, así que la aserción de estado no lo vería: es esta guarda la
  que lo convierte en un fallo con nombre.

## Tradeoffs

- **La guarda del motor no tiene prueba, y no se puede tener con lo que sabemos.** La condición que
  cubre no se reproduce; lo único reproducible —quitar permiso de escritura— hace que `rmSync` lance
  antes de llegar a ella. Se comprobó con una mutación: quitarla no pone en rojo ninguna prueba.
- **Cortar en vez de seguir convierte un transitorio en un fallo duro.** Es deliberado: un banco a
  medio borrar contamina la medición siguiente, que es lo único que la recreación existe para evitar.
- **Nada de esto explica el borrado silencioso.** Lo que cambia es que la próxima vez va a haber qué
  leer, que es la precondición de explicarlo.

## Contexto de descubrimiento

Publicando 0.72.0. El `ci (current)` del PR de versión falló acá con `ci (24)` en verde sobre el mismo
árbol; la re-corrida salió verde y el release siguió. Buscando si el fallo era mío apareció que el
mensaje no podía distinguir entre las causas.

## Relacionados

- Ninguno. Vivía como comentario en `engine/cli/catalog.js`, que es donde sólo lo lee quien ya está
  editando esa función.

## Cierre

**Resuelto en 0.73.0**, y lo que se resuelve es la mudez, no el borrado silencioso. La diferencia
importa y por eso está en el título del caso.

- **La prueba mira el resultado de la segunda corrida.** Mutación comprobada: quitando esa aserción, el
  mismo fallo vuelve a ser `true !== false` y el `EACCES` se pierde. Es la mitad que estaba probada
  antes de escribirla, porque la reproducción la produce a pedido.
- **El motor comprueba que el borrado borró, y nombra lo que sobrevivió.** Sin esto, el caso silencioso
  —que es el que ocurre en CI— sale con código 0 y la aserción de estado no lo ve: sigue siendo un
  booleano. Las dos mitades cubren casos distintos y ninguna sobra.
- **Tradeoff «la guarda del motor no tiene prueba» — se paga, y se midió.** La mutación que la quita
  **sobrevive**: ninguna prueba se pone en rojo. No es un descuido sino el límite de lo que se sabe —lo
  único reproducible hace que `rmSync` lance antes de llegar a esa rama—. Lo que la probaría es una
  reproducción del borrado silencioso, que es justamente lo que este caso no logró y lo que la próxima
  falla en CI va a permitir intentar.
- **Tradeoff «cortar convierte un transitorio en un fallo duro» — se paga a propósito.** Un banco a
  medio borrar contamina la medición siguiente, que es lo único que la recreación existe para evitar.
  Y hasta hoy no era un transitorio tolerado sino uno invisible: la corrida seguía y fallaba después,
  en otro lado y sin explicación.
- **Tradeoff «nada de esto explica el borrado silencioso» — sigue siendo cierto, y es el estado
  declarado del caso.** Lo que lo activaría es la próxima falla en CI: ahora va a traer el código, la
  ruta y los archivos que sobrevivieron. Hasta entonces la causa es hipótesis y no se afirma.

**Lo que apareció y el enunciado no preveía: el patrón de las tres mitigaciones.** Reintentos en el
borrado, `force` en el andamiaje y un `rm` antes del enlace se agregaron por separado, cada uno después
de un fallo distinto, y los tres **rodean** el mismo hecho en vez de mirarlo. El comentario de cada uno
lo dice bien; lo que ninguno hizo fue preguntarse por qué el borrado no borraba. Cuando un síntoma se
mitiga tres veces en lugares distintos, lo que falta no es una cuarta mitigación.

**Y una nota sobre cómo se llegó acá**, porque cambia qué se hace la próxima vez: el caso se abrió
después de tratar el fallo como el transitorio conocido y re-correrlo. La re-corrida salió verde y el
release siguió, que era lo correcto en ese momento. Lo que no era correcto era dejarlo ahí: el
comentario del código decía «no está establecido» desde hacía semanas y nadie iba a leerlo eligiendo
trabajo.
