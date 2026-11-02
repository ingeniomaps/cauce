---
caso: 469
titulo: Un commit esconde a los guards lo que su comando ejecuta entre comillas
estado: resuelto
resuelto-en: 0.118.0
prioridad: media
version-detectada: 0.117.2
---

# 469 — Un commit esconde lo que ejecuta entre comillas

**🟢 resuelto en 0.118.0** · detectado en 0.117.2 · prioridad **media**: hace falta un comando que meta una orden en un commit, y no se contó cuántas veces aparece; pero lo que se esconde es un `push --force`. Antes de arreglarlo hay que decidir qué hacer con el mensaje de commit por `$(cat <<EOF …)`.

## Resumen

`asRun` vacía todo lo entrecomillado de un commit, porque es el mensaje. También lo que el shell ejecuta: una sustitución dentro del `-m`, o un `sh -c '…'` encadenado después. Los guards no lo ven.

## Reproducción

En un banco `sidecar` con raíz `..`, una rama de trabajo en `app` y un archivo stageado. Se le pregunta al hook, sin commitear:

```bash
printf '%s' "{\"cwd\":\"$W\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"<comando>\"}}" \
  | OPS_ROOT=$W/ops node engine/hooks/run.js pre-shell; echo "exit $?"
```

## Síntoma

Salida real, 2026-10-31. Motor de 0.117.2 y motor con el 464, iguales:

| Comando | Exit |
|---|---|
| `git -C app push -f origin main` | 2 |
| `git -C app commit -m "$(git push -f origin main)"` | **0** |
| `cd app && git commit -m "$(git push -f origin main)"` | **0** |
| `git -C app commit -m x; sh -c 'git reset --hard'` | **0** |

Bash ejecuta esas sustituciones: se comprobó con `echo` delante del verbo. Con el 464, la misma forma alcanza también a una ruta con espacios, que antes no se leía como commit y frenaba por otro camino.

## Causa raíz

`asRun` (`engine/hooks/input.js`, `if (isCommit(raw)) return unquoted(raw)`) trata como mensaje todo lo entrecomillado del comando entero.

## Fix propuesto

**Decisión abierta.** Dejar a la vista una sustitución dentro de un commit frenaría la forma normal de escribir un mensaje largo, `-m "$(cat <<'EOF' … EOF)"`, cuyo texto puede citar cualquier comando. Las formas:

1. Tapar sólo el mensaje real: el valor de `-m`, salvo una sustitución que no sea un `cat` de heredoc; y dejar a la vista lo que venga después de un separador.
2. Dejar a la vista toda sustitución, y mandar a escribir el mensaje con `-F`.

Se recomienda la 1. Necesita leer el comando por segmentos, lo mismo que el 468, así que conviene hacerlos juntos.

## Tradeoffs

- Es la lectura que evita que un mensaje que cita un comando se frene a sí mismo. Cualquier arreglo se prueba contra los mensajes de este repositorio, que citan muchos.
- `git-globals.js` se escribió a mano por las regresiones de leer comandos con regex: un parser de segmentos pide las mismas ocho pasadas.

## Contexto de descubrimiento

La última revisión independiente del 464.

## Relacionados

Caso 464, caso 468.

## Cierre

**Resuelto en 0.118.0**, con la forma 1 que este caso recomendaba.

- **Lo que un commit ejecuta queda a la vista.** Se hizo en `engine/hooks/as-run.js`: cada comando simple se lee por lo que es, y de un mensaje queda sólo lo que corre.
  - `git commit -m "$(git push -f origin main)"`: antes exit 0, ahora exit 2, por el hook instalado y en una sesión real.
  - `git commit -m x; sh -c 'git push -f origin main'`: antes exit 0, ahora exit 2, por el hook instalado y en una sesión real.
- **El mensaje por `$(cat <<'EOF' …)`.** Se decidió como proponía el caso: el heredoc con delimitador citado que cierra el mensaje se tapa entero. Una sesión real commiteó en una rama de trabajo un mensaje que cita `git push -f`, `git reset --hard` y `rm -rf`.
- **Mensajes inertes.** Siguen sin frenar: `-m "fix \`git push -f\` docs"`, `-m "v$(date +%F): no usar git push -f"`, `-m "$(printf 'no usar git push -f')"`.
- **Tradeoff, los mensajes de este repositorio.** Se comprobó con 3000 mensajes reales en cinco formas: 15 000 comandos. Se leen distinto 954: en ninguno quedan más verbos peligrosos a la vista, y en 12 quedan menos.
- **Hacerlo junto con el 468.** Se hizo por partes: el repositorio se terminó después, en `commit-repo.js`.

Encontrado y no previsto:

- **El heredoc que no cierra el mensaje, o que está en un comentario, escondía una orden.** Por eso está anclado a `-m` y a que abra fuera de otra cadena.
- **`input.js` llegó a las 500 líneas.** La lectura salió a `as-run.js`, e `isCommit` a `git-globals.js`.
- **Frenan sin ejecutar nada peligroso, a propósito**: `$(git log --grep='cita un verbo')`, y `git tag -m 'cita un verbo'` después de un commit, igual que solo.

### Lista de cierre

1. hecho: la tabla de este caso, medida en un banco antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/git-command-reading.test.js`, vista en rojo.
4. hecho: mutaciones de esta versión en una copia, todas en rojo: lo posterior es mensaje, tubería a `sh` oculta, heredoc dentro de otra cadena, sin ancla, de punta a punta, delimitador sólo simple, sólo `-m` suelto, sin `--message`, mensaje siempre tapado, escape como sustitución, anidada sin mostrar, sustitución sin leer, herestring como heredoc, `-c` que ejecuta tomado entero. La que sobrevivió antes mostró una condición que sobraba, y se quitó.
5. hecho: el barrido del 468, 135 905 comandos, y los 15 000 de mensajes reales, contra `6ab83bcd` y con esta versión.
6. hecho: sesiones reales. Se frenaron la orden dentro del mensaje y la orden después del commit, cada una en una corrida; en la otra el modelo se negó a correrla, y eso no mide el guard. El mensaje que cita verbos pasó en una rama de trabajo, en las dos.
7. hecho: Claude Code 2.1.316. Gemini CLI 0.63.0 y `agy` 1.4.12, en sesiones reales con el motor de ese momento, anterior a 473-479: la orden dentro del mensaje y `git -c user.name="A B" push -f` después de un commit se frenaron en los dos, y en Claude la segunda también. En `agy` pasó el mensaje que cita verbos. En Gemini ese mismo mensaje lo dejó pasar el hook, con el guard del proyecto corrido, y lo negó su propia política de `--allowed-tools`.
8. hecho: repetida con el motor de ese momento en los tres runners; sobre el motor de hoy, por hook. Sin correr: Codex, por decisión.
9. no aplica: lee un comando; no coordina nada.
10. hecho: quienes leen `asRun` en `shell.js` y `workers.js`, ejercidos por `test/hooks`.
11. hecho: diez pasadas junto con el 468. Las dos anteriores a los últimos cambios, sobre 4196 y 2481 formas, no hallaron nada que impida en los guards. Sus últimas formas, `git -c user.name="A B" reset --hard` y parecidas, llevaron a leer el valor de `-c` entero salvo que pueda ejecutar algo, y ese cambio tuvo su pasada final.
12. hecho: pasada uno por uno.
13. hecho: `npm run ci` en exit 0.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex, por decisión. Las sesiones, sobre el motor anterior a 473-479. Lo que no se arregló lo cerraron 473 a 479.
