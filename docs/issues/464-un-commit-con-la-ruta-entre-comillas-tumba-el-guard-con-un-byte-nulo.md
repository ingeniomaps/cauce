---
caso: 464
titulo: Un commit con la ruta de git -C o cd entre comillas hace caer los guards de pre-shell con un byte nulo
estado: abierto
prioridad: alta
version-detectada: 0.117.2
---

# 464 — Un commit con la ruta entre comillas tumba pre-shell con un byte nulo

**🔴 abierto** · detectado en 0.117.2 · prioridad **alta**: `git -C "$dir" commit` es una forma corriente. En Antigravity
frena sin una razón útil. En Claude Code el hook sale 1 y la herramienta corre, así que el commit sale sin `verify`,
`governance` ni `dependencies`. Se vio en una sesión real: la medición está en el caso 467.

## Resumen

Citar la ruta de un commit es lo correcto en shell. Al leer el commit, `gitDirectory` vacía todo lo entrecomillado para no
tomar el mensaje como orden, también la ruta. Lo que queda es `<cwd>/\0`, y Node lanza al pasárselo a `git -C`. Ningún guard
llega a opinar y los que siguen no corren.

## Reproducción

```bash
B=$(node engine/cli/ops.js bench tarea --force); cd "$B"; R=$PWD
printf '%s' "{\"cwd\":\"$R\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git -C \\\"$R\\\" commit -m x\"}}" \
  | CLAUDE_PROJECT_DIR=$R bash automatization/hooks/guard-shell.sh; echo "exit $?"
```

No se ejecuta ningún commit: el guard sólo decide.

## Síntoma

Salida real, 0.117.2, 2026-10-31, con el wrapper que usa Claude Code, en una rama que no es la viva. `R` es la raíz del banco.

| Comando | Exit | Salida |
|---|---|---|
| `git -C R commit -m x` | 0 | |
| `git -C "R" commit -m x` | **1** | `BLOQUEADO: The argument 'args[1]' must be a string without null bytes. Received 'R/\x00'` |
| `git -C "$PWD" commit -m x` | **1** | el mismo |

En la rama viva, sin comillas sale 2 con la razón real. `cd "R" && git commit -m x` cae igual, y `git -C "R" status` no,
porque no es un commit.

Por el puente de Antigravity, la instancia donde se detectó vio `deny` con ese mismo mensaje. Falla cerrado sólo ahí.

Qué hace el runner con un exit 1, según su documentación pública, consultada el 2026-10-31:

- **Claude Code** (`code.claude.com/docs/en/hooks`): «Exit code 1 without valid JSON output is a non-blocking error»; la
  acción sigue. Verificado en 2.1.316, en el caso 467.
- **Gemini CLI** (`geminicli.com/docs/hooks/reference/`): otro código «continues with a warning»; no dice si la herramienta
  corre.
- **Codex** (`learn.chatgpt.com/docs/hooks`): no lo especifica.

## Causa raíz

Antes el caso la ponía en `asRun`, y no es ahí. La traza dice:

- `stagedFiles` (`engine/hooks/input.js:340`), llamada desde `stagedForCommit`, lanza en `dependencies`, `governance` y
  `verify`. `dependencies` es la primera del grupo, así que es la que corta la corrida. Con ella fuera, `live-commit` lanza
  igual en `engine/hooks/live-commit.js:26`.
- Todos reciben la ruta de `gitDirectory` (`engine/hooks/input.js:302-310`), que en la `:304` usa `unquoted`.

El comentario de arriba de esa función afirma que esa ruta «se pierde y cae al cwd». Eso sólo es cierto para una ruta con
espacios: sin espacios, la marca `\0` se lee como si fuera la ruta. El comentario se corrige con el arreglo.

Por qué se deja pasar en vez de frenar está en el caso 467.

## Fix propuesto

En `gitDirectory`, vaciar lo entrecomillado de un commit salvo el argumento de un `cd` o de un `-C` global. La decisión se
toma mirando lo que hay **antes** de la comilla, ya sin comillas, no por posición.

Se probó en una copia, parcheando sólo esa función:

| Comando | Hoy | Con el parche |
|---|---|---|
| `git -C "R" commit -m x` | `<cwd>/\0` | `R` |
| `git -C 'R' commit -m x` | `<cwd>/\0` | `R` |
| `cd "R" && git commit -m x` | `<cwd>/\0` | `R` |
| `git -c "a=b" -C "R" commit -m x` | `<cwd>/\0` | `R` |
| `git commit -m "cd /otro && git -C /otro commit"` | `<cwd>` | `<cwd>` |
| `git commit -C "HEAD"` | `<cwd>` | `<cwd>` |
| `git -C "$PWD" commit -m x` | `<cwd>/\0` | `<cwd>/$PWD` |
| `git -C "R/mi carpeta" commit -m x` | `<cwd>` | `<cwd>` |

`node --test test/hooks/*.test.js` da 355 de 355 con y sin el parche. Quedan dos filas por resolver al construirlo:

- **La variable** deja de lanzar, pero queda sin expandir. Se comprueba al construir qué mensaje da `stagedFiles` ahí. Cerrar
  esta fila no pide expandirla: la forma sin comillas tiene hoy el mismo límite.
- **La ruta con espacios** sigue cayendo al cwd, y los guards leen el índice de otra carpeta. `GIT_GLOBAL`
  (`engine/hooks/input.js:283`) la corta en el espacio. Hay que entenderla ahí también, y es lo único de este caso que el
  prototipo no cerró.

## Tradeoffs

- Conservar una parte de lo entrecomillado reabre lo que `unquoted` evita, que el mensaje se lea como orden. Por eso se
  decide por lo que hay antes de la comilla; las dos filas de mensaje de la tabla son la prueba que tiene que seguir verde.
- `git -C "R" commit` pasa a llegar de verdad a `verify` y compañía, así que un commit que hoy pasa sin mirar puede empezar a
  frenarse. Es lo correcto, y conviene decirlo en el CHANGELOG.

## Contexto de descubrimiento

La revisión de una instancia, probando formas de commit contra un guard propio. Dos filas de su escenario estaban frenadas
por esta caída y no por el guard medido, así que también falsea una prueba que aserciona «se frenó» sin mirar quién.

## Relacionados

Caso 467 (un guard que lanza sale 1), caso 261 (el destino de un `cd` por variable), caso 328 (lo que la lectura de comillas
todavía no conoce).
