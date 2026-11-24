---
caso: 551
titulo: una línea de trabajo se arma o se retira sin que nadie lo pida, y declararla por la CLI esquiva el freno que tiene por archivo
estado: resuelto
resuelto-en: 0.124.0
prioridad: media
version-detectada: 0.124.0
---

# 551 — una línea de trabajo se arma o se retira sin que nadie lo pida, y declararla por la CLI esquiva el freno que tiene por archivo

**🟢 resuelto en 0.124.0** · detectado en 0.124.0 · prioridad **media**: pasó en una instancia sidecar real, deja una rama, un árbol y
una raíz escribible que nadie decidió, y la misma declaración escrita a mano ya frena. No rompe nada que no se deshaga
con `ops lines join`, y por eso no es alta.

## Resumen

Armar una línea es una decisión de la persona: crea una rama `line/<línea>` y un worktree en cada repositorio que
nombra, y escribe la línea en `ops.config.json`. Ese último paso ensancha lo que el agente puede escribir —cada
repositorio de una línea es una raíz escribible, `engine/hooks/config-keys.js:58`—, y por eso la misma llave escrita
con `Write` o `Edit` frena y pide a una persona. Por la CLI no frena nada: `node tools/ops.js line . <nombre> <repo>`
pasa el hook sin una orden en el chat.

Lo mismo con retirarla: `ops lines join . <nombre> --apply` sobre una línea declarada borra sus worktrees y su rama
(`engine/cli/lines-join.js:162-182`), y también pasa sin orden. El retiro se niega solo si la rama no llegó a la viva,
así que lo que cuida es el trabajo sin mergear, no que alguien lo haya pedido.

## Qué crea, retira o modifica cada subcomando

Leído en `engine/cli/ops.js:182-186` (uso) y `:272-276` (despacho):

| Comando | Qué hace | Clase |
|---|---|---|
| `ops line <root> <nombre> [<repo>...] [--env]` | Declara la línea en `ops.config.json` (`engine/cli/lines.js:252-256`) y arma un worktree por repositorio con `git worktree add` sobre `line/<nombre>` (`lines.js:128`). Con `--env` copia los `.env*`. Sobre una línea ya declarada y sin repositorios nuevos, reusa lo que hay y no declara nada. | **crea** si el nombre o algún repositorio es nuevo |
| `ops lines <root> [--json]` | El panorama de las líneas (`lines.js:295`). | lee |
| `ops lines join <root> <nombre>` (en seco) | Dice qué falta para retirar o juntar. | lee |
| `ops lines join <root> <nombre> --apply` | Línea declarada: `retire` (`lines-join.js:43`, `:133`) hace `git worktree remove` y `git branch -D line/<nombre>` (`:170-182`) y la saca de `ops.config.json`. Línea de antes: `git merge` en la rama actual (`:68-78`). | **retira** / modifica |
| `ops lines migrate <root> <nombre> <repo>... --apply` | Pasa una línea de antes a la disposición nueva (`lines-join.js:295`, `:324`). | modifica |
| `ops lines env <root> <nombre> --apply` | Reemplaza `.env*` del árbol que difieren, guardando respaldo (`engine/cli/line-env.js:160-173`). | modifica, dentro de la línea |
| `ops worktree … --line <nombre>` | Arma el árbol de una línea **ya declarada** cuando una tarea lo pide. | dentro de lo decidido |

No hay `ops line --help` propio: `ops line --help` cae en el uso general (`node engine/cli/ops.js line --help`, salida:
el bloque `Uso:` entero), así que no crea nada.

**Ningún guard los mira hoy.** `grep -n "ops line\|'line'\|lines join\|retire" engine/hooks/*.js` devuelve sólo dos
comentarios (`boundary.js:31`, `line-scope.js:301`). `line-scope` lee los argumentos de `ops claim` y `ops worktree` para
anotar qué línea lleva la sesión (`engine/hooks/line-scope.js:41-46`) y no juzga `ops line`. El grupo `pre-shell`
(`engine/hooks/run.js:107-109`) no tiene ningún guard sobre ellos. `ops-config-shell` mira lo que el shell escribe en
`ops.config.json` (`sed -i`, redirecciones), y un `node` que lo escribe adentro no lo ve.

