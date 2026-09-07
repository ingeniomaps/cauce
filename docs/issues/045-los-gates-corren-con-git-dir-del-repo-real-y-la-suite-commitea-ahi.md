---
caso: 045
titulo: Los gates corren con GIT_DIR del repo real y la suite commitea ahí
estado: abierto
prioridad: alta
version-detectada: 0.66.0
---

# 045 — Committear por partes deja commits de las pruebas en el repositorio

**🔴 abierto** · detectado en 0.66.0 · prioridad **alta** — escribe historia en el repo del usuario y no avisa

## Resumen

Cuando el árbol de trabajo está sucio, `verify` materializa el índice en un temporal y corre los gates
con `GIT_DIR` apuntando al `.git` **del repositorio real** y `GIT_WORK_TREE` al temporal. La suite de
Cauce levanta repositorios de prueba y les hace `git init`, `git add` y `git commit` sin limpiar el
entorno, así que esos comandos no operan sobre el repositorio de prueba: operan sobre el del usuario.

El resultado es que un commit bloqueado deja commits ajenos en la rama, archivos trackeados que nadie
agregó y `core.worktree` apuntando a un temporal ya borrado. Nada de eso se anuncia: el usuario ve un
mensaje de gate en rojo.

Y el disparador es exactamente lo que R8 pide. `commitTree` sólo materializa el temporal cuando queda
algo sin stagear (`engine/hooks/shell.js:380`), así que committear **todo junto** es seguro y
committear **una naturaleza por vez** —dejando el resto del trabajo en el árbol— es lo que lo activa.

## Reproducción

```bash
git clone https://github.com/ingeniomaps/cauce && cd cauce
npm ci
git checkout -b prueba-045

# Dos cambios de naturalezas distintas, y se stagea sólo uno: el árbol queda sucio.
printf '\n// uno\n' >> engine/hooks/files.js
printf '\n// dos\n' >> engine/planning/state.js
git add engine/hooks/files.js

# El guard corre acá. Con el repo conectado a un runner es el hook de PreToolUse;
# a mano es la misma entrada:
echo '{"tool_input":{"command":"git commit -m prueba"}}' \
  | automatization/hooks/guard-verify.sh

git log --oneline -5
git config --local --get core.worktree
git status --short
```

## Síntoma

`git log` sobre la rama, después de un solo intento de commit bloqueado:

```text
c2df5dc base
3a45e25 base
106835c base
262e1ae base
a2465ec base
195ac70 contrato inicial
2249a3c Merge pull request #236 from ingeniomaps/release/0.66.0
```

`contrato inicial` trae adentro lo que estaba staged más dos symlinks que ninguna prueba quiso crear
acá:

```text
 .cauce-eval                              |  1 +
 .claude/workflows                        |  1 +
 automatization/hooks/README.md           |  1 +
 engine/hooks/files.js                    | 56 ++++++++++++++++++-
```

Y la configuración local queda rota:

```text
$ git config --local --get core.worktree
/tmp/ops-verify-1iQpBj

$ git rev-parse --is-inside-work-tree
false
```

A partir de ahí cualquier comando de git que nombre una ruta responde
`fatal: esta operación debe ser realizada en un árbol de trabajo`, porque el temporal ya no existe.

## Causa raíz

`engine/hooks/shell.js:403-404` arma el entorno de los gates:

```js
const gitDir = run('git', ['-C', dir, 'rev-parse', '--absolute-git-dir'], dir)
const env = gitDir.ok ? { GIT_DIR: gitDir.output.trim(), GIT_WORK_TREE: temp } : {}
```

Ese entorno existe por una razón buena y documentada en el propio comentario: un índice materializado
no trae `.git`, y un gate que llama a git —listar lo trackeado, leer una etiqueta— fallaría ahí. Lo que
no previó es un gate que **escribe** con git, y el gate de este repositorio es su propia suite:
`test/wiring/hooks.test.js:31-34` lanza `spawnSync('git', args, { cwd })` sin tocar el entorno, así que
hereda `GIT_DIR` y escribe en el repositorio real aunque su `cwd` sea un temporal.

Es la contracara de [040](040-verify-corre-los-gates-sobre-el-arbol-y-el-commit-graba-el-indice.md):
aquel caso arregló que el gate midiera el árbol en vez del índice, y `commitTree` es su fix. Este es el
borde que ese fix abrió.

## Fix propuesto

