---
caso: 550
titulo: el candado de gates no mira la memoria libre antes de arrancar
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 550 — el candado de gates no mira la memoria libre antes de arrancar

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**, por el freno de memoria: un gate arranca igual con la
máquina al borde, y una instancia sidecar real tuvo que escribirse el freno por su cuenta. El cupo configurable es
**baja**: nadie midió que uno por vez sobre, y subirlo es justo lo que el 240 cerró.

## Resumen

`engine/hooks/machine-lock.js` deja **un** gate por vez en la máquina (caso 240): un archivo con el pid de quien lo
tiene, tomado con `wx` (`machine-lock.js:39`), y el resto espera hasta un tope (`machine-lock.js:52-56`). Dos huecos:

1. **No mira la memoria.** El candado sólo pregunta si otro gate corre. Con un gate solo y la memoria tomada por otra
   cosa —un navegador, un contenedor, una QA—, el gate arranca igual. Una instancia sidecar real tuvo una QA que congeló
   la máquina y construyó su propio freno: lee `MemAvailable` de `/proc/meminfo` y no arranca por debajo de 6000 MB,
   sólo en Linux.
2. **El cupo es fijo en uno.** No hay llave: `machine-lock.js` no lee configuración, y `runner` acepta
   `gateTimeoutMinutes` pero nada sobre cuántos gates a la vez (`engine/config/validate.js:64-65`). Una máquina grande
   con dos sesiones espera en serie aunque le sobren recursos. La auditoría propone extender el candado a N lugares.

Son dos resultados que se entregan por separado (R17): el freno de memoria vale sin el cupo, y el cupo sin el freno es
la forma de volver a tirar la máquina. Van juntos acá porque los dos tocan el mismo archivo y el segundo no se puede
abrir sin el primero; partirlos es una decisión abierta.

## Reproducción

Sin gastar modelo ni llenar memoria. Una sonda que toma el candado real con `holdMachine` (`machine-lock.js:35`) desde
dos procesos, con `CAUCE_VERIFY_LOCK` en el scratchpad para no tocar el de la máquina (`probe.js`, en el scratchpad de la
sesión que lo escribió):

```js
// node probe.js <nombre> <ms-que-retiene> <ms-de-espera-max>
const release = holdMachine(Number(waitMs))
log(`lo obtuvo tras esperar ${Date.now() - t0} ms`)
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(holdMs))
release()
```

```bash
export CAUCE_VERIFY_LOCK=$SCRATCH/verify.lock
node probe.js A 2000 10000 & sleep 0.2; node probe.js B 500 10000; wait   # B espera a A
node probe.js A 2000 10000 & sleep 0.2; node probe.js B 500 800; wait     # B se rinde antes
grep -c 'meminfo\|MemAvailable\|freemem\|config' engine/hooks/machine-lock.js
```

## Síntoma

```
A +   35 ms pide el candado
A +   35 ms lo obtuvo tras esperar 0 ms
B +  236 ms pide el candado
A + 2036 ms lo soltó
B + 2241 ms lo obtuvo tras esperar 2005 ms
B + 2742 ms lo soltó
--- con espera máxima menor que lo que retiene A ---
A +   36 ms pide el candado
A +   37 ms lo obtuvo tras esperar 1 ms
B +  239 ms pide el candado
B + 1241 ms frenado: otro verify corre en esta máquina (pid 1626356) y no terminó en 1 s. Uno por vez es a propósito: dos suites en paralelo
A + 2037 ms lo soltó
--- lo que machine-lock.js lee de memoria o configuración ---
0
```

Con cupo 1 el segundo gate espera entero al primero, o se rinde con el mensaje de `machine-lock.js:53`. Y A obtiene el
candado en 0 ms sin mirar nada más: el único criterio es que el archivo no exista. No se provocó una máquina sin
memoria —R23 y la consigna lo prohíben—; que arranque igual se lee en el fuente, que no tiene ninguna lectura de
memoria (el `0` de arriba).

## Causa raíz

- `engine/hooks/machine-lock.js:35-59`: `holdMachine(waitMs, file)` toma un solo archivo. No recibe cupo ni umbral.
- `engine/hooks/verify.js:238`: el único que lo llama, `holdMachine(timeoutMs * 4)`, sin pasarle nada de
  `configOf(ops).runner`, que sí lee para el tope (`verify.js:331-335`).
- `engine/config/validate.js:64-65`: `RUNNER_KEYS` no tiene llave de cupo ni de memoria.

El precedente de leer memoria ya existe en el motor: `engine/cli/copy.js:36-50` lee `MemAvailable` de `/proc/meminfo`
para acotar una copia a un tmpfs, y fuera de Linux cae al tope fijo.

## Fix propuesto

Dos llaves en `runner`, las dos opcionales:

