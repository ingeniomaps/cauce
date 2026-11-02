---
caso: 473
titulo: Lo que la lectura de un commit sigue sin ver, y que pide un parser de shell de verdad
estado: resuelto
resuelto-en: 0.118.0
prioridad: baja
version-detectada: 0.117.2
---

# 473 — Lo que la lectura de un commit sigue sin ver

**🟢 resuelto en 0.118.0** · detectado en 0.117.2 · prioridad **baja**: son formas que ya pasaban antes de los casos 464, 468 y 469, y hay que escribirlas así.

## Resumen

Los guards leen un comando con expresiones y un lector de opciones. Qué ejecuta un heredoc, o un alias, no se sabe sin un parser de shell. Cada intento de leer más en esta tanda abrió otra forma de esconder una orden, así que estas formas quedaron como estaban.

## Síntoma

Se le pregunta a `run.js pre-shell` en una rama de trabajo, sin ejecutar nada. Salida real, 2026-10-31, corrida fila por fila: exit 0 con el motor anterior y con éste. 

| Comando | Por qué pasa |
|---|---|
| `git commit -m "$(cat <<EOF` con `$(orden)` en el cuerpo | `commandOf` quita el cuerpo del heredoc antes de leer |
| `git commit -F - <<'EOF'`, y una línea `sh -c '…'` después del cierre | el heredoc se lleva el resto del comando |

Frenan sin ejecutar nada peligroso, a propósito: `git tag -m 'cita un verbo'` después de un commit, igual que solo, y `$(git log --grep='cita un verbo')`.

También pasan: un `-c alias.p='push -f' p` o un `-c core.sshCommand='…' fetch`, que corren algo sin que el comando lo diga.

Frena de más, porque con dudas se juzga la sesión: `(cd F && git commit)` con la sesión en la instancia, igual que antes del 468; `cd F || cd R; git commit`; `pushd F; git commit`; `eval git -C F commit`; y `cd F && git -C "$PWD/a b" add -A`, porque fuera de un commit `$PWD` no se sigue.

## Causa raíz

`commitAsRun` (`engine/hooks/as-run.js`) y `commandOf` (`engine/hooks/input.js`).

## Fix propuesto

Hipótesis: un parser de shell propio, sin dependencias, que entienda heredocs y sustituciones, y que reemplace estas lecturas de una vez. Es un proyecto aparte. Antes de empezarlo se mide cuántas de estas formas aparecen en los `journal.jsonl` de las corridas: si no aparecen, no se hace.

## Tradeoffs

Leer comandos es lo más caro de cambiar en el motor: en el 464 costó ocho revisiones independientes y en el 468 y el 469, diez, varias sobre formas como éstas. El generador y el barrido contra el motor anterior que usó esa tanda no viajan con el repositorio: hay que rehacerlos.

## Contexto de descubrimiento

Las revisiones de los casos 464, 468 y 469.

## Relacionados

Casos 464, 469. El 468 cerró lo que era de repositorio: `engine/hooks/commit-repo.js`.

## Cierre

Se resolvió sin parser. Bastó un recorrido hacia adelante para los heredocs, mostrar lo que un `-c` hace correr y simular subshells, `pushd` y bloques. Lo que no se resolvió salió como casos 474, 475 y 476.

Salida de `run.js pre-shell`, motor de `07a8eba1` → éste. Las que frenaban de más, medidas en rama viva; las demás, en rama de trabajo:

| Comando | Antes → ahora |
|---|---|
| `git commit -m "$(cat <<EOF`, con `$(git push -f origin b)` en el cuerpo | 0 → 2 |
| `git commit -F - <<'EOF'`, y `sh -c 'git push -f origin b'` tras el cierre | 0 → 2 |
| `git -c alias.p='push -f' p` | 0 → 2 |
| `cat <<EOF \| sh`, con `git push -f origin b` en el cuerpo | 0 → 2 |
| `git -c core.pager='rm -rf /' log` | 0 → 2 |
| `(cd F && git commit -m x)` | 2 → 0 |
| `cd F \|\| cd R; git commit -m x` | 2 → 0 |
| `pushd F; git commit -m x` | 2 → 0 |
| `cd F && git -C "$PWD/a b" add -A` | 2 → 0 |
| `if true; then cd R; fi; git commit -m x`, desde F, con R en rama viva | 0 → 2 |

Contra el enunciado:

- **`$(orden)` en el cuerpo de un heredoc.** Se hizo: sin comillas en el delimitador, lo que corre queda en la línea. Lo escapado y lo citado siguen siendo dato.
- **Una línea después del cierre.** Se hizo: el heredoc ya no se lleva el resto.
- **`git tag -m 'cita un verbo'` y `$(git log --grep='cita un verbo')`.** Siguen frenando, a propósito: 2 → 2.
- **`-c alias.p='push -f' p`.** Se hizo. Un alias sólo se muestra si el subcomando lo usa.
- **`-c core.sshCommand='…' fetch`.** Se hizo: el valor queda a la vista. `rm -rf x` sigue en 0 → 0 porque esa orden relativa no la frena nadie, tampoco suelta. Con `git push -f` da 2 → 2 y con `rm -rf /`, 0 → 2.
- **`(cd F && git commit)`, `cd F || cd R`, `pushd F`, `cd F && git -C "$PWD/a b" add -A`.** Se hizo, tabla arriba.
- **`eval git -C F commit`.** No se tocó: ya no frena, 0 → 0 en rama viva. Lo arregló el 468 y el enunciado quedó viejo.
- **Causa raíz.** Se corrigió en `commitAsRun` y `commandOf`, y además en `directoriesOf` y `withoutGitGlobals`.
- **Fix propuesto, un parser de shell propio.** Se decidió que no: lo que el caso pedía entró en un lector de 40 líneas.
- **Medir en los `journal.jsonl` antes de empezar.** Se hizo y no sostiene nada: 320 diarios, 9249 líneas, 0 de cada forma. Esos diarios guardan las respuestas de los agentes y no los comandos, así que el 0 no prueba que no pase. Que no hiciera falta el parser fue lo que quitó la condición.
- **Tradeoff, el generador y el barrido no viajan con el repositorio.** Se rehicieron en el scratchpad, y siguen sin viajar.

Encontrado y no previsto:

- **Leer de más volvió a costar.** Cada una de las cuatro primeras revisiones halló regresiones con la suite en verde. La lectura de heredocs pasó por una regex y un contador de comillas, que un `# it's` desfasaba, hasta llegar a un solo recorrido. La de bloques pasó de una duda global a una pila, y terminó en la regla más chica: un `cd` dentro de cualquier bloque deja dudas al cerrarlo.
- **`then cd` no se veía.** `if true; then cd R; fi; git commit` desde otra carpeta pasaba sin juzgarse. Ahora se juzga.
- **Un cuerpo de heredoc se leía como comandos también en `directoriesOf`.** Ya no.
- **Un `bash <<EOF` o un `cat <<EOF | sh` tenían el cuerpo fuera de los guards.** Ahora se lee, en un subshell para que su `cd` no mueva lo que sigue (caso 456).

Frena de más, declarado:

- **`{ cd F; }; git commit`, `if …; then cd F; fi; git commit` y `for …; do cd F; done; git commit` con la sesión en la instancia.** Se juzgan en la sesión aunque el `cd` sí corra. Sin ejecutar no se puede saber dónde cae, y esta es la dirección que frena. Un `cd /abs` después del bloque recupera la certeza.
- **Un heredoc sin cerrar** (`git commit -F - <<'EOF'` sin línea de cierre) deja el cuerpo como comandos: 0 → 2 si nombra una orden. Bash lo corre igual con un aviso. El 474 decidió dejarlo.
- **`$'…\'…'` antes de un heredoc** desfasa el recorrido: 0 → 2 si el cuerpo nombra una orden. Lo arregló el 474.

### Lista de cierre