`GIT_DIR` y `GIT_WORK_TREE` sirven para **leer** y son peligrosos para escribir, y el guard no puede
saber qué hace cada gate. Lo que sí puede es no dejar que el entorno viaje más allá del proceso del
gate, y lo que un proyecto puede es no heredar un entorno de git en sus pruebas. Son dos arreglos y el
segundo no alcanza solo: vale para esta suite y no para la del que instala Cauce.

En el motor, materializar también el `.git` en vez de apuntar al real:

```diff
-  const gitDir = run('git', ['-C', dir, 'rev-parse', '--absolute-git-dir'], dir)
-  const env = gitDir.ok ? { GIT_DIR: gitDir.output.trim(), GIT_WORK_TREE: temp } : {}
+  // Un clon local del repositorio dentro del temporal: los gates que leen git siguen contestando, y
+  // los que escriben lo hacen sobre una copia que se borra al terminar. Apuntar `GIT_DIR` al `.git`
+  // real convierte cualquier escritura de un gate en historia del usuario.
+  const cloned = run('git', ['clone', '--local', '--no-checkout', '--quiet', dir,
+    path.join(temp, '.git-verify')], temp)
+  const env = cloned.ok ? { GIT_DIR: path.join(temp, '.git-verify'), GIT_WORK_TREE: temp } : {}
```

En la suite, limpiar el entorno en el ayudante que lanza git:

```diff
 function git(args, cwd) {
-  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
+  // Sin esto, una corrida bajo `verify` hereda su `GIT_DIR` y escribe en el repositorio de verdad.
+  const env = { ...process.env }
+  delete env.GIT_DIR
+  delete env.GIT_WORK_TREE
+  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env })
   assert.equal(result.status, 0, result.stderr)
 }
```

El clon local cuesta un `git clone --local` por commit con árbol sucio; en un repositorio grande no es
gratis, y conviene medirlo antes de fijarlo. La alternativa barata —no exportar nada y aceptar que un
gate que llama a git falle en el temporal— es volver a lo que 040 encontró roto.

## Tradeoffs

- El clon local agrega tiempo a cada commit parcial. Cuánto depende del repositorio y no está medido.
- **Y el clon no responde lo mismo que el original.** Su índice es el de `HEAD`, no el que `verify`
  acaba de materializar, así que un gate que pregunte `git ls-files` o `git status` obtiene otra
  respuesta que hoy. Quien tome el caso tiene que comprobar contra qué preguntan los gates reales antes
  de fijar esta forma; el diff de arriba es la dirección, no una solución verificada.
- Limpiar el entorno en las pruebas puede tapar un caso legítimo: una prueba que quisiera comprobar el
  comportamiento **con** `GIT_DIR` puesto tendría que declararlo explícitamente. Hoy no hay ninguna.
- Mientras el motor no cambie, un proyecto con gates que escriben con git —un `make ci` que taggea, un
  script que commitea un lockfile regenerado— sigue expuesto aunque limpie su propia suite.

## Prioridad

**Alta.** Escribe historia en el repositorio de quien lo usa, sin anunciarlo y por el camino que el
proceso recomienda. Se deshace con `git reset --mixed` y `git config --unset core.worktree` cuando
alguien lo descubre, y el costo real es que hasta entonces se lee como estado que ya estaba.

## Contexto de descubrimiento

Apareció committeando trabajo propio en este repositorio, partido en dos commits por naturaleza como
pide R8, con tres borradores sin trackear en `docs/issues/` que dejaban el árbol sucio. El primer
commit se bloqueó por un gate en rojo; el rojo era `test/repo/repo.test.js` fallando con `EISDIR` sobre
`.cauce-eval`, un symlink que la propia corrida acababa de crear en el repositorio.

Costó dos diagnósticos equivocados antes de mirar `git log`: primero se leyó como un problema de rutas
absolutas, después como suciedad preexistente del checkout. Nada en la salida del guard apunta a que
la corrida escribió en el repositorio, y ése es el costo real del caso — no los commits, que se
deshacen con un `reset`, sino que se leen como estado que ya estaba.

## Arreglo aplicado

**Mergeado y sin publicar.** El caso sigue `abierto` a propósito: se marca `resuelto` cuando salga la
versión que lo lleva, porque hasta entonces sigue mordiendo a todo el que instale. El recorrido de lo
que este caso enumeró, ítem por ítem — incluidos los tres daños del Resumen, que no son uno solo:

- **Commits ajenos en la rama — cerrado y con prueba.** `engine/hooks/shell.js` ya no exporta
  `GIT_DIR` ni `GIT_WORK_TREE`: la copia materializada se vuelve un repositorio propio con `git init` y
  `git add --all`, así que su índice sale de lo que se acaba de materializar y lo que escriba escribe
  ahí. `test/wiring/hooks.test.js` corre un gate que commitea y comprueba que el repo de verdad no lo
  gana.
