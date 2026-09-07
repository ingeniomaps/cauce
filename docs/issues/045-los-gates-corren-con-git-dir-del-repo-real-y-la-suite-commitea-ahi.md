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

## Contexto de descubrimiento

Apareció committeando trabajo propio en este repositorio, partido en dos commits por naturaleza como
pide R8, con tres borradores sin trackear en `docs/issues/` que dejaban el árbol sucio. El primer
commit se bloqueó por un gate en rojo; el rojo era `test/repo/repo.test.js` fallando con `EISDIR` sobre
`.cauce-eval`, un symlink que la propia corrida acababa de crear en el repositorio.

Costó dos diagnósticos equivocados antes de mirar `git log`: primero se leyó como un problema de rutas
absolutas, después como suciedad preexistente del checkout. Nada en la salida del guard apunta a que
la corrida escribió en el repositorio, y ése es el costo real del caso — no los commits, que se
deshacen con un `reset`, sino que se leen como estado que ya estaba.

## Relacionados

- [040](040-verify-corre-los-gates-sobre-el-arbol-y-el-commit-graba-el-indice.md) — introdujo
  `commitTree` y con él este borde.
- [035](035-los-guards-que-leen-el-indice-lo-leen-antes-de-que-el-comando-lo-llene.md) — el mismo
  enunciado de fondo: decidir mirando un estado que no es el objeto de la decisión.
