---
caso: 240
titulo: verify corre sin timeout ni candado y escribe en el árbol que juzga
estado: resuelto
resuelto-en: 0.100.0
prioridad: alta
version-detectada: 0.99.2
---

# 240 — `verify` incumple R26: no acota su costo y escribe en el árbol del commit, y por eso las dos instancias lo apagaron

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **alta**.

**Prioridad alta**: las dos instancias relevadas lo apagaron entero con `OPS_SKIP_VERIFY=1` fijo en el entorno de cada sesión, y con eso perdieron también lo demás que `verify` mide (OpenAPI/sqlc, índice materializado, el rastro de `EV.record`). Es la salida que R26 describe: «una puerta que estorba se saltea con la variable de escape».

## Resumen

El guard de commit corre `test`, `lint`, `typecheck` y `build` del repositorio sin límite de tiempo, sin candado entre corridas simultáneas y sin cota de paralelismo, y cuando árbol e índice coinciden corre en el árbol vivo: un `build` que limpia o escribe su salida toca el trabajo de quien commitea. R26 pide lo contrario —«con un tope y con un candado», «no escribe en el árbol que juzga»—.

## Reproducción

Corrido el 2026-10-01 contra `main` (0.100.0 sin publicar), en un repositorio embedded descartable con `app.js` staged:

1. Con `"test": "sleep 30"` el hook no termina solo; lo corta un `timeout 12` de afuera (exit 124 a los 12 s).
2. Con `"test": "true", "build": "touch BUILT-BY-VERIFY"` y árbol e índice iguales, `verify` sale 0 y deja `BUILT-BY-VERIFY` en el árbol de trabajo.

## Síntoma

Un gate que cuelga deja la sesión colgada sin decir por qué, y dos sesiones que commitean a la vez corren dos suites completas en paralelo. roax-ops dejó escrito en el encabezado de `automatization/hooks/guard-roax-verify.sh` dos caídas de la máquina —14,1 GB y `systemd-oomd` el 2026-08-31; el gate tumbó la máquina el 2026-09-10— y un `nest build` con `deleteOutDir` que borró el `dist/` de la app viva.

## Causa raíz

- `engine/hooks/shell.js:459`, `run()`: `spawnSync` sin `timeout`.
- `engine/hooks/verify.js:296`: recorre `['test', 'lint', 'typecheck', 'build']` completos.
- `engine/hooks/verify.js`, `commitTree`: sin delta entre árbol e índice devuelve `{ root: dir }`, y los gates corren en el árbol vivo.
- No hay candado ni cota de workers en `engine/hooks/`.

## Fix propuesto

Lo que las dos instancias construyeron por separado, y en lo que coinciden:

- Timeout por gate, con el corte nombrado en el mensaje.
- Un candado de máquina para que corra un gate por vez.
- Sin `build` por defecto, o corrido en una copia: `typecheck` cubre lo que el commit necesita saber sin escribir salida.
- Nunca un lint con `--fix` en el árbol.
- Cota de paralelismo para los runners de pruebas (medir antes qué respeta cada uno).

## Tradeoffs

- Sacar `build` cambia lo que hoy se garantiza: un error que sólo aparece al compilar deja de frenarse en el commit. Se puede ofrecer declararlo por raíz (`workspaceRoots[].verify` existe en el schema y el hook no lo usa).
- Un timeout corto corta suites legítimamente largas: el valor tiene que ser configurable y el mensaje tiene que decir que fue el tope.

## Contexto de descubrimiento

Relevamiento de roax-ops y conorbi-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. Las dos tienen `OPS_SKIP_VERIFY=1` en el entorno (`roax-ops/automatization/settings.json:4`, `conorbi/.claude/settings.json:3`) y un reemplazo propio: `guard-roax-verify.sh` (247 líneas) y `guard-conorbi-verify.sh`.

## Relacionados

- 241 — el rojo preexistente, la otra mitad de lo que las instancias reemplazaron.
- 232 — la cota de workers fuera del commit.
- R26 (`template/planning/rules/system/runs.md`).

## Cierre

Resuelto en 0.100.0. Manuel decidió dos cosas el 2026-10-01: que lo que escribe no corra sobre el árbol salvo
que la raíz lo declare, y que el tope por defecto sea de 10 minutos.

- **Timeout por gate, con el corte nombrado** — se hizo. `run()` (`engine/hooks/shell.js`) acepta un tope y
  lanza el gate como líder de su grupo. Al cortarlo mata el grupo entero, porque `spawnSync` sólo mata al
  proceso que lanzó: medido, sin eso el `sleep` de un `npm run test` seguía vivo después del corte. El tope
  sale de `runner.gateTimeoutMinutes` y vale 10 por defecto. El bloqueo dice `test (cortado, … s): pasó el
  tope de N min (runner.gateTimeoutMinutes en ops.config.json)`.
