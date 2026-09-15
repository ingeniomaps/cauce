---
caso: 156
titulo: verify materializa el índice ante cualquier archivo sucio, incluso uno que el gate no va a leer, y nada declara qué rutas alcanza un gate
estado: resuelto
resuelto-en: 0.92.0
prioridad: media
version-detectada: 0.91.0
---

# 156 — Un archivo ajeno al commit fuerza la copia, y con ella todo lo que la copia arrastra

**🟢 resuelto en 0.92.0** · detectado en 0.91.0 · prioridad **media** — una raíz declara qué rutas lee su
puerta, y lo que ninguna puerta lee deja de forzar la copia; sin el campo, nada cambia

## Resumen

`commitTree` corre los gates sobre el árbol cuando árbol e índice coinciden, y materializa el índice en un
temporal cuando difieren. Lo que decide cuál de los dos es esta línea:

```js
if (!lines.some((line) => !line.startsWith('!!') && line[1] !== ' ')) {
  return { root: dir, temp: null, env: {} }
}
```

O sea: materializa ante **cualquier** entrada de `git status` que no sea ignorada y tenga algo en la segunda
columna — un archivo sin trackear, uno modificado y sin stagear, cualquiera. **No mira si ese archivo entra
en lo que el gate va a leer.**

Eso es deliberado y es la mitad correcta del diseño: lo que atrapa es el olvido de `git add`, que es
exactamente el caso en que el verde del árbol no vale para el commit. Lo que no está previsto es el otro
lado: un `tsconfig.json` que dejó otra sesión, un README a medio escribir o la basura de una sonda fuerzan
la copia aunque el gate no los vaya a abrir nunca.

Y **nada en el contrato declara qué rutas alcanza un gate**. Una raíz de `workspaceRoots` admite hoy
`name`, `path` y `verify` —el comando de la puerta—, validado en `engine/config/validate.js`. El comando
está declarado; su alcance, no.

## Reproducción

Desde un directorio vacío:

```bash
mkdir -p repro/planning/wip repro/src && cd repro
git init -q . && git config user.email t@t && git config user.name t
printf '{ "project": "x", "mode": "embedded", "workspaceRoots": [ { "name": "main", "path": "." } ] }\n' \
  > ops.config.json
printf '{ "name": "x", "version": "1.0.0", "scripts": { "test": "node -e \\"process.exit(0)\\"" } }\n' \
  > package.json
printf -- '---\ntask: t\nphase: Build\n---\n\n## Plan aprobado\n1. [ ] Paso\n' > planning/wip/w-prueba.md
echo 'module.exports = 1' > src/app.js
git add ops.config.json package.json src/app.js
git commit -qm base

# El commit que se quiere hacer: un cambio de código, staged.
echo 'module.exports = 2' > src/app.js
git add src/app.js

# Y un archivo que el gate no va a leer jamás.
echo 'nota para mí' > NOTAS.md

# El gate corre sobre una copia materializada, no sobre el árbol.
CAUCE_RUNNER=/w/prueba node <ruta-a-cauce>/engine/hooks/run.js verify <<'JSON'
{"cwd":"<ruta-a-repro>","tool_input":{"command":"git commit -m x"}}
JSON
```

Que materializó se ve en que el bloqueo —cuando el gate falla— agrega «Corrió sobre el índice». Con
`NOTAS.md` borrado y todo lo demás igual, corre sobre el árbol.

## Síntoma

No hay mensaje: el efecto es que la copia se arma. Por sí solo cuesta el tiempo de `checkout-index` —medido
en 157 ms para las mil quinientas rutas de este repositorio, según el propio comentario de `commitTree`— y
nada más.

Lo caro es lo que la copia arrastra. En la copia, `node_modules` viaja por **enlace** al proyecto, y eso es
lo que rompe `next build` con Turbopack (**153**), sin salida del lado del proyecto. Ahí un archivo ajeno al
commit deja de ser un costo y pasa a ser un bloqueo: el gate no puede pasar hasta que el árbol esté limpio,
y quien commitea no tiene por qué saber que un README suelto es lo que lo frena.

## Causa raíz

`engine/hooks/shell.js`, `commitTree`: la condición de arriba mide **si hay** delta, no **qué** delta. La
pieza que permitiría medir lo segundo no existe: `workspaceRoots[].verify` declara el comando del gate y no
las rutas que lee.

## Fix propuesto

