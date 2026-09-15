---
caso: 153
titulo: El `node_modules` enlazado que verify usa rompe cualquier build de Turbopack, y el proyecto no tiene forma de compensarlo
estado: resuelto
resuelto-en: 0.92.0
prioridad: media
version-detectada: 0.89.0
---

# 153 — Turbopack rechaza el enlace que `commitTree` necesita, así que el gate de un proyecto Next no puede pasar

**🟢 resuelto en 0.92.0** · detectado en 0.89.0 · prioridad **media** — declarar `scope` hace que un
archivo ajeno al commit no fuerce la copia que rompe el build, y se comprobó contra un `next build` real

> **Medido el 2026-09-15 sin arreglarlo.** De las tres opciones que este caso proponía, dos quedaron
> cerradas —la 2 descartada por medición, la 3 ya existía desde 0.74.0 con su premisa equivocada— y la
> que queda no es un arreglo sino un cambio de contrato, que salió como **156**. El defecto sigue en pie:
> por eso esto no se cierra.
>
> **Segunda tanda el 2026-09-15**, sobre las dos dimensiones que este caso declaraba sin medir. Las dos
> se midieron y **las dos corrigen al caso**: el *bind mount* no sirve, y por una razón más fuerte que la
> portabilidad que se le atribuía; y la línea que el guard muestra **sí** es la de Turbopack, así que la
> sospecha de que la causa quedaba escondida era falsa. Se midió además una vía que ningún caso
> contemplaba —`cp -al`— y quedó descartada. Nada de esto destraba el defecto: sigue siendo el **156**.

## Resumen

`commitTree` (`engine/hooks/shell.js`) materializa el índice en un temporal y **enlaza** lo ignorado que un
gate no puede fabricar: `node_modules`, `.env`, credenciales. La decisión está bien razonada —sin
`node_modules` no corre ningún gate— y funciona para `vitest` y `eslint`.

No funciona para `next build`. Turbopack se niega a seguir un symlink que apunte afuera de la raíz del
proyecto:

```
Error [TurbopackInternalError]: Symlink [project]/node_modules is invalid,
it points out of the filesystem root

Debug info:
- Execution of find_package failed
- Symlink [project]/node_modules is invalid, it points out of the filesystem root
[ELIFECYCLE] Command failed with exit code 1.
```

Reproducido a mano replicando exactamente lo que hace `commitTree`: `checkout-index -a --prefix=$T/`,
`ln -s <proyecto>/node_modules $T/node_modules`, `pnpm run build` adentro.

## Reproducción

1. Proyecto Next 16 con `next build` entre los gates del servicio (Turbopack es el default).
2. Cualquier archivo sucio en el árbol que no esté en el índice — basta uno ajeno al commit.
3. Commitear. `test` y `lint` pasan dentro de la copia; `build` vuelve en **2,2 s** con `[ELIFECYCLE]`.

~~El guard informa sólo el código de salida, así que el mensaje de arriba no se ve: hay que replicar la
copia para leerlo.~~ **Falso, medido el 2026-09-15**: el bloqueo muestra la primera línea de error desde
0.74.0, y con esta salida la que elige es la del `TurbopackInternalError` —el detalle, en la opción 3—. Lo
que no se ve sin replicar la copia es el resto del volcado, que es otra cosa y es deliberado. En el árbol,
el mismo contenido compila en 3,6 s y genera sus 5 páginas estáticas, exit 0.

## Síntoma

Los dos gates que pasan hacen el fallo más difícil de leer, no más fácil: con `test` y `lint` en verde, un
`build` en rojo parece un problema de compilación del cambio. Y el tiempo lo delata sólo si alguien lo
mira — 2,2 s para un build que tarda segundos de compilación más la generación estática.

**Y no hay salida del lado del proyecto.** El **151** se compensa declarando un ajuste de pnpm en el
repositorio; acá no existe el equivalente: Turbopack no tiene una opción para aceptar el enlace, y volver a
webpack sería degradar el producto para satisfacer al andamio. Quedan sólo las dos salidas que el bloqueo
ofrece —aprobar las rutas, o `OPS_SKIP_VERIFY=1`—, y las dos significan commitear sin haber corrido el
gate sobre lo que se graba, que es justo lo que el mecanismo vino a garantizar.

## Causa raíz