- **Archivos trackeados que nadie agregó — cerrado, y se había quedado afuera.** Un `git add` sin commit
  no toca el `git log`, así que mirar el log no lo veía. La prueba compara el `git status --porcelain`
  entero de antes contra el de después, y se comprobó por separado que esa aserción cae: con la fuga
  puesta y un gate que sólo stagea, el repo de verdad aparece con `AD filtrado.txt`.
- **`core.worktree` roto — cerrado.** La misma prueba lo comprueba vacío al terminar.
- **Materializar el `.git` en vez de apuntar al real — hecho, y distinto de como estaba propuesto.** No
  se clona. Eso resuelve de paso la pregunta abierta que el propio caso dejaba en Tradeoffs —un clon
  contesta sobre `HEAD` y no sobre el índice— sin tener que medirla. Los dos gates que necesitaban git
  adentro del temporal (`git ls-files` en `test/repo/repo.test.js`) siguen contestando sobre lo que el
  commit va a grabar.
- **El costo, que el caso pedía medir antes de fijar la forma — medido.** Sobre este repositorio, 1549
  archivos: `init` 4 ms y `add --all` ~385 ms, tres corridas, contra 2 ms del `rev-parse` que costaba
  antes. O sea **~0,39 s por commit con árbol sucio**, al lado de gates que tardan segundos o minutos.
  Escala con la cantidad de archivos, así que un repositorio diez veces más grande pagaría unos cuatro
  segundos. Se acepta; queda el número para que nadie tenga que volver a estimarlo.
- **Limpiar el entorno donde se lanza git — hecho en dos lugares, y uno de ellos lo había descartado mal.**
  En `engine/cli/catalog.js`, la creación del banco de evaluación: es el sitio que hizo el daño y es
  código del motor, así que protege a cualquier consumidor. Y en el ayudante que el caso nombraba,
  `test/wiring/hooks.test.js`: la primera vuelta lo salteó diciendo que sólo leía, y **no es cierto** —
  hace `init`, `config`, y sus llamadores `add` y `commit`—. Está limpiado.
- **«Limpiar el entorno puede tapar un caso legítimo» — no hay ninguno.** Ninguna prueba de hoy quiere
  `GIT_DIR` puesto; la de `test/agents/bench.test.js` lo pone a propósito y comprueba que el banco
  commitea igual en el banco.
- **«Un proyecto con gates que escriben con git sigue expuesto» — dejó de estarlo, y a cambio pierde el
  efecto.** El motor ya no exporta nada, así que no hay qué heredar. Pero un gate cuyo efecto **es** una
  escritura de git —los dos ejemplos que el caso daba, un `make ci` que taggea y un script que commitea
  un lockfile regenerado— la hace ahora sobre la copia, que se borra. Ese efecto se pierde **en
  silencio**. Se elige ese silencio sobre el anterior, que era escribir en la rama de quien commitea; un
  proyecto con un gate así tiene que sacar esa escritura del gate, y conviene que lo sepa antes de
  actualizar.

**Lo que el caso no preveía y hay que saber**: `-C` no le gana a `GIT_DIR`. Verificado corriendo
`git -C <otro> rev-parse --absolute-git-dir` con la variable puesta, que contesta el de la variable. Por
eso el banco escribía afuera aunque cada comando nombrara su directorio, y por eso limpiar el entorno es
lo único que lo cierra.

Las tres piezas se vieron rojas antes de arreglarse, cada una por lo suyo: volver a exportar `GIT_DIR`
rompe la prueba de la fuga por commit; con la fuga puesta y un gate que sólo stagea, rompe la del
estado; y quitar la limpieza del entorno rompe la del banco.

**Y este cierre se rehízo.** La primera versión daba por cerrados tres ítems que no lo estaban: el daño
por `git add` sin commit no tenía prueba, el ayudante que el caso nombraba se había salteado con una
razón falsa, y el costo que el caso mandaba medir se había afirmado barato sin medirlo. Salió de que
alguien preguntara si de verdad estaba cerrado.

## Relacionados

- [040](040-verify-corre-los-gates-sobre-el-arbol-y-el-commit-graba-el-indice.md) — introdujo
  `commitTree` y con él este borde.
- [035](035-los-guards-que-leen-el-indice-lo-leen-antes-de-que-el-comando-lo-llene.md) — el mismo
  enunciado de fondo: decidir mirando un estado que no es el objeto de la decisión.