## Reproducción

Banco `sidecar` con el hook instalado, sin modelo. Un `UserPromptSubmit` por `guard-chat.sh` con un pedido que no habla
de líneas, y después el `PreToolUse` de Bash por `guard-shell.sh`, con `CLAUDE_PROJECT_DIR` en la carpeta de sesión
(`repro-551.sh`, en el scratchpad de la sesión que lo escribió):

```bash
BANCO=$(node engine/cli/ops.js bench sidecar)          # imprime la instancia; el producto queda en ../app
(cd "$BANCO" && node tools/ops.js automation install . claude >/dev/null)
bash repro-551.sh "$BANCO"
# prompt: 'revisá la cola y decime qué tarea sigue'
# hook:   'node tools/ops.js line . pagos app'
# hook:   'node tools/ops.js lines join . pagos --apply'
# hook:   'git push origin master'                       # control: un guard que sí lee el chat
# y después corre de verdad `node tools/ops.js line . pagos app`
```

Y el control por archivo: la misma llave escrita con `Write` sobre `ops.config.json` (`"lines": {"cobros": ["app"]}`),
con el mismo pedido en el chat, por `guard-files.sh`.

## Síntoma

```
== node tools/ops.js line . pagos app
exit=0
== node tools/ops.js lines join . pagos --apply
exit=0
== git push origin master
BLOQUEADO: 'git push' publica cambios en master, la rama viva, y requiere una acción humana: ni runner.allowPush ni una orden en el chat llegan ahí sin un permi…
exit=2
== corrido de verdad: node tools/ops.js line . pagos app
✓ $BANCO/../lines/pagos/app  (line/pagos)
  sale de: master
  ops.config.json declara la línea: commitealo, que es de donde la lee el equipo
-- ramas de app:
+ line/pagos
-- worktrees de app:
$SESION/app             9a23390 [master]
$SESION/lines/pagos/app 9a23390 [line/pagos]
-- lines en ops.config.json:
{"pagos":["app"]}
```

El control por archivo:

```
BLOQUEADO: $BANCO/ops.config.json afloja lo que frena a un agente: lines cobros +app. Lo decide una persona (R…
Decile a la persona qué se frenó y por qué, y pedile que lo confirme con sus palabras: un «dale» alcanza, …
  afloja lines cobros +app
exit=2
```

La misma declaración frena por `Write` y pasa por la CLI, que además arma la rama y el árbol.

## Causa raíz

No hay guard para estos comandos: `engine/hooks/run.js:107-109` no lista ninguno, y el único que lee `ops` en el shell,
`line-scope`, sólo reconoce `claim` y `worktree` (`engine/hooks/line-scope.js:46`). La protección de `lines` vive en
`ops-config` (`engine/hooks/config-keys.js:58`), que juzga escrituras al archivo y no un programa que lo escribe.

## Fix propuesto

Un guard en `pre-shell`, con la lectura de `ops` que ya tiene `line-scope` (`opsArgs`, `line-scope.js:41-46`: `node
…/ops.js`, `ops.js`, `cauce`, `npx cauce`, `npm run ops --`) extendida a `line` y `lines`, sin copiarla.

**Frena** lo que crea o retira, y lo decide por estado, no por palabras:

- `ops line <root> <nombre> [<repo>...]` cuando `<nombre>` no está en `LT.declared(root)` o trae un repositorio que la
  línea no tiene. El ítem es `ops line <nombre>` (y `<nombre> +<repo>` por repositorio nuevo, igual que `config-keys`
  dice `lines cobros +app`), para que la orden y `.ops-approval` lo nombren igual que el bloqueo.
- `ops lines join <root> <nombre> --apply`, y `ops lines migrate … --apply`.

**Deja pasar**: `ops lines`, `ops lines join` y `migrate` sin `--apply`, `ops line` sobre una línea declarada sin
repositorios nuevos (reusa), `ops line --help`, `ops worktree --line` y `ops lines env` (trabajan dentro de una línea ya
decidida; el `--apply` de `env` respalda lo que reemplaza).