El enlace es la mitad deliberada del arreglo de `commitTree`: lo ignorado que el gate no puede fabricar
viaja por enlace para no copiar gigabytes. Turbopack, en cambio, valida que todo lo alcanzable esté bajo la
raíz del proyecto, y un symlink absoluto hacia afuera no lo está.

## Fix propuesto

1. **No materializar cuando el delta no puede cambiar el veredicto.** Hoy alcanza un archivo sucio
   cualquiera para materializar. Si las rutas que difieren entre árbol e índice no están en el alcance del
   gate —un `tsconfig.json` de otra sesión, un README—, correr en el lugar es lo mismo y no rompe nada. Es
   la salida más barata y la que más casos cubre.
2. ~~**Montar `node_modules` dentro de la raíz en vez de enlazarlo hacia afuera**: un *bind mount* donde el
   sistema lo permita, o un enlace **relativo** que quede bajo la raíz de la copia.~~ **La mitad barata está
   descartada por medición** (2026-09-15). Un enlace relativo no cambia a dónde llega, sólo cómo se escribe:

   | forma | ¿resuelve dentro de la copia? |
   | --- | --- |
   | absoluto hacia afuera, lo que hace hoy `commitTree` | **no** |
   | relativo (`../proyecto/node_modules`) | **no** — y el gate igual lo lee |
   | copiado adentro | sí |

   Turbopack rechaza por el **destino**, así que el relativo no lo evita. Lo único que deja `node_modules`
   bajo la raíz es copiarlo, que es exactamente lo que `commitTree` evita para no copiar gigabytes por
   commit. ~~Queda el *bind mount*, que el propio caso ya señala como lo menos portable —y el **069** lo
   descartó por eso mismo: en dos de las tres plataformas no hay equivalente directo—.~~

   **El *bind mount* también está descartado, medido el 2026-09-15, y la razón no es la portabilidad.**
   Un montaje **vive en el namespace que lo creó**: para que sirviera, `commitTree` tendría que montar y
   lanzar los gates dentro del mismo namespace, no sólo montar. Y montar no puede: pide privilegios que un
   guard no tiene. Medido en Linux 6.8.0 (uid 1000, `CapEff: 0000000000000000`):

   | vía | resultado |
   | --- | --- |
   | `mount --bind` directo | `debe ser superusuario para utilizar mount` |
   | `mount -t overlay` | `debe ser superusuario para utilizar mount` |
   | `mount --bind` dentro de `unshare --user --mount` | el montaje no sobrevive al proceso |
   | hardlink del directorio | `no se permiten enlaces fuertes para directorios` |

   El **069** lo descartó diciendo «en dos de las tres plataformas no hay equivalente directo», y eso deja
   creer que en Linux sí lo hay. **En Linux tampoco**, sin privilegios. La corrección importa porque ese
   «en Linux sí» es lo que mantenía la vía viva en los dos casos.

   Una advertencia para quien repita esto: acá `unshare --map-root-user` falló con `Operación no
   permitida` al escribir `/proc/self/uid_map`, y **eso fue el entorno de medición, no la plataforma** —
   `apparmor_restrict_unprivileged_userns=1`—. El kernel sí da user namespaces: `unshare --user true`
   pasa. Decirlo separa una limitación local de una propiedad del sistema, que es lo que estuvo a punto de
   escribirse al revés.

4. ~~**Copiar `node_modules` con hardlinks de archivo** (`cp -al`): deja un directorio real bajo la raíz,
   que es lo que Turbopack exige, sin duplicar los bytes.~~ **Descartada por medición** (2026-09-15).
   Parecía el hueco entre «enlazar el directorio», que Turbopack rechaza, y «copiar gigabytes», que el
   caso evita. Falla por dos razones independientes, cada una suficiente:

   - **Los symlinks internos no resuelven dentro de la copia.** Un `node_modules` de pnpm es un bosque de
     enlaces relativos hacia `.pnpm/`; `cp -al` copia el enlace como enlace, y en la copia la cadena se
     rompe: `readlink -f dep7` devuelve vacío.
   - **Escribir en la copia pisa el original.** Un hardlink es el mismo inodo: al escribir el
     `package.json` de un paquete dentro de la copia, el del proyecto quedó con el contenido nuevo. Es
     exactamente el daño que el **069** fue a evitar, reintroducido por otra puerta.

   Y el número que faltaba para poder descartar la copia de verdad: sobre un `node_modules` real de esta
   máquina —3,0 G, 66 420 archivos, 4 180 symlinks—, 2 000 archivos (24 MB) costaron **2,56 s**, o sea
   **~85 s por commit** extrapolado al árbol entero, contra los **157 ms** que hoy tarda `checkout-index`.
   El caso decía «gigabytes» sin número; el número es ése.