1. hecho: las filas de este caso, medidas con el motor de `07a8eba1` en rama de trabajo y en rama viva, antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/git-command-reading.test.js`, vista en rojo con 5 fallos antes del arreglo, y cada corrección de una revisión con su prueba.
4. hecho: 26 mutaciones en la versión final, sobre una copia, todas en rojo. Las versiones anteriores sumaron otras. Las que sobrevivieron sumaron su prueba o quitaron lo que sobraba: las dudas de `)` sin pila y de un `cd` condicional. Sobre el motor final, el 2026-11-02, se repitieron todas las tandas de 473 a 479: 110 en rojo, ninguna sobrevive, y 14 ya no aplican porque ese código se reescribió. El último ajuste sumó 8, en rojo.
5. hecho: quita probada lado a lado con el barrido del punto 6, y con pruebas de ausencia: el alias sin usar y el comentario que no abre heredoc se vieron en rojo al mutar.
6. hecho: 5291 comandos contra `07a8eba1`, en banco, con la sesión en la instancia y en un repo ajeno. Difieren 2551, que corrieron por `run.js`: 613 dejan de frenar y 1418 pasan a frenar. Con un `git` falso, de los 613 hay 225 que caen en la instancia: todos llevan un alias que el subcomando no usa, sin orden que corra. Fuera de los alias quedan 8, todos `add -A` en el repo ajeno. La quinta pasada corrió 41344 más con el `pwd` real: 0 regresiones. Motor final contra `07a8eba1`, toda la tanda: 14044 comandos reales, 3 pasan a frenar y 9 dejan de frenar. Ocho son `git add` y `commit` dentro de un `(cd X && …)` o un `for`, que caen en otra carpeta (caso 473). El noveno es un script de banco de esta tanda, con un `git init` y un commit. De los 3, uno es un script de esta tanda cuyo texto nombra `git push -f`, y dos juntan `git add` y commit en una forma que ahora se lee. El último ajuste, contra el anterior: 14071 comandos, 0 pasan a frenar y 3 dejan de frenar, los tres `git archive` a una copia desechable.
7. hecho: Codex se intentó con autorización de la persona: no hay sesión iniciada, devuelve 401. Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12, con hook instalado. En los tres frenaron `pushd app; git commit` y `cd /nope || cd app; git commit` en rama viva y el alias a `push -f`, sin crear commit. `pushd F; git commit` en un repo ajeno pasó y creó el commit en Gemini y `agy`; en Claude lo frena Claude Code mismo, antes del hook, y ahí se midió por el hook. Después la persona excluyó Codex de la tanda.
8. hecho: subshell, `||`, `pushd`, alias y repo ajeno corrieron por sesión real antes de los casos 474 a 476. Sobre el motor final de esos casos se repitieron, en los mismos tres runners, el heredoc con `$(git push -f)` y el `cd` dentro de un bloque: frenaron, sin crear commit. En el 477 también `{ … }` y `for` con `cd`: frenaron. Sobre el motor anterior al último ajuste se repitieron el 2026-11-02, de a un runner y comprobando antes los hooks del banco, 19 comandos de los casos 473 a 479 y 9 de la ampliación, en Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12. Frenó todo lo que debía, sin crear commit, salvo `timeout 5 \`, salto, `cat .env` en Claude, donde se negó el modelo. `bash -c "… -m 'cita git push -f'"` y `echo` pasaron, como deben. Después cambiaron `ONLY_READS`, el fin de `git commit`, la ruta con espacios y `{ (`: se repitieron 12 comandos en los tres. Frenó lo que debía, y un commit en rama de trabajo pasó. En `agy` el modelo se negó con el heredoc y la firma se cortó por tiempo: esas dos, ahí, sólo por el hook.
9. hecho: dos carpetas de sesión, la instancia y un repo ajeno, y dos ramas, viva y de trabajo.
10. hecho: los que usan `gitDirectory`, `commandOf` y `withoutGitGlobals`, por `test/hooks`. El comentario de `input.js` que daba por perdido `$(cat <<EOF …)` se corrigió. `gitDirectory` usa la simulación también con un `-C "$PWD"` fuera de un commit.
11. hecho: cinco pasadas. Las cuatro primeras hallaron regresiones, arregladas; la quinta, sobre el motor de ese momento: «nada impide». Lo preexistente que halló sale en el 474. Sobre el diff entero de la tanda, contra `07a8eba1`, una pasada: nada impide en las matrices, y halló que el último ajuste dejaba de frenar `npx jest-cli` y `./jest.js`. Arreglado, y con otra pasada sobre eso: nada impide. La ampliación del 479 tuvo dos pasadas más, y el diff entero contra `main` y estos cierres, una cada uno: hallaron que `git archive`, `pull` y otros arrastraban el juicio a la instancia, y líneas de cierres que el motor desmentía. Arreglado, y una pasada sobre eso: nada impide.
12. hecho: pasada uno por uno sobre el diff entero de la tanda, 2026-11-01. Corrigió tres: una razón repetida en `ai-signature.js`, otra en `shell-changes.js` y una lista vieja en `workers.js`. Antes de esa fecha este punto se había marcado sin hacerla en 477, 478 y 479. Se repitió el 2026-11-02 sobre la ampliación del 479: quitó una razón repetida entre `as-run.js` y `git-globals.js`.
13. hecho: `npm run ci` en exit 0, con el código ya stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex: sin sesión iniciada, 401, y después excluido por la persona.
