---
caso: 333
titulo: verify sólo corre los gates de la raíz git del commit
estado: resuelto
resuelto-en: 0.105.0
prioridad: alta
version-detectada: 0.104.1
---

# 333 — `verify` sólo corre los gates de la raíz git del commit: un monorepo commitea en rojo sin que nada lo diga

**🟢 resuelto en 0.105.0** · detectado en 0.104.1 · prioridad **alta**.

**Prioridad alta**: es la puerta que sostiene «no se commitea en rojo», y en el layout que el README usa de
ejemplo —`apps/api`, `apps/web` en un solo repositorio— no corre nada y no lo dice. Y es el layout que
`/onboard` configura solo: en el banco de esta campaña dejó `workspaceRoots` en `apps/api` y `apps/web`.

## Resumen

`verify` busca `package.json`, `go.mod` o `pyproject.toml` en el directorio del repositorio git donde cae el
commit, y sólo ahí. Un servicio con su manifiesto en una subcarpeta no se mira, aunque sea una raíz declarada
en `ops.config.json` y aunque esa raíz traiga `verify: "npm test"`. El commit pasa en silencio con la suite
roja. Sólo frena cuando el manifiesto está en la raíz del repositorio o cuando cada servicio es su propio
repositorio git.

## Reproducción

Instancia sidecar dentro de un repo con dos servicios Node, guards instalados para Claude, rama de trabajo:

```bash
mkdir -p acme/apps/api && cd acme && git init -q -b main
printf '{"name":"api","scripts":{"test":"node -e \\"process.exit(1)\\""}}' > apps/api/package.json
echo 'module.exports = 1' > apps/api/index.js && git add apps && git commit -qm init
node <cauce>/engine/cli/ops.js init --name acme --no-install && cd ops && npm install --save-dev <cauce>.tgz
node tools/ops.js automation install . claude && cd .. && git switch -c feat/x
echo 'module.exports = 2' > apps/api/index.js && git add apps/api/index.js
printf '%s' '{"session_id":"s","cwd":"'$PWD'","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit -m \"feat: x\""}}' \
  | CLAUDE_PROJECT_DIR=$PWD ops/automatization/hooks/guard-shell.sh; echo "exit=$?"
```

Repetir con `workspaceRoots: [{ "name": "api", "path": "../apps/api", "verify": "npm test" }]` en
`ops.config.json`, y también invocando el guard con `cwd` en `apps/api`.

## Síntoma

Las tres formas dan lo mismo:

```
exit=0
```

Sin salida del guard. `ops contract .` muestra el gate declarado —`gates ../apps/api → npm test`— y el guard
no lo corre. El mismo cambio con un `package.json` en la raíz del repo, con el mismo `test` rojo:

```
BLOQUEADO: Verify falló en acme: test (exit 1, 0.1 s)
...
No se commitea en rojo.
exit=2
```

Y con cada servicio como repositorio git propio, en un sidecar hermano, también frena:
`BLOQUEADO: Verify falló en shop: test (exit 1, 0.2 s)`.

## Causa raíz

- `engine/hooks/verify.js`, `verifyGates(root, dir, …)`: `root` es el árbol que se va a verificar y sale de
  `commitTree(dir, input)`, donde `dir` es el directorio git del commit. La función mira
  `path.join(root, 'package.json')` y los otros dos manifiestos sólo ahí.
- `rootOf(input, dir)` compara cada `workspaceRoots[].path` resuelto contra `dir`, el directorio git. Una
  raíz que es subcarpeta del repositorio nunca es igual a `dir`, así que su `verify` declarado no se
  consulta desde el guard.
- El `verify:` de una raíz no lo corre nadie: lo leen `engine/cli/contract.js` para imprimir «gates» y
  `writesInTree` en `verify.js` para decidir si un `build` corre en el árbol. Comprobado con `grep` de
  `.verify` sobre `engine/` y `automatization/workflows/autobuild.js`, que sólo tiene el rol `verify` del cast.

## Fix propuesto

Dos partes, y la segunda es la que decide:

1. Correr los gates de **cada raíz declarada que el commit toca**: de los archivos staged, resolver a qué
   `workspaceRoots[]` pertenecen y correr ahí el `verify:` declarado o, sin él, el manifiesto de esa raíz.
   El índice materializado en el temporal ya contiene toda la raíz; sólo cambia dónde se busca el manifiesto.
2. Cuando no hay raíz declarada ni manifiesto en el directorio git, **decirlo**: una línea en el bloqueo o
   en `automation doctor` que diga «este commit no tiene gate: ningún manifiesto en `<dir>` ni raíz
   declarada con `verify`». Hoy el silencio y el verde se leen igual.

## Tradeoffs

- Un commit que toca dos raíces corre dos suites: más tiempo por commit, que es el costo correcto si las dos
  cambian. `scope` ya existe para acotar qué archivos fuerzan la copia; puede acotar también qué raíces.
- Una raíz declarada sin manifiesto y sin `verify:` sigue sin gate; el aviso del punto 2 es lo que la hace
  visible.
- `evidence.js` registra el gate por nombre; con varias raíces conviene anteponer el nombre de la raíz para
  que el registro distinga `api test` de `web test`.

## Por qué hacerlo

Es el guard que más cuesta que esté apagado sin decirlo: una empresa que lo instala cree que no commitea en
rojo. El README lo promete con el ejemplo de `apps/api` y `apps/web`, el onboard configura ese layout solo, y
ahí hoy no corre nada. R27 pide que una defensa nazca cerrada y que cada excepción se declare; acá la
excepción es el layout más común y no está declarada en ningún lado.

