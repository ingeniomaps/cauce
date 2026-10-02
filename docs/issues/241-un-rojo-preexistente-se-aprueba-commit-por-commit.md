---
caso: 241
titulo: un rojo preexistente se aprueba commit por commit
estado: resuelto
resuelto-en: 0.100.0
prioridad: media
version-detectada: 0.99.2
---

# 241 — Un repositorio con un gate en rojo heredado pide una aprobación en cada commit

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **media**.

**Prioridad media**: no rompe nada, pero en un repositorio con lint heredado en rojo cada commit se frena y pide aprobación, y eso empuja a apagar el guard entero (240).

## Resumen

`verify` sólo distingue verde de rojo. Un rojo que ya estaba antes del cambio —errores de lint ajenos, una suite rota en otro módulo— frena todos los commits hasta que alguien lo arregle, y la única salida es aprobar operación por operación (`.ops-approval`). Las dos instancias resolvieron lo mismo con un archivo `automatization/gate-known-red`: el rojo se declara por raíz y gate, con su motivo; si el gate falla sólo en lo declarado pasa con aviso, y un rojo nuevo sigue frenando.

## Reproducción

Pendiente de correr al tomar el caso: un repositorio con `"lint": "exit 1"` y dos commits seguidos; se espera que los dos se frenen y cada uno pida su aprobación.

## Síntoma

En acme-ops el archivo tiene 3 entradas vivas (lint de ESLint 9) y reemplazó un worktree de baseline que duplicaba la carga. En globex está vacío: el mecanismo existe y todavía no se usó.

## Causa raíz

`engine/hooks/verify.js`, `verifyGates`: cualquier gate con `!result.ok` va a `failures` y bloquea salvo aprobación de la operación (`engine/hooks/approval.js`).

## Fix propuesto

Un archivo declarado (o un campo de `ops.config.json`) con `<raíz> <gate> — <motivo>`, leído por `verify`. Lo declarado pasa y se avisa mientras exista, igual que hoy se avisa una exención. Hay que decidir qué se compara para saber si el rojo es «el mismo»: el gate entero (simple, deja pasar un rojo nuevo en el mismo gate) o la línea de error.

## Tradeoffs

- Choca con la idea de `approval.js` de que una llave que dura no es por operación: es una decisión de producto, no un detalle.
- Por gate entero es más simple y más permisivo.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala.

## Relacionados

- 240 — lo que hizo que las dos apagaran `verify`.

## Cierre

Resuelto en 0.100.0. Manuel eligió el 2026-10-02 la forma: por gate entero, con motivo y aviso.

- **Reproducción, antes de tocar nada:** un repositorio con `"lint": "… exit 1"` y dos commits seguidos. Con
  el motor de `main`, los dos se frenaron: `Verify falló en r241: lint (exit 1 …)`.
- **Un archivo con `<raíz> <gate> — <motivo>`, leído por `verify`** — se hizo, en `planning/gate-known-red`
  (`engine/core/known-red.js`), con la raíz separada por dos puntos: `app: lint — <motivo>`. Los gates se
  nombran como los anota `verify`: `test`, `lint`, `typecheck`, `build`, `go test`, `go build`, `make ci` y
  `make test`. Un gate declarado que falla se anota igual en el rastro y no frena; uno que no está declarado,
  o declarado para otra raíz, sigue frenando.
- **Que se avise mientras exista** — se hizo en `check`, que lista cada declaración con su motivo. Un hook no
  tiene cómo avisar sin frenar, y `check` es lo que se corre en cada tarea.
- **Qué se compara: el gate entero o la línea de error** — se decidió el gate entero. Comparar la línea se
  rompe en cuanto la herramienta cambia el orden o el texto de su salida. El costo, aceptado: un rojo nuevo
  dentro de un gate ya declarado no frena.
- **Tradeoff: choca con que una aprobación valga por operación** (`approval.js`) — decidido por Manuel. La
  declaración no es una aprobación: no vive en `.ops-approval`, se escribe con su motivo y `check` la muestra
  siempre.

Lo que el caso no preveía:

- **Una declaración mal escrita no puede pasar en silencio.** Sin la forma, con un gate que no existe o con una
  raíz que no está en `workspaceRoots`, la línea no declararía nada y el commit seguiría frenando sin que se
  entienda por qué. `check` lo da como error, nombrando la línea.

Prueba real:

- **La misma reproducción con el motor de esta rama**, con `app: lint — once errores de ESLint 9 heredados`
  declarado: los dos commits salieron `verify exit=0`.
- **Seis mutaciones en una copia, cada una en rojo por `test/hooks/known-red.test.js`:**
  - Ignorar lo declarado.
  - Valer para cualquier raíz.
  - Dejar pasar un gate desconocido.
  - Dejar pasar una raíz desconocida.
  - `check` sin los errores.
  - `check` sin la lista.