**Cómo se aprueba**: el canal de siempre. `CHAT.unauthorizedNow` (`engine/hooks/chat.js:408`) sobre el ítem —la orden
del mensaje en curso que nombra la línea, o el «dale» después del bloqueo— y `AP.HOW` (`engine/hooks/approval.js:135`)
para decirlo, con la línea pegable en `planning/.ops-approval` (`approval.js:33`). `inherit: false`, como lo que
publica: «armá la línea pagos» vale para esa, no para la próxima que la sesión decida abrir.

**Dentro de `/autobuild <línea>`** no estorba porque no lo corre: `autobuild` exige la línea ya declarada y sólo la
lista (`automatization/workflows/autobuild.js:1006`); los árboles los arma `ops worktree --line`, que pasa. El único
camino que frenaría es el que sugiere `line-scope.js:301` —sumar un repositorio con `ops line … <repo>`—, y frenarlo es
lo correcto: es la misma raíz escribible nueva que `config-keys` ya manda a confirmar.

## Tradeoffs

- **Un guard no decide con palabras permitidas** (AGENTS.md, «Convenciones»). Éste no busca un verbo en el mensaje:
  frena por un hecho comprobable —el nombre no está declarado, la bandera es `--apply`— y la salida es la que ya tienen
  los demás: la persona nombra la línea o confirma, y si el agente leyó bien un pedido que no la nombra («armá una línea
  para lo de pagos»), contesta ella. Lo que hay que mirar al construir es que `namedUnasked` y `ordersPull`
  (`engine/hooks/orders.js:66`) no se amplíen con verbos nuevos para «armar»: la orden que nombra el ítem pasa por
  `mentions`, como cualquier otro.
- Una persona que ya pidió la línea en palabras propias puede ver un freno. Es una pregunta por sesión, y cuesta menos
  que una rama y un árbol que nadie decidió.
- Un subagente no puede contestar: devuelve el bloqueo (`approval.js`, rama `input.agent_id`). Un `/autobuild` que
  quiera sumar un repositorio a mitad de corrida se detiene ahí, y eso es lo que el `line-scope.js:301` tendría que
  decir ahora: pedírselo a la persona, no correrlo.
- Lo que no tiene forma no se ve: un script del proyecto que llame a `ops line` adentro pasa, igual que en R10. Se dice.
- `ops lines env --apply` queda abierto: reemplaza `.env` del árbol (con respaldo), y no crea ni retira nada. Si se
  decide que también frene, entra con su ítem.

## Contexto de descubrimiento

Ítem 17 de la auditoría del 2026-11-21 sobre una instancia sidecar real: una sesión abrió una línea que nadie había
pedido, y la persona se enteró por la rama.

## Relacionados

- 422: `line-scope`, el límite de escritura de la sesión de una línea; de ahí se reusa la lectura de `ops`.
- 373: `lines` como llave que afloja en `ops.config.json`; este caso cierra el camino por la CLI.
- 544: lo que el retiro deja sin bajar del lado del producto.

## Decisión del 2026-11-22

Manuel aprobó las recomendaciones: el guard frena crear una línea, sumarle un repositorio, `lines join --apply` y
`lines migrate --apply`; deja pasar las lecturas y `lines env --apply`. Se aprueba nombrándolo en el chat, por el
canal de siempre. El mensaje de `line-scope.js` que sugiere sumar un repositorio dentro de un `/autobuild` se reescribe
para que se lo pida a la persona.

## Cierre

Se recorrió el caso entero:

- **Fix, un guard en `pre-shell`**: se hizo, `engine/hooks/line-command.js`, con la lectura de `ops` de `line-scope`
  (`opsCall`) y sin copiarla. Frena una línea que no está declarada, un repositorio que la línea no tiene y el `--apply`
  de `lines join` y `lines migrate`. Decide por estado: ninguna lista de palabras.