## Riesgos y regresiones

1. **Monorepos con suites lentas** pasan a esperar en cada commit. Es el comportamiento que un repo simple ya
   tiene; `gateTimeoutMinutes` sigue acotando.
2. **Raíces que comparten `node_modules` en la raíz del repo**: la copia del índice ya enlaza los ignorados,
   así que correr desde la subcarpeta debería resolverlos igual. Hay que medirlo con un workspace de npm.
3. **Instancias que hoy confían en el silencio** empiezan a frenar. Es lo que corresponde, pero conviene que
   la entrada del CHANGELOG lo diga como cambio de comportamiento.

## Contexto de descubrimiento

Campaña de prueba de punta a punta del 2026-10-08. Apareció al medir el guard con una suite roja en
`apps/api`: pasó. Se descartó que fuera el arnés probando con un `package.json` en la raíz, que sí frena, y
con un repositorio git por servicio, que también frena. La corrida real de `/autobuild` sobre un producto
con el manifiesto en la raíz sí tuvo su gate, y el registro de `verify` lo muestra.

## Relacionados

- 334, el otro guard de commit que depende de dónde está el repositorio respecto de `ops/`.

## Cierre

Recorrido contra el caso entero:

- **Correr los gates de cada raíz declarada que el commit toca** — hecho, con `gatePlaces` en
  `engine/hooks/verify.js`: de las rutas staged se deduce qué `workspaceRoots[]` contienen alguna, y
  `verifyGates` corre una vez por raíz, con el manifiesto de esa raíz, en el árbol o en su espejo dentro de la
  copia del índice. Se hizo distinto en dos detalles que el caso no preveía: las rutas del índice se resuelven
  contra el toplevel de git y no contra el cwd del comando, igual que en el 334; y el `verify:` declarado de
  una raíz **no** se ejecuta como comando, porque hoy nadie lo ejecuta —sólo decide si un `build` corre en el
  árbol— y cambiarle el significado es otra decisión. Lo que el caso daba por cierto, que `autobuild` lo
  usaba, era falso y quedó corregido en la causa raíz.
- **Decirlo cuando no hay gate** — se decidió que no, por ahora: con el arreglo, un commit sin raíz declarada
  mira el repositorio entero, y `contract` ya imprime «gates ninguno declarado» cuando no hay `verify:`. Un
  aviso en el bloqueo no tiene dónde salir, porque sin gate no hay bloqueo; si hace falta, es un aviso de
  `doctor` y va como caso propio.
- **Tradeoff «dos raíces, dos suites»** — es lo que pasa y lo que corresponde; `gateTimeoutMinutes` acota
  cada gate y el candado de la máquina sigue siendo uno.
- **Tradeoff «`node_modules` compartido en la raíz»** — la copia del índice ya enlaza lo ignorado desde el
  toplevel, así que el espejo de cada raíz lo encuentra por la misma ruta relativa. Medido en la prueba: la
  corrida sobre la copia frena con el mismo mensaje que sobre el árbol.
- **Tradeoff «el registro distingue `api test` de `web test`»** — no se cambió: el registro sigue guardando
  el nombre del gate, y la entrada del CHANGELOG lo dice. Es lo mismo que el 332 dejó escrito sobre ese
  registro.
- **Riesgo «instancias que confiaban en el silencio empiezan a frenar»** — es el comportamiento buscado, y
  la entrada del CHANGELOG lo anuncia como cambio de comportamiento.

Cómo se supo que funciona:

- Rojo previo: la prueba nueva en `test/hooks/verify-bounded.test.js` falló antes del arreglo —`verify` no
  lanzó nada con `apps/api` en rojo— y pasó después, en sus tres escenarios: sólo `web` pasa, `api` frena
  desde la raíz y desde `apps/api`, y frena igual sobre la copia del índice.
- Mutación: devolver siempre la raíz git (`if (true) return [{ run: root, dir }]`) deja la suite en 8 de 9;
  restaurado, 9 de 9. `test/hooks/verify.test.js` sigue en 26 de 26.
- Corrida real sobre el banco de la campaña con el motor del fuente, raíces `apps/api` y `apps/web`,
  `apps/api` con `test` en rojo: el commit desde la raíz y desde `apps/api` devuelve «BLOQUEADO: Verify falló
  en api: test (exit 1, 0.1 s)» con exit 2; un commit que sólo toca `apps/web` pasa con exit 0 y el registro
  anota el `test` de `web`. Antes del arreglo los tres daban exit 0.

### Segunda pasada, tras la revisión del conjunto

Dos huecos del arreglo, reproducidos antes de tocarlos. Tocar una raíz declarada dejaba de correr la puerta
del repositorio para lo staged fuera de toda raíz, que antes sí corría: ahora el repositorio entero sigue
siendo un lugar más cuando algo staged no cuelga de ninguna raíz tocada. Y la copia del índice se
materializaba desde el cwd del comando —medido: `git -C apps/api checkout-index -a --prefix=out/` escribe sólo
`apps/api/`—, así que desde adentro de una raíz el espejo de la otra no existía y su gate se salteaba en
silencio; era un defecto anterior que el arreglo ensanchaba. `verify` resuelve ahora el toplevel real una vez y
desde ahí lee el estado, copia el índice y ubica las raíces. Prueba nueva con los dos escenarios, en rojo
antes; mutaciones —quitar la puerta del repo, copiar desde el cwd— cada una en rojo; corrida real desde
`apps/api` con `apps/web` roja y un archivo suelto: «BLOQUEADO: Verify falló en web: test», exit 2.