3. ~~**Que el guard muestre la salida del gate cuando falla en menos de N segundos.**~~ **Ya existe, y la
   premisa de este punto estaba equivocada.** El bloqueo muestra la primera línea de error del gate desde
   **0.74.0** —`030bd544`, quince versiones antes de la que este caso midió— junto con la duración y el
   aviso de que volver en menos de 2 s no alcanza para correr una suite. La cita a «el 142» era errónea: el
   142 es sobre propuestas firmadas sin salida. El caso de esta familia es el **094**.

   ~~Lo que **no** queda establecido es por qué quien escribió este caso no vio esa línea, y se declara en
   vez de suponerse: `run()` compone `stdout` entero y después `stderr` entero —no intercalados— y
   `fallo()` elige la primera línea que matchea `ERROR_LINE` entre las que no empiezan con `>`. Con una
   salida real de Next, cualquier línea de `stdout` que contenga «error» o «fail» gana antes que el
   `TurbopackInternalError` de `stderr`. Medirlo pide la salida real de un `next build`, que no se tiene
   acá.~~

   **Medido el 2026-09-15, y la sospecha era falsa: gana el `TurbopackInternalError`.** No hacía falta un
   `next build` — lo que había que medir no es Next sino la selección de línea, y la salida de Turbopack
   está citada literal más arriba en este mismo caso. Ejercido el `fallo()` del motor, extraído del fuente
   y no reimplementado, sobre esa salida precedida del eco de pnpm, la línea elegida es:

   ```
   Error [TurbopackInternalError]: Symlink [project]/node_modules is invalid,
   ```

   Falla la predicción porque ignoraba dos filtros de `engine/hooks/shell.js`. El eco `>` se descarta en
   `:577`, así que `> next build` no compite; y `:578` busca **primero** una marca de prueba fallada
   (`FAILED_TEST`), que la salida de Next no tiene, antes de caer al `ERROR_LINE` de `:579`. Para cuando
   se llega ahí, `stdout` ya no aporta ninguna línea con «error» o «fail» y la primera coincidencia es la
   de Turbopack.

   **Así que quien commitea sí ve la causa**, y este caso no tiene nada pendiente por acá. Queda en pie lo
   que el **Síntoma** describe —dos gates en verde hacen que el rojo parezca del cambio—, que es otra cosa
   y no se arregla mostrando una línea.

El 1 es lo único que queda en pie, y **no es un arreglo sino un cambio de contrato**: salió como caso
propio, el **156**.

## Tradeoffs

El 1 cambia cuándo se confía en el árbol, que es exactamente la garantía que `commitTree` fue a construir:
hay que definir «en el alcance del gate» sin adivinar, y lo honesto es por ruta declarada en
`ops.config.json` y no por heurística. El 2 es más fiel al diseño actual pero depende de qué acepte cada
herramienta, así que su verde no se puede afirmar sin medirlo con Turbopack delante.

**Y ese último tradeoff se cobró solo.** La mitad barata del 2 —el enlace relativo— se midió y no llega a
Turbopack: falla antes, en que sigue resolviendo afuera de la copia. O sea que no hizo falta Turbopack para
descartarla, y la predicción de que «su verde no se puede afirmar sin medirlo» era correcta por una razón
más simple que la prevista.

**Y la otra mitad del 2 se cobró igual, midiéndola.** «Depende de qué acepte cada herramienta» daba por
sentado que la herramienta llegaría a opinar; no llega, porque el mecanismo no está disponible para quien
tendría que usarlo. Un tradeoff planteado sobre la compatibilidad se resolvió en la capa de abajo.

**Una corrección de alcance que este caso arrastra.** El texto habla de «lo ignorado» en general, y eso
hace parecer el problema más ancho de lo que es: `RECREABLE` (`engine/hooks/shell.js:401`) ya excluye
`.next`, `.turbo`, `dist`, `build` y compañía, así que la salida de Next **no** se enlaza —se reconstruye
dentro de la copia—. Lo único que viaja por enlace y rompe a Turbopack es `node_modules`. Importa para
quien vaya a arreglarlo: la superficie es un nombre, no una categoría.

