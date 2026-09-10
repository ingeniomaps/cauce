---
caso: 068
titulo: El índice materializado de `verify` hace que pnpm quiera borrar el `node_modules` real del proyecto
estado: resuelto
resuelto-en: 0.74.0
prioridad: alta
version-detectada: 0.73.0
---

# 068 — `verify` enlaza el `node_modules` del proyecto y pnpm intenta purgarlo; lo frena que no haya TTY

**🟢 resuelto en 0.74.0** · detectado en 0.73.0 · prioridad **alta** — bloquea todo commit parcial en un proyecto pnpm, y el único motivo por el que no borró nada es una comprobación de terminal que no está ahí para esto

## Resumen

Cuando el árbol y el índice difieren —o sea, en **todo commit parcial**, que es lo que R8 pide, y
también con **un solo archivo sin trackear**, que es lo que este caso no había visto—, `verify`
materializa el índice en un temporal y enlaza ahí lo ignorado, `node_modules` incluido. El enlace apunta
al `node_modules` **real** del proyecto.

En un proyecto pnpm eso no corre. pnpm 11 comprueba sincronía con el lockfile antes de ejecutar un
script, en la copia esa comprobación no cuadra —el árbol enlazado no fue instalado *ahí*— y su reacción
no es negarse: es **reinstalar**, y para reinstalar primero borra el directorio de módulos.

```
$ pnpm run test        # dentro del índice materializado
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY

If you are running pnpm in CI, set the CI environment variable to "true", or set
"confirmModulesPurge" to "false".
```

~~Lo que abortó ese borrado fue **la falta de TTY**, no un límite de Cauce.~~ **Corregido al contrastar
contra el código (2026-09-09):** la falta de TTY sí es de Cauce. `run()` —`engine/hooks/shell.js:358`—
lanza todo gate con `stdio: 'pipe'`, así que el hijo nunca ve una terminal. No fue suerte: es una
propiedad de cómo el guard ejecuta.

Eso acota el susto y no lo elimina, y conviene decir exactamente cuánto. El borrado no ocurre por el
camino del guard mientras `run` no cambie de `stdio`; sí ocurre en cuanto alguien reproduce a mano
—como hizo este mismo caso— o si un gate se aloca su propia terminal. El directorio apuntado es el del
proyecto de quien commitea, no una copia, y eso no cambió.

## Reproducción

Proyecto con `packageManager: pnpm@11.x` y un gate declarado como `pnpm run test && …`:

1. Stagear **una parte** de los cambios (que árbol e índice difieran).
2. `git commit -m "…"`.

El guard responde `Verify falló en <servicio>: test (exit 1), lint (exit 1), build (exit 1). No se
commitea en rojo.`

Reproducción manual de la copia, que es lo que confirma el mecanismo:

```
git checkout-index -a -f --prefix=$T/
git status --porcelain --ignored | grep '^!! ' | while read n; do ln -s "$PWD/$n" "$T/$n"; done
cd $T && pnpm run test        # ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
```

En ese mismo temporal, `npx vitest run` pasa: **62 archivos, 943 pruebas**. O sea que el código está
sano y lo que falla es el gestor de paquetes al arrancar el script.

## Síntoma

Dos cosas, y la segunda es la que preocupa.

**El mensaje dice lo contrario de lo que pasó.** «No se commitea en rojo» describe una suite que falló;
acá ningún gate llegó a ejecutarse. Se distingue por el tiempo, y sólo si a alguien se le ocurre
mirarlo: en `planning/.verify-log` de una instancia real, los tres gates fallidos están a **1,2 segundos**
uno del otro, contra 13 s, 7 s y 13 s de la corrida siguiente —la del commit donde árbol e índice ya
coincidían y los gates corrieron de verdad—.

```
{"at":"…T23:32:33Z","gate":"test","status":1}
{"at":"…T23:32:35Z","gate":"lint","status":1}
{"at":"…T23:32:36Z","gate":"build","status":1}
{"at":"…","gate":"test","status":0}            ← corrida real, 13 s
```

