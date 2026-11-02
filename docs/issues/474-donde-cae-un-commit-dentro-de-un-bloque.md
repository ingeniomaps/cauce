---
caso: 474
titulo: Un commit dentro de un bloque o una función se juzga en otra carpeta, y dos formas de comillas desfasan la lectura de un heredoc
estado: resuelto
resuelto-en: 0.118.0
prioridad: baja
version-detectada: 0.118.0
---

# 474 — Un commit dentro de un bloque o una función se juzga en otra carpeta

**🟢 resuelto en 0.118.0** · detectado en 0.118.0 · prioridad **baja**: no era regresión del 473, salvo las dos formas de comillas.

## Resumen

`isCommit` mira si el comando es un commit desde su primera palabra, y `directoriesOf` sigue los `cd` que reconoce. Lo que queda fuera se juzga en otro lado, y el guard de rama viva no lo ve.

## Síntoma

`run.js pre-shell`, sin ejecutar nada, 2026-11-01, sesión en F, con la instancia R en rama viva. Todas dan exit 0 y el commit caería en R:

| Comando |
|---|
| `cd F && cd R && if [ -f a ]; then git commit -m x; fi` |
| `if cd R; then git commit -m x; fi` |
| `pushd R; if true; then git commit -m x; fi; popd` |
| `commit() { git commit -m x; }; cd R; commit` |

Con la sesión en R y exit 0, el commit cae en R si el `cd` falla: `cd F/no && git status; git commit -m x`.

Frenan de más desde el 473, en rama de trabajo, 0 → 2:

| Comando | Por qué |
|---|---|
| `git commit -F - <<'EOF'`, sin línea de cierre, con una orden citada en el cuerpo | el cuerpo queda como comandos |
| `printf $'don\'t' > m`, y un heredoc cuyo cuerpo nombra una orden | `$'…'` no se conoce, y el `\'` desfasa las comillas |

## Causa raíz

- `isCommit` (`engine/hooks/git-globals.js:202`) da falso con el commit detrás de `then` o `{`, y `gitDirectory` (`engine/hooks/input.js`) toma entonces el primer `cd`.
- `CD` (`engine/hooks/commit-repo.js:16`) no ve `if cd R`.
- `after === '&&'` da por movido el `cd` (`engine/hooks/commit-repo.js:161`), aunque un `;` después deje correr el commit.
- `withoutHeredocBodies` (`engine/hooks/quoting.js`) no conoce `$'…'`, y sin línea de cierre deja el cuerpo.

## Fix propuesto

Hipótesis, sin probar: reconocer el commit detrás de `then`, `do`, `else` y `{`, y mirar `$'…'` en el recorrido. Una función exige saber cuándo se llama, y ahí conviene no hacer nada.

## Tradeoffs

Es lo mismo que costó cinco revisiones en el 473: cada forma leída abrió otra. Hacerlo sin que aparezca en una corrida real puede costar más de lo que cuida. La alternativa barata es dejarlo declarado.

## Contexto de descubrimiento

Las pasadas de revisión del 473.

## Relacionados

Casos 468, 473.

## Cierre

Motor anterior → éste, con R en rama viva:

| Comando | Sesión | Antes → ahora |
|---|---|---|
| `cd F && cd R && if [ -f a ]; then git commit -m x; fi` | F | 0 → 2 |
| `if cd R; then git commit -m x; fi` | F | 0 → 2 |
| `pushd R; if true; then git commit -m x; fi; popd` | F | 0 → 2 |
| `commit() { git commit -m x; }; cd R; commit` | F | 0 → 2 |
| `cd F/no && git status; git commit -m x` | R | 0 → 2 |
| `if cd F; then git commit -m x; fi` | R | 0 → 0 |
| `cd F && git status && git commit -m x` | R | 0 → 0 |
| `printf $'don\'t' > m`, y un heredoc que nombra una orden | R | 2 → 0 |

Contra el enunciado:

- **Reconocer el commit detrás de `then`, `do`, `else` y `{`.** Se hizo, y además `elif`, `if`, `while`, `until`, `!`, `function x` y `) {`.
- **`CD` no veía `if cd R`.** Se hizo.
- **`after === '&&'` daba por movido el `cd`.** Se hizo: si la carpeta no existe, el comando no la crea y un `;` deja correr el commit, se juzgan las dos.
- **`$'…'`.** Se hizo, en el recorrido de heredocs.
- **Heredoc sin línea de cierre.** Se decidió que no, y frena de más: 0 → 2 si el cuerpo nombra una orden. Leer hasta el final escondería lo que sigue a `x=$((1 << n))`, que se ve igual, y ahí la dirección es la mala: ese `git push -f` sigue en 2.
- **Una función «conviene no hacer nada».** Se hizo distinto: si su cuerpo commitea, se juzga cada carpeta que nombra el comando. Fueron tres líneas, sin saber cuándo se llama.
- **Tradeoff, cada forma leída abrió otra.** Pasó: ver abajo.

Encontrado y no previsto:

- **Un `)` suelto leía prosa como commit.** `# 2) git commit` frenaba en rama viva. Lo halló la revisión; ahora sólo abre `) {`.
- **`mkdir -p $S/A && cd $S/A && x; git commit` dudaba.** Lo halló la revisión. Ahora un `mkdir`, `git init` o `git clone` previo quita la duda. Eso deja un hueco: `mkdir -p dist; cd /no/existe && make; git commit` sigue pasando, 0 → 0, y sale en el 477.
- **`secrets-shell` vaciaba todo lo citado de un comando con commit.** Con `isCommit` viendo más, `if a; then git commit -m x; fi; cat ".env"` habría pasado de 2 a 0. Ahora sólo vacía el mensaje, y `git commit -m x; cat ".env"`, que ya pasaba, frena: 0 → 2.

Frena de más, declarado. Siguen la regla de siempre y antes no se veían:

- **`for r in a b; do git -C $r commit -m x; done`:** 0 → 2, «no se pudo leer el índice», igual que `git -C $T commit`.
- **Una función con el commit y un `git add` afuera:** 0 → 2, «stagea y commitea a la vez». Con 8 comandos en el historial de todas las sesiones, antes de los últimos arreglos: el hábito va a frenar.
- **El texto citado:** `echo 'f() { git commit -m x; }'` frena en rama viva, como ya hacía `echo "(git commit"`. Lo mismo una línea propia que empieza `then git commit` dentro de un argumento.

### Lista de cierre

1. hecho: la tabla del caso, medida el 2026-11-01 antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/commit-blocks.test.js` y `secrets-shell.test.js`, en rojo con el motor anterior y en verde con éste.
4. hecho: 21 mutaciones en una copia, todas en rojo: `$'…'`, cada palabra de bloque probada, `) {`, `if cd`, función, `cd` que no entra, `creates`, `made`, `secrets-shell`. `sin function` y `creado duda` sobrevivieron primero y sumaron su prueba. Sobre el motor final, el 2026-11-02, se repitieron todas las tandas de 473 a 479: 110 en rojo, ninguna sobrevive, y 14 ya no aplican porque ese código se reescribió.
5. hecho: la lectura de `secrets-shell` cambió de implementación: 110 comandos lado a lado en la segunda revisión, sin falsos frenos en el mensaje.
6. hecho: en banco, la tabla de arriba. 8302 comandos reales de las sesiones de este repositorio, motor anterior → éste: 3 pasan a frenar y ninguno deja de frenar. Los 3 hacen `cd` a carpetas de banco que hoy no existen: al repetirlos en vivo no frenarían, y sin la regla del `cd` que no entra pasan. La primera revisión corrió 32349 con forma afín de todas las sesiones, antes de sus arreglos: 59 diferencias, ninguna 2 → 0. Motor final contra `07a8eba1`, toda la tanda: 14044 comandos reales, 3 pasan a frenar y 9 dejan de frenar. Ocho son `git add` y `commit` dentro de un `(cd X && …)` o un `for`, que caen en otra carpeta (caso 473). El noveno es un script de banco de esta tanda, con un `git init` y un commit. De los 3, uno es un script de esta tanda cuyo texto nombra `git push -f`, y dos juntan `git add` y commit en una forma que ahora se lee.
7. hecho: Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12 frenaron `if cd app; then git commit` en rama viva, sin crear commit. `if cd F; then git commit` en un repo ajeno creó el commit en Gemini y `agy`; en Claude lo frena Claude Code antes del hook. Codex: la persona autorizó probarlo y no hay sesión iniciada, devuelve 401. Después la persona excluyó Codex de la tanda.
8. hecho: corrió sobre el motor de ese momento. Por sesión, `if cd`; las demás, por hook y por prueba. Sobre el motor final se repitieron el 2026-11-02, de a un runner y comprobando antes los hooks del banco, 19 comandos de los casos 473 a 479 y 9 de la ampliación, en Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12. Frenó todo lo que debía, sin crear commit, salvo `timeout 5 \`, salto, `cat .env` en Claude, donde se negó el modelo. `bash -c "… -m 'cita git push -f'"` y `echo` pasaron, como deben.
9. hecho: dos carpetas de sesión, la instancia y un repo ajeno, y dos ramas, viva y de trabajo.
10. hecho: `isCommit` lo usan `as-run`, `live-commit`, `ai-signature`, `secrets-shell`, `comments`, `dependencies` y `governance`. `secrets-shell` se corrigió; los otros frenan ahora en más formas, declaradas arriba.
11. hecho: dos pasadas, compartidas por 474, 475 y 476. La primera halló dos regresiones, arregladas: un `)` suelto leído como apertura de un commit y un `cd` a una carpeta recién creada con otra escritura. La segunda: «nada impide». Lo preexistente y lo armado salen en el 477. Sobre el diff entero de la tanda, contra `07a8eba1`, una pasada: nada impide en las matrices, y halló que el último ajuste dejaba de frenar `npx jest-cli` y `./jest.js`. Arreglado, y con otra pasada sobre eso: nada impide. La ampliación del 479 tuvo dos pasadas más.
12. hecho: pasada uno por uno sobre el diff entero de la tanda, 2026-11-01. Corrigió tres: una razón repetida en `ai-signature.js`, otra en `shell-changes.js` y una lista vieja en `workers.js`. Antes de esa fecha este punto se había marcado sin hacerla en 477, 478 y 479. Se repitió el 2026-11-02 sobre la ampliación del 479: quitó una razón repetida entre `as-run.js` y `git-globals.js`.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex: sin sesión iniciada, 401, y después excluido por la persona.