## Prioridad

**Alta, y ahora con un solo camino.** Sigue bloqueando todo commit de un proyecto Next cuando árbol e índice
difieren, y lo único que puede destrabarlo es el **156**: mientras `node_modules` viaje por enlace, la copia
rompe el build, y mientras cualquier archivo sucio fuerce la copia, basta un README suelto para dejar sin
gate a quien commitea. ~~Baja el día que el 156 se resuelva, o si aparece una vía sobre el enlace que estas
mediciones no cubrieron —el *bind mount* sigue sin medirse, y sigue siendo lo menos portable—.~~

~~**Baja el día que el 156 se resuelva, y ya no hay una segunda puerta esperando medición.**~~ Las cuatro
vías que dejarían `node_modules` bajo la raíz de la copia están medidas y descartadas —enlace relativo,
bind mount, overlay, hardlinks— y la quinta, copiar de verdad, cuesta ~85 s por commit. O sea que el
enlace se queda, y lo que tiene que cambiar es **cuándo se hace la copia**, no cómo se puebla. Eso es el
156, y esta tanda lo deja como única salida por eliminación y no por preferencia.

**Y el 156 se resolvió en 0.92.0, así que esto baja a media: la vía existe y falta comprobarla acá.** Una
raíz puede declarar `scope` junto a `verify` y un archivo que el gate no va a abrir deja de forzar la
copia, que es lo que dejaba a un proyecto Next sin poder commitear. Lo que **no** está comprobado es el
final del recorrido: que con `scope` declarado un `next build` real pase dentro del gate. Eso pide un
proyecto Next y no se puede correr desde este repositorio, así que el caso sigue abierto — lo que cambió
es que ya no espera una decisión de diseño sino una corrida.

Queda cerrado el día que alguien declare el alcance en una instancia con Next y commitee con el árbol
sucio. Si ahí el gate pasa, se cierra citando esa corrida; si no pasa, lo que aparezca es un caso nuevo y
no este mismo, porque la causa ya no sería el enlace.

## Contexto de descubrimiento

2026-09-14/15, commiteando la tarea `env-schema-yaml` de una instancia sidecar. El fallo apareció después
de resolver el **151**: con pnpm ya sin motivo para reinstalar, `test` y `lint` pasaron dentro de la copia y
quedó este solo.

**Y lo que forzaba la materialización era un residuo del propio recorrido, no un archivo ajeno.** Su fase
Review corrió `NEXT_DIST_DIR=.next-review pnpm run build` para no pisar `.next`, borró la sonda acto seguido
citando P16 —bien— y dejó en `tsconfig.json` un `include` apuntando a `.next-review/**`, un directorio que ya
no existe y que el `.gitignore` tampoco cubre. Ese archivo modificado y sin stagear es lo que hacía diferir
árbol e índice. Vale anotarlo porque es la forma en que este caso se dispara en la práctica: **una sonda que
limpia su salida pero no su configuración deja el árbol sucio, y con el árbol sucio el gate del commit
siguiente no puede correr**. El defecto de este caso es independiente de eso —Turbopack rechaza el enlace
venga el delta de donde venga—, pero quien lo reproduzca conviene que sepa que el disparador más probable no
es trabajo de otra persona sino basura propia.

## Relacionados

- **151** — el otro fallo del mismo mecanismo, ése sí compensable desde el proyecto. Los dos juntos hacen
  que un commit con lockfile en un proyecto Next no pueda pasar el gate de ninguna forma limpia.
- **069**, **045**, **095** — las decisiones de `commitTree` que sí funcionan y que este caso no propone
  tocar.
- **152** — la tercera del día sobre la misma superficie: el guard que decide con un id de runner distinto
  del que escribió el plan.
- **156** — lo que salió de medir este caso, y lo que lo destrababa. **Resuelto en 0.92.0**: una raíz
  declara `scope` junto a `verify` y un archivo que el gate no va a abrir deja de forzar la copia. Era un
  cambio del contrato que cada instancia recibe y no un arreglo de éste, y por eso vivió aparte. Lo que
  queda acá no es diseño sino una corrida contra un `next build` real.
