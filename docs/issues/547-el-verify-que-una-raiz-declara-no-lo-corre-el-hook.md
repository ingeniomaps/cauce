---
caso: 547
titulo: el `verify` que una raíz declara no lo corre el hook, y el registro de gates no guarda qué árbol juzgó
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 547 — el `verify` que una raíz declara no lo corre el hook, y el registro de gates no guarda qué árbol juzgó

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**: la puerta de commit corre lo que adivina por el stack, no lo
que el proyecto dijo que es su gate. Una empresa con un gate propio —dentro de un contenedor, con un tope— no tiene
dónde ponerlo.

## Resumen

`workspaceRoots[].verify` existe: `check` lo valida (`engine/config/validate.js:278`), `ops contract` se lo muestra al
agente como el gate de esa raíz (`engine/cli/contract.js:257`) y el hook lo lee para no correr un `build` que escribe
(`engine/hooks/verify.js:345`). Pero el hook nunca lo corre: elige los comandos por el stack —los `scripts` de
`package.json`, `make ci` o `go test`/`go build`, `make test` en Python— (`engine/hooks/verify.js:354-386`).

Así, el gate que el proyecto declaró y el que frena el commit son dos cosas distintas. Y la salida que una empresa
encontró, registrar su gate como un guard propio, no entra: `project-guards.js:32` da 20 s a todos los guards de un
evento, y una suite real no cabe ahí.

Además, `planning/.verify-log` guarda por corrida el gate, el estado y lo que tardó (`engine/core/evidence.js:44`), pero
no el árbol que juzgó. Sin eso no se puede medir cuántas veces se repite la puerta sobre el mismo árbol, que es la
medición que pide, antes de construirlo, el sello del gate por hash del árbol.

## Reproducción

Un repositorio embebido con todo stageado, un `verify` declarado que sale con 3 y un `test` del stack que pasa
(`repro-547.js`, en el scratchpad de la sesión que lo escribió, con los ayudantes de `test/hooks/verify-bounded.test.js`):

```js
workspaceRoots: [{ name: 'app', path: '.', verify: 'node -e "process.exit(3)"' }]
// package.json: { scripts: { test: 'node -e 0' } }, y un app.js stageado
execute('verify', { cwd: dir, tool_input: { command: 'git commit -m x' } })
```

## Síntoma

```
commit: pasa
gates que corrieron: test
```

El gate declarado en rojo no corrió, y el commit pasó con el `test` del stack.

## Causa raíz

`verifyGates` (`engine/hooks/verify.js:354`) no mira `rootOf(input, dir).verify`: arma la lista desde el stack. Y
`EV.record` (`engine/core/evidence.js:39`) no recibe el árbol.

## Fix propuesto

- Si la raíz declara `verify`, ése es su gate: corre en su lugar, con el mismo tope (`gateTimeoutMinutes`), el mismo
  candado de máquina y sobre la misma copia del índice que hoy. El registro lo anota como `verify`. Sin `verify`, todo
  sigue como hoy.
- Cada corrida anota en `.verify-log` el árbol que juzgó: el hash del índice (`git write-tree`, que `git commit`
  escribiría igual). Con eso se puede contar cuántas veces se repite la puerta sobre el mismo árbol.
- El sello del gate por hash del árbol queda para cuando esa medición diga que vale (decisión del 2026-11-22: «antes se
  mide»).

## Tradeoffs

- **Es una quita** (R29): con `verify` declarado dejan de correr los gates del stack. Se sostiene con la salida de antes
  y la de después sobre el mismo repositorio, y con una prueba de ausencia de los gates del stack.
- Un `verify` que hoy está declarado sólo como información pasa a frenar commits. Una instancia que lo tenga mal escrito
  descubre el rojo en su próximo commit. El CHANGELOG lo dice.
- El comando corre por el shell (`sh -c`), como lo escribió el proyecto. Es la misma confianza que ya tienen los
  `scripts` de `package.json`.
- Quien depende de lo que cambia: la fase Verify de `/autobuild` ya corre el `verify` declarado
  (`automatization/workflows/autobuild.js:2280`), así que agente y hook pasan a coincidir; y `gate-known-red` nombra
  los gates por etiqueta (`template/planning/README.md:18`), así que un rojo conocido declarado como `test` deja de
  aplicar cuando el gate pasa a llamarse `verify`. El CHANGELOG lo dice.
- `git write-tree` escribe un objeto en el repositorio. Es el mismo que el commit escribe un instante después, y si el
  commit no ocurre, `git gc` lo limpia.

## Contexto de descubrimiento

Auditoría del 2026-11-21 sobre una instancia sidecar real: corría su gate dentro de un contenedor con tope desde un hook
propio registrado sólo en Claude, porque como guard de Cauce moría a los 20 s; y su gate en el host había tumbado la
máquina.

## Relacionados

- 240: el candado de máquina y la copia del índice, que el gate declarado tiene que respetar igual.
- 550: el cupo de gates y el freno por memoria, que limitan cuántos gates corren a la vez.

## Cierre

Se recorrió el caso entero:

- **Fix, correr el `verify` declarado en lugar de los del stack**: se hizo. `verifyGates` (`engine/hooks/verify.js`)
  corre el `verify` de la raíz por `sh -c`, con el mismo tope, el mismo candado y sobre la misma copia del índice; el
  registro lo anota como `verify`. Sin `verify` todo sigue como antes.