El `at` lo escribe `EV.record` en cada línea; el excerpt original lo omitía y por eso parecía que el
tiempo había que deducirlo de afuera.

**Y la salida que el guard ofrece no arregla nada, aunque no por lo que este caso decía.** Frente a un
rojo que no entiende, el mensaje propone `planning/.ops-approval` o `OPS_SKIP_VERIFY=1`.

~~Quien la use en un entorno con TTY reabre el borrado.~~ **No es así, y las dos se portan distinto entre
sí**, que es lo que importa para quien las use:

- `OPS_SKIP_VERIFY=1` sale antes de materializar nada (`verify()`, primera línea): no hay copia, no hay
  gate, no hay riesgo — y tampoco hay medición, para toda la sesión.
- `planning/.ops-approval` **no saltea los gates**: `verifyGates` los corre igual y sólo se calla el
  bloqueo del final. O sea que en un proyecto pnpm el intento de purga vuelve a ocurrir en cada commit
  aprobado, con el mismo `stdio: 'pipe'` conteniéndolo.

Lo que sí es cierto y es el problema: ninguna de las dos toca la causa, y la que el mensaje recomienda
—la aprobación por rutas— deja al usuario aprobando como «rojo conocido» un commit que **nunca se midió**.

## Causa raíz

`engine/hooks/shell.js`, `commitTree()` (línea 383): lo ignorado se enlaza al temporal con
`symlinkSync` apuntando al original (línea 405). El comentario de al lado explica bien por qué se enlaza
y no se copia —`node_modules` es entorno, no código del commit— y esa parte es correcta. Lo que la
decisión no contempla es que **el gate puede escribir sobre lo enlazado**.

**Y es más ancho que pnpm, más ancho de lo que este caso vio al escribirse.** El bucle enlaza **todo**
lo que `git status --ignored` marca con `!!`, no sólo `node_modules`. En un proyecto cualquiera eso
incluye la salida de build —`.next/`, `dist/`— y los directorios de caché y cobertura. Los gates que el
propio `verifyGates` corre son `test`, `lint`, `typecheck` y `build`: **`build` escribe en la salida de
build, y `test` con cobertura escribe su reporte**, los dos a través del enlace, o sea en el árbol real
de quien commitea.

Eso ya está pasando hoy, en cada commit parcial, en todo proyecto. No rompe nada visible —el usuario
termina con su `.next/` regenerado, que es lo que habría pasado corriendo el build a mano— y por eso
nadie lo notó. La purga de pnpm no es un caso especial: es la instancia más filosa de una propiedad
general, que **la copia sólo está aislada para lo trackeado**.

Dicho de otra forma, y es lo que hay que arreglar: se asumió que un gate lee su entorno, y los gates
escriben en él.

## Fix propuesto

Tres capas, de la más barata a la más completa:

```diff
  const started = run('git', ['init', '--quiet'], temp)
  if (started.ok) run('git', ['add', '--all'], temp)
- return { root: temp, temp, env: {} }
+ // Un gate puede escribir sobre lo enlazado. Marcar la copia como no interactiva evita que un gestor
+ // de paquetes decida reinstalar sobre el node_modules del proyecto.
+ return { root: temp, temp, env: { CI: 'true' } }
```

**Va en ese `return` y no en el otro, que es una precisión que este caso no tenía.** `commitTree` sale
por dos lados: el temprano (línea 390), cuando árbol e índice coinciden y los gates corren en el
directorio del usuario, y el final, que es el de la copia. Poniendo `CI=true` arriba se le cambiaría el
entorno al usuario en su propio árbol sin ninguna razón — que es justamente el tradeoff que este caso
enumera y que acá se evita entero.

