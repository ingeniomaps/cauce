---
caso: 091
titulo: Un proveedor de integraciones sólo existe si su adaptador vive en el motor
estado: resuelto
resuelto-en: 0.80.0
prioridad: baja
version-detectada: 0.79.0
---

# 091 — `adapter()` conoce un solo nombre, y conectar otra herramienta exige cambiar Cauce

**🟢 resuelto en 0.80.0** · detectado en 0.79.0 · prioridad **baja** — hoy la única integración es Jira y funciona.
Sube a **media** el día que una empresa necesite un proveedor que Cauce no trae

## Resumen

La instancia es dueña de la **configuración** de sus integraciones (`integrations/config.json` y
`integrations/<proveedor>/config.json`), pero no del **adaptador**. Tres cosas lo atan al motor:

1. **`adapter()` resuelve por el nombre del proveedor contra una lista fija** que tiene un solo elemento
   (`engine/integrations/registry.js:40-43`).
2. **El registro ya tiene un campo `adapter`, y nadie lo lee para cargar nada.** El molde declara
   `"adapter": "jira"` y `validate()` exige que esté (`registry.js:88`), pero las dos llamadas resuelven por
   el nombre (`registry.js:94` y `:188`). Lo único que lo usa es `integration list`, para mostrarlo.
3. **`integration enable` copia el andamiaje desde `template/integrations/<proveedor>/`** y, si no existe,
   se niega (`engine/cli/wiring.js:41-42`): aunque el adaptador existiera en la instancia, no habría cómo
   conectarlo.

Lo que **sí** existe es el contrato: `integrations/README.md` declara `validateConfig`, `fetchItems` y
`normalizeFixture`, y una prueba lo contrasta contra `providers/jira.js`. Pero ese README no viaja en el
paquete —`files` de `package.json` no incluye `integrations/`—, así que una empresa no lo tiene.

## Reproducción

Desde un checkout de Cauce: el motor sólo trae `jira`, y un proveedor escrito en la instancia —registrado con
una ruta en `adapter`, con su carpeta y su adaptador— no se puede ni conectar ni validar.

```bash
ls engine/integrations/providers
node -e "try { require('./engine/integrations/registry').adapter('infisical') } catch (e) { console.log(e.message) }"
BANCO=$(mktemp -d); ROOT="$BANCO/acme-ops"
mkdir -p "$ROOT/integrations/tablero" "$ROOT/planning"
echo '{"project":"acme","mode":"sidecar","workspaceRoots":[{"name":"main","path":".."}]}' > "$ROOT/ops.config.json"
echo '{"schemaVersion":1,"providers":{"tablero":{"adapter":"./adapter.js","enabled":false,"config":"tablero/config.json"}}}' \
  > "$ROOT/integrations/config.json"
echo '{"enabled":true}' > "$ROOT/integrations/tablero/config.json"
printf 'module.exports = { contract: 1, validateConfig() {}, async fetchItems() { return [] }, normalizeFixture() { return [] } }\n' \
  > "$ROOT/integrations/tablero/adapter.js"
node engine/cli/ops.js integration enable "$ROOT" tablero
node engine/cli/ops.js integration check "$ROOT" tablero
```

## Síntoma

Salida real, 2026-09-11, sobre `main` = `e710d620`:

```
jira.js
No existe adaptador para infisical
Cauce no trae un adaptador para tablero.
✗ tablero: No existe adaptador para tablero
1 error(es) de integración
```

`check` sale con código 1. El adaptador está en disco, registrado con su ruta, y el motor no lo mira.

## Causa raíz

`engine/integrations/registry.js:40-43`:

```js
function adapter(name) {
  if (name === 'jira') return require('./providers/jira')
  throw new Error(`No existe adaptador para ${name}`)
}
```

El campo `adapter` del registro nunca llega a esta función, y `enable` (`wiring.js:41-42`) sólo conoce el
molde de Cauce.

## Fix propuesto

Lo decidió el operador el 2026-09-11, antes de construir:

- **El campo `adapter` decide.** Un nombre sin `./` —`"jira"`— es un adaptador de Cauce, de una tabla en
  el motor. Una ruta que empieza con `./` es un módulo de la instancia, relativo a `integrations/<nombre>/`
  y acotado ahí con `assertWithin`, como ya se acota su configuración (`registry.js:36`).
- **El contrato lleva versión.** Todo adaptador —también el de Jira— exporta `contract: 1`, y el motor
  rechaza otro valor diciendo cuál espera. Un adaptador de la empresa no lo toca `upgrade`, así que un
  cambio de interfaz en el motor lo rompería en silencio si no hubiera con qué compararlo.
- **`check` rechaza un adaptador que no cumpla**, nombrando qué le falta: la versión o alguna de las tres
  funciones.
- **`enable` conecta un proveedor propio** cuando ya está registrado y su carpeta existe en la instancia,
  sin buscar un molde de Cauce. Si no está ni registrado ni en disco, el error dice cómo se declara uno.
- **El contrato se documenta donde viaja**: `template/integrations/README.md`, que es el
  `integrations/README.md` de cada instancia. El del repositorio y el `README.md` raíz dejan de decir que
  agregar un proveedor exige tocar el motor.

## Tradeoffs

- **El motor ejecuta código de la instancia.** Es el repositorio de la empresa y corre con los mismos
  permisos que el CLI; la contención es de ruta, no de capacidad. Se dice en el README, no se esconde detrás
  de la palabra «adaptador».
- **ESM y CommonJS.** Una instancia con `"type": "module"` escribe su adaptador como ESM. Node 24.18.0 lo
  carga con `require`, tanto `.mjs` como `.js` dentro de un paquete `module` —comprobado el 2026-09-11 con
  una sonda de dos archivos—, así que no hace falta un `import()` asíncrono.
- **La versión cuesta una línea por adaptador**, y es la que evita el fallo silencioso de arriba.

## Qué tiene que probar el cierre

- Un adaptador propio registrado con `./adapter.js` pasa `check`, y `sync` usa ése y no otro.
- Otra versión del contrato, o una función que falta, no pasan `check`, y el error dice cuál.
- Una ruta que sale de `integrations/<nombre>/` se rechaza; un nombre desconocido dice qué hay.
- `enable` conecta un proveedor propio registrado, y el que no existe dice cómo declararlo.
- El README que viaja documenta el contrato, con su versión.
- Jira sigue funcionando con la versión declarada: sus pruebas de `sync` pasan por la resolución nueva.

## Contexto de descubrimiento

2026-09-10, al revisar el 088: su propuesta de un adaptador de secretos propio de la empresa se apoyaba
en un punto de extensión que no existe tampoco para las integraciones de trabajo. Estaba adentro del 088
como una de sus causas; se separó porque se arregla, se prueba y se cierra sin decidir nada de secretos.

2026-09-11, al mejorarlo antes de arreglarlo: la primera redacción decía que faltaba definir la interfaz,
y ya estaba escrita y probada; no veía que el registro tenía un campo `adapter` sin uso ni que `enable`
dependía del molde; y no sabía que el README del contrato no viaja en el paquete.

## Relacionados

- **088** — ya no depende de este caso: se resolvió con copias canónicas, sin adaptador.
- **`OPS-003`** — fija el ciclo de las integraciones de contenido de trabajo; un adaptador propio tiene
  que respetarlo (sólo lectura, staging tipado), y el motor lo sigue haciendo cumplir fuera del
  adaptador.

## Cierre

**🟢 resuelto en 0.80.0** · `engine/integrations/registry.js`, `engine/integrations/providers/jira.js`,
`engine/cli/wiring.js`, `test/wiring/integrations.test.js`, `template/integrations/README.md`

### Contra lo que el caso enumeró

