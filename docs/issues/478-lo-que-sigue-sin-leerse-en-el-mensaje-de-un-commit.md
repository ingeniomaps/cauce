---
caso: 478
titulo: Un `--amend` o un `-a` sin ver, tras un heredoc con sustitución o en otra línea
estado: resuelto
resuelto-en: 0.118.0
prioridad: media
version-detectada: 0.118.0
---

# 478 — Un `--amend` o un `-a` sin ver, tras un heredoc con sustitución o en otra línea

**🟢 resuelto en 0.118.0** · detectado en 0.118.0 · prioridad **media**: reescribe historia publicada o stagea todo, y las dos formas se escriben trabajando; ya pasaba antes del 477.

## Síntoma

`run.js pre-shell` con HEAD publicado, sin ejecutar nada, 2026-11-01, motor anterior y éste:

| Comando | Exit |
|---|---|
| `git commit -m "$(cat <<EOF`, cuerpo `fix $(date)`, cierre `)" --amend` | 0 |
| el mismo, con `-a` | 0 |
| `git commit -m "x" \`, salto de línea, `  --amend` | 0 |
| `git commit -m "x" \`, salto de línea, `  -a` | 0 |

## Causa raíz

Dos, sin separar todavía:

- `messageOf` (`engine/hooks/as-run.js`), rama de anidado: deja el texto en el lugar, con un salto de línea antes de la bandera.
- `MISMO` (`engine/hooks/shell.js:52`) excluye `\n`, y una barra al final de línea no se pliega.

## Fix propuesto

Hipótesis, sin probar. La rama de anidado usa `runsAfter` como la de sustitución simple. La continuación se pliega antes de leer el comando, cuidando el cuerpo de un heredoc: una línea suya que termina en barra no puede pegarse a su cierre.

## Tradeoffs

Plegar toca lo que leen todos los guards. Hay que medirlo contra la historia real y contra el motor anterior.

## Contexto de descubrimiento

La segunda pasada de revisión del 477.

## Relacionados

Caso 477.

## Cierre

La continuación era más ancha de lo que el caso decía: partía también el verbo. Salida de `run.js pre-shell`, motor anterior → éste:

| Comando | Antes → ahora |
|---|---|
| `git commit -m "$(cat <<EOF`, cuerpo `fix $(date)`, `)" --amend`, con HEAD publicado; y con `-a` | 0 → 2 |
| `git commit -m "x" \`, salto, `--amend`; y `-a` | 0 → 2 |
| `git \`, salto, `commit --amend -m x`; `git \`, salto, `commit -m x` en rama viva | 0 → 2 |
| `git \`, salto, `push -f origin feat`; `git add \`, salto, `-A` | 0 → 2 |
| `cat \`, salto, `.env`; `cat .en\`, salto, `v` | 0 → 2 |
| `rm \`, salto, `-rf /`: frena `destructive`, antes frenaba el guard de límites | 2 → 2 |
| `git commit -m \`, salto, `"…"` con firma | 0 → 2 |
| `git status \`, salto, `--short`; cuerpo de heredoc con barra final; `echo 'git push \`, salto, ` -f'` | 0 → 0 |
| `git status # nota \`, salto, `git push -f origin feat` | 2 → 2 |

Contra el enunciado:

- **Causa raíz, rama de anidado.** Se hizo como proponía: usa `runsAfter`.
- **Causa raíz, `MISMO`.** Se hizo distinto: `MISMO` no se tocó. Se pliega en `commandOf`, y así lo ve cada guard que la lee, no sólo el que usa `MISMO`.
- **Plegar sin pegar un cuerpo a su cierre.** Se hizo: el plegado corre después de quitar los cuerpos.
- **Tradeoff, medirlo contra la historia real y el motor anterior.** Se hizo: puntos 5 y 6.

Encontrado y no previsto:

- **El verbo partido no se veía:** `git \`, salto, `push -f` pasaba. Es lo más grave que cerró este caso.
- **Cinco falsos frenos se fueron,** como `grep -rn \`, salto, `"git push -f" src` y `npx jest \`, salto, `--maxWorkers=2`.
- **Iguala la forma multilínea a la de una línea, también en sus huecos.** `if [ -f .env ]; then \`, salto, `cat .env; fi` y `timeout 5 \`, salto, `cat .env` pasan de 2 a 0, y `cross-env CI=1 \`, salto, `npx jest` también. En una línea ya daban 0: antes acertaban sólo porque el salto escondía el prefijo. Lo arregló el 479, en las dos formas.
- **Lo mismo en falsos frenos, 0 → 2:** `timeout 60 \`, salto, `git commit -m "cita git push -f"`. En una línea ya daba 2. También lo arregló el 479.
- **Los guards que leen por tramos no pliegan,** porque usan `rawCommandOf`: `nice \`, salto, `rm -rf /etc/foo` y `echo a > \`, salto, `/etc/x` siguen en 0. Lo arregló el 479. Con CRLF no se pliega, y es correcto: bash tampoco.
- **Editar el motor frena la sesión que lo edita.** Un `require` a medio escribir dejó todo comando bloqueado por el guard de este repositorio, hasta arreglarlo con el editor.

### Lista de cierre

1. hecho: las 24 filas, medidas con el motor stageado antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/line-continuation.test.js` y `ai-signature`: cuatro pruebas en rojo con el motor anterior, en verde con éste.
4. hecho: 9 mutaciones en una copia, todas en rojo: sin plegar, plegar antes de quitar cuerpos, sin unir fuera de comillas ni dentro de dobles, sin respetar comillas simples ni comentarios, sin saltear escapes, sin `runsAfter` anidado y sin continuación en `INLINE`. Sobre el motor final, el 2026-11-02, se repitieron todas las tandas de 473 a 479: 110 en rojo, ninguna sobrevive, y 14 ya no aplican porque ese código se reescribió.
5. hecho: el plegado cambia cómo se lee todo comando: tabla de arriba, y la revisión lado a lado con 227 multilínea, 190 plegados sistemáticos, 567 prefijos y las matrices anteriores.
6. hecho: en banco, la tabla de arriba. 13975 comandos reales de las sesiones de este repositorio, motor anterior → éste: 0 pasan a frenar y 0 dejan de frenar. Motor final contra `07a8eba1`, toda la tanda: 14044 comandos reales, 3 pasan a frenar y 9 dejan de frenar. Ocho son `git add` y `commit` dentro de un `(cd X && …)` o un `for`, que caen en otra carpeta (caso 473). El noveno es un script de banco de esta tanda, con un `git init` y un commit. De los 3, uno es un script de esta tanda cuyo texto nombra `git push -f`, y dos juntan `git add` y commit en una forma que ahora se lee.
7. hecho: Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12 frenaron `git -C app \`, salto, `push -f`; `\`, salto, `commit` en rama viva; `add \`, salto, `-A`; `commit -m y \`, salto, `-a`; y el heredoc anidado con `-a`. Ningún commit creado. Codex no se corrió: el pedido lo excluyó antes, para esta tanda.
8. hecho: la tanda de este caso corrió antes de los cambios del 479. `--amend` y la firma con continuación, por hook y por prueba; `.env` plegado, por hook. Sobre el motor final se repitieron el 2026-11-02, de a un runner y comprobando antes los hooks del banco, 19 comandos de los casos 473 a 479 y 9 de la ampliación, en Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12. Frenó todo lo que debía, sin crear commit, salvo `timeout 5 \`, salto, `cat .env` en Claude, donde se negó el modelo. `bash -c "… -m 'cita git push -f'"` y `echo` pasaron, como deben.
9. no aplica: no coordina nada entre raíces ni ramas.
10. hecho: se recorrieron los que leen `commandOf`: ninguno cruza su posición con el texto crudo. `workers.js` conserva su propio plegado porque `launches` entra sin pasar por `commandOf`. `test/hooks` pasa.
11. hecho: una pasada, sobre esta versión: «nada impide». Lo que ya pasaba en una línea lo arregló el 479. Sobre el diff entero de la tanda, contra `07a8eba1`, una pasada: nada impide en las matrices, y halló que el último ajuste dejaba de frenar `npx jest-cli` y `./jest.js`. Arreglado, y con otra pasada sobre eso: nada impide. La ampliación del 479 tuvo dos pasadas más.
12. hecho: pasada uno por uno sobre el diff entero de la tanda, 2026-11-01. Corrigió tres: una razón repetida en `ai-signature.js`, otra en `shell-changes.js` y una lista vieja en `workers.js`. Antes de esa fecha este punto se había marcado sin hacerla en 477, 478 y 479. Se repitió el 2026-11-02 sobre la ampliación del 479: quitó una razón repetida entre `as-run.js` y `git-globals.js`.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex, por decisión de la persona. `--amend`, la firma y `.env` con continuación en una sesión real: sólo por el hook.
