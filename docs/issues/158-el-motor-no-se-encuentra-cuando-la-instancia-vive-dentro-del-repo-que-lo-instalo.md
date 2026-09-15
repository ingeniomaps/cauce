---
caso: 158
titulo: El motor sólo se busca colgando de la instancia, así que una instancia dentro del repo que instaló Cauce no lo encuentra y el consejo manda a bajar una segunda copia
estado: resuelto
resuelto-en: 0.92.0
prioridad: alta
version-detectada: 0.91.0
---

# 158 — `npm install` donde corresponde, y `automation check` pide que lo vuelvas a correr un nivel más abajo

**🟢 resuelto en 0.92.0** · detectado en 0.91.0 · prioridad **alta** — eran nueve errores sobre un motor
instalado, y la cascada que los produce vive en tres archivos, no en uno

## Resumen

Cauce se instala como dependencia y el CLI llega con ella: `npm install @ingeniomaps/cauce` deja
`node_modules/.bin/cauce` y `npx cauce` funciona. Desde ahí, `cauce init ops` materializa la instancia.

Ese flujo produce este árbol, que es el que el propio comando sugiere:

    acme/
      node_modules/@ingeniomaps/cauce   ← el motor, donde se instaló
      ops/                              ← la instancia
        ops.config.json                 mode: sidecar, workspaceRoots: [{ main → .. }]

Y ahí `automation check` devuelve **nueve errores**, todos con el mismo consejo:

    ✗ falta engine/hooks/run.js: corré "npm install" en la raíz del repo ops
    ✗ falta automatization/workflows/autobuild.js: corré "npm install" en la raíz del repo ops
    ✗ falta automatization/workflows/flow.js: …
    ✗ falta automatization/workflows/integrations/sync.js: …
    ✗ falta automatization/workflows/integrations/promote.js: …
    ✗ claude: configuración inválida (no encuentro automatization/: corré "npm install"…)
    ✗ codex: …    ✗ gemini: …    ✗ antigravity: …
    9 error(es) de automatización

El motor **está instalado**. Lo que falla es dónde se lo busca.

## Reproducción

Desde un directorio vacío, con el paquete publicado:

```bash
mkdir acme && cd acme
npm install @ingeniomaps/cauce
npx cauce init ops --name Acme --mode sidecar --no-install
npx cauce automation check ops
```

Nueve errores. El motor está en `acme/node_modules/@ingeniomaps/cauce`, y `ops/node_modules` no existe
ni tiene por qué existir.

Seguir el consejo —`cd ops && npm install`— baja **una segunda copia del paquete** un directorio por
debajo de la que ya está, y recién entonces pasa.

## Síntoma

Nueve líneas rojas para **un solo hecho**, y el hecho que enuncian es falso: no falta el `npm install`.

Lo caro no es el ruido sino a dónde manda. Quien hace lo que dice el mensaje termina con el paquete
duplicado en el mismo árbol —dos versiones que pueden divergir en el próximo `upgrade`—, y quien no lo
hace se queda con nueve rojos permanentes en una instancia que funciona. Las dos salidas son peores que
el estado inicial.

## Causa raíz

`engine/core/ownership.js`, `packagePath`: la cascada tiene exactamente dos candidatos, los dos colgando
de la instancia.

```js
function packagePath(root, relative) {
  const candidates = [
    path.join(root, 'node_modules', '@ingeniomaps', 'cauce', relative),
    path.join(root, relative),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}
```

**El motor ya sabe que en sidecar hay una raíz por encima, y esta pieza es la única que no lo usa.**
`installRoot` (`engine/automation/runners.js`) resuelve `mode: sidecar → path.resolve(root, '..')` para
decidir dónde se instala el runner; `packagePath` no mira ahí.

Y `mode` no alcanza para distinguir los dos layouts legítimos —un `acme-ops` con su propio
`node_modules` y un `acme/ops` cuyo motor vive arriba—: los dos son `sidecar`.

