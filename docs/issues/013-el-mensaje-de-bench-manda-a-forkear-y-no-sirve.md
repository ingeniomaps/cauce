---
caso: 013
titulo: el error de --bench manda a adoptar el cargo, y adoptarlo no cambia nada
estado: resuelto
prioridad: baja
version-detectada: 0.58.0
resuelto-en: 0.59.0
---

# 013 — El error de `--bench` recomienda una acción que no resuelve nada

**🟢 resuelto en 0.59.0** · detectado en 0.58.0 · prioridad **baja** — sólo el mensaje, el comportamiento es correcto

## Resumen

`evaluate <cargo> --bench` es del toolkit y en una instancia se niega. Correcto y deliberado. Pero el
mensaje cierra recomendando *«si es del catálogo, adoptalo primero con `ops agents fork <cargo>`»*, y
adoptarlo no habilita nada: el chequeo es sobre el **modo de la instancia**, no sobre de quién es el
cargo.

Quien siga el consejo forkea, repite el comando y recibe el mismo mensaje diciéndole que forkee.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.58.0 init ops --mode sidecar --install
cd ops

node tools/ops.js agents fork backend-engineer          # ahora es propio
node tools/ops.js agents list . --own                   # backend-engineer (propio)
node tools/ops.js evaluate backend-engineer --bench     # el mismo mensaje: "adoptalo primero"
```

## Síntoma

```text
$ node tools/ops.js agents list . --own
backend-engineer (propio)  Implementa endpoints, persistencia, jobs y autorización dentro de un servicio…

$ node tools/ops.js evaluate backend-engineer --bench
--bench es del toolkit. En una instancia, el cargo trabaja sobre tu planning/: si es del catálogo,
adoptalo primero con "ops agents fork backend-engineer".
exit=2
```

El cargo ya es propio. La condición que falla es otra.

## Causa raíz

`engine/cli/catalog.js:190-193`:

```js
if (cli.has('--bench')) {
  if (O.mode(root) !== 'toolkit') {
    fail('--bench es del toolkit. En una instancia, el cargo trabaja sobre tu planning/: si es del '
      + `catálogo, adoptalo primero con "ops agents fork ${agent}".`, 2)
  }
```

El guard mira `O.mode(root) !== 'toolkit'` y nada más. La segunda mitad del mensaje habla de una
condición que el código no evalúa.

El comentario de arriba dice bien lo que pasa —*«El banco sólo tiene sentido acá: en una empresa el
cargo que se evalúa es suyo —propio o adoptado— y su `planning/` ya es el lugar legítimo donde
trabajar»*—. El mensaje al usuario dice otra cosa.

## Fix propuesto

Decir qué hacer en vez de qué adoptar:

```diff
 fail('--bench es del toolkit. En una instancia, el cargo trabaja sobre tu planning/: si es del '
-  + `catálogo, adoptalo primero con "ops agents fork ${agent}".`, 2)
+  + `corré "ops evaluate ${agent}" sin la bandera, que valida sus controles, casos y propuestas `
+  + 'contra este proyecto.', 2)
```

Si además se quiere conservar la pista sobre adoptar, va donde sí aplica: en `agents list`, o en el
error de `learn` sobre un cargo del catálogo, que **sí** se resuelve forkeando —comprobado: `learn
backend-engineer` falla antes del fork y anda después—.

## Tradeoffs

Ninguno: es un cambio de texto sobre un camino que ya falla con el exit correcto.

## Contexto de descubrimiento

Barriendo el ciclo de vida completo de 0.58.0 el 2026-09-03. Apareció al probar `learn` y `evaluate`
sobre un cargo del catálogo y sobre uno propio en la misma corrida: `learn` cambió de comportamiento
tras el fork —como su mensaje prometía— y `--bench` no.

## Resolución

**Resuelto en 0.59.0** con el texto que proponía el caso: el mensaje nombra la salida —`ops evaluate
<cargo>` sin la bandera— en vez de una condición que el guard no evalúa.

Había una prueba que fijaba el mensaje viejo, y afirmaba de él exactamente lo contrario de lo que este
caso demostró: `assert.match(result.stderr, /agents fork product-manager/, 'y nombra la salida real')`.
Ahora asercia la salida que sí lo es, y una prueba nueva cubre lo que ninguna cubría: que adoptar el
cargo no cambia la respuesta.

La segunda mitad de la propuesta —llevar la pista del fork al error de `learn`— **ya estaba hecha**, y
esta resolución dijo lo contrario en su primera versión: afirmó que ese mensaje no menciona el fork, a
partir de una salida truncada a dos líneas. Menciona las tres cosas, y la tercera es exactamente eso:

```text
product-manager es un cargo que trae Cauce y su aprendizaje se hace en el toolkit, no acá.
  Lo que este cargo debe saber de esta empresa va en organization/roles/product-manager.md.
  Para tener una versión propia del cargo, adoptalo: ops agents fork product-manager.
```

Comprobado el 2026-09-03 corriendo el comando entero. No hacía falta agregar nada: la pista vive donde
sí resuelve, que es lo que el caso pedía.

Verificado el 2026-09-03 sobre un cargo adoptado: el mensaje no nombra el fork ni antes ni después.

## Relacionados

Ninguno.
