---
caso: 022
titulo: pre-shell no mira a dónde escribe un comando y el límite de raíces se esquiva con Bash
estado: abierto
prioridad: media
version-detectada: 0.60.1
---

# 022 — El límite de raíces sólo existe para `Edit` y `Write`

**🔴 abierto** · detectado en 0.60.1 · prioridad **media** — el límite sólo existe para `Edit` y `Write`

## Resumen

`workspace-boundary` juzga el destino de una escritura y vive sólo en el grupo `pre-files`, que se
dispara con `Edit` y `Write`. El grupo `pre-shell` no tiene ningún guard que mire a dónde escribe un
comando: la misma escritura al mismo archivo pasa sin obstáculo con `>`, `tee` o `cp`.

No es que falte registrar el guard en el otro grupo. `workspace-boundary` lee `filesOf(input)`, que
para un `Bash` no devuelve nada, así que correrlo ahí es un no-op.

## Reproducción

Con una raíz mínima —un directorio con `ops.config.json` y `planning/`, que es lo que `findOpsRoot`
(`engine/hooks/input.js:113-124`) busca—:

```bash
mkdir -p raiz/planning && echo '{"name":"demo","mode":"sidecar","workspaceRoots":[]}' > raiz/ops.config.json
export CLAUDE_PROJECT_DIR="$PWD/raiz"

# El camino de Edit/Write: bloquea.
printf '{"tool_name":"Write","tool_input":{"file_path":"%s/afuera/nota.md","content":"x"}}' "$HOME" \
  | node <ruta>/engine/hooks/run.js pre-files

# El mismo destino por Bash: pasa, en tres formas.
printf '{"tool_name":"Bash","tool_input":{"command":"echo x > $HOME/afuera/nota.md"}}' \
  | node <ruta>/engine/hooks/run.js pre-shell
printf '{"tool_name":"Bash","tool_input":{"command":"printf x | tee %s/afuera/nota.md"}}' "$HOME" \
  | node <ruta>/engine/hooks/run.js pre-shell
printf '{"tool_name":"Bash","tool_input":{"command":"cp nota.md %s/afuera/nota.md"}}' "$HOME" \
  | node <ruta>/engine/hooks/run.js pre-shell

# Y el guard invocado a mano sobre un input de Bash tampoco ve nada.
printf '{"tool_name":"Bash","tool_input":{"command":"echo x > $HOME/afuera/nota.md"}}' \
  | node <ruta>/engine/hooks/run.js workspace-boundary
```

## Síntoma

```
BLOQUEADO: $HOME/afuera/nota.md está fuera de las raíces declaradas en ops.config.json.
exit=2      # Write

exit=0      # echo >
exit=0      # tee
exit=0      # cp
exit=0      # workspace-boundary sobre el input de Bash
```

## Causa raíz

Dos piezas, y ninguna está mal por su cuenta.

`engine/hooks/run.js:51-55` reparte los guards por evento:

```js
'pre-shell': ['destructive', 'git-add', 'dependencies', 'governance', 'verify'],
'pre-files': ['secrets', 'generated', 'workspace-boundary', 'engine', 'migrations',
  'integration-snapshot', 'test-evidence'],
```

Ninguno de los cinco de `pre-shell` mira destinos de escritura: `destructive` busca comandos que
destruyen, `git-add` la forma ancha de stagear, `dependencies` y `governance` publicaciones, `verify`
el gate.

Y `engine/hooks/input.js:47-54`, `filesOf`, sólo junta el `file_path` de la herramienta y las rutas de
un patch. Un `Bash` no trae ninguna de las dos, así que `workspace-boundary` recorre una lista vacía y
devuelve sin juzgar nada. Registrarlo en `pre-shell` no arregla esto.

## Fix propuesto

Un guard de `pre-shell` que lea `commandOf(input)` y saque los destinos evidentes, con la misma forma
que ya usa `destructive` —una tabla de regexes sobre el comando, `engine/hooks/shell.js:14-54`, que
incluso tiene ya una regla sobre `>` (`>\s*/dev/(?:sd|nvme|disk)`)—:

- redirecciones: `>` y `>>`,
- `tee` con su argumento,
- `cp`/`mv`/`install`/`rsync` con destino absoluto,
- `sed -i` y `truncate` sobre una ruta.

Cada destino se resuelve contra el cwd y se contrasta contra las mismas raíces que usa
`workspaceBoundary`, extrayendo esa comparación a una función que los dos guards compartan en vez de
duplicarla —duplicada, una de las dos copias se pudre y nada falla—.

El mensaje tiene que decir cuál es la salida honesta, porque el caso legítimo existe y es el que
originó el [020](020-workspace-boundary-frena-la-memoria-del-runner.md): declarar la ruta, no cambiar
de herramienta.

## Tradeoffs

**Un guard así no puede ser completo, y ése es el riesgo principal.** `eval`, una variable que se
arma en otra línea, un heredoc dentro de un `bash -c`, `python -c "open(...)"`, un script que se
invoca por nombre: todo eso escribe afuera y ningún regex lo va a ver. Si el guard se presenta como un
límite, alguien va a confiar en él más de lo que aguanta. Vale la pena sólo si se lo escribe y se lo
documenta como lo que es —el mismo registro que `destructive`: frena la forma habitual, no al que
quiere pasar—.

Falsos positivos: escribir a `/tmp`, al scratchpad de la sesión o a `/dev/null` es trabajo corriente.
La lista de destinos permitidos tiene que existir desde el primer día o el guard se apaga en la primera
semana.

El costo cae sobre todos los consumidores: `pre-shell` corre en cada comando, y este guard agrega
parseo a un camino caliente.

## Contexto de descubrimiento

Salió del [020](020-workspace-boundary-frena-la-memoria-del-runner.md), migrando `gouduet` a Cauce
(2026-09-03): el guard frenó una escritura legítima por `Write` y la misma escritura salió después por
`Bash` sin que nada la mirara. Estaba escrito adentro de aquel caso como un párrafo del fix; se separó
acá porque es otro archivo, otro guard y otra prueba, y el `README` de esta carpeta pide uno por
archivo.

## Relacionados

- [020](020-workspace-boundary-frena-la-memoria-del-runner.md) — el otro lado del mismo límite: allá
  falta la salida declarada para el caso legítimo, acá falta el guard para el rodeo.
