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

**Resuelto en 0.118.0, en una parte**: la que se puede afirmar sin ejecutar. Lo demás salió como el 473.

- **`git commit -m x && cd /etc` y `git commit -m x; cd "/etc"`.** Se hizo: lo que venga después del commit no lo cambia de repositorio, salvo que sea otro `git`, que también se juzga. Antes exit 0, ahora exit 2 de `live-commit`, por el hook instalado y en una sesión real.
- **`echo git -C /etc && git commit` y `cd /etc; cd R && git commit`.** Le tocaba a otro: caso 473. El Fix propuesto de este caso, partir por segmentos y leer el último `cd`, se construyó y se quitó: las revisiones lo vieron dejar pasar `cd . ; cd F/nope; git commit` y `git -C R status; cd /nope; git commit`, que antes frenaban. Cuál `cd` corrió no se sabe sin ejecutar.
- **`(cd "/o" && git commit)`.** Le tocaba a otro: caso 473.
- **Tradeoff, cinco lugares usan `gitDirectory`.** Se recorrieron por `test/hooks`, y por el barrido de abajo.
- **Tradeoff, un `cd` condicional.** Sigue en el primero, como antes.
- **Prioridad, «sube a alta si aparece en los diarios».** La condición sigue en pie para lo que no se arregló: pasó al 473 con su medición.

### Lista de cierre

1. hecho: la tabla de este caso, medida antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/git-command-reading.test.js`, vista en rojo.
4. hecho: mutaciones de esta versión en una copia, todas en rojo: lo posterior siempre se ignora, lo posterior siempre cuenta, un `git` entre comillas después, escapes que separan el `cd`, commit sin tapar, ruta y `cd` sin `shellWord`.
5. hecho: 135 905 comandos generados contra el motor de `6ab83bcd`, con esta versión. Los 31 585 que difieren corrieron por `run.js`: de exit 2 a 0 hay 6870, y en ninguno el verbo queda como subcomando.
6. hecho: sesión real de `claude -p`: `git -C W/app commit -m x && cd /tmp` se frenó sin crear commit, con el motor de la pasada anterior.
7. hecho: Claude Code 2.1.316. Gemini CLI 0.63.0 y `agy` 1.4.12, en sesiones reales con el motor final: `git -C W/app commit -m x && cd /tmp` se frenó en los dos por `live-commit`.
8. hecho: con el motor final en Gemini y `agy`, y por el hook instalado de Claude: exit 2. Repetida en sesión de Claude, el modelo se negó a correr ese comando. Sin correr: Codex, por decisión.
9. no aplica: lee un comando; no coordina nada.
10. hecho: `approval.js`, `ai-signature.js`, `live-commit.js`, `shell.js`, `stagedForCommit`.
11. hecho: diez pasadas junto con el 469. Las seis primeras hallaron regresiones, y las dos siguientes, sobre 4196 y 2481 formas, nada que impida en los guards. Sus últimas formas, `git -c user.name="A B" reset --hard` y parecidas, llevaron a leer el valor de `-c` entero salvo que pueda ejecutar algo, y ese cambio tuvo su pasada final.
12. hecho: pasada uno por uno; se reescribieron comentarios cortados y una razón vieja de `asRun`.
13. hecho: `npm run ci` en exit 0.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** nada de lo que este cierre afirma. Lo que no se arregló está en el 473.