1. **Declarar el alcance del gate por raíz.** Un campo junto a `verify` —`scope`, con globs— y materializar
   sólo cuando alguna ruta del delta cae adentro. Determinista y explícito: no adivina, y quien lo declara
   es quien sabe. Cuesta un campo nuevo en `ops.config.json`, su validación, el molde y la documentación, y
   **baja a todos los consumidores en su próximo `upgrade`**.
2. **Acotar sin contrato nuevo**: materializar sólo si el delta toca archivos que el commit también toca, o
   que cuelgan de la raíz del servicio de la tarea. No pide campo nuevo y cubre el caso real del 153
   —basura ajena al commit—, pero es una heurística, y una heurística que decide cuándo se confía en el
   árbol envejece mal.
3. **No cambiar cuándo se materializa y atacar lo que la copia arrastra** — o sea resolver el 153 por el
   lado del enlace. Queda registrado porque es la alternativa honesta, y porque su vía más prometida ya se
   midió y no sirve: un enlace relativo resuelve al mismo destino de afuera.

## Tradeoffs

- **La 1 y la 2 aflojan la garantía que `commitTree` fue a construir**: que el gate corra sobre lo que el
  commit graba y no sobre el árbol. Hoy cualquier delta fuerza la copia justamente para que esa garantía no
  dependa de un juicio; acotarla es decidir que algunos deltas «no cuentan», y equivocarse ahí devuelve el
  defecto que `commitTree` vino a cerrar: un verde calculado sobre código que nadie va a commitear.
- **La 1 agrega superficie al contrato que cada empresa recibe.** Un campo que se declara mal —demasiado
  angosto— apaga el aislamiento sin que nada lo diga, que es la forma cara del error.
- **La 2 es exactamente lo que el 153 desaconseja** en su propio tradeoff: «lo honesto es por ruta declarada
  en `ops.config.json` y no por heurística».
- **No medido: con qué frecuencia el delta es ajeno al gate.** Es el número que decide si esto vale un campo
  nuevo o si alcanza con no hacer nada, y no se puede sacar de este repositorio —donde no hay `build` ni
  `lint`—: sale de instancias reales.

## Prioridad

**Media.** Sube a **alta** si el 153 se resuelve por esta vía en lugar de por el enlace, porque ahí este
caso pasa a ser el único camino; y baja a **baja** si la medición que falta muestra que el delta ajeno es
raro en instancias reales.

## Contexto de descubrimiento

2026-09-15, mejorando el **153** antes de arreglarlo. Las tres opciones que ese caso proponía se midieron:
la del enlace relativo no sirve, la del mensaje del guard ya existe desde 0.74.0, y la que quedaba
—«no materializar cuando el delta no puede cambiar el veredicto»— resultó ser un cambio de contrato y no
un arreglo, así que sale como caso propio en vez de entrar de contrabando en el cierre de aquél.

## Relacionados

- **153** — el bloqueo real que esto destrabaría. Mientras `node_modules` viaje por enlace, un delta ajeno
  al commit deja sin gate a un proyecto Next.
- **069**, **045**, **095** — las decisiones de `commitTree` que sí funcionan; esto no propone tocarlas.
- **151** — el otro fallo del mismo mecanismo, ya resuelto.

## Cierre

**🟢 resuelto en 0.92.0** · `engine/core/scope.js`, `engine/hooks/shell.js`, `engine/config/validate.js`,
`engine/schemas/ops-config.schema.json`, `test/repo/scope.test.js`, `test/wiring/verify-scope.test.js`,
`CHANGELOG.md`

Una raíz puede declarar `scope` junto a `verify`, y `commitTree` pasó de preguntarse *si hay* delta a
preguntarse *qué* delta: lo que ninguna puerta lee no puede cambiar su veredicto, así que el árbol vuelve
a servir. **Sin `scope` declarado no cambia nada**, y esa mitad es la que se probó con más cuidado: el
campo baja a cada consumidor en su próximo `upgrade` y ninguno lo declara todavía.

### Contra lo que el caso enumeró

- **Opción 1, declarar el alcance del gate por raíz** — **se hizo, tal como estaba escrita.** Campo
  `scope` con globs, su validación en `validate.js`, su `description` en el esquema y su entrada de
  CHANGELOG. El molde **no** lo trae: `verify` tampoco está ahí, y los dos son opcionales — meterlos en
  el molde los convertiría en ceremonia para todos.
- **Opción 2, acotar sin contrato nuevo** — **se decidió que no, por la razón que el propio caso
  escribió**: es la heurística que el 153 desaconseja en su tradeoff, «lo honesto es por ruta declarada
  en `ops.config.json` y no por heurística». Decidir cuándo se confía en el árbol sin que nadie lo
  declare es exactamente lo que envejece mal.
