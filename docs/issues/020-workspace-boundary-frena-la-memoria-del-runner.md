---
caso: 020
titulo: workspace-boundary bloquea el directorio de memoria del runner y no tiene salida declarada
estado: abierto
prioridad: media
version-detectada: 0.60.1
---

# 020 — El guard de límites frena la memoria del propio runner

**🔴 abierto** · detectado en 0.60.1 · prioridad **media** — frena el camino honesto y deja pasar el rodeo

## Resumen

`workspace-boundary` rechaza toda escritura fuera de la raíz de ops y de las `workspaceRoots`. Ahí cae el
directorio donde el runner guarda su memoria entre sesiones —en Claude Code,
`~/.claude/projects/<proyecto>/memory/`—, que no es código del proyecto sino infraestructura de la
herramienta que Cauce eligió instalar.

Dos cosas lo vuelven un problema y no una molestia. Es el único guard sin salida declarada: los otros
cuatro que bloquean por política tienen su variable de override. Y vive en el grupo `pre-files`, que se
dispara con `Edit`/`Write`: el mismo archivo se escribe sin obstáculo con un heredoc por `Bash`. O sea
frena la herramienta que usa quien actúa de buena fe, y no la que usaría quien quiere rodearlo. Ese
segundo agujero no es de este guard y tiene su propio caso:
[022](022-pre-shell-no-juzga-el-destino-de-una-escritura.md).

## Reproducción

Contra una instancia instalada:

```bash
mkdir repo && cd repo && git init -q .
npx @ingeniomaps/cauce@0.60.1 init ops --mode sidecar --install --runner claude

printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.claude/projects/x/memory/nota.md","content":"x"}}' "$HOME" \
  | CLAUDE_PROJECT_DIR="$PWD" ops/automatization/hooks/guard-files.sh
```

O directo contra el motor, que es lo que el shim ejecuta —`run-hook.sh` termina en `exec node
"$runner" "$@"`—, con una raíz mínima: un directorio con `ops.config.json` y `planning/`, que es lo
que `findOpsRoot` (`engine/hooks/input.js:113-124`) busca. Por el shim la raíz no sale de
`CLAUDE_PROJECT_DIR` sino del `OPS_ROOT` que él mismo exporta, y `files.js:98` lo lee primero; por el
camino directo, que no lo exporta, manda `CLAUDE_PROJECT_DIR`.

```bash
mkdir -p raiz/planning && echo '{"name":"demo","mode":"sidecar","workspaceRoots":[]}' > raiz/ops.config.json
printf '{"tool_name":"Write","tool_input":{"file_path":"%s/.claude/projects/x/memory/nota.md","content":"x"}}' "$HOME" \
  | CLAUDE_PROJECT_DIR="$PWD/raiz" node <ruta>/engine/hooks/run.js pre-files   # exit 2
```

## Síntoma

```
BLOQUEADO: /home/manuel/.claude/projects/-home-manuel-Code-gouduet/memory/nota.md está fuera de las raíces declaradas en ops.config.json.
```

No hay variable que lo levante. Los overrides que existen son cuatro y ninguno alcanza a este guard:
`OPS_TEST_EVIDENCE_OVERRIDE` (`engine/hooks/files.js:77`), `OPS_MIGRATIONS_OVERRIDE`
(`files.js:111`), `OPS_DEPENDENCIES_OVERRIDE` (`engine/hooks/shell.js:64`) y
`OPS_GOVERNANCE_OVERRIDE` (`shell.js:110`).

## Causa raíz

`engine/hooks/files.js:97-107`:

```js
const allowed = [root, ...(config.workspaceRoots || []).map((entry) => path.resolve(root, entry.path))]
for (const raw of filesOf(input)) {
  const file = path.resolve(cwdOf(input), raw)
  if (!allowed.some((base) => file === base || file.startsWith(`${base}${path.sep}`))) {
    block(`${file} está fuera de las raíces declaradas en ops.config.json.`)
  }
}
```

La lista de permitidos son las raíces de **código**. El directorio de memoria del runner no es una raíz
de código y no debería declararse como tal para que esto funcione: declararlo mete un árbol ajeno en
`scan`, en el inventario de credenciales y en todo lo que recorre `workspaceRoots`.

El contraste es `migrations` (línea 111), que abre con `OPS_MIGRATIONS_OVERRIDE === '1'` cuatro líneas
después de este bloque. La forma existe en el motor y a este guard le falta.

## Fix propuesto

Una lista de rutas exentas en `ops.config.json`, que no son raíces de código y por eso no se declaran
como tales:

```diff
+const os = require('node:os')
+
 const allowed = [root, ...(config.workspaceRoots || []).map((entry) => path.resolve(root, entry.path))]
+// Rutas que el proyecto declara escribibles sin ser raíces de código: la memoria del runner, un
+// scratchpad, un directorio de salida. No entran a `scan` ni al inventario de credenciales.
+const exempt = (config.writableOutsideRoots || []).map((p) => path.resolve(root, p.replace(/^~/, os.homedir())))
+allowed.push(...exempt)
```

`node:os` no está importado hoy en `files.js` —sólo `node:fs`, `node:path` y `./input`—, así que el
`require` va en el diff o el fix no corre.

La alternativa que parecía más barata —exentar por defecto el directorio de memoria del runner
instalado, «que el adaptador ya conoce»— **no lo es: el adaptador no lo conoce**. Ningún
`manifest.json` de `automatization/runners/` declara nada parecido; el de `claude` tiene
`config`, `instructions`, `artifacts`, `capabilities`, `roleSkills` y `commands`, y `grep -rn memory
--include=manifest.json .` no devuelve una sola línea en los cuatro runners. O sea que esa variante
cuesta un campo nuevo en el esquema del manifest **más** el cambio en el guard, que es más que la
lista de configuración, y además mete una ruta interna de cada herramienta adentro del motor.

Queda una tercera salida que conviene descartar explícitamente antes de construir cualquiera de las
dos: que esto no sea problema de Cauce. El directorio de memoria lo escribe el runner por su cuenta y
el guard sólo lo alcanza cuando el propio agente lo escribe con `Write`. Si se decide que ese caso no
existe, el caso se cierra como `descartado` y no hay superficie nueva.

## Tradeoffs

Una exención por configuración es una superficie nueva que alguien puede abrir de más; por eso conviene
que sea explícita, corta y que `check` la muestre, en vez de una variable de entorno que no deja rastro
en el repositorio. Y la expansión de `~` la vuelve más ancha de lo que parece: un
`writableOutsideRoots: ["~"]` desactiva el guard entero sin que nada lo cante. Si se toma este camino,
`check` tendría que mostrar las rutas resueltas, no las escritas.

## Contexto de descubrimiento

Migrando `gouduet` a Cauce (2026-09-03). Al terminar, el runner fue a registrar en su memoria dónde
había quedado el planning —dato que evita que la próxima sesión busque `planning/` en la raíz, donde ya
no está— y el guard lo frenó. Se reportó al dueño en vez de rodearlo; con su autorización explícita se
escribió después por `Bash`, que es exactamente el agujero que describe el 022.

## Relacionados

- [022](022-pre-shell-no-juzga-el-destino-de-una-escritura.md) — el rodeo por `Bash`. Se descubrió
  acá y se arregla en otro archivo, otro guard y otra prueba.