`run()` mezcla ese objeto sobre `process.env` (línea 356), así que llega al gate tal cual. `CI=true` es
lo que el propio mensaje de pnpm nombra, y es una variable que cualquier gate razonable ya espera. No
arregla la causa —un gate sigue pudiendo escribir por el enlace— pero cierra el camino que hoy está
abierto.

Segundo, **el enlace de sólo lectura donde el sistema lo permita**: un bind mount `ro`, o al menos
enlazar el almacén virtual y no el árbol. Es más caro y más dependiente de la plataforma.

Y tercero, independiente de los otros dos: **que el bloqueo distinga «falló» de «no corrió»**. Un gate
que termina en menos de un segundo con salida de error del gestor no es una suite en rojo, y decirlo
cambia qué hace quien lo lee — hoy lo empuja a aprobar un commit que cree rojo cuando en realidad nunca
se midió.

**Esta capa es más barata de lo que este caso suponía.** `EV.record` ya escribe un `at` por gate
—`engine/core/evidence.js:39`, `{"at":…,"gate":…,"status":…}`—, así que el dato de tiempo ya está en
disco y el excerpt de arriba lo omitía. Lo que falta es la duración **del gate**, que es un parámetro
más en `record` y no una heurística sobre marcas de tiempo consecutivas. Con eso el umbral se aplica a
un número propio en vez de a una resta entre líneas.

## Contrastado contra el código, 2026-09-09

Lo que este caso afirma se cruzó con `engine/hooks/shell.js` y `engine/core/evidence.js` antes de
tomarlo. Queda dicho qué se sostuvo y qué no, porque quien lo arregle va a leer las dos cosas:

| Afirmación | Veredicto |
|---|---|
| Se materializa el índice y se enlaza lo ignorado al original | **se sostiene** (`:389`, `:405`) |
| Ocurre en todo commit donde árbol e índice difieren | **se sostiene** (`:389`) |
| Los gates corren con el `env` que devuelve `commitTree` | **se sostiene** (`:474`, `:356`) |
| El borrado lo abortó la falta de TTY «y no un límite de Cauce» | **corregido**: es `stdio: 'pipe'` en `run()` (`:358`), o sea de Cauce |
| Las dos salidas del guard reabren el borrado | **corregido**: `OPS_SKIP_VERIFY` no corre nada; `.ops-approval` sí corre los gates |
| El problema es de pnpm y de herramientas que se auto-sincronizan | **incompleto**: se enlaza todo lo ignorado, y `build` ya escribe en la salida real |
| El tiempo hay que deducirlo | **incompleto**: `EV.record` ya guarda `at` por gate |
| Se dispara en todo commit parcial | **más ancho**: cualquier archivo sin trackear también lo dispara (`:391`) |

Ninguna corrección baja la prioridad. La mitad que bloquea —todo commit parcial en un proyecto pnpm,
con un mensaje que dice lo contrario de lo que pasó— no depende de ninguna de ellas.

## Tradeoffs

- `CI=true` cambia el comportamiento de algunas herramientas —menos color, sin prompts, a veces más
  estricto—. Eso es lo que se quiere en un gate, pero es un cambio observable: alguien puede tener un
  gate que se comporte distinto bajo esa variable. Poniéndolo sólo en el `return` de la copia, un
  proyecto sin commit parcial nunca lo ve.
- Distinguir «no corrió» de «falló» pide clasificar salidas de herramientas ajenas, que es frágil. Una
  heurística conservadora —código de salida del gestor y duración por debajo de un umbral— ya alcanza
  para cambiar el mensaje sin prometer un diagnóstico.

## Contexto de descubrimiento

Instancia real (sidecar, 0.73.0), 2026-09-09, proyecto Next.js con `pnpm@11.20.0`. El commit era un
split por naturaleza: dos archivos de una nature en el índice y otros dos en el árbol. Los tres gates
volvieron en rojo, y la sospecha empezó por el tiempo, no por el mensaje. El commit siguiente —ya con
árbol e índice iguales— pasó con los gates corriendo de verdad, que es lo que confirmó el mecanismo.

