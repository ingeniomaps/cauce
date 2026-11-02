---
caso: 475
titulo: Un borrado dentro de una sustitución no lo ve el guard de límites
estado: resuelto
resuelto-en: 0.118.0
prioridad: baja
version-detectada: 0.118.0
---

# 475 — Un borrado dentro de una sustitución no lo ve el guard de límites

**🟢 resuelto en 0.118.0** · detectado en 0.118.0 · prioridad **baja**: nadie escribe así un borrado por accidente; ya pasaba antes del 473.

## Síntoma

`run.js pre-shell`, sin ejecutar nada, 2026-11-01:

| Comando | Exit |
|---|---|
| `rm -rf /etc/foo` | 2, «el comando borra /etc/foo, fuera de las raíces» |
| `echo $(rm -rf /etc/foo)` | 0 |
| `x=$(rm -rf /etc/foo)` | 0 |

## Causa raíz

`shellBoundary` (`engine/hooks/shell.js:333`) lee `writes` (`engine/hooks/shell-changes.js:426`). Sin comprobar todavía en qué paso se pierde la sustitución.

## Fix propuesto

Por revisar: leer también lo que corre dentro de `$(…)`. Antes hay que ver si el 469 dejó algo que se pueda reusar.

## Tradeoffs

Un guard de límites que lee sustituciones frena más comandos que sólo leen. Hay que medirlo contra la historia real antes de elegir.

## Contexto de descubrimiento

Una pasada de revisión del 473.

## Relacionados

Casos 469, 473.

## Cierre

Se pierde en `steps` (`engine/hooks/shell-changes.js`): `withoutSubstitutions` tira lo de adentro. Ahora cada sustitución se lee como un `sh -c`, en su propio proceso. Motor anterior → éste, en una instancia:

| Comando | Antes → ahora |
|---|---|
| `echo $(rm -rf /etc/foo)`, `x=$(rm -rf /etc/foo)` | 0 → 2 |
| `echo "$(rm -rf "/etc/foo")"`, con comillas adentro | 0 → 2 |
| `` echo `rm -rf /etc/foo` `` | 0 → 2 |
| `sh -c 'echo $(rm -rf /etc/foo)'` | 0 → 2 |
| `x=$(mkdir -p /etc/foo)` | 0 → 2 |
| `echo '$(rm -rf /etc/foo)'`, `echo "\$(rm -rf /etc/foo)"` | 0 → 0 |
| `x=$(ls /etc)`, `x=$(cd /etc); rm -rf foo`, `T=$(mktemp -d)` | 0 → 0 |

Contra el enunciado:

- **Causa raíz, sin comprobar en qué paso se perdía.** Comprobado, arriba.
- **Fix propuesto, ver si el 469 dejó algo reusable.** No dejó. Se reusó `steps`, que ya sabe leer un `sh -c`.
- **Tradeoff, frena más comandos que sólo leen; medirlo contra la historia real.** Se midió: los verbos que se juzgan son los que borran o crean, no los que leen. Ver el punto 6.

Encontrado y no previsto:

- **`sh -c 'echo $(rm …)'` perdía el script.** `withoutSubstitutions` entraba en las comillas simples. Por eso pasó de una regex a un recorrido, que además entiende comillas dentro de `$(…)`.
- **Más de 16 `$(` anidados pasan a frenar** con su mensaje de anidación, 0 → 2. Nadie lo escribe.
- **Lo que se lee más cuesta más con entradas de cientos de KB.** Un `` `a` `` repetido en 150 KB pasa de 233 ms a 1,7 s. No impide.
- **`then (rm -rf /etc/foo)` no se ve, con o sin sustitución,** y un cuerpo de heredoc con `$(rm …)` tampoco lo ve este guard. Salen en el 477.

### Lista de cierre