- **Opción 3, atacar lo que la copia arrastra** — **le tocaba al 153 y ya está medida y cerrada ahí.**
  Las cuatro vías que dejarían `node_modules` bajo la raíz de la copia —enlace relativo, *bind mount*,
  overlay, hardlinks— quedaron descartadas el 2026-09-15, y la quinta, copiar de verdad, cuesta ~85 s por
  commit. O sea que el enlace se queda y lo que tenía que cambiar era **cuándo** se hace la copia.
- **Tradeoff «la 1 y la 2 aflojan la garantía que `commitTree` fue a construir»** — **se paga, y sólo lo
  paga quien declara el campo.** Está fijado por prueba y por mutación: con el cableado revertido, las
  tres pruebas que describen el comportamiento de siempre siguen verdes y sólo caen las dos del alcance;
  y apagando el default seguro —que una raíz sin `scope` deje de forzar— caen exactamente las dos que
  prometen la compatibilidad.
- **Tradeoff «la 1 agrega superficie al contrato que cada empresa recibe»** — **se paga, y se decidió
  antes de construir, no a mitad de camino.** La alternativa era una heurística sin campo, y se preguntó
  con las tres salidas sobre la mesa.
- **Tradeoff «la 2 es exactamente lo que el 153 desaconseja»** — **se cobró solo**: fue la razón de
  descartarla, no una objeción que hubiera que sopesar después.
- **Tradeoff «no medido: con qué frecuencia el delta es ajeno al gate»** — **sigue sin medir, y se
  declara en vez de tacharse.** El caso decía que ese número decide si esto vale un campo nuevo; no
  decidió, porque lo que lo justificó fue otra cosa: el 153 no tiene salida del lado del proyecto, así
  que la frecuencia sólo movería el tamaño del ahorro, no la existencia del bloqueo. Sigue sin poder
  sacarse de este repositorio —acá no hay `build` ni `lint`— y lo que lo contestaría es una instancia
  real. Queda abierto como medición pendiente, no como deuda de este caso.
- **Prioridad** — el caso decía «sube a **alta** si el 153 se resuelve por esta vía en lugar de por el
  enlace». Eso es exactamente lo que pasó: las vías del enlace se midieron y ninguna sirve, así que
  ésta pasó a ser la única, y el caso se resolvió en vez de subir de prioridad.

### Lo que el caso no preveía

**El bucle lo cerraba el propio guard.** Cuando un gate falla, el bloqueo manda escribir las rutas en
`planning/.ops-approval` para aprobarlas. Ese archivo queda **sin trackear** —y a propósito: `check` avisa
mientras exista, así que no es un olvido del molde— y con él cada commit siguiente materializaba. O sea
que seguir la instrucción del guard para destrabar un gate garantizaba que el gate siguiente corriera
sobre la copia, que en un proyecto Next es el gate que no puede pasar. Está medido y tiene su prueba.

**Y la superficie del 153 es más angosta de lo que ese caso sugiere**: `RECREABLE` ya excluye `.next` y
`.turbo`, así que la salida de Next se reconstruye dentro de la copia. Lo único que viaja por enlace y
rompe a Turbopack es `node_modules`.

### Qué se corrió

- **Reproducción antes de arreglar**, con el gate registrando su propio `cwd` fuera del repositorio:
  árbol limpio → árbol; `?? NOTAS.md` → copia (`/tmp/ops-verify-GNafr2`); se borra → árbol;
  `?? planning/.ops-approval` → copia. El mensaje «Corrió sobre el índice» no sirve como discriminador:
  `verifyGates` vuelve sin bloquear cuando lo staged está aprobado, así que su ausencia significa «no
  bloqueó» y no «corrió sobre el árbol».
- **Rojo previo** sobre las pruebas definitivas, con el cableado revertido en una copia desechable: 3
  verdes y **2 rojas**, y las dos rojas son las del alcance. Las tres que describen el comportamiento de
  siempre siguen verdes, que es la evidencia de compatibilidad.
- **Tres mutaciones**, cada una sobre una decisión distinta: apagar el conservadurismo del directorio → 1
  roja, la del directorio; hacer que el alcance no acote nunca → 9 rojas; romper el default seguro → 2
  rojas, las dos de la compatibilidad.
- `npm run ci` **exit 0: 863 pruebas, 0 en rojo**, sin superficie muerta, 71 archivos en su piso y
  `engine/core/scope.js` en 100 % de líneas, ramas y funciones.