## Relacionados

- **0.65.0, «Los gates corrían sobre tu directorio y el commit graba el índice»** — la mejora que
  introdujo esta materialización. El diagnóstico de entonces sigue siendo correcto; lo que faltó
  contemplar es que un gate escriba sobre lo que se le enlaza.
- **R8** — un commit por naturaleza del diff. Es lo que garantiza que árbol e índice difieran, así que
  este caso se dispara justamente cuando alguien sigue la regla.

## Cierre

**Resuelto en 0.74.0 en dos de sus tres capas**, y la tercera sale como caso propio en vez de quedarse
adentro de éste.

- **Capa 1, la copia se marca no interactiva.** `commitTree` devuelve `env: { CI: 'true' }`, y sólo en
  el `return` de la copia: por el otro los gates corren en el árbol del usuario y ahí cambiarle el
  entorno no tiene razón. Medido por lo que el gate **recibe** y no por lo que la función devuelve,
  porque entre una cosa y la otra está `run`, que mezcla el objeto sobre el entorno del proceso.
- **Capa 3, el bloqueo deja de ser mudo, y salió distinto de como este caso lo proponía.** No hizo falta
  ninguna heurística de duración para clasificar: lo que faltaba era **mostrar lo que la herramienta
  dijo**. El mensaje tiraba la salida, así que una suite en rojo y un gestor que se negó a arrancar el
  script llegaban con el mismo `test (exit 1)`. Ahora llega
  `test (exit 1, 0.1 s): ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, y nadie tiene que inferir nada.
- **La duración se agregó igual, como hecho y no como veredicto.** Va en el registro —`ms` por gate— y
  en el mensaje; y cuando **todos** los gates fallaron por debajo de dos segundos se agrega una línea
  con ese número, sin afirmar que no corrieron: un lint puede fallar rápido y de verdad.
- **Capa 2, el enlace de sólo lectura, no se hizo y sale como el [069](069-la-copia-de-verify-solo-esta-aislada-para-lo-trackeado.md).**
  No es una postergación por costo: es que este caso reportó el síntoma de pnpm y la capa 2 ataca una
  propiedad más ancha que apareció al leer el código —los gates escriben en el árbol del usuario a
  través de los enlaces, y `build` ya lo hace hoy en cada corrida—. Meterla acá la dejaría cerrada
  dentro de un caso que habla de otra cosa.
- **Tradeoff «`CI=true` cambia el comportamiento de algunas herramientas» — se paga, acotado.** Sólo lo
  ve la copia; un proyecto donde árbol e índice coinciden y no hay nada suelto nunca lo ve. La prueba
  fija las dos mitades.
- **Tradeoff «distinguir “no corrió” de “falló” pide clasificar salidas ajenas, que es frágil» — no se
  pagó, porque no se clasifica.** Se muestra la línea de error y el número; quien lee decide.

**Lo que apareció y el enunciado no preveía: se dispara más seguido de lo que el caso creía.** La
condición mira cualquier diferencia entre lo que `git status` lista y el índice, así que **un archivo
sin trackear alcanza**. Medido: con todo staged y nada suelto el gate ve `CI=vacio`; agregando un solo
`suelto.txt` ve `CI=true`. O sea que la materialización —y con ella el intento de purga— no es sólo del
commit parcial: es de casi cualquier commit en un árbol de trabajo normal.

**Y una precisión sobre la primera línea de error que conviene registrar**, porque costó dos intentos:
npm y pnpm imprimen el eco del script antes de correrlo, y esa línea lleva el comando entero. Con el
eco adentro, un script que **menciona** una palabra de error gana siempre la búsqueda — pasó en la
primera corrida de esta prueba. Se descartan las líneas que empiezan con `>`.

Cuatro mutaciones comprobadas: quitar el `CI` de la copia, quitar la línea de error, quitar el aviso de
tiempo, y quitar la duración del registro. Las cuatro ponen su prueba en rojo.