- **Fix, anotar el árbol juzgado**: se hizo. Cada corrida lleva `tree`, el `git write-tree` del índice.
- **Fix, el sello por hash del árbol**: se decidió que no en este caso, como pedía la decisión del 2026-11-22: queda
  para cuando `.verify-log` tenga corridas que contar.
- **Tradeoff, es una quita**: hecho, con la salida de antes y la de después lado a lado (abajo) y la aserción de que el
  gate del stack ya no corre (`STACK` no se crea), vista en rojo contra HEAD.
- **Tradeoff, un `verify` declarado pasa a frenar**: va en el CHANGELOG.
- **Tradeoff, quien depende**: la fase Verify de `/autobuild` ya corría el declarado; `gate-known-red` no aceptaba
  `verify` como gate, y se sumó (`engine/core/known-red.js`); el aviso de `check` sobre un lint con `--fix` dejó de ser
  cierto para una raíz con `verify` y se calla ahí (`engine/cli/validate.js`).
- **Lo que el enunciado no preveía**:
  - `rootOf` comparaba la ruta de la raíz con su enlace contra la real: desde una sesión abierta por un enlace, el
    `verify` declarado no corría y el commit pasaba con los del stack. Lo encontró la revisión; ahora compara las dos
    reales.
  - La excepción de `build` en `writesInTree` quedó muerta (el `build` que la raíz pide va en su `verify`) y se quitó.
  - El `verify` declarado corre sobre el árbol vivo cuando el commit coincide con él, también si escribe. Es el comando
    que el proyecto escribió y el que corre el agente en Verify; correrlo siempre en una copia reabre el 153
    (Turbopack). Queda declarado así.
  - **Anotado sin caso propio**, porque falla hacia lo de antes y no hacia algo peor:
    - En el árbol de una línea o en el worktree de una tarea, `dir` no es la ruta de ninguna raíz declarada, y ahí
      siguen corriendo los gates del stack, como antes del cambio.
    - Una entrada vieja de `gate-known-red` con `test` para una raíz que ahora declara `verify` queda sin efecto, y
      `check` no la señala.

Lo que se corrió:

- `repro-547.js` antes y después: `commit: pasa` / `gates que corrieron: test` → `commit: FRENA: Verify falló en
  repro-547-1: verify (exit 3, 0.0 s): gate propio en rojo` / `gates que corrieron: verify`.
- Por el hook instalado (`run-hook.sh pre-shell`), en un banco sidecar sin modelo, lado a lado:

  ```
  antes (motor 89ab662c):  exit=0  {"gate":"test","status":0,"ms":122}
  después:                 BLOQUEADO: Verify falló en app: verify (exit 3, 0.1 s)  exit=2
                           {"gate":"verify","status":3,"ms":88,"tree":"a841d44b…"}
  ```
- Las pruebas nuevas de `test/hooks/verify-bounded.test.js` contra el código de HEAD: 8 en rojo; después, en verde.
- 7 mutaciones en una copia, las 7 rojas: ignorar el declarado, correr los dos, no anotar el árbol, `known-red` sin
  `verify`, `build` de vuelta al árbol, comparar con el enlace y avisar el lint con `verify` declarado.
- Dos pasadas de revisión independiente: la primera halló el enlace y el lint con `--fix` sobre el árbol; la segunda,
  nada que impida entregar.
- `npm run ci` con los archivos nuevos stageados: 1962 de 1962, exit 0.

**Sin probar:** un `verify` dentro de un contenedor con tope, que es el uso que lo motivó: el banco no corre Docker, y lo
que se midió es que el comando declarado es el que corre. Tampoco una raíz de una línea de trabajo, que sigue con los
gates del stack.

### Lista de cierre

1. hecho: `repro-547.js` con su salida de antes en «Síntoma».
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: las pruebas nuevas, 8 en rojo contra HEAD y en verde después.
4. hecho: 7 mutaciones en una copia, las 7 rojas, con la copia sin mutar en verde.
5. hecho: deja de correr los gates del stack con `verify` declarado; antes y después lado a lado, y la aserción de ausencia (`STACK` no se crea) vista en rojo contra HEAD.
6. hecho: banco sidecar por el hook instalado, sin dobles; se midió que el `test` del stack ya no corre y que el declarado frena.
7. no aplica: no depende de un modelo; el runner es el hook instalado, que es lo que se corrió.
8. hecho: banco, mutaciones y puerta sobre la versión final; corre el `verify` del stack y el declarado, y no corre una raíz de línea.
9. hecho: dos raíces (instancia y producto, sidecar), dos caminos (árbol y copia del índice) y dos formas de entrar (ruta real y enlace).
10. hecho: dependían Verify de `/autobuild`, `gate-known-red`, el aviso de `check` y `writesInTree`; los tres últimos se corrigieron.
11. hecho: dos pasadas de revisión independiente; la segunda, sobre lo que cambió la primera, sin nada que impida entregar.
12. hecho: pasada de comentarios sobre el diff entero; se quitaron dos que sobraban.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1962 de 1962, exit 0.
14. hecho: este cierre recorre el Fix propuesto y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
