---
caso: 467
titulo: Un guard que lanza un error inesperado sale con 1, y Claude Code deja correr la herramienta
estado: resuelto
resuelto-en: 0.118.0
prioridad: alta
version-detectada: 0.117.2
---

# 467 — Un guard que lanza sale 1, y Claude Code deja pasar

**🟢 resuelto en 0.118.0** · detectado en 0.117.2 · prioridad **alta**: un defecto cualquiera dentro de un guard apaga todos los que siguen
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

Líneas de la versión detectada.

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

## Cierre

**Resuelto en 0.118.0.**

- **Salir con 2 ante un error inesperado.** Se hizo con `exitCodeOf` (`engine/hooks/run.js`), cerrado por defecto: frena todo salvo lo declarado en `CANNOT_STOP`, también un guard que no existía al escribirlo.
- **`stop` y `prompt` afuera.** Se hizo: `stop`, `planning-drift`, `prompt`, `chat`, `prompt-notice` y `rules-notice` siguen saliendo con 1, y escriben `ERROR:` en vez de `BLOQUEADO:`.
- **El mensaje dice que el guard falló.** Se hizo: «el guard destructive falló sin llegar a juzgar: …». También con un error congelado o que no es un `Error`.
- **`onFailure: block`.** Se decidió que no: sirve a un solo runner.
- **Tradeoff, un guard roto frena toda la sesión.** Se midió en la sesión real de abajo, y el mensaje nombra el guard. Es la conducta que pide R27.
- **Tradeoff, la prueba no puede depender del 464.** Se hizo: `test/hooks/guard-failure.test.js` dispara el error con un byte nulo en la ruta.
- **Falta una sesión real.** Se hizo, en los dos sentidos, con Claude Code 2.1.316 y `claude -p --model haiku`, en un banco instalado:
  - **Antes**, con el motor de 0.117.2: `git -C "R" commit -m x` creó el commit `bdb7606` en `master`.
  - **Después**, con una copia del motor cuyo guard `destructive` lanza a propósito: «BLOQUEADO: el guard destructive falló sin llegar a juzgar: guard roto a propósito», y el comando no corrió.

Encontrado y no previsto:

- **El retorno nuevo de `executeAll` rompió la salida del caso 419.** Restaurar un `ops.config.json` ilegible pasaba de exit 0 a 2. Lo encontró la revisión, y tiene prueba propia.

### Lista de cierre

1. hecho: el commit `bdb7606` creado en `master` con el motor anterior, y `BLOQUEADO … args[1]` con exit 1.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/guard-failure.test.js`, vista en rojo.
4. hecho: mutaciones en una copia, cada una en rojo: exit 1, exit 2 siempre, sin nombrar el guard, mutar el error, sin nombres exento, `restoresConfig` sin valor.
5. hecho: exit 1 antes y exit 2 después sobre el mismo comando, y las pruebas de que `stop` y `chat` no cambian.
6. hecho: sesión real, con un guard roto a propósito en una copia del motor.
7. hecho: Claude Code. Gemini CLI 0.63.0 y `agy` 1.4.12, en sesiones reales con el motor de `31a5e77a`, con una copia del motor cuyo guard lanza: «el guard destructive falló sin llegar a juzgar», y el comando no corrió. Gemini lo muestra como `Tool execution blocked`; `agy`, como `denied by pre-tool hook`.
8. hecho: repetida con el motor de `31a5e77a` en los tres runners; esos archivos no cambiaron después. Sin correr: Codex, por decisión.
9. no aplica: es una salida de un proceso; no coordina nada.
10. hecho: quien dependía del retorno de `executeAll`: `restoresConfig` y el puente. El primero estaba roto y se arregló.
11. hecho: tres pasadas tocaron `run.js`. La primera halló la salida rota, un error congelado y `run` sin nombres, ya arreglados; las siguientes no hallaron nada en este archivo.
12. hecho: pasada uno por uno. Se quitó de la prueba la razón que ya está en `exitCodeOf`, y un `eslint-disable` en un repo sin linter.
13. hecho: `npm run ci` en exit 0.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex, por decisión.
