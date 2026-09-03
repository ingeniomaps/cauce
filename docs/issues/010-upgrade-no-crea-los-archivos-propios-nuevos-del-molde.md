---
caso: 010
titulo: upgrade no crea los archivos propios que una versión nueva agrega al molde
estado: resuelto
prioridad: media
version-detectada: 0.57.0
resuelto-en: 0.58.0
---

# 010 — `upgrade` no crea los archivos propios que el molde agrega

**🟢 resuelto en 0.58.0** · detectado en 0.57.0 · prioridad **media** — la instancia queda apuntando a un archivo que no existe

## Resumen

`upgrade` reemplaza lo del toolkit y no toca lo del proyecto. Correcto. Pero cuando una versión
**agrega** un archivo propio al molde, la instancia que actualiza no lo recibe nunca: `upgrade` no
copia el molde, sólo reemplaza rutas del sistema y el runtime.

Pasó con 0.57.0, que agrega `organization/workspace.md`. Una instancia actualizada desde 0.56.0 queda
con un `AGENTS.md` que lo nombra tres veces, un `check` que lo lee para cruzar credenciales, y el
archivo sin existir.

## Reproducción

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.56.0 init ops --mode sidecar --install
cd ops
npm install --save-exact --save-dev @ingeniomaps/cauce@0.57.0
node tools/ops.js upgrade .

ls organization/                       # sin workspace.md
grep -c 'organization/workspace.md' AGENTS.md   # 3
```

## Síntoma

```text
0.56.0 · organization/: company.md domains.md product.md README.md roles
tras upgrade a 0.57.0:  company.md domains.md product.md README.md roles
¿existe workspace.md? NO

pero AGENTS.md ya lo nombra:
  apariciones: 3
