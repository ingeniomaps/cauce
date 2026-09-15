---
caso: 151
titulo: La variable con la que verify evita que pnpm reinstale no la lee pnpm 11.20, así que ningún commit que cambie el lockfile puede pasar el gate
estado: resuelto
resuelto-en: 0.91.0
prioridad: alta
version-detectada: 0.89.0
---

# 151 — `npm_config_verify_deps_before_run` no surte efecto, y el gate muere en 1,2 s con un error que no es rojo

**🟢 resuelto en 0.91.0** · detectado en 0.89.0 · prioridad **alta** — el mecanismo estaba bien elegido y
el nombre no: pnpm lee sus ajustes del entorno con el prefijo `pnpm_config_`, no con el de npm

## Resumen

`commitTree` (`engine/hooks/shell.js`) materializa el índice en un temporal, enlaza `node_modules` al
proyecto y corre los gates ahí. Para que pnpm no sincronice dependencias antes de correr el script
—porque sincronizar **empieza borrando** el `node_modules` del proyecto, que llega por el enlace— devuelve:

```js
return { root: temp, temp, env: { npm_config_verify_deps_before_run: 'false' } }
```

**Esa variable no la lee pnpm 11.20.0.** Medido por conducta en un proyecto real:

```
$ npm_config_verify_deps_before_run=false pnpm exec node -e "console.log('script corrio')"
Already up to date            ← la verificación corrió igual
Done in 53ms using pnpm v11.20.0
script corrio

$ pnpm --config.verify-deps-before-run=false pnpm exec node -e "console.log('script corrio')"
script corrio                 ← sin línea de verificación: el ajuste SÍ surte efecto así
```

La primera forma es la que el motor exporta; la segunda es la documentada y funciona. El ajuste existe en
esta versión —4 coincidencias de la cadena en el `dist` del binario 11.20.0 instalado—, así que no es que
se haya retirado: es que no se toma del entorno con ese nombre.

## Reproducción

Proyecto pnpm cuyo commit incluya un cambio de `pnpm-lock.yaml` —agregar una dependencia alcanza— y
cualquier archivo sucio en el árbol que no esté en el índice, que es lo que fuerza la materialización.

Al commitear, el guard frena con:

```
BLOQUEADO: Verify falló en platform:
  test  (exit 1, 1.2 s): [ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
  lint  (exit 1, 1.2 s): [ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] …
  build (exit 1, 1.3 s): [ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] …
Los 3 volvieron en menos de 2 s: eso no alcanza para correr una suite …
```

La cadena completa, medida: pnpm verifica dependencias antes de correr el script (default `install` en
11.x) → en la copia el lockfile del índice no coincide con el `node_modules` enlazado → decide reinstalar
→ un install empieza removiendo el directorio de módulos → sin TTY aborta.

Los gates del proyecto son limpios y no invocan ningún install (`vitest run`, `eslint`, `next build`).
El mismo contenido pasa en el árbol: `test` 0 con 980 pruebas, `lint` 0, `build` 0.

## Síntoma

**El aviso del propio guard es lo único que evita leerlo como un rojo real**, y está bien puesto: dice que
tres gates que vuelven en menos de dos segundos no alcanzan para correr una suite. Sin esa línea, lo
razonable sería creer que el cambio rompió la suite.

Y la salida que el bloqueo ofrece empuja justo a lo que no hay que hacer: pegar las 18 rutas en
`.ops-approval` es commitear con el gate sin correr, y `OPS_SKIP_VERIFY=1` lo apaga toda la sesión. La
tercera —`CI=true`— es la que el **caso 070** ya marcó como regresión, porque desarma la confirmación que
es lo único que protege al `node_modules` del proyecto a través del enlace.

Lo que lo hace caro es cuándo aparece: **nunca, hasta el primer commit que toca el lockfile.** En esta
instancia `planning/.verify-log` tiene meses de corridas verdes de 7,5 s de lint y 13 s de build, y las
tres primeras rojas son las de hoy, de 1,2 s.

## Causa raíz

No es el diseño de `commitTree`, que está bien razonado y documentado: enlazar `node_modules` es correcto
—un gate sin él no corre— y quitarle a pnpm el motivo de preguntar es la decisión correcta. Lo que falla es
**cómo** se le quita el motivo: por variable de entorno en lugar de por configuración.