1. hecho: la tabla del caso, medida el 2026-11-01 antes de tocar el código.
2. hecho: `fix/guards-464-467`.
3. hecho: `test/hooks/boundaries.test.js`, en rojo con el motor anterior y en verde con éste.
4. hecho: en una copia, todas en rojo: no leer la sustitución, comilla simple que no cita, comilla simple dentro de doble, barra que no cita, sin backtick y no quitarla de la lectura. Sobrevivieron quitar la entrada de escritura y la rama de aritmética: eran código de más y se quitaron. Otras dos sumaron su prueba. Sobre el motor final, el 2026-11-02, se repitieron todas las tandas de 473 a 479: 110 en rojo, ninguna sobrevive, y 14 ya no aplican porque ese código se reescribió.
5. hecho: `withoutSubstitutions` cambió de implementación: comparación lado a lado con el punto 6. Lo citado y lo que sólo lee siguen en 0 → 0.
6. hecho: en banco, la tabla de arriba. 8302 comandos reales de las sesiones de este repositorio, motor anterior → éste: 3 pasan a frenar y ninguno deja de frenar. Los 3 hacen `cd` a carpetas de banco que hoy no existen: al repetirlos en vivo no frenarían, y sin la regla del `cd` que no entra pasan. Motor final contra `07a8eba1`, toda la tanda: 14044 comandos reales, 3 pasan a frenar y 9 dejan de frenar. Ocho son `git add` y `commit` dentro de un `(cd X && …)` o un `for`, que caen en otra carpeta (caso 473). El noveno es un script de banco de esta tanda, con un `git init` y un commit. De los 3, uno es un script de esta tanda cuyo texto nombra `git push -f`, y dos juntan `git add` y commit en una forma que ahora se lee.
7. hecho: Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12 frenaron `echo $(rm -rf /etc/cauce-no-existe)` citando la ruta. Una primera tanda salió inválida: el arnés expandió la sustitución en su propio shell, corrió ese `rm` sobre una ruta que no existe y le dio a la sesión un `echo` vacío. Se rehízo con el comando en un archivo. Codex: la persona autorizó probarlo y no hay sesión iniciada, devuelve 401. Después la persona excluyó Codex de la tanda.
8. hecho: corrió sobre el motor de ese momento. Por sesión, `$(…)` sin comillas; las demás formas, por hook y por prueba. Sobre el motor final se repitieron el 2026-11-02, de a un runner y comprobando antes los hooks del banco, 19 comandos de los casos 473 a 479 y 9 de la ampliación, en Claude Code 2.1.316, Gemini CLI 0.63.0 y `agy` 1.4.12. Frenó todo lo que debía, sin crear commit, salvo `timeout 5 \`, salto, `cat .env` en Claude, donde se negó el modelo. `bash -c "… -m 'cita git push -f'"` y `echo` pasaron, como deben.
9. no aplica: no coordina nada entre raíces ni ramas; el guard juzga una ruta contra las raíces.
10. hecho: `steps` también lo leen `removals`, `creations` y `LS.gitTargets`. Un `$(git checkout x)` ahora cuenta para el guard de líneas, que es correcto. `test/hooks` pasa.
11. hecho: dos pasadas, compartidas por 474, 475 y 476. La primera halló dos regresiones, arregladas: un `)` suelto leído como apertura de un commit y un `cd` a una carpeta recién creada con otra escritura. La segunda: «nada impide». Lo preexistente y lo armado salen en el 477. Sobre el diff entero de la tanda, contra `07a8eba1`, una pasada: nada impide en las matrices, y halló que el último ajuste dejaba de frenar `npx jest-cli` y `./jest.js`. Arreglado, y con otra pasada sobre eso: nada impide. La ampliación del 479 tuvo dos pasadas más.
12. hecho: pasada uno por uno sobre el diff entero de la tanda, 2026-11-01. Corrigió tres: una razón repetida en `ai-signature.js`, otra en `shell-changes.js` y una lista vieja en `workers.js`. Antes de esa fecha este punto se había marcado sin hacerla en 477, 478 y 479. Se repitió el 2026-11-02 sobre la ampliación del 479: quitó una razón repetida entre `as-run.js` y `git-globals.js`.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.118.0, con su entrada en el CHANGELOG.

**Sin probar:** Codex: sin sesión iniciada, 401, y después excluido por la persona.