- **`gateMinFreeMb`** (número > 0; sin declarar, ver «Decisiones»). Después de tomar el lugar y **antes** de lanzar el
  primer gate, se lee la memoria disponible. Si está por debajo:
  - si hay **otro** gate corriendo en la máquina, se espera —soltando el lugar y volviendo a pedirlo—, porque ese gate
    va a devolver memoria al terminar; dentro del mismo `waitMs` que ya existe;
  - si **no** hay otro gate, esperar no compra nada: se frena enseguida con un mensaje que dice cuánto hay, cuánto pide
    la llave y cuál es (`runner.gateMinFreeMb en ops.config.json`). Lo mismo al vencer la espera.
  - La lectura: `os.freemem()`. **Verificado** en esta corrida, Node v24.18.0 en Linux: `os.freemem()` dio
    `11882315776` y `MemAvailable` de `/proc/meminfo` `11882315776` —el mismo número; `MemFree` era `4024627200`—. O
    sea que en Linux ya es la medida que usa el freno de la instancia, sin leer `/proc` a mano.
  - **Fuera de Linux**, qué mide `os.freemem()` es **hipótesis** acá (macOS y Windows no se comprobaron): puede contar
    distinto lo reclamable, y un umbral calibrado en Linux frenaría de más o de menos. Opción conservadora: fuera de
    Linux la llave no frena y `doctor`/el mensaje lo dicen una vez; opción amplia: usar `os.freemem()` igual. Decisión
    abierta.
- **`gateSlots`** (entero ≥ 1, default 1: el comportamiento de hoy). Los lugares son archivos `lockFile()`, `.1`, `.2`…;
  el lugar 0 conserva el nombre actual, así `CAUCE_VERIFY_LOCK` y las pruebas de `verify-bounded.test.js:119-140` siguen
  valiendo. Se elige sin carreras con el mismo `wx` de hoy (`O_EXCL`, atómico en el sistema de archivos local): se
  recorre `0..N-1` y el primero que se crea es el propio; si ninguno, se mira cada pid y se roba el muerto con la misma
  regla de `machine-lock.js:48-51`. `release` sigue soltando sólo el propio archivo (`machine-lock.js:25-27`).
  - **Dos instancias con cupos distintos en la misma máquina**: cada una pide en `0..su N-1`, así que el total en la
    máquina es el mayor N declarado, no la suma. Se escribe en el encabezado del módulo.
- Las dos llaves aflojan un freno cuando suben (`gateSlots`) o bajan (`gateMinFreeMb`): van en `engine/hooks/config-keys.js`
  con una regla que pide confirmación humana —no `null` como `gateTimeoutMinutes` (`config-keys.js:81`)—, y en
  `engine/schemas/ops-config.schema.json` junto a `gateTimeoutMinutes` (línea 165). `ops-config-keys.test.js` ya falla
  si falta la clasificación.

Pruebas, con mutación declarada:

- Cupo 2: dos procesos obtienen lugar sin esperarse; un tercero espera. Mutar el bucle a un solo lugar pone roja la
  primera.
- Umbral por encima de la memoria disponible —se le pasa la lectura como parámetro, sin llenar nada—: con otro lugar
  tomado espera y frena al vencer; sin otro, frena enseguida nombrando la llave. Quitar la lectura pone rojas las dos.
- Sin llaves: la salida de hoy, lado a lado con la de antes (es un reemplazo del candado, R29).

## Tradeoffs

- **R26 es la razón de las dos llaves y el riesgo de una.** El freno de memoria acota el costo mejor que el candado: el
  candado cuenta gates, la memoria cuenta lo que tira la máquina. El cupo, en cambio, afloja la cota: con `gateSlots: 3`
  vuelven las tres suites en paralelo que el 240 cerró porque `systemd-oomd` mataba la sesión. Por eso el cupo sin
  umbral de memoria no debería poder subirse: o se exige `gateMinFreeMb` cuando `gateSlots > 1`, o el umbral tiene un
  default.
- **El umbral se lee al arrancar, no durante.** Dos gates que arrancan con 7 GB libres cada uno pasan los dos y después
  cada uno toma 5. El freno baja la probabilidad, no la anula. Con cupo 1 esto no pasa; con cupo N sí.
- **Un número elegido sin medir es una suposición.** Los 6000 MB son lo que una instancia eligió para su máquina y su
  suite; no hay medición de cuánto pide un gate de Cauce ni de una suite típica. Ponerlo de default es tomar el número
  de otro. El de este repositorio se puede medir barato (pico de memoria de `npm run ci` con `/usr/bin/time -v`), y eso
  va antes de elegir.
- **Frenar con memoria baja puede frenar commits sanos** en máquinas chicas (8 GB) si el default es alto: ahí el
  remedio se apaga con `OPS_SKIP_VERIFY`, que es lo que el 240 vio hacer. Un default bajo o ninguno lo evita.
- **Más archivos de candado en `/tmp`**: uno por lugar, borrados al soltar; un pid muerto se roba igual que hoy.
- Fuera de Linux, si la llave no frena, una instancia en macOS cree estar protegida y no lo está, salvo que se diga.

## Prioridad

