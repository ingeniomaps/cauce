---
caso: 476
titulo: La firma de IA no se mira en un commit con el mensaje por stdin
estado: resuelto
resuelto-en: 0.118.0
prioridad: baja
version-detectada: 0.118.0
---

# 476 — La firma de IA no se mira en un commit con el mensaje por stdin

**🟢 resuelto en 0.118.0** · detectado en 0.118.0 · prioridad **baja**: la forma habitual, `-m "$(cat <<'EOF'`, ya se miraba; R8 declara lo que no ve: un archivo que no se puede leer.

## Síntoma

`run.js pre-shell`, sin ejecutar nada, 2026-11-01, en rama de trabajo, con una línea `Co-Authored-By` de un asistente en el mensaje:

| Forma | Exit |
|---|---|
| `git commit -m "x…"` | 2 |
| `git commit -m "$(cat <<'EOF'` | 2 |
| `git commit -F - <<'EOF'` | 0 |

## Causa raíz

Líneas de la versión detectada.

`messageOf` (`engine/hooks/ai-signature.js:73`) lee `-F` con `readFileSync`, y `-` no es un archivo: el `catch` lo calla.

## Fix propuesto

Por revisar: con `-F -` o `--file=-`, tomar el cuerpo del heredoc de `rawCommandOf`.

## Tradeoffs

Una forma más que lee el guard, y sólo el heredoc: un `| git commit -F -` seguiría sin verse.

## Contexto de descubrimiento

Una pasada de revisión del 473.

## Relacionados

Caso 473.

## Cierre

Se hizo lo propuesto. Salida de `run.js pre-shell` en rama de trabajo, motor anterior → éste:

| Comando | Antes → ahora |
|---|---|
| `git commit -F - <<'EOF'`, con la firma al final | 0 → 2 |
| `git commit --file=- <<EOF`, con la firma al final | 0 → 2 |
| `git commit -F - <<'EOF'`, sin firma | 0 → 0 |
| `git commit -F - <<'EOF'`, con la firma citada en la prosa | 0 → 0 |

Contra el enunciado:

- **Fix propuesto, tomar el cuerpo del heredoc.** Se hizo, con el heredoc de la misma línea: el de otro comando no cuenta. Vale también para `gh --body-file -`, que lee por el mismo lugar.
- **`| git commit -F -`.** Acá se decidió que no; el 479 lo leyó para `printf`, `echo` y `cat`. Lo que sale de otro programa sigue sin verse, y lo dice el encabezado de `ai-signature.js`.

Encontrado y no previsto:

- **`-F-` y `-aF -` no ven la firma.** Nunca se leyeron con la opción pegada, tampoco con un archivo. Sale en el 477.
- **`git commit -m a; grep -F - <<EOF` con una firma en el cuerpo pasa a frenar.** La lectura no mira de quién es el `-F`. Nadie lo escribe, y va del lado que frena.
- **En Claude Code, un pedido que nombra la firma la autoriza.** Es la conducta declarada. La primera sesión se pedía con la firma en el texto y el commit se creó: lo que se midió ahí fue esa autorización.

### Lista de cierre