- **El campo `adapter` decide** — hecho: `adapter(root, name, entry)` busca un nombre en la tabla `BUILTIN`
  del motor, y una ruta que empieza con `./` la carga desde `integrations/<nombre>/`, acotada con
  `F.assertWithin` como la configuración. Las dos llamadas —`validate()` y `sync()`— le pasan la entrada del
  registro.
- **El contrato lleva versión** — hecho: `CONTRACT = 1`, y `jira.js` exporta `contract: 1` como cualquier
  otro. Un valor distinto se rechaza diciendo cuál espera el motor y cuál declara el adaptador.
- **`check` rechaza el que no cumple** — hecho: una versión distinta y una función que falta llegan como
  error de `check` con el nombre del proveedor y de lo que falta.
- **`enable` conecta uno propio** — hecho: si no hay molde en Cauce pero el proveedor está registrado y su
  carpeta existe, sólo prende el interruptor; si no, el error dice cómo declararlo.
- **El contrato donde viaja** — hecho: sección «Un proveedor propio» en `template/integrations/README.md`.
  `integrations/README.md` suma `contract: 1` al contrato y dice que él no viaja, y el `README.md` raíz deja
  de decir que agregar un proveedor exige tocar el motor.
- **Tradeoff «el motor ejecuta código de la instancia»** — dicho en el README del molde, con la frase de
  que la contención es de ruta y no de capacidad.
- **Tradeoff «ESM y CommonJS»** — la afirmación salió de una sonda con Node 24.18.0 (un `.mjs` y un `.js` en
  un paquete `module`, los dos cargados con `require`), y la revisión de huecos antes del merge la llevó a la
  suite: `un adaptador propio escrito en ESM se carga igual` pasa con `node --test`, y con
  `--no-experimental-require-module` —que apaga cargar ESM con `require`— da 0 de 1. Lo que no se prueba es
  un `.js` dentro de un paquete `"type": "module"`; ése sigue descansando en la sonda.
- **Tradeoff «la versión cuesta una línea»** — se cumple.
- **Cada ítem de «Qué tiene que probar el cierre»** — hechos los seis, con las pruebas de abajo. El de Jira
  lo muestra la mutación M6: sin `contract` en `jira.js`, seis pruebas de Jira caen, así que pasan por la
  resolución nueva.

### Lo que el caso no preveía

- **La reproducción del caso usa la firma vieja.** Su línea `adapter('infisical')` documenta el estado de
  antes; con el arreglo imprime `No existe adaptador para undefined…`, porque la llamada ya no es la que
  usa el motor. Las dos llamadas reales pasan raíz, nombre y entrada.
- **`enable` salía con código 2** al negarse; la primera salida de la reproducción no lo mostraba porque el
  código era el de la tubería. Se midió aparte antes de arreglar.

### Qué se corrió

- **El rojo previo**: con las cuatro pruebas nuevas escritas y el motor sin tocar —cero menciones de
  `contract` en `registry.js`—, 0 de 4.
- **La reproducción del propio caso**, después del arreglo:

  ```
  ✓ tablero: conectado al proyecto y andamiaje en integrations/tablero/.
    Su configuración ya estaba completa: "integration sync" puede correr.
  ✓ integraciones válidas: tablero
  ```

  `check` sale con código 0.
- `node --test test/wiring/integrations.test.js test/wiring/wiring.test.js`: 25 de 25.
- **Siete mutaciones, en una copia desechable del repositorio (R23)**, comprobadas aplicadas antes de
  contar, contra una base en verde:

  ```
  M1 sin chequear la versión             fail 1 → ROJA
  M2 sin chequear las funciones          fail 1 → ROJA
  M3 la ruta sin contención              fail 1 → ROJA
  M4 resuelve por el nombre              fail 3 → ROJA
  M5 enable sin proveedores propios      fail 1 → ROJA
  M6 jira sin contract                   fail 6 → ROJA
  M7 el README del molde sin la versión  fail 1 → ROJA
  ```
- `npm run ci`: código 0, 687 de 687, cobertura de 58 archivos en su piso o por encima.
