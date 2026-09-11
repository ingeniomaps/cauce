---
caso: 108
titulo: `allowPush: true` deja pasar cualquier push: a la rama viva, y de un subagente igual que de la persona
estado: resuelto
resuelto-en: 0.82.0
prioridad: media
version-detectada: 0.80.0
---

# 108 — Prender `allowPush` para un push habilita todos, incluido `main` desde un subagente

**🟢 resuelto en 0.82.0** · detectado en 0.80.0 · prioridad **media** — el único permiso que hay para
publicar no mira a dónde ni quién, así que un proyecto que lo prende para que el loop suba ramas de trabajo
también deja que cualquier agente publique en la rama viva

## Resumen

`runner.allowPush` es la «autorización configurada para el proyecto» de R10
(`engine/hooks/input.js:186-188`), y es un booleano. Con `true`, el guard de publicación deja pasar todo
push que no sea `--force`:

1. **No distingue la rama viva.** `git push origin main` pasa igual que `git push origin feat/x` (E).
2. **No distingue quién lo pide.** Una llamada de un subagente —Claude la marca con `agent_id`— pasa igual
   que una de la sesión principal (G). El 098 ya trata a los subagentes como trabajo que el agente delegó y
   no como la persona (`engine/hooks/chat.js:95`); `allowPush` no.

El `--force` sí está fuera de alcance (F), porque su rama va antes del permiso y no lo consulta.

Se separó del 103, que tenía las dos mitades juntas. Su «Fix propuesto» decía que la aprobación puntual
dejaba fuera las ramas vivas «como hoy»: **es falso**, hoy `allowPush` deja pasar `main` (E). Lo único que
hoy queda fuera es el `--force`.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable:

```bash
S=$(mktemp -d); mkdir -p "$S/tmp"
node engine/cli/ops.js init "$S/acme" --mode embedded --runner claude --no-install >/dev/null
TMPDIR="$S/tmp" A="$S/acme" REPO="$PWD" node - <<'EOF'
const { spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path')
const { A, REPO } = process.env; const env = { ...process.env, OPS_ROOT: A }; delete env.CI
const probe = (label, command, extra = {}) => {
  const r = spawnSync('node', [path.join(REPO, 'engine/hooks/run.js'), 'pre-shell'], { input: JSON.stringify(
    { cwd: A, session_id: 's1', tool_name: 'Bash', tool_input: { command }, ...extra }), env, encoding: 'utf8', cwd: A })
  console.log(`${label.padEnd(58)}: exit=${r.status} ${(r.stderr || r.stdout).split('\n')[0].slice(0, 90)}`) }
const cfg = `${A}/ops.config.json`; const c = JSON.parse(fs.readFileSync(cfg, 'utf8'))
c.runner = { ...c.runner, allowPush: true }; fs.writeFileSync(cfg, JSON.stringify(c, null, 2))
probe('E allowPush true, push main', 'git push origin main')
probe('F allowPush true, push --force', 'git push --force origin feat/x')
probe('G allowPush true, agent_id=sub, push main', 'git push origin main', { agent_id: 'sub' })
EOF
```

## Síntoma

Salida real, 2026-09-11, desde el checkout de `main` en 0.81.0 (misma corrida que la del 103):

```
E allowPush true, push main                               : exit=0
F allowPush true, push --force                            : exit=2 BLOQUEADO: 'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runner.allo
G allowPush true, agent_id=sub, push main                 : exit=0
```

## Causa raíz

- `engine/hooks/input.js:215-220`, `pushAllowed`: devuelve `runner.allowPush === true` y no recibe ni el
  comando ni quién llama; la entrada de la llamada sólo se usa para encontrar la raíz.
- `engine/hooks/shell.js:72-74`: con `pushAllowed` en verdadero el push pasa sin mirar la rama destino ni
  `input.agent_id`.
- `engine/hooks/shell.js:67-71`: la única distinción que existe es la del `--force`, y es por R8, no por
  `allowPush`.

## Fix propuesto

Que `pushAllowed` reciba el comando y la entrada, y que el permiso del proyecto deje de alcanzar a dos cosas:

1. **La rama viva.** Un push cuyo destino es la rama viva no pasa por `allowPush: true`. Cuál es la rama viva
   hay que leerlo de algún lado, y ése es parte de la decisión de abajo.
2. **Un subagente.** Con `input.agent_id` presente, el push se frena aunque `allowPush` sea `true`: publicar
   es un acto que R10 pone en una persona, y un subagente está dos pasos más lejos de ella que la sesión.

**Decisión pendiente del usuario:**

- **P2 — ¿La orden del chat (103) o `allowPush` alcanzan a la rama viva?** **Recomendación**: ninguno de los
  dos por sí solo. Un push a `main` requiere un permiso explícito por rama en `ops.config.json` —la forma
  concreta, por ejemplo una lista de ramas que `allowPush` alcanza, queda a decidir— o la línea exacta en
  `planning/.ops-approval`. Y un subagente no pushea, con ningún permiso. Esto cambia lo que hoy recibe cada
  proyecto con `allowPush: true`, así que no es un borde: es producto.