## Por qué nadie lo notó

`test/instance/instance.test.js` afirma `automation check` en verde sobre una instancia recién creada, y
es correcto: su fixture usa `linkEngine(target)`, que enlaza el motor **dentro** de la instancia. La suite
mide un layout que el flujo documentado no produce, así que el verde es cierto y no cubre este caso.

El molde tampoco los documenta: ni `acme-ops` ni `acme/ops` aparecen en `template/AGENTS.md`,
`template/README.md` ni `template/planning/delivery/multi-repo.md`. Sin los dos layouts escritos, la
ambigüedad no tenía dónde verse.

## Fix propuesto

1. **Que `packagePath` pruebe también la raíz que la instancia ya declara.** Primero
   `<instancia>/node_modules/@ingeniomaps/cauce`, y si no está, la misma raíz que `installRoot` usa para
   el runner. Un `acme-ops` con motor propio lo encuentra en el primer candidato y no cambia nada; un
   `acme/ops` lo encuentra en el segundo.
2. **Que el consejo diga dónde, en vez de «la raíz del repo ops».** Y que nueve consecuencias de un solo
   hecho se reporten como el hecho: si el motor no está en ninguno de los dos lugares, es una línea.
3. **Documentar los dos layouts en el molde**, con cuál elegir y cómo se pasa de uno al otro.

## Tradeoffs

- **Lo que no se hace, y es deliberado: deducir el layout.** Mirar el toplevel de git los distingue
  —medido: en `acme/ops` el toplevel es `acme`, en `acme-ops` es él mismo— pero ata la resolución del
  motor a que exista un repositorio, y una instancia local sin versionar es un uso legítimo. Sugerir
  versionar está bien; exigirlo para poder encontrar el motor, no.
- **Subir por el árbol hasta encontrar `node_modules`, como hace Node**, también funciona y es lo que la
  gente espera. Se descarta por lo mismo que la anterior: adivina. Dentro de un monorepo con varios
  paquetes podría encontrar un motor de otra versión, y ese fallo es silencioso.
- **La opción 1 hereda lo que `installRoot` decida.** Si algún día esa resolución cambia, cambian las
  dos; es una coincidencia deseada y conviene que sea una sola función y no dos parecidas.

## Prioridad

**Alta.** No rompe una instancia en uso —la que ya tiene su `node_modules` adentro sigue igual— pero es
lo primero que ve quien instala Cauce siguiendo el camino documentado, y las dos salidas que ofrece
dejan el proyecto peor: paquete duplicado, o nueve rojos permanentes.

## Contexto de descubrimiento

2026-09-15, barriendo Cauce de punta a punta antes de construir el banco de medición. El barrido empezó
por `init` en un directorio limpio: no deja basura —91 archivos, 548 KB, cero temporales, cero vacíos— y
el planning nuevo pasa `check`. Lo que no pasó fue `automation check`, y la primera lectura fue que
sobraba ruido en el mensaje. Medir el flujo real mostró que el mensaje era la consecuencia y no la causa.

## Relacionados

- **110** — un choque que `upgrade` conservó, y el otro lugar donde un consejo mandaba a una vuelta sin
  salida. Mismo modo de fallo en el mensaje: decir qué correr sin decir dónde ni por qué.
- **156**, **157** — los otros dos que salieron del mismo barrido.

## Cierre

**🟢 resuelto en 0.92.0** · `engine/core/ownership.js`, `automatization/hooks/run-hook.sh`,
`automatization/runners/antigravity/hook.js`, `test/support/environment.js`, `test/instance/instance.test.js`

`packagePath` prueba ahora un tercer candidato: la raíz que la instancia **declara**, que es la misma que
`installRoot` usa para decidir dónde se instala el runner. Un `<empresa>-ops` con su propio `node_modules`
gana en el primer candidato y no cambia nada.

### Contra lo que el caso enumeró

