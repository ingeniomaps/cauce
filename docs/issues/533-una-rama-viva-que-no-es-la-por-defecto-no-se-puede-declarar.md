---
caso: 533
titulo: una rama viva que no es la por defecto del remoto —develop, staging, production— no se puede declarar
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.123.1
---

# 533 — una rama viva que no es la por defecto del remoto —develop, staging, production— no se puede declarar

**🟢 resuelto en 0.124.0** · detectado en 0.123.1 · prioridad **media**: con `allowPush` puesto, un agente empuja y commitea
directo en `develop` o `production` sin ninguna aprobación. En GitFlow esas ramas son tan vivas como `main`.

## Resumen

Cauce cuenta como vivas `main`, `master` y la rama por defecto de cada remoto. `push` las frena aunque `allowPush` esté
puesto, salvo que la persona las nombre en `runner.pushToLiveBranches`, y `live-commit` frena un commit que cae en ellas.
Una empresa con GitFlow tiene más ramas vivas —`develop` (a la que se integra), `staging`, `production`— y no tiene
cómo declararlas: para Cauce son ramas de trabajo.

## Reproducción

```bash
BANCO=$(node engine/cli/ops.js bench suelto) && cd "$BANCO"
node tools/ops.js automation install . claude >/dev/null   # trae automatization/hooks/guard-shell.sh
git init -q --bare ../remoto.git && git remote add origin ../remoto.git
git push -q origin HEAD:main && git remote set-head origin main
git branch develop && git branch production
# runner.allowPush = true en ops.config.json
# hook <comando>: un payload PreToolUse de Bash por stdin a automatization/hooks/guard-shell.sh, con
# CLAUDE_PROJECT_DIR en la carpeta que contiene al banco (antes decía ./hook.sh, que el banco no trae).
for c in 'git push origin main' 'git push origin develop' 'git push origin production'; do hook "$c"; done
git checkout -q develop && hook 'git commit -m x'
git checkout -q main    && hook 'git commit -m x'
```

## Síntoma

```
== git push origin main
BLOQUEADO: 'git push' publica cambios en main, la rama viva, y requiere una acción humana: …
== git push origin develop
exit=0
== git push origin production
exit=0
== commit en develop
exit=0
== commit en main
BLOQUEADO: 'git commit' cae en main, la rama viva de suelto. No hace falta preguntarle a nadie: cortá una rama, …
```

## Causa raíz

`engine/hooks/push.js:51-59` (`liveBranches`): el conjunto arranca en `main` y `master` y suma el `refs/remotes/*/HEAD`
de cada remoto. No lee ninguna llave de configuración. `engine/hooks/live-commit.js:65` usa la misma función, así que el
commit tiene el mismo hueco. `engine/hooks/config-keys.js` no tiene una llave para sumar ramas.

## Fix propuesto

Una llave nueva, `runner.liveBranches` (lista de nombres exactos), que `liveBranches` suma a las que ya cuenta. Así la
declaración cubre a la vez el push y el commit. `pushToLiveBranches` sigue siendo lo que la habilita para push, igual que
hoy con `main`.

## Tradeoffs

- **Sacar una rama de la lista es una quita** (R29): deja empujar donde antes frenaba. La llave nueva entra en
  `PROTECTED` de `engine/hooks/ops-config.js:37`, junto a `allowPush` y `pushToLiveBranches`, para que el agente no se
  la escriba (caso 114). Esa protección se prueba en rojo quitándola.
- No cambia nada para quien no la declara: el default sigue siendo `main`, `master` y la rama por defecto.
- Patrones (`release/*`) no entran: `pushToLiveBranches` exige nombres exactos (`engine/config/validate.js:322-325`) y
  conviene que las dos llaves hablen igual. Si una empresa lo pide, es otro caso.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real que trabaja con GitFlow. Su guard propio frena el push a
`develop`, `staging` y `production` porque Cauce no lo hacía.

## Relacionados

- 108: `allowPush` dejaba empujar a la rama viva; se arregló contando `main`, `master` y la por defecto.
- 114: el agente se escribía el permiso de push en `ops.config.json`.

## Cierre

Se recorrió el caso entero:

- **Fix propuesto, `runner.liveBranches`**: se hizo. `liveBranches` (`engine/hooks/push.js`) la suma a `main`, `master` y
  la rama por defecto, y la leen el push y `live-commit`, así que la declaración cubre las dos cosas. `pushToLiveBranches`
  sigue siendo lo que habilita el push a una de ellas.
- **Tradeoffs, sacar una rama es una quita**: hecho. La llave está en `PROTECTED` de `engine/hooks/ops-config.js` y en
  `config-keys.js`. La prueba de que el agente no se la escribe se vio en rojo quitándola. Agregar una rama también frena,
  porque `PROTECTED` compara la llave entera. Se dejó así, coherente con `allowPush`.