- **P4 — Rastro de la aprobación consumida.** Registrar quién aprobó qué push, a qué rama y cuándo. Un push
  no se deshace solo, y hoy ninguna aprobación del 098 deja ese rastro. **Recomendación**: tratarlo como
  mejora aparte del mecanismo de aprobaciones entero, no dentro de este caso ni del 103.

## Tradeoffs

- **Rompe a quien hoy usa `allowPush: true` para publicar en `main` a propósito** —un proyecto chico sin PR,
  un loop que publica directo—. Su próximo `upgrade` empieza a frenar un push que ayer pasaba. Hace falta que
  el mensaje diga qué configurar para recuperarlo y que el CHANGELOG lo declare como cambio de conducta.
- **Qué es «la rama viva»** no tiene una sola respuesta: `main`, `master`, `develop`, la rama por defecto del
  remoto. Leerla del remoto es otra consulta desde un guard; declararla en la configuración es un campo más.
- **Frenar al subagente** puede cortar un flujo donde la persona delegó explícitamente «abrí el PR» en un
  subagente. Con el 103 la salida es el «dale» en la sesión principal, que sí tiene persona.

## Qué tiene que probar el cierre

- E termina en `exit=2` con un mensaje que nombra qué habilita el push a la rama viva; `git push origin feat/x`
  con `allowPush: true` sigue en `exit=0`: la quita se prueba con su aserción de ausencia, vista en rojo
  devolviendo el permiso ancho.
- G termina en `exit=2`, y la misma llamada sin `agent_id` sobre una rama de trabajo pasa. Mutación que ignore
  `agent_id`: roja.
- F sigue en `exit=2` con el mensaje de R8.
- Si P2 sale como la recomendación: el permiso por rama o la línea en `.ops-approval` destraban `main`, y la
  orden del chat sola (103) no.
- Quien dependía del permiso ancho se corrige o se declara (R9, dependientes de una quita). Un `grep -rn
  allowPush` sobre `template/`, `automatization/hooks/` y `engine/hooks/run.js` encontró dos, los dos en el
  molde y por lo tanto en cada consumidor: `template/AGENTS.md:252-258` —«la publicación […] la decide
  `allowPush`», que deja de ser cierto para la rama viva— y R10 en
  `template/planning/rules/system/commits.md:68`, que dice que el motor comprueba el push «contra
  `runner.allowPush`». Se repite la búsqueda sobre el diff del arreglo, por si aparece un tercero.

## Contexto de descubrimiento

2026-09-11, mejorando el 103: su «Fix propuesto» afirmaba que las ramas vivas quedaban fuera «como hoy», y la
sonda sobre 0.81.0 mostró lo contrario (E), además del subagente (G).

## Relacionados

- **103** — la vía angosta para un push que ordena la persona. Este caso acota la ancha; los dos juntos
  deciden cuánto publica un agente sin que alguien lo diga en ese momento.
- **098** — el criterio de que un subagente no es la persona (`chat.js:95`) es el que este caso le pide a
  `allowPush`.
- **109** — se abre en paralelo sobre «nombrar no es pedir»; relevante si P2 deja que la orden del chat
  alcance la rama viva.

## Cierre

**🟢 resuelto en 0.82.0** · `engine/hooks/push.js` (nuevo), `engine/hooks/shell.js`, `engine/config/validate.js`,
`engine/schemas/ops-config.schema.json`, `template/AGENTS.md`, R10

### Contra lo que el caso enumeró

- **Fix 1, la rama viva** — hecho. Son vivas `main`, `master` y la rama por defecto de cada remoto, que se lee
  de `refs/remotes/<remoto>/HEAD`: la escribe el `clone` y la cambia `git remote set-head`, así que el proyecto
  la declara sin un campo nuevo. Verificado con git 2.43.0: clonar un bare cuya rama es `develop` deja
  `origin/HEAD` en `origin/develop`. `main` y `master` cuentan siempre porque un remoto agregado a mano no
  anota nada. Publicar todas las ramas (`--all`, `--branches`, `--mirror`) y borrar la viva (`:main`,
  `--delete main`) cuentan como publicar en ella.
- **Fix 2, un subagente** — hecho, y absoluto: con `agent_id` el push se frena antes de mirar cualquier
  permiso, incluida una línea de `.ops-approval`.
- **P2** — el usuario eligió que ni la orden del chat ni `allowPush` alcanzan la rama viva sin un permiso por
  rama. Es `runner.pushToLiveBranches`, una lista de nombres exactos, opcional —las configuraciones de hoy
  siguen siendo válidas— y validada sin patrones. Una rama nombrada ahí queda como una de trabajo: la alcanzan
  `allowPush`, la orden del chat o el «dale». La línea exacta de `.ops-approval` alcanza la viva aun sin la
  lista, como recomendaba el propio caso: la escribe una persona a mano, y los guards de límites no dejan que
  el agente se la escriba.
