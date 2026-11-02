---
caso: 464
titulo: Un commit con la ruta de git -C o cd entre comillas hace caer los guards de pre-shell con un byte nulo
estado: resuelto
resuelto-en: 0.118.0
prioridad: alta
version-detectada: 0.117.2
---

# 464 — Un commit con la ruta entre comillas tumba pre-shell con un byte nulo

**🟢 resuelto en 0.118.0** · detectado en 0.117.2 · prioridad **alta**: `git -C "$dir" commit` es una forma corriente. En Antigravity
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

Líneas de la versión detectada.

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

## Cierre

**Resuelto en 0.118.0**, y no con el parche que este caso proponía: ese parche se probó y dejaba regresiones.

- **La ruta entre comillas de `-C` y `cd`.** Se hizo distinto. En un commit, `gitDirectory` tapa lo entrecomillado con una marca del mismo largo, busca ahí y lee la ruta del original en ese lugar. Salida real antes y después, por `run.js pre-shell`, en la rama viva:
  - `git -C "R" commit -m x`: antes exit 1 con `null bytes`; ahora exit 2 de `live-commit`.
  - `git -C 'R' commit`, `cd "R" && git commit` y `git -c "a=b" -C "R" commit`: igual.
  - `git commit -m "cd /otro && git -C /otro commit"`: exit 2 antes y después, leyendo el cwd.
- **El prototipo de este caso.** Se decidió que no. Se construyó primero con regex, y las revisiones le encontraron regresiones. `engine/hooks/git-globals.js` es un lector lineal, porque la regex tardaba 24,3 s con 26 `-C`.
- **La ruta con espacios.** Se hizo, sólo con `git` como primera palabra de un comando simple. Era peor de lo que este caso decía: `git -C "a b" commit` no se reconocía como commit. En otra posición se lee como antes: leerla ahí dejaba pasar lo que el shell vuelve a parsear. Desde el 479 también detrás de una palabra de bloque o un envoltorio.
- **La variable, `git -C "$PWD"`.** Se hizo: deja de lanzar. Sale exit 2, «no se pudo leer el índice… Si usaste una variable en `git -C`, escribí la ruta literal». No se expande, igual que sin comillas. Con `$PWD`, se lee: el 468 lo expande.
- **Comentario falso de `gitDirectory`.** Se reemplazó.
- **Tradeoff, el mensaje leído como orden.** Se probó: mensajes con `cd` y `-C` citados siguen leyendo el cwd.
- **Tradeoff, commits que empiezan a frenarse.** Ocurre, y está en el CHANGELOG.
- **Prioridad, alta.** Se confirmó en una sesión real: la medición está en el 467.

Encontrado y no previsto:

- **Lo que las revisiones hallaron en mis arreglos.** Pasaban de exit 2 a 0: `git -C "R"/. push --force`, `git -C "$(git push --force …)" status`, una continuación de línea, `git -C R;git commit`, `git -c alias.p='!git push --force' p`, `bash -c "git -C R …"`, `foo 'git -C ' ; git push -f ; foo ' x'`, `eval git -C 'x push -f'` y `eval true \; git -C 'x push -f'`. Todas tienen prueba y las 50 formas se compararon con el motor anterior: quedan iguales, salvo tres que pasan a frenar.
- **Un valor entre comillas sólo se toma entero si adentro no hay nada que el shell interprete**, y con `git` como primera palabra de un comando simple. Es la regla que cerró esa serie.
- **`git --no-advice push -f` pasaba en los dos motores.** Se sumaron `--no-advice`, `--no-lazy-fetch` y `--attr-source`, comprobados con el binario local.
- **`input.js` llegó a las 500 líneas.** La lectura de comillas salió a `engine/hooks/quoting.js`.
- **Dos casos propios.** 468: se lee el primer `cd` o `-C` del comando. 469: un commit esconde lo que ejecuta adentro.

Comparación con el motor anterior, sin ejecutar nada, sobre 68 040 comandos generados: fuera de la primera palabra sólo difieren las opciones nuevas, que dejan el verbo a la vista, y los commits que antes lanzaban.

### Lista de cierre

1. hecho: tabla de nueve formas por `run.js`, guardada antes de tocar el código, con el rojo previo de cada una.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/git-command-reading.test.js`, vista en rojo antes del arreglo.
4. hecho: mutaciones en una copia, todas en rojo: primera palabra siempre y nunca, asignación con separador, valor interpretado, `-c` como palabra, directorio fuera de la primera palabra, máscara siempre y nunca, `shellWord`. Las que sobrevivieron sumaron su caso o se quitó lo que sobraba.
5. hecho: 50 formas lado a lado contra el motor de `91dbdc9e`.
6. hecho: sesión real de `claude -p`: `git -C "W/app" commit -m x` y `git -C "W/mi carpeta" commit -m x` se frenaron sin crear commit. Antes, la primera creó `bdb7606`.
7. hecho: Claude Code 2.1.316. Gemini CLI 0.63.0 y `agy` 1.4.12, en sesiones reales con el motor de ese momento, anterior a 468 y 473-479: `git -C "W/app" commit -m x` se frenó en los dos sin crear commit.
8. hecho: repetida con el motor de ese momento en los tres runners; sobre el motor de hoy, por hook. Sin correr: Codex, por decisión.
9. no aplica: lee un comando; no coordina nada.
10. hecho: `gitDirectory` lo usan `approval.js`, `ai-signature.js`, `live-commit.js`, `shell.js` y `stagedForCommit`, ejercidos por `test/hooks`; `withoutGitGlobals`, toda la lectura de comandos.
11. hecho: Ocho pasadas independientes. Las siete primeras hallaron regresiones y se arreglaron. La última, sobre esta versión, corrió 2838 de 39 683 diferencias por `run.js`: sus 135 casos de 2 a 0 son de una sola forma, un commit en una ruta con espacios que esconde una orden, y esa forma ya pasaba sin espacios (caso 469). Después, un barrido completo sin ejecutar nada: 76 950 comandos generados, 16 142 donde los motores leen distinto, todos por `run.js`. De exit 2 a 0 hay 2676, todos con `git` como primera palabra y con el verbo dentro del valor, como `git -C 'x push -f'`, donde git no lo corre: eran falsos positivos del motor anterior. Y una revisión de lo movido después: nada que impida.
12. hecho: pasada uno por uno sobre el diff. Se corrigió un «Vive acá» falso, se movieron los comentarios de `GIT_GLOBAL` con su código y se quitó lo repetido.
13. hecho: `npm run ci` en exit 0.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex, por decisión. Los dos restos de esta lectura quedaron en el 473, que los cerró.