- **094** — el caso de la familia de la opción 3, que la cita a «el 142» nombraba mal.

## Cierre

**🟢 resuelto en 0.92.0** · lo resuelve el **156** (`scope` por raíz); acá está la corrida que lo comprueba
contra Next real, que es lo único que este caso tenía pendiente.

El enlace se queda: las cinco vías para meter `node_modules` bajo la raíz de la copia están medidas y
descartadas. Lo que cambió es **cuándo** se hace la copia.

### La corrida, sobre Next 16.1.1 de verdad

Banco desechable con `next build` como puerta —producto en `app/`, instancia sidecar en `ops/`,
`node_modules` real de 298 MB, Turbopack por default—. Línea base: el árbol limpio compila en **4,74 s** y
genera sus páginas estáticas.

| escenario | `scope` | delta | corrió sobre | veredicto |
| --- | --- | --- | --- | --- |
| A | no | `?? NOTAS.md` (ajeno) | **copia** | **BLOQUEADO** — `build (exit 1, 1.9 s)` |
| B | sí | `?? NOTAS.md` (ajeno) | **árbol** | **PASA** |
| C | sí | `?? src/app/sucio.ts` (dentro) | **copia** | BLOQUEADO — `build (exit 1, 2.0 s)` |
| D | sí | nada sucio | **árbol** | PASA |

**A es el defecto de este caso, reproducido por primera vez acá.** Replicando la copia a mano se lee la
causa entera, que hasta hoy sólo constaba de una sesión ajena:

```
- Execution of find_package failed
- Symlink node_modules is invalid, it points out of the filesystem root
  type: 'TurbopackInternalError'
```

**B es el cierre**: el mismo commit, el mismo archivo sucio, y el gate pasa. **C y D son los controles que
lo vuelven legible**: sin ellos, el verde de B no distingue «el alcance decide» de «el guard dejó de
materializar». C materializa y falla porque el delta sí cae dentro del alcance; D pasa porque no hay delta.

Y el tiempo delata igual que en el enunciado: **1,9 s** contra los **4,74 s** de un build que compila de
verdad.

### Lo que la corrida encontró y no estaba previsto

**En sidecar, el alcance no se consultaba salvo que `OPS_ROOT` esté declarado.** `findOpsRoot` sube por
ancestros, y en sidecar la instancia es **hermana** del repositorio del producto: desde `app/` devuelve
vacío, `staysInTree` recibe cero raíces y —por su default seguro— fuerza la copia. Con `OPS_ROOT` puesto,
los cuatro escenarios dan lo esperado.

No es un defecto del producto: el shim que lanza cada guard la exporta (`automatization/hooks/run-hook.sh`,
`export OPS_ROOT="$ops_root"`) y el bridge de Antigravity también. Era mi arnés, que invocaba el guard a
mano sin ella. Queda escrito porque quien reproduzca esto sin instalar el runner va a ver el mismo falso
negativo y va a creer que el alcance no funciona.

### Contra lo que el caso enumeró

- **Opción 1, no materializar cuando el delta no puede cambiar el veredicto** — **hecha, y salió como el
  156**: el campo `scope` por raíz. Esta corrida es su comprobación de punta a punta.
- **Opción 2, meter `node_modules` bajo la raíz** — **descartada por medición**, las cinco vías: enlace
  relativo, *bind mount*, overlay, hardlinks de directorio y `cp -al`. La única que queda —copiar de
  verdad— cuesta ~85 s por commit contra los 157 ms de `checkout-index`.
- **Opción 3, que el guard muestre la salida del gate** — **ya existía desde 0.74.0**, y la sospecha de que
  la causa quedaba escondida era falsa. Confirmado otra vez acá: el bloqueo de A cita la línea del gate.
- **Tradeoff «el 1 cambia cuándo se confía en el árbol»** — **se paga, y sólo lo paga quien declara el
  campo.** D lo muestra por el otro lado: sin delta, el árbol **es** el próximo commit.

### Lo que sigue sin medir, y ya no decide nada

Cuántas instancias reales tienen un delta ajeno al gate con qué frecuencia. Decidía si valía un campo
nuevo; el campo existe y es opcional, así que la frecuencia sólo mueve cuánto se ahorra, no si el bloqueo
se puede destrabar.
