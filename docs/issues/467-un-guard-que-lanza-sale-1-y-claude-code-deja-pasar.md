---
caso: 467
titulo: Un guard que lanza un error inesperado sale con 1, y Claude Code deja correr la herramienta
estado: abierto
prioridad: alta
version-detectada: 0.117.2
---

# 467 — Un guard que lanza sale 1, y Claude Code deja pasar

**🔴 abierto** · detectado en 0.117.2 · prioridad **alta**: un defecto cualquiera dentro de un guard apaga todos los que siguen
en ese evento, sin frenar nada. Se vio en una sesión real de Claude Code: un commit salió en la rama viva sin pasar por los guards.

## Resumen

`run.js` sale con 2 sólo si el error viene marcado como bloqueo. Cualquier otro error sale con 1 y escribe `BLOQUEADO:`, así
que se lee como un freno. Para Claude Code un exit 1 no frena, y el resto del motor razona al revés: un guard que no
contesta, frena (R27).

## Reproducción

Hoy la dispara el caso 464, que es el único error inesperado conocido:

```bash
B=$(node engine/cli/ops.js bench tarea --force); cd "$B"; R=$PWD
printf '%s' "{\"cwd\":\"$R\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git -C \\\"$R\\\" commit -m x\"}}" \
  | CLAUDE_PROJECT_DIR=$R bash automatization/hooks/guard-shell.sh; echo "exit $?"
```

## Síntoma

Salida real, 0.117.2, 2026-10-31:

```
BLOQUEADO: The argument 'args[1]' must be a string without null bytes. Received 'R/\x00'
exit 1
```

Claude Code, `code.claude.com/docs/en/hooks`, consultado el 2026-10-31: «Exit code 1 without valid JSON output is a
non-blocking error… If your hook is meant to enforce a policy, use `exit 2`».

**Verificado en una sesión real**, Claude Code 2.1.316, `claude -p --model haiku`, en un banco con el runner instalado, en la
rama viva `master` y con un archivo stageado. Costó USD 0,03 entre las dos:

| Comando | Qué pasó | Commits en el banco |
|---|---|---|
| `git -C R commit -m x` | `live-commit` lo frenó | sigue en 1 |
| `git -C "R" commit -m x` | **se creó el commit `bdb7606` en `master`** | 2 |

## Causa raíz

`engine/hooks/run.js:319`: `process.exit(error.blocked ? 2 : 1)`. Está así desde el primer commit del motor (`185f2717`).

El mismo problema ya se encontró una vez, sólo para una forma: el encabezado de `engine/hooks/project-guards.js` y el caso 428
cuentan que un `.map` sobre una configuración mal escrita salía con 1 «que Claude Code trata como error que no frena». Se
arregló esa rama y no la salida común.

El puente de Antigravity no pasa por esta línea: llama a `executeAll` y convierte cualquier error en `deny`.

## Fix propuesto

Salir con 2 ante un error inesperado **en los eventos `pre-*`**, con un mensaje que diga que el guard falló y no que juzgó.

En una copia, con `process.exit(2)` para todos, `node --test test/hooks/*.test.js` da 355 de 355. Eso dice que ninguna prueba
de esa carpeta depende del 1, no que el cambio sea correcto.

Queda afuera a propósito `stop` y `prompt`, y esto no está en esa corrida: salir 2 en `stop` por un defecto ata la sesión a no
poder cerrar, que es el bucle que `project-guards.js` ya evita; y `chat` declara que nunca bloquea, así que un fallo suyo no
puede tragarse el mensaje de la persona.

La alternativa es `"onFailure": "block"`, que la misma página documenta para Claude Code desde 2.1.295. Sirve para un solo
runner y depende de la versión instalada, así que se descarta.

## Tradeoffs

- Es una quita que invierte una conducta (R29): hoy un guard roto deja trabajar. Con el arreglo, un defecto de un guard frena
  todos los comandos de la sesión hasta que se arregle. Es lo que pide R27, y la salida tiene que nombrar el guard y su error,
  porque la sesión no se puede destrabar sola.
- La prueba necesita antes y después sobre un mismo guard que lance, con un guard de prueba y no con el 464: una vez arreglado
  aquél, deja de disparar éste.

## Contexto de descubrimiento

Al revisar el 464, que decía «falla cerrado» mirando sólo el puente de Antigravity. El wrapper de los otros runners devolvió 1.

## Relacionados

Caso 464 (el error que hoy lo dispara), caso 428 (la misma salida, para los guards del proyecto).