1. hecho: la tabla del caso, medida el 2026-11-01 antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/ai-signature.test.js`, en rojo con el motor anterior y en verde con éste.
4. hecho: cuatro mutaciones en una copia, todas en rojo: no leer el cuerpo, no saltar el archivo llamado `-`, buscar el heredoc en otra línea y leer el cuerpo hasta el final. Sobre el motor final, el 2026-11-02, se repitieron todas las tandas de 473 a 479: 110 en rojo, ninguna sobrevive, y 14 ya no aplican porque ese código se reescribió. El último ajuste sumó 8, en rojo.
5. no aplica: no quita nada. La prueba de que un heredoc ajeno no cuenta cuida la dirección contraria.
6. hecho: en banco, la tabla de arriba. 8302 comandos reales de las sesiones de este repositorio, motor anterior → éste: 3 pasan a frenar y ninguno deja de frenar. Los 3 hacen `cd` a carpetas de banco que hoy no existen: al repetirlos en vivo no frenarían, y sin la regla del `cd` que no entra pasan. Motor final contra `07a8eba1`, toda la tanda: 14044 comandos reales, 3 pasan a frenar y 9 dejan de frenar. Ocho son `git add` y `commit` dentro de un `(cd X && …)` o un `for`, que caen en otra carpeta (caso 473). El noveno es un script de banco de esta tanda, con un `git init` y un commit. De los 3, uno es un script de esta tanda cuyo texto nombra `git push -f`, y dos juntan `git add` y commit en una forma que ahora se lee. El último ajuste, contra el anterior: 14071 comandos, 0 pasan a frenar y 3 dejan de frenar, los tres `git archive` a una copia desechable.
7. hecho: Gemini CLI 0.63.0 y `agy` 1.4.12 frenaron el commit firmado y no se creó. En Claude Code 2.1.316 no se llegó al guard: leyéndolo de un archivo, el modelo armó `bash -c "$(cat …)"` y lo frenó Claude Code, y ahí se midió por el hook. Codex: la persona autorizó probarlo y no hay sesión iniciada, devuelve 401. Después la persona excluyó Codex de la tanda.
8. hecho: corrió sobre el motor de ese momento. Caminos: `-F -` por sesión; `--file=-` por hook; `--file -` por prueba; `gh --body-file -` sin correr. Sobre el motor anterior al último ajuste se repitieron el 2026-11-02, de a un runner y comprobando antes los hooks del banco, 19 comandos de los casos 473 a 479 y 9 de la ampliación, en Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12. Frenó todo lo que debía, sin crear commit, salvo `timeout 5 \`, salto, `cat .env` en Claude, donde se negó el modelo. `bash -c "… -m 'cita git push -f'"` y `echo` pasaron, como deben. Después cambiaron `ONLY_READS`, el fin de `git commit`, la ruta con espacios y `{ (`: se repitieron 12 comandos en los tres. Frenó lo que debía, y un commit en rama de trabajo pasó. En `agy` el modelo se negó con el heredoc y la firma se cortó por tiempo: esas dos, ahí, sólo por el hook.
9. hecho: dos carpetas de sesión, la instancia y un repo ajeno, y dos ramas, viva y de trabajo.
10. hecho: `signatureIn` y `messageOf` sólo los usa este guard. `test/hooks/ai-signature.test.js` pasa.
11. hecho: dos pasadas, compartidas por 474, 475 y 476. La primera halló dos regresiones, arregladas: un `)` suelto leído como apertura de un commit y un `cd` a una carpeta recién creada con otra escritura. La segunda: «nada impide». Lo preexistente y lo armado salen en el 477. Sobre el diff entero de la tanda, contra `07a8eba1`, una pasada: nada impide en las matrices, y halló que el último ajuste dejaba de frenar `npx jest-cli` y `./jest.js`. Arreglado, y con otra pasada sobre eso: nada impide. La ampliación del 479 tuvo dos pasadas más, y el diff entero contra `main` y estos cierres, una cada uno: hallaron que `git archive`, `pull` y otros arrastraban el juicio a la instancia, y líneas de cierres que el motor desmentía. Arreglado, y una pasada sobre eso: nada impide.
12. hecho: pasada uno por uno sobre el diff entero de la tanda, 2026-11-01. Corrigió tres: una razón repetida en `ai-signature.js`, otra en `shell-changes.js` y una lista vieja en `workers.js`. Antes de esa fecha este punto se había marcado sin hacerla en 477, 478 y 479. Se repitió el 2026-11-02 sobre la ampliación del 479: quitó una razón repetida entre `as-run.js` y `git-globals.js`.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex: sin sesión iniciada, 401, y después excluido por la persona. `-F -` con el motor de este caso en Claude: sólo por el hook; con el motor final frenó en sesión.