- **Fix, lo que deja pasar**: `ops lines`, `join` y `migrate` en seco, `ops line` sobre una línea declarada sin
  repositorios nuevos, `ops line --help`, `ops worktree --line` y `lines env --apply`, como decidió la persona.
- **Fix, cómo se aprueba**: `AP.pendingNow`, que no hereda: nombrar «la línea <nombre>» en el turno o confirmar después
  del bloqueo, y la línea pegable en `.ops-approval`.
- **Decisión, el mensaje de `line-scope`**: se reescribió; ya no sugiere sumar un repositorio sin pedírselo a la persona.
- **Lo que el enunciado no preveía**:
  - Nombrar la línea con «armá» no la destraba: el verbo no está en la lista del chat (`ASKS`), que es deuda y la regla
    del repositorio prohíbe ampliar. Con «creá» sí, y confirmar después del bloqueo funciona con cualquier palabra.
  - Una línea declarada como `app/` frenaba un `ops line … app`: se normalizan los dos lados.
  - La prueba de `secrets-shell` que corría `ops line . pagos --env` sobre una línea sin declarar ahora frenaba, que es
    lo correcto; se declaró la línea en la prueba.
  - **Anotado sin caso propio**: no ve `pnpm ops …`, `npm --prefix x run ops` ni `npx -y cauce`, la misma cobertura que
    `line-scope` ya tenía para `claim` y `worktree`. `ops worktree --line` sigue pudiendo sumarle un repositorio a una
    línea declarada (caso 421), a propósito.

Lo que se corrió:

- Por el hook instalado, en un banco sidecar sin modelo, `node tools/ops.js line . pagos app`, lado a lado:

  ```
  antes (motor 89ab662c):  exit=0
  después:                 BLOQUEADO: Este comando la declara y le arma su rama la línea pagos, y una línea —su
                           rama, sus árboles, lo que escribe en ops.config.json— la decide la persona. …  exit=2
  ```
  Y `node tools/ops.js lines .` pasa (`exit=0`).
- `test/hooks/line-command.test.js` contra HEAD: 4 en rojo; después, en verde.
- 7 mutaciones en una copia, las 7 rojas, incluida sacarlo del grupo `pre-shell`, que primero sobrevivió y sumó la
  prueba por el grupo.
- Dos pasadas de revisión independiente; la segunda, nada que impida entregar.
- `npm run ci` con los archivos nuevos stageados: 1962 de 1962, exit 0.

**Sin probar:** una sesión real que abra una línea por su cuenta, que es el incidente: se midió el hook instalado con el
comando, no un modelo decidiendo correrlo.

### Lista de cierre

1. hecho: `repro-551.sh` con su salida de antes en «Síntoma», y el «antes» del banco.
2. hecho: rama `fix/cases-from-an-instance-audit`.
3. hecho: la prueba nueva, 4 en rojo contra HEAD y en verde después.
4. hecho: 7 mutaciones en una copia, las 7 rojas; la que sobrevivió sumó su caso.
5. no aplica: agrega un freno y no quita nada; el mensaje de `line-scope` cambia de texto y su prueba sigue en verde.
6. hecho: banco por el hook instalado, sin dobles; se midió que la línea nueva frena y que la lectura pasa.
7. hecho: el runner es el hook instalado de Claude, que se corrió; una sesión con modelo queda en «Sin probar», porque el caso no la pide.
8. hecho: banco, mutaciones y puerta sobre la versión final; corrieron crear, sumar, retirar, migrar, leer y aprobar por chat.
9. hecho: dos líneas (una declarada, una nueva) y dos formas de aprobar (nombrarla y confirmar después del bloqueo).
10. hecho: dependían la prueba de `secrets-shell` y el mensaje de `line-scope`, que se corrigieron, y el README de hooks.
11. hecho: dos pasadas de revisión independiente; la segunda, sin nada que impida entregar.
12. hecho: pasada de comentarios sobre el diff entero.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1962 de 1962, exit 0.
14. hecho: este cierre recorre el Fix propuesto, la Decisión y los Tradeoffs.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.124.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.124.0.