- **Fix 1, que `packagePath` pruebe la raíz declarada** — hecho, y **en tres archivos y no en uno**. El
  comentario de `engineAt` ya avisaba que el shim `run-hook.sh` y el bridge de Antigravity repiten la
  cascada porque corren antes de poder cargar el motor. Arreglar sólo el módulo dejaba el CLI en verde y
  los guards sin motor: medio arreglo, del lado que no se nota.
- **Fix 2, que el consejo diga dónde** — **se hizo distinto y por eso quedó chico**: con el tercer
  candidato, los nueve errores desaparecen en vez de redactarse mejor. Lo que se tocó del mensaje es su
  alcance —«bajo `$ops_root` y su carpeta padre»—, que es lo que ahora es cierto.
- **Fix 3, documentar los dos layouts en el molde** — **no se hizo acá y queda nombrado.** Es prosa del
  molde, o sea que baja a cada instancia en su `upgrade`, y merece decidirse con la redacción delante en
  vez de entrar como cola de un arreglo de motor.
- **Tradeoff «no deducir el layout»** — sostenido, y con una razón mejor que la que el caso tenía: no es
  sólo que git ate la resolución a tener repositorio, es que **el usuario elige** si su `ops` es
  independiente o vive dentro del monorepo, y esa elección ya está declarada en `ops.config.json`. Deducir
  lo que alguien declaró es adivinar sobre un dato que ya se tiene.
- **Tradeoff «subir por el árbol como Node»** — descartado. Sube hasta la raíz del disco y en un monorepo
  con varios paquetes encontraría un motor de otra versión, en silencio.
- **Tradeoff «hereda lo que `installRoot` decida»** — se aceptó y no se pudo compartir la función:
  `automation/runners` ya importa `core/ownership`, así que importarlo al revés cierra un ciclo. La
  resolución quedó en `ownership` y los tres sitios se nombran entre sí.

### Lo que el caso no preveía

- **El conteo de `runners.test.js` se movió por un comentario mío, y volvió.** Ese test cuenta 52
  coincidencias clasificadas a mano; al nombrar `automatization/hooks/run-hook.sh` dentro de un comentario
  del bridge pasó a 53, y al reescribir ese comentario volvió a 52. Quedó en 52, que es lo que se mide. La
  puerta hizo exactamente lo suyo: obligar a clasificar antes de mover el número.
- **Y la puerta de comentarios pidió retirar un par aceptado.** `run-hook.sh ↔ antigravity/hook.js` estaba
  en `ACCEPTED_PAIRS` porque los dos explicaban la cascada; al dejar el porqué en `ownership.js` y sólo un
  puntero en los otros dos, el par bajó del umbral y su entrada quedó huérfana. Se retiró.

### Qué se corrió

- **Reproducción del flujo documentado**: `npm install @ingeniomaps/cauce` en `acme/`, `cauce init ops`,
  `automation check ops` → **nueve errores** con el motor instalado, y `engineAt` devolviendo `""` mientras
  `installRoot` ya contestaba el directorio correcto.
- **Rojo previo**: la prueba nueva contra el motor sin tocar da **12 pass, 1 fail** con los nueve errores
  completos en el mensaje. No un `ReferenceError`: el import del helper se corrigió antes de medir.
- **Verde por los dos caminos que importan**, sobre un banco nuevo: `automation check` **exit 0**
  —«✓ automatización válida: 20 guards, 4 adaptadores»— y un guard real invocado por `run-hook.sh`, que
  encuentra el motor y decide (exit 0). Sin eso, el CLI habría quedado verde y los guards rotos.
- **Suite**: **839 pruebas, 839 pass, fail 0, skipped 0**; `npm run ci` exit 0; 69 archivos en su piso.
- **Pasada R11 a 0.22**: dos pares quedaron sobre el umbral —0.450 entre los dos comentarios de la cascada
  y 0.440 contra el helper de pruebas— y se reescribieron para que la razón viva en `ownership.js` y los
  demás apunten. El más alto quedó en **0.152**.