## Fix propuesto

1. **Pasar el ajuste por configuración y no por entorno.** La forma verificada es
   `--config.verify-deps-before-run=false` en la invocación del gate. Si el gate se invoca como comando del
   proyecto —`pnpm run test`— el flag va antes del subcomando.
2. **Comprobar que surtió efecto en vez de suponerlo.** La señal es observable y barata: con la
   verificación activa, pnpm imprime `Already up to date` (o reinstala); con el ajuste puesto, no imprime
   nada. Un test de wiring puede afirmar la ausencia de esa línea — y sería la aserción de ausencia que
   R9 pide para una quita.
3. **Y mientras eso no esté, que el bloqueo lo diga.** Un `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` no
   es un gate en rojo: es el gate que no arrancó. El mensaje ya sospecha por el tiempo; podría nombrar este
   error concreto y decir que la aprobación por ruta **no** es la salida correcta acá.

## Tradeoffs

El punto 1 depende del gestor: la forma `--config.` es de pnpm, y el motor corre gates de cualquier stack.
Lo que sirve para todos es el 2 —comprobar el efecto— porque no depende de qué herramienta sea: si la
mitigación no surte efecto, el gate falla en segundos y eso ya se puede detectar.

## Contexto de descubrimiento

2026-09-14/15, al commitear la tarea `env-schema-yaml` de una instancia sidecar: el primer commit de ese
repositorio que agrega una dependencia y por lo tanto cambia `pnpm-lock.yaml`. pnpm 11.20.0 con
`packageManager` fijado en el propio `package.json`. El contenido del commit ya había pasado el gate
completo en el árbol minutos antes, y la única diferencia entre árbol e índice era un archivo de otra
sesión que deliberadamente se dejó afuera — o sea que la materialización, y con ella el fallo, la disparó
un archivo ajeno al commit.

## Relacionados

- **070** — la regresión de `CI=true`, que este caso no debe repetir: no se desarma la confirmación, se le
  quita el motivo. Acá el motivo sigue puesto porque la vía elegida no llega.
- **068** — el síntoma original de pnpm preguntando antes de purgar.
- **069**, **045**, **095** — la familia de decisiones de `commitTree` que sí funcionan y que no hay que tocar.
- **153** — el fallo que quedó **debajo** de éste, y que corrige el alcance del título: compensado el
  ajuste de pnpm desde el proyecto —`verifyDepsBeforeRun: false` en `pnpm-workspace.yaml`, verificado:
  `test` y `lint` pasan dentro de la copia—, `build` sigue rojo porque Turbopack rechaza el `node_modules`
  enlazado. O sea que este caso es real y su mitigación funciona, pero **no** alcanza para que el commit
  pase: eso pide el **153**, que no tiene salida del lado del proyecto. ~~el 144~~ — el 144 es la puerta de
  pisos de cobertura y no tiene nada que ver; la cita estaba mal y se corrigió al cerrar.

## Cierre

**🟢 resuelto en 0.91.0** · `engine/hooks/shell.js`, `test/wiring/hooks.test.js`, `CHANGELOG.md`

El defecto es real y el diagnóstico acertó en todo salvo en el arreglo. El mecanismo —una variable de
entorno que viaja con la copia— estaba bien elegido; lo que estaba mal era **el prefijo**: pnpm lee sus
ajustes del entorno con el suyo, así que `npm_config_verify_deps_before_run` llegaba y se descartaba sin
decir nada. El arreglo es una palabra.

### Contra lo que el caso enumeró

- **Fix 1, pasar el ajuste por configuración y no por entorno** — **se hizo distinto, y por eso es más
  chico.** `--config.verify-deps-before-run=false` funciona —medido— y habría exigido inyectar un argumento
  en la invocación del gate. El entorno no estaba equivocado; el nombre sí.
- **Fix 2, comprobar que surtió efecto en vez de suponerlo** — **hecho, y era la mitad que faltaba.** La
  prueba de wiring afirma ahora que el nombre nuevo llega **y que el viejo no viaja**, que es la aserción de
  ausencia que R9 pide para una quita. Para qué sirve lo muestra la mutación m2.