**Media** por el freno de memoria: el daño que previene es una máquina congelada —ya pasó en una instancia— y es un
cambio chico sobre un módulo de 61 líneas con un precedente en el propio motor (`copy.js`). Sube a **alta** si llega
otro caso de una instancia con la máquina tirada por un gate. El **cupo** es baja: ningún caso midió tiempo perdido
por esperar en serie, y es lo que una persona va a subir para ir más rápido; se reabre cuando alguien mida esa espera
en los diarios de corridas.

## Decisión del 2026-11-22

Manuel aprobó las recomendaciones:

1. `gateMinFreeMb` es opcional y no tiene default: sin la llave, todo sigue como hoy.
2. Sin memoria y con otro gate corriendo, se espera dentro del tope de hoy; sin otro gate, se frena enseguida.
3. Fuera de Linux la llave no frena, y el mensaje lo dice, hasta comprobar en macOS qué mide `os.freemem()`.
4. El cupo de N gates (`gateSlots`) sale como caso propio y aplazado, el **553**. Este caso queda en el freno de memoria.

## Contexto de descubrimiento

Ítem 16 de la auditoría del 2026-11-21 sobre una instancia sidecar real. Su QA congeló la máquina y escribió un freno
propio por memoria libre, fuera de Cauce; la auditoría propuso llevar el candado a N lugares por configuración.

## Relacionados

- 240: el candado de máquina y el tope de gates; este caso lo extiende y no puede deshacer lo que cerró.
- 547: el `verify` declarado por raíz, que tiene que correr dentro del mismo candado y del mismo freno.

## Cierre

Se recorrió el caso entero:

- **Fix, `runner.gateMinFreeMb`**: se hizo, según la decisión. `memoryShort` (`engine/hooks/machine-lock.js`) decide y
  no frena; `verify` lo consulta con el candado tomado y, si no alcanza, frena el commit sin correr ningún gate, nombrando
  cuánto hay y la llave. `check` valida la llave y `config-keys` pide confirmación para bajarla o quitarla.
- **Decisión 2, esperar si hay otro gate**: no aplica con un solo lugar: con el candado tomado no hay otro gate de
  Cauce corriendo. Vuelve con el cupo, en el 553.
- **Decisión 3, fuera de Linux no frena y se dice**: se hizo distinto. No frena; lo dice la descripción de la llave en el
  schema y el CHANGELOG, porque un hook que pasa no tiene dónde mostrar un aviso en Claude Code.
- **Decisión 4, el cupo**: salió como caso propio, el 553, aplazado.
- **Tradeoff, un número elegido sin medir**: la llave no tiene default, así que no se eligió ninguno.
- **Lo que el enunciado no preveía**: con el candado de un lugar, la espera que proponía el fix no tiene a quién esperar.

Lo que se corrió:

- Por el hook instalado, en un banco sidecar sin modelo, con `gateMinFreeMb: 99999999`, lado a lado:

  ```
  antes (motor 89ab662c):  exit=0
  después:                 BLOQUEADO: Verify no arrancó: hay 9618 MB de memoria libre y runner.gateMinFreeMb en
                           ops.config.json pide 99999999 para arrancar un gate …  exit=2
  ```
  Y con `gateMinFreeMb: 1`, el commit pasa (`exit=0`).
- Las pruebas nuevas contra HEAD: rojas (`verify-bounded`, 8; `ops-config-keys`, 1); después, en verde.
- 5 mutaciones en una copia, las 5 rojas: nunca frenar, frenar fuera de Linux, `verify` sin consultar la memoria,
  `check` sin validar y bajar la llave sin preguntar.
- Dos pasadas de revisión independiente; la segunda, nada que impida entregar.
- `npm run ci` con los archivos nuevos stageados: 1962 de 1962, exit 0.

**Sin probar:** una máquina de verdad sin memoria, porque provocarlo es lo que el freno evita; se midió con una llave
inalcanzable. Y macOS o Windows, donde la llave no frena a propósito.

### Lista de cierre

1. hecho: la sonda de «Reproducción» y el «antes» del banco, que pasa sin mirar la memoria.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas en rojo contra HEAD y en verde después.
4. hecho: 5 mutaciones en una copia, las 5 rojas.
5. no aplica: agrega un freno y no quita nada; sin la llave, la salida es la de antes, que el banco muestra.
6. hecho: banco por el hook instalado, sin dobles; se midió que frena con la llave inalcanzable y pasa con 1.
7. no aplica: no depende de un modelo; el runner es el hook instalado, que es lo que se corrió.
8. hecho: banco, mutaciones y puerta sobre la versión final; Linux corrió, otro sistema no.
9. hecho: dos valores de la llave (inalcanzable y 1) y dos estados (declarada y sin declarar).
10. hecho: dependían `check` y `config-keys`, que se corrigieron, y el schema.
11. hecho: dos pasadas de revisión independiente; la segunda, sin nada que impida entregar.
12. hecho: pasada de comentarios sobre el diff entero.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1962 de 1962, exit 0.
14. hecho: este cierre recorre el Fix propuesto, la Decisión y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
