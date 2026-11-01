---
caso: 468
titulo: El repositorio de un commit se lee del primer cd o -C del comando, aunque no sea el del commit
estado: resuelto
resuelto-en: 0.118.0
prioridad: media
version-detectada: 0.117.2
---

# 468 — El repositorio de un commit se lee del primer `cd` o `-C` del comando

**🟢 resuelto en 0.118.0** · detectado en 0.117.2 · prioridad **media**: un commit encadenado con un `cd` que no es el suyo pasa sin
`verify`, `governance` ni `live-commit`, y no avisa nada. Hace falta esa forma de comando, y no se contó cuántas veces
aparece. Sube a alta si aparece en los diarios de una corrida real.

## Resumen

`gitDirectory` busca en todo el comando el primer `-C` de un `git` y, si no hay, el primer `cd`. No mira si vienen antes o
después del commit, ni de qué `git` son. Si el repositorio que lee no es de la instancia, los guards se abstienen: creen que el
commit es de otro.

## Reproducción

En un banco `tarea`, en la rama viva y con un archivo stageado, se le pregunta al hook sin commitear nada:

```bash
printf '%s' "{\"cwd\":\"$R\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"<comando>\"}}" \
  | OPS_ROOT=$R node engine/hooks/run.js pre-shell; echo "exit $?"
```

## Síntoma

Salida real, 2026-10-31, con el arreglo del 464 puesto:

| Comando | Exit | Lo correcto |
|---|---|---|
| `git commit -m x` | 2, `live-commit` | 2 |
| `git commit -m x && cd /etc` | **0** | 2: el commit corre antes del `cd` |
| `echo git -C /etc && git commit -m x` | **0** | 2: ese `git` es texto de un `echo` |
| `cd /etc; cd R && git commit -m x` | **0** | 2: el último `cd` antes del commit es el que vale |

La forma entrecomillada de la segunda fila, `echo git -C "/etc"`, antes del 464 lanzaba y también dejaba pasar.

## Causa raíz

`gitDirectory` (`engine/hooks/input.js`): `text.match` devuelve la primera coincidencia del comando entero. El comentario de
arriba de la función explica por qué se lee el mensaje como dato, pero no contempla varios comandos.

## Fix propuesto

Hipótesis, sin probar: partir el comando por sus separadores, ubicar el segmento del `git commit`, y leer el `-C` de ese segmento o,
si no tiene, el último `cd` de los segmentos anteriores. `expandAssigned` ya resuelve las variables asignadas en el comando.

`(cd "/o" && git commit)` también se lee mal, porque el `cd` tras el paréntesis no cae en el ancla. Es de esta misma lectura.

## Tradeoffs

- Se usa en cinco lugares (`approval.js`, `ai-signature.js`, `live-commit.js`, `shell.js` y `stagedForCommit`). Cambiar qué repositorio
  se lee puede frenar commits que hoy pasan.
- Si el `cd` es condicional (`cd a || cd b`), el repositorio no se sabe mirando el comando. Frenar es lo que pide R27.

## Contexto de descubrimiento

La revisión independiente del 464. El arreglo de ese caso no lo crea: la forma sin comillas ya pasaba.

## Relacionados

Caso 464 (la ruta entrecomillada), caso 261 (el destino de un `cd` por variable).

## Cierre

**Resuelto en 0.118.0, entero.** Un primer cierre lo arregló en parte, y el resto pasó al 473; volvió acá y se terminó.

- **`git commit -m x && cd /etc` y `git commit -m x; cd "/etc"`.** Se hizo: lo que viene después no cambia el repositorio.
- **`echo git -C /etc && git commit -m x`.** Se hizo: ese `git` no corre.
- **`cd /etc; cd R && git commit -m x`.** Se hizo distinto de lo que proponía. «El último `cd`» no alcanza, porque uno puede no correr: `engine/hooks/commit-repo.js` simula el comando entero, mira si la carpeta existe, y cada `git` se juzga donde corre.
- **`(cd "/o" && git commit)`.** Se hizo distinto: un subshell deja dudas, y con dudas se juzga el candidato que sea de la sesión. Una sesión fuera de la instancia que entra a ella por un subshell ahora se frena. Frena de más con la sesión en la instancia y el commit en otro lado, igual que antes, y queda en el 473.
- **Tradeoff, cinco lugares usan `gitDirectory`.** Se hizo: los cinco le pasan `input`, y sus guards eligen entre los candidatos.
- **Tradeoff, un `cd` condicional.** Se hizo: `cd a || cd b`, `false && cd x;`, `cd x &`, `true | cd x` y `pushd` dejan dudas. `cd x || exit 1` no.
- **Prioridad, «sube a alta si aparece en los diarios».** Queda sin objeto.

Encontrado y no previsto:

- **Frenar de más era el riesgo mayor, y lo encontraron las revisiones.** `T=$(mktemp -d); cd $T; git commit`, `mkdir T && cd T`, `cd F && npm test 2>&1 | tail -5 && git commit`, `git grep x; cd F && git commit` y `cd my-git && git commit` frenaban sin razón en versiones intermedias. Están todas en las pruebas.
- **`--git-dir R/.git` elige el repositorio** y nadie lo leía. Se lee.
- **`git -C "$PWD/a b"` y `git -c user.name="Git Bot"` no se reconocían como commit.** Se reconocen, y salen del 473.
- **Otro `git` del comando también corre.** `cd R && git add -A && cd F && git commit` se juzga en `R`, y los de sólo lectura no se juzgan.

### Lista de cierre

1. hecho: las filas de este caso y del 473, medidas con el motor de `8d54944f` antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/git-command-reading.test.js`, vista en rojo.
4. hecho: 25 mutaciones de `commit-repo.js` y de la lectura de `git-globals.js` en una copia, todas en rojo. Las que sobrevivieron sumaron su caso, o mostraron una condición que sobraba, y se quitó.
5. hecho: 3456 comandos contra `8d54944f`, con la sesión en la instancia y en un repo ajeno. Los 564 que difieren corrieron por `run.js`, y después por `bash` con un `git` falso que anota dónde cae. De los 76 que dejan de frenar, ninguno escribe en la instancia. De los 516 que pasan a frenar, 34 son `commit` o `add` que no la tocan: el resto de la lista está en el 473.
6. hecho: hook instalado y sesiones reales. `cd /tmp; cd W/app && git commit` y `echo git -C /tmp && git -C W/app commit` se frenaron por `live-commit`, sin crear commit.
7. hecho: Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12. El commit en un repo ajeno pasó y se creó en Gemini y `agy`; en Claude lo frena Claude Code mismo, antes del hook, y ahí se midió por el hook: exit 0.
8. hecho: con el motor final, salvo las últimas correcciones de falsos frenos, medidas por las pruebas y el barrido. Sin correr: Codex, por decisión.
9. hecho: dos carpetas de sesión, un repo propio y uno ajeno, en cada corrida.
10. hecho: los cinco que usan `gitDirectory`, por `test/hooks`.
11. hecho: cuatro pasadas sobre `commit-repo.js`. La última no halló regresiones, sólo falsos frenos, ya arreglados y comprobados con pruebas, mutaciones y barrido, sin otra pasada.
12. hecho: pasada uno por uno.
13. hecho: `npm run ci` en exit 0.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex, por decisión.