- **Fix 3, que el bloqueo nombre este error y diga que aprobar por ruta no es la salida** — **no se hizo
  acá, y sale como trabajo propio.** Es el mismo ítem 3 del **153** —mostrar la salida del gate cuando
  falla en menos de N segundos— y vive en el mensaje del guard, no en esta variable. Queda nombrado porque
  ninguno de los dos casos lo cierra.
- **Tradeoff «la forma `--config.` es de pnpm y el motor corre gates de cualquier stack»** — **se cayó por
  dos lados.** `verifyGates` ya elige `pnpm` o `npm` según exista `pnpm-lock.yaml`, así que esa rama estaba
  separada desde antes; y lo que se tomó es una variable de entorno, que un gestor que no la conoce ignora
  sin costo.
- **La cita al «144» del último bullet** — estaba mal, es el **153**; el 144 es la puerta de pisos de
  cobertura. Corregida en el propio archivo.

### Lo que el caso no preveía

- **La protección no falló ahora: nunca estuvo puesta.** El nombre entró en 0.75.0 con el arreglo del
  **070**, que reemplazó `CI=true` por esta variable justamente para no desarmar la confirmación que
  protege al `node_modules`. El cierre del 070 afirmó entonces una protección que no llegó a instalarse, y
  entre 0.75.0 y 0.91.0 lo único que evitó el daño fue que pnpm 10 trae la comprobación apagada.
- **Y la prueba que tenía que atraparlo estaba verde porque fabricaba el mecanismo roto.** El `pnpm` de
  mentira preguntaba por `npm_config_…`: un doble que pregunta por un nombre que el original ignora no puede
  fallar nunca, haga lo que haga el motor. Es el mismo modo de fallo que el **149** encontró en el arnés del
  **148**, y acá también se corrigió el doble y no la aserción.
- **El comentario del motor decía «tres valores» y son cinco** —`install`, `warn`, `prompt`, `error` y
  `false`—. Segundo error de hecho en el mismo párrafo, corregido.
- **pnpm empuja a la puerta vedada.** Su propio mensaje de aborto dice «If you are running pnpm in CI, set
  the CI environment variable to "true"», que es exactamente la regresión que el 070 prohibió.

### Qué se corrió

- **Reproducción del defecto**, con pnpm 11.20.0 instalado en un banco desechable: contra el estado real
  —`package.json` pide una dependencia que `node_modules` no tiene— el control sin mitigación devuelve
  `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, exit 1, que es textualmente el error que el caso reporta.
- **La matriz, con un proyecto nuevo por fila** para que ninguna heredara el estado de la anterior. El
  primer intento no usó esa precaución: el control sincronizó el proyecto y las filas siguientes midieron
  sobre algo que ya estaba sano, así que sus resultados no valían.

  | forma | ¿corrió la comprobación? |
  | --- | --- |
  | sin mitigación (control) | sí, y reinstaló |
  | `npm_config_…`, lo que exportaba el motor | **sí, y reinstaló** |
  | `pnpm_config_…` | no |
  | `--config.verify-deps-before-run=false` | no |
  | `pnpm-workspace.yaml` | no |

- **Las dos versiones que importan dan lo mismo**: forzando `verifyDepsBeforeRun: install`, 10.30.2 y
  11.20.0 ignoran el nombre viejo y honran el nuevo. pnpm 9.15.9 **no tiene el ajuste** —cero apariciones de
  cualquiera de los dos nombres en su bundle—, así que no hay nada que romperle.
- **Rojo previo**: con el arnés corregido y el motor sin tocar, `hooks.test.js` baja de 98/98 a **96 pass,
  2 fail**, y el mensaje nombra el defecto —`actual: 'verify=vacio viejo=false'`— y la destrucción del
  `node_modules` del proyecto.
- **Tres mutaciones sobre una copia que primero corrió en verde**, las tres en rojo: volver al nombre viejo
  (2 rojas), exportar los dos nombres a la vez (1 roja, la de ausencia) y no exportar nada (2 rojas).
- **Verde final**: `npm test` **829 pruebas, 829 pass, fail 0, skipped 0**; `npm run ci` exit 0; 68 archivos
  en su piso de cobertura.