- **Un candado de máquina** — se hizo, en `engine/hooks/machine-lock.js`. Es un archivo con el pid de quien lo
  tiene. Se espera hasta el mismo tope y después se bloquea diciendo quién lo tiene. Un pid muerto se toma.
  Sólo se suelta el propio. Un archivo todavía vacío se espera y no se roba.
- **Sin `build` en el árbol, o en una copia** — se hizo distinto. Correr siempre sobre la copia rompe los
  builds de Turbopack (caso 153) y dejaría sin efecto el alcance del 156. Sobre el árbol no corren `build` ni
  un lint con `--fix`/`--write`. Sobre la copia del índice corren todos, porque se descarta. `build` vuelve al
  árbol si el `verify` de la raíz lo nombra. `go build ./...` no se tocó: con más de un paquete no escribe en
  el árbol.
- **Nunca un lint con `--fix` en el árbol** — se hizo, con un aviso de `check`. Un hook no tiene cómo avisar
  sin frenar, y sin el aviso el gate se saltearía en silencio.
- **Cota de paralelismo para los runners de pruebas** — no le toca a este caso: es el 232, que pide medir
  antes qué cota respeta cada runner.
- **Tradeoff: sacar `build` deja de frenar un error que sólo aparece al compilar** — aceptado, con la salida de
  declararlo por raíz. `typecheck` sigue corriendo.
- **Tradeoff: un timeout corto corta suites largas** — por eso es configurable y el mensaje nombra la llave.

Lo que el caso no preveía:

- **El rastro de `verify` mandaba a la copia todas las corridas siguientes**, en una instancia sin
  `planning/.verify-log` en el `.gitignore`. El molde ya lo ignora, así que no es un defecto, pero explica por
  qué mi primera reproducción del arreglo daba mal: lo encontré ahí.

- **Esperar el candado sólo un tope se rendía con una corrida sana a la mitad.** Lo mostró la suite completa:
  otra prueba tenía el candado y ésta se cansó a los 1,2 s. Quien lo tiene corre hasta cuatro gates, así que
  se espera cuatro topes.
- **Una prueba ajena se rompió por la cantidad de archivos.** `test/repo/coverage-floors.test.js` armaba su
  copia con `git ls-files -z | xargs -0 tar cf -`. Con los veinte casos nuevos, `xargs` partió la lista en
  dos `tar` y el `tar xf` del otro lado extrajo sólo el primero, así que la copia salió sin
  `test/tools/coverage.sh`. Medido: dos llamadas de `xargs` sobre el árbol actual. Se pasó a
  `tar --null -T -`, que lee la lista por stdin.

- **Se abrió como 219 y se renumeró a 240**, junto con el 220 a 241. Otra sesión abrió el mismo día su 219 y
  su 220, y los mergeó antes; según `docs/issues/README.md`, se mueve el que todavía no se publicó. Los
  mensajes de los commits de esta rama dicen `Refs: docs/issues/219`: quedaron así porque la rama ya estaba
  empujada, y reescribirla es lo que R8 prohíbe.

Prueba real:

- **La reproducción del caso, repetida sobre el arreglo** con `runner.gateTimeoutMinutes: 0.1`:

  ```
  1. test colgado: exit=2 tras 6 s; huérfanos: 0
  BLOQUEADO: Verify falló en r219: test (cortado, 6.0 s): pasó el tope de 0.1 min (runner.gateTimeoutMinutes …)
  2. árbol = índice: exit=0; build escribió en el árbol: no
  3. con build declarado en verify: exit=0; build escribió: BUILT-BY-VERIFY
  ```

  Antes del arreglo, el paso 1 lo cortaba un `timeout 12` de afuera (exit 124) y el paso 2 dejaba
  `BUILT-BY-VERIFY` en el árbol.
- **Siete mutaciones en una copia, cada una en rojo por `test/hooks/verify-bounded.test.js`:**
  - Sin tope.
  - Sin matar el grupo. La primera versión de la prueba no la veía: npm le reenvía el corte a su `sh`, y el
    `touch` de la marca moría con él. Ahora la marca la escribe un nieto, que sólo muere si se mata el grupo.
  - Todo en el árbol.
  - Ignorar el `build` declarado.
  - No tomar el candado abandonado.
  - Soltar el ajeno.
  - No esperar.

**Después del cierre (2026-10-02).** El candado era de la máquina también para la suite de pruebas. En la
corrida del caso 227, dos pruebas de `verify` esperaron casi diez minutos detrás del commit real de otra
sesión, y la del tope se rindió. La ruta ahora se resuelve al usarse (`CAUCE_VERIFY_LOCK`, o el temporal del
sistema), y `test/support/environment.js` la mueve al temporal de cada corrida. Moverlo no lo apaga: dentro de
quien lo comparte sigue corriendo uno por vez. Lo prueban dos casos de `test/hooks/verify-bounded.test.js`, y
la mutación que ignora la variable se pone roja.
