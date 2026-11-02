---
caso: 477
titulo: Lo que las revisiones de los casos 474 a 476 dejaron sin leer
estado: resuelto
resuelto-en: 0.118.0
prioridad: baja
version-detectada: 0.118.0
---

# 477 — Lo que las revisiones de los casos 474 a 476 dejaron sin leer

**🟢 resuelto en 0.118.0** · detectado en 0.118.0 · prioridad **baja**: ya pasaba antes o hay que armarlo a propósito, y ninguna forma apareció en 8302 comandos reales de este repositorio. Sube si una aparece en una corrida.

## Resumen

Formas sueltas, con un solo motivo común: la lectura de un comando sin parser. Sin revisar con el recorrido completo. Al tomar el caso se parte lo que pida decisiones distintas.

## Síntoma

`run.js pre-shell`, sin ejecutar nada, 2026-11-01:

| Comando | Rama | Exit | Qué falta |
|---|---|---|---|
| `bash -c "git push -f origin main; git commit -m x"` | trabajo | 0 | se lee el `sh -c` como mensaje de commit |
| `mkdir -p dist; cd /no/existe && make; git commit -m x` | viva | 0 | cualquier `mkdir` previo quita la duda |
| `git commit -m "$(cat .env)"` | trabajo | 0 | `secrets-shell` no ve lo que corre en el mensaje |
| `if true; then (rm -rf /etc/foo); fi` | cualquiera | 0 | un `(` detrás de una palabra de bloque no abre tramo |
| `cat <<EOF` y un cuerpo con `$(rm -rf /etc/foo)` | cualquiera | 0 | `shellBoundary` lee sin cuerpos, por `asRead` |
| `git commit -F- <<EOF` y `git commit -aF - <<EOF`, con firma | trabajo | 0 | `FROM_FILE` no lee la opción pegada |

Y un costo: `COMMITS_IN_FUNCTION` (`engine/hooks/commit-repo.js`) es cúbico con `f() { git ` repetido, 7,5 s en 16 KB.

## Causa raíz

Por revisar fila por fila; cada una nombra dónde mirar.

## Fix propuesto

Por revisar. La fila del `mkdir` es la más barata: contar sólo si nombra el destino o el destino trae variable. Hipótesis, sin probar.

## Tradeoffs

Cada forma leída abrió otra en los casos 473 y 474. La alternativa barata es dejarlas declaradas.

## Contexto de descubrimiento

Las pasadas de revisión de los casos 474, 475 y 476.

## Relacionados

Casos 473, 474, 475, 476, 478.

## Cierre

No hizo falta partirlo: cada fila era una lectura de pocas líneas. Salida de `run.js pre-shell`, motor anterior → éste:

| Comando | Rama | Antes → ahora |
|---|---|---|
| `bash -c "git push -f origin main; git commit -m x"` | trabajo | 0 → 2 |
| `mkdir -p dist; cd /no/existe && make; git commit -m x` | viva | 0 → 2 |
| `git commit -m "$(cat .env)"` | trabajo | 0 → 2 |
| `if true; then (rm -rf /etc/foo); fi`, y con `{ …; }` o `do (` | cualquiera | 0 → 2 |
| `cat <<EOF` con `$(rm -rf /etc/foo)` o `` `rm …` `` en el cuerpo | cualquiera | 0 → 2 |
| `git commit -F-`, `-aF -` y `-m"…"`, con firma | trabajo | 0 → 2 |
| `git commit -m "cita git push -f"`, `<<'EOF'` o `\$(…)` en un cuerpo, `$(cat msg.txt)` | trabajo | 0 → 0 |
| `git commit -m x; ` + `f() { git ` × 1600 | cualquiera | 45 s → 0,2 s |

Contra el enunciado:

- **`bash -c`.** Se hizo en `commitAsRun`: el tramo se decide con lo citado tapado.
- **`mkdir` previo.** Se hizo como proponía la hipótesis: cuenta si nombra el destino o lleva una variable. `git clone` y `git init` entran igual.
- **`$(cat .env)`.** Se hizo: lo que corre queda al final del tramo y `secrets-shell` lo ve.
- **`then (rm …)`.** Se hizo en `unwrapped`.
- **Cuerpo de heredoc.** Se hizo en `withoutBodies`, con el mismo `heredocRuns` de `commandOf`.
- **`-F-` y `-aF -`.** Se hizo en `FROM_FILE`.
- **Costo cúbico.** Se hizo con un recorrido por tramos en vez de una expresión.
- **Tradeoff, cada forma leída abre otra.** Pasó: ver abajo. Lo que quedó sale en el 478.

Encontrado y no previsto:

- **`git commit -m"…"` con firma pasaba.** `INLINE` no leía el valor pegado. Arreglado.
- **`git commit -aF m` stageaba todo sin frenar.** La regla de `-a` no admitía mayúsculas. Arreglado con `-[a-z]*a[a-zA-Z]*`: la primera versión leía `-mUpdate` como `-a`, y la revisión la devolvió.
- **`git commit -m "$(cat <<EOF…)" --amend` pasaba con HEAD publicado,** y con `-a`, la forma habitual de commitear: 0 → 2. Lo que corre en el mensaje quedaba en el medio del tramo. Dejarlo al final lo cerró.
- **Cinco falsos frenos se fueron:** `git commit -m "$(git log --all | head -1)"` y similares, 2 → 0.
- **Frena de más, declarado.** Lo citado en un `node -e` que además nombra un commit se lee como orden, y es lo que ya pasaba sin el commit. Con un `bash -c` frenaba igual, hasta que el 479 lo leyó como comandos. `git commit -mupdateReadme` frena como `-mupdate` antes. Una línea `ls -am "<firma>"` junto a un commit se toma por mensaje. Un `git clone u/Foo.git; cd foo && …; git commit` duda, por la mayúscula.
- **`bash archivo.sh` no se lee.** Claude lo eligió solo en dos pruebas y corrió: el commit se creó y un `rm` sobre una ruta que no existe se ejecutó. Es lo declarado desde siempre: un script no se abre. Esas dos filas se repitieron con el comando literal, y frenaron.

### Lista de cierre

1. hecho: las filas de este caso y de la tabla, medidas con el motor stageado antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: seis pruebas en rojo con el motor anterior, en `commit-blocks`, `boundaries`, `git-command-reading`, `secrets-shell` y `ai-signature`; en verde con éste. Las de `-a` y `--amend`, sumadas tras la revisión.
4. hecho: 19 mutaciones en una copia, todas en rojo. Sobrevivieron tres en la primera tanda, cada una sumó su prueba: la variable en `mkdir`, el `git` antes del `commit` en una función y la mayúscula de `-aF`. Sobre el motor final, el 2026-11-02, se repitieron todas las tandas de 473 a 479: 110 en rojo, ninguna sobrevive, y 14 ya no aplican porque ese código se reescribió.
5. hecho: `COMMITS_IN_FUNCTION` se reemplazó: 11 comandos con función, mismo resultado. `messageOf` cambió de lugar lo que corre: tabla de arriba y 270 + 2388 comandos de las revisiones, lado a lado.
6. hecho: en banco, la tabla de arriba. 14553 comandos reales de las sesiones de este repositorio, motor anterior → éste: 1 pasa a frenar, un `node`/`python` cuyo texto nombra un commit y un `git push -f`; 1 deja de frenar, un `(cd $W && mkdir …)` dentro de un `for`, con un destino que no se puede resolver. Motor final contra `07a8eba1`, toda la tanda: 14044 comandos reales, 3 pasan a frenar y 9 dejan de frenar. Ocho son `git add` y `commit` dentro de un `(cd X && …)` o un `for`, que caen en otra carpeta (caso 473). El noveno es un script de banco de esta tanda, con un `git init` y un commit. De los 3, uno es un script de esta tanda cuyo texto nombra `git push -f`, y dos juntan `git add` y commit en una forma que ahora se lee.
7. hecho: Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12 sobre el motor de ese momento. Frenaron sin crear commit: función, `cd` que no entra, `{ cd; }`, `for … cd`, `mkdir` previo, `bash -c`, cuerpo de heredoc y `then (rm`, con esta salvedad: en una instancia cuya carpeta no es un repositorio, las de bloque frenan por «git no toma» esa carpeta. `-F-` con firma frenó por la firma en los tres. `$(cat .env)` frenó por el guard en Gemini y `agy`; en Claude se negó el modelo, y ahí se midió por el hook. Codex no se corrió, por decisión de la persona.
8. hecho: la tanda de este caso corrió antes de los cambios de 478 y 479. Sobre el motor final se repitieron el 2026-11-02, de a un runner y comprobando antes los hooks del banco, 19 comandos de los casos 473 a 479 y 9 de la ampliación, en Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12. Frenó todo lo que debía, sin crear commit, salvo `timeout 5 \`, salto, `cat .env` en Claude, donde se negó el modelo. `bash -c "… -m 'cita git push -f'"` y `echo` pasaron, como deben.
9. no aplica: no coordina nada entre raíces ni ramas. `directoriesOf` se probó con dos carpetas.
10. hecho: `asRun` lo leen `destructive`, `gitAdd` y `secrets-shell`; `asRead`, los que usan `steps` y `writes`. Se corrigió el comentario de `destructive` que daba por invisible la sustitución del mensaje. `test/hooks` pasa.
11. hecho: dos pasadas. La primera halló dos regresiones, arregladas: `--amend` y `-a` después de un mensaje con sustitución, 2 → 0, y `-mUpdate` leído como `-a`, 0 → 2. La segunda, sobre 2388 comandos: «nada impide». Lo preexistente que halló sale en el 478. Sobre el diff entero de la tanda, contra `07a8eba1`, una pasada: nada impide en las matrices, y halló que el último ajuste dejaba de frenar `npx jest-cli` y `./jest.js`. Arreglado, y con otra pasada sobre eso: nada impide. La ampliación del 479 tuvo dos pasadas más.
12. hecho: pasada uno por uno sobre el diff entero de la tanda, 2026-11-01. Corrigió tres: una razón repetida en `ai-signature.js`, otra en `shell-changes.js` y una lista vieja en `workers.js`. Antes de esa fecha este punto se había marcado sin hacerla en 477, 478 y 479. Se repitió el 2026-11-02 sobre la ampliación del 479: quitó una razón repetida entre `as-run.js` y `git-globals.js`.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex, por decisión de la persona. `$(cat .env)` en una sesión de Claude Code: se negó el modelo, sólo por el hook.