```

Y el `AGENTS.md` recién instalado dice, sobre un archivo que no está:

> El mapa real […] vive en **`organization/workspace.md`**, que es del proyecto y `upgrade` no toca.

El cruce de credenciales de `engine/core/onboarding.js:105` lo lee primero de los tres contratos, así
que hasta que alguien lo cree a mano el aviso de credenciales huérfanas vuelve, sobre un archivo que la
instancia no sabe que le falta.

## Causa raíz

`upgrade` (`engine/cli/instance.js`) recorre `O.systemPaths(root)` y el runtime de
`automatization/hooks/`. Ninguno de los dos incluye un archivo propio del molde, y con razón: si lo
incluyera, lo reemplazaría en cada actualización, que es justo lo que este archivo no debe sufrir.

El hueco no es el reemplazo: es que **no hay un paso de «crear lo que falta»**. `copyTemplate` ya sabe
hacerlo —conserva lo que existe y escribe lo que no— y `init --force` lo demuestra:

```text
$ npx @ingeniomaps/cauce@0.57.0 init . --force --no-install
+ …/organization/workspace.md
= conservado …/automatization/hooks/guard-workspace-boundary.sh
```

Es decir: la operación existe y funciona; `upgrade` no la llama.

## Fix propuesto

Que `upgrade` corra `copyTemplate` con `force: true` antes de reemplazar lo del sistema. Conserva todo
lo que ya está —es su comportamiento probado— y sólo escribe lo que falta:

```diff
 function upgrade(dir, cli) {
   ...
+  // Un archivo propio que el molde agrega en una versión nueva no llega por ninguna otra vía:
+  // `systemPaths` no lo incluye a propósito —lo reemplazaría cada vez— y sin esto la instancia queda
+  // nombrando un archivo que no tiene. `copyTemplate` con force conserva lo que ya está.
+  const agregados = copyTemplate(path.join(PROJECT_ROOT, 'template'), root, {
+    '{{PROJECT_NAME}}': config.project, '{{MODE}}': O.mode(root),
+    '{{WORKSPACE_PATH}}': O.mode(root) === 'embedded' ? '.' : '..',
+  }, true, providerNames(), true)
+  for (const file of agregados) console.log(`+ ${file}: lo agrega esta versión`)
```

Nombrarlos en la salida importa tanto como crearlos: un archivo nuevo que aparece sin aviso no lo
completa nadie, y estos existen para completarse.

Alternativa mínima si tocar `upgrade` es mucho: que el mensaje de `upgrade` diga qué archivos del molde
faltan y que se reponen con `init . --force`. Es el mismo trabajo para el usuario, con un paso más.

## Tradeoffs

`upgrade` pasa a poder crear archivos, no sólo reemplazarlos. Es un cambio de alcance del comando y va
en el CHANGELOG. El riesgo de pisar algo es nulo por construcción: `copyTemplate` con `force` conserva
todo lo que existe y sólo escribe lo ausente — es lo que ya hace `init --force`.

Un efecto lateral deseable: una instancia vieja a la que le falte cualquier archivo del molde —porque
se borró, o porque se creó antes de que existiera— lo recupera en la próxima actualización.

## Contexto de descubrimiento

Actualizando `venotal-ops` de 0.56.0 a 0.57.0 el 2026-09-03, siguiendo la migración que el propio
`upgrade` indica: mover el mapa real de `AGENTS.md` a `organization/workspace.md`. El destino no
existía. Se creó a mano copiando el molde del paquete.

Es el mismo día en que 0.57.0 resolvió el [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md)
creando ese archivo: el arreglo llega completo a una instancia nueva y a medias a una que actualiza.

## Resolución

**Resuelto en 0.58.0, por la lista declarada y no por copiar todo lo que falte.** El caso reproduce
exacto y el diagnóstico era correcto: no había un paso de «crear lo que falta». Lo que cambió respecto
del fix propuesto son dos cosas que se vieron al comprobarlo.

**El diff no corría.** `copyTemplate` devuelve los archivos **conservados** —se lo cambió en 0.55.0 para
arreglar el [001](001-upgrade-pisa-lo-que-init-force-conservo.md)— y es un objeto, así que
`for (const file of agregados)` lanza `TypeError: ret is not iterable`. Corregido a `Object.keys`,
habría anunciado «lo agrega esta versión» sobre los 59 archivos que ya estaban y sobre ninguno de los
creados. Aparte, `config` no está definido en el punto donde el diff lo usa: se lee 113 líneas después.

**El «efecto lateral deseable» era el riesgo principal.** Reponer cualquier archivo faltante del molde
trata igual dos causas que no lo son: «se borró» y «nunca llegó». Borrar un archivo del molde que no se
usa es legítimo —`check` sale 0 sin `organization/domains.md` ni `planning/adr/000-template.md`,
comprobado— y reponerlo en cada actualización es la fricción recurrente que el
[008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) acababa de eliminar. Y el manifiesto no
puede desempatar: de tres archivos propios probados —`domains.md`, `company.md`, `INBOX.md`— ninguno
está registrado, porque el manifiesto anota lo que entrega el toolkit.

Por eso la creación se declara archivo por archivo. `TEMPLATE_OWN` (`engine/core/ownership.js`) lista
los 21 archivos propios del molde con cómo llega cada uno a una instancia que ya existe: `init` si toda
instancia lo tiene desde su arranque, `upgrade` si una versión lo agrega y hay que crearlo. Es el
simétrico de `RETIRED`.

La debilidad de toda lista escrita a mano —envejecer sola— la cubre una prueba que compara el árbol del
molde contra la declaración: agregar un archivo a `template/` sin clasificarlo rompe la puerta con el
mensaje que dice qué decidir. Comprobada en rojo agregando uno.

Verificado el 2026-09-03 sobre una instancia 0.56.0 publicada:

- El `upgrade` crea `organization/workspace.md` y lo anuncia: `+ organization/workspace.md: lo agrega
  esta versión, completalo`.
- `organization/domains.md`, borrado a propósito, **no** vuelve.
- El segundo `upgrade` no lo repite ni pisa lo que el proyecto escribió adentro.

## Relacionados

- [008](008-el-readme-manda-completar-un-archivo-del-toolkit.md) — la versión que introdujo el archivo
  que esta falla no entrega.