- **P4** — le tocaba a otro: salió como **112**.
- **Tradeoff «rompe a quien usa `allowPush: true` para publicar en `main`»** — se cumple, y es un cambio de
  conducta: el mensaje nombra `runner.pushToLiveBranches` y la línea exacta, y la entrada del CHANGELOG lo
  declara así.
- **Tradeoff «qué es la rama viva»** — decidido arriba: lo que git ya anota del remoto, más `main` y `master`,
  sin consultar al remoto desde un guard.
- **Tradeoff «frenar al subagente»** — se cumple: el mensaje manda a devolverle el resultado a la sesión
  principal, que es la que publica.
- **Cada ítem de «Qué tiene que probar el cierre»**:
  - E en `exit=2` con un mensaje que nombra qué lo habilita, y `git push origin feat/x` con `allowPush: true`
    en `exit=0`; la quita tiene su aserción de ausencia y se vio en rojo devolviendo el permiso ancho (M4);
  - G en `exit=2`, y sin `agent_id` sobre una rama de trabajo pasa (W); ignorar `agent_id` sale rojo (M3);
  - F sigue en `exit=2` con el mensaje de R8;
  - el permiso por rama y la línea destraban `main` (E2, E4) y la orden del chat sola no (L1); con la rama
    nombrada, la orden sí (E3);
  - los dependientes de la quita: se repitió `grep -rn allowPush` sobre `template/`, `automatization/hooks/`,
    `automatization/workflows/` y `engine/hooks/run.js`. Los dos que el caso nombraba se corrigieron
    —`template/AGENTS.md` y R10 ahora dicen hasta dónde llega la llave—; `template/ops.config.json`
    (`"allowPush": false`) y `onboard.js` («hoy declara runner.allowPush=false») siguen siendo ciertos, y no
    apareció un tercero.

### Lo que el caso no preveía

- **El agente puede escribirse el permiso.** Ningún guard mira `ops.config.json`: en el banco, un `Edit` del
  archivo y un `sed -i` sobre él pasan los dos (`exit=0` en `pre-files` y en `pre-shell`). Con `allowPush` ya
  era así —el 103 lo dejaba en la conducta del agente—, y ahora el bloqueo de la rama viva le nombra la llave
  exacta. Protegerlo es una decisión de producto —el mismo archivo lleva `workspaceRoots` y
  `writableOutsideRoots`, que se editan como trabajo corriente— y no le toca a este caso: queda para que el
  usuario decida si sale como caso propio. Lo que sí se hizo acá es que el mensaje deje el permiso como cosa
  de la persona.
- **El `+rama` del refspec era un force que `allowPush` dejaba pasar**; lo cuenta el cierre del 103.

### Qué se corrió

- **El rojo previo**: 8 de 97 sobre `git archive` de `437170a8`, entre ellas las dos pruebas de antes que
  aserciaban que `allowPush: true` publicaba en `main`, ahora con su aserción de ausencia.
- **La reproducción del propio caso** con el arreglo, ampliada:

  ```
  E allowPush true, push main                               : exit=2 BLOQUEADO: 'git push' publica cambios en main, la rama viva, y requiere una acción humana:
  F allowPush true, push --force                            : exit=2 BLOQUEADO: 'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runner.allo
  F2 allowPush true, push +feat/x                           : exit=2 BLOQUEADO: 'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runner.allo
  G allowPush true, agent_id=sub, push main                 : exit=2 BLOQUEADO: 'git push' desde un subagente no se publica, con ningún permiso: publicar lo de
  G2 allowPush true, agent_id=sub, push feat/x              : exit=2 BLOQUEADO: 'git push' desde un subagente no se publica, con ningún permiso: publicar lo de
  W allowPush true, push feat/x                             : exit=0
  E2 allowPush true + pushToLiveBranches [main], main       : exit=0
  E3 allowPush false + [main] + «subí main a origin»        : exit=0
  E4 .ops-approval «push origin main», sin lista            : exit=0
  L1 «subí main a origin», allowPush false                  : exit=2 BLOQUEADO: 'git push' publica cambios en main, la rama viva, y requiere una acción humana:
  ```

  Sobre el código de antes, E, F2, G y G2 daban `exit=0`.
- **Las mutaciones** son las diecisiete del 103, una sola tanda; las de este caso son M3, M4, M5, M8, M14,
  M15 y M16, todas rojas.
- **En vivo**, en el mismo banco del 103: «Subí main a origin.» → `git push origin main` BLOQUEADO, y el
  «dale» de la misma sesión no lo destraba; el `main` del remoto quedó en `694c314` en las dos corridas. La
  primera, con el mensaje anterior, terminó con el agente intentando escribirse la aprobación; la segunda,
  con el mensaje nuevo, le pidió a la persona que la escriba. La segunda arrancó con un `package-lock.json`
  modificado por la reinstalación del paquete, y el agente frenó por eso antes del «dale»; no cambia lo que
  se medía, que es el push.
- `npm run ci`: la misma corrida que la del 103, código 0 y 708 de 708.