- **Tradeoffs, nada cambia sin la llave**: hecho, y la prueba lo asierta.
- **Tradeoffs, sin patrones**: hecho. Se valida igual que `pushToLiveBranches`, en `config/validate.js` y en el schema.
- **Lo que el enunciado no preveía**:
  - La reproducción citaba un `./hook.sh` que el banco no trae; se corrigió en el caso.
  - El prompt de `/autobuild` (`automatization/workflows/autobuild.js:429-452`) sigue definiendo la rama viva como
    `main`, `master` o la por defecto. Con `develop` declarada, el agente puede commitear ahí, y `live-commit` lo frena con
    un intento perdido. No empeora nada: antes no frenaba nada. Se cerró después, abajo.
  - `lines join` y la rama de la que sale una línea siguen midiendo contra la de integración, `main`. Eso es correcto:
    `production` no tiene que ser punto de partida. Con GitFlow, `lines join` mide contra `main` y no contra `develop`;
    eso es anterior a este caso.
  - `liveBranches` en `ops.config.local.json` se ignora, porque `configOf` lee sólo el compartido. No afloja nada.

Lo que se corrió:

- Línea de base, el bloque «sin declarar» de `repro-533-final.log` por el hook instalado en un banco: el push a `develop`
  y a `production` y el commit en `develop` salen con exit 0, idéntico al «Síntoma».
- Después: con `liveBranches: [develop, production]` los cinco frenan; con `pushToLiveBranches: [develop]` pasa el push a
  `develop` y `production` sigue frenada.
- `test/hooks/live-branches.test.js`, 3 pruebas, las 3 en rojo contra HEAD y en verde después.
- 6 mutaciones en una copia, las 6 rojas.

**Lo que se cerró después** (2026-11-22, a pedido de Manuel): el prompt de `/autobuild`.

- `ops contract` trae `liveBranches`, y los prompts que commitean (el del producto y el de planning) nombran las ramas
  vivas como las cuenta `live-commit`: `main, master, <las declaradas> o la rama por defecto del remoto`.
- Lo que decía este cierre, que tocar el workflow vencía su eval, era una afirmación sin comprobar. `/autobuild` no tiene
  una eval que venza: las evals son de los cargos y los recorridos.
- **Dos corridas reales** de `/autobuild` con la misma tarea y el mismo banco, `app/` en `develop` y
  `runner.liveBranches: ["develop"]`:
  - con el prompt de antes (motor `HEAD`), el agente commiteó en `develop`, `live-commit` lo frenó («'git commit' cae en
    develop, la rama viva de app») y recién ahí cortó la rama (USD 8,28);
  - con el prompt nuevo, el agente corrió `git switch -c feat/sumar-dos-numeros` antes del primer commit, sin ningún
    freno (USD 8,29).
- `test/workflows/autobuild-live.test.js` y `test/planning/contract.test.js` suman sus pruebas; 5 mutaciones, las 5 rojas.

**Sin probar:** nada más.

### Lista de cierre

1. hecho: el bloque «sin declarar» de `repro-533-final.log`, idéntico al «Síntoma».
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las 3 pruebas en rojo contra HEAD y en verde después.
4. hecho: 6 mutaciones en una copia, las 6 rojas, entre ellas quitar la protección.
5. no aplica: no quita nada; angosta, y la prueba asierta que sin la llave todo sigue igual.
6. hecho: banco con el hook instalado y un remoto `--bare`, sin dobles; se midió que lo que antes pasaba ahora frena.
7. hecho: el guard no depende de un modelo; el prompt de `/autobuild` sí, y se corrió en dos `/autobuild` reales, antes y después, el 2026-11-22.
8. hecho: el banco y las mutaciones se repitieron sobre la versión final.
9. hecho: dos ramas declaradas a la vez, una habilitada y la otra no; push y commit.
10. hecho: lo usan sólo `push.js` y `live-commit.js`, y los dos reciben la raíz; `startPoint` y `reachedLive` se revisaron y no cambian. Los textos de «dos llaves» se corrigieron.
11. hecho: seis pasadas de revisión independiente sobre la tanda (530, 531, 533, 534, 535 y 536); ninguna halló nada que impida entregar, sus hallazgos baratos se arreglaron, y cada arreglo se revisó en la pasada siguiente. El último, que tapa los `span` al buscar comentarios en `links.js`, se cerró con su prueba y su mutación en rojo, sin otra pasada.
12. hecho: pasada de comentarios sobre el diff entero en la cuarta revisión; se quitaron los ocho que repetían o sobraban.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1926 de 1926, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
