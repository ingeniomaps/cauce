---
caso: 523
titulo: un comando frenado se autoriza por chat nombrando el último tramo de una ruta que trae adentro
estado: resuelto
resuelto-en: 0.123.1
prioridad: alta
version-detectada: 0.123.0
---

# 523 — un comando frenado se autoriza por chat nombrando el último tramo de una ruta que trae adentro

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **alta**: deja pasar en la dirección peligrosa. «revisá prod.yaml»
autoriza `kubectl apply -f k8s/prod.yaml`, y «revisá la api» autoriza cerrar o aprobar un PR, disparar un workflow o
crear una release en `o/api`.

## Resumen

Las reglas de `destructive` con salida —entrega (`delivery.js`), deploy, `deployCommands`— usan como ítem el tramo
entero del comando, y la orden por chat se lee con `named` → `mentions`. `mentions` compara el ítem **y su
`path.basename`**, que para un comando es lo que sigue a su última `/`: `api` en `gh pr close 69 --repo o/api`,
`prod.yaml` en `kubectl apply -f k8s/prod.yaml`. Cualquier frase que nombre esa palabra con un verbo de `ASKS`
—`revisa`, `mira`, `arregla`, `usa`…— cuenta como orden de correr el comando entero.

El basename existe para los archivos («leé el .env» por `/w/.env`). Para el push, el 103 ya lo sacó con la misma razón
(«arreglá el login y no subas nada» publicaba `feat/login`), y el comentario de `PLACE` (`chat.js:106-110`) lo evitó
para el lugar que se le pega al ítem. Los ítems de comando que llegaron después —225, 451— quedaron con él.

## Reproducción

Desde la raíz de Cauce, hook `destructive` real con el arnés de las pruebas y una sesión nueva por mensaje (revisado el
2026-11-19 sobre `27bbf5e5`):

```bash
node -e '
const { chatSession, pushRoot } = require("./test/support/hooks-harness")
const { executeAll } = require("./engine/hooks/run")
const root = pushRoot("cauce-repro-523-")
for (const [m, c] of [["revisá la api", "gh pr close 69 --repo o/api"],
  ["arreglá la api", "gh pr review 69 --approve --repo o/api"],
  ["mirá cómo está la api", "gh pr comment 69 --body ok --repo o/api"],
  ["revisá el deploy de la api", "gh workflow run deploy.yml --repo o/api"],
  ["revisá la api", "gh release create v1 --repo o/api"],
  ["revisá prod.yaml", "kubectl apply -f k8s/prod.yaml"],
  ["contame de la api", "gh pr close 69 --repo o/api"],
  ["contame de prod.yaml", "kubectl apply -f k8s/prod.yaml"]]) {
  const chat = chatSession()
  try { executeAll(["destructive"], { hook_event_name: "PreToolUse", permission_mode: "dontAsk", cwd: root,
    ...chat.says(m)({ cwd: root, tool_input: { command: c } }) }); console.log("pasa ", m, "→", c) }
  catch (e) { console.log(e.blocked ? "frena" : String(e), m, "→", c) } finally { chat.close() }
}'
```

## Síntoma

```
pasa  revisá la api → gh pr close 69 --repo o/api
pasa  arreglá la api → gh pr review 69 --approve --repo o/api
pasa  mirá cómo está la api → gh pr comment 69 --body ok --repo o/api
pasa  revisá el deploy de la api → gh workflow run deploy.yml --repo o/api
pasa  revisá la api → gh release create v1 --repo o/api
pasa  revisá prod.yaml → kubectl apply -f k8s/prod.yaml
frena contame de la api → gh pr close 69 --repo o/api
frena contame de prod.yaml → kubectl apply -f k8s/prod.yaml
```

Las dos últimas frenan sólo porque `contame` no está en `ASKS`: lo que autoriza es el basename más cualquier verbo de
la lista.

## Causa raíz

- `engine/hooks/chat.js:126`: `for (const name of new Set([item, path.basename(item)]…))` — el basename entra siempre
  como segundo nombre, sea el ítem una ruta o un comando.
- `engine/hooks/shell.js:255-267`: sin `by.items` (todas las reglas salvo el merge), el ítem es el tramo del comando y
  `AP.pending` recibe `asked` indefinido, o sea `named` (`chat.js:326`, default de `chat.js:415`).
- El merge no lo tiene porque su ítem se lee con `ordersMerge` (`delivery.js:59`), y el push tampoco, por `ordersPush`
  (103).

## Fix propuesto

Que un ítem que es un comando se lea sin basename. La forma más chica: una variante de `named` que compare sólo el
ítem entero —`mentions(text, item, { basename: false })`— y que `shell.js` la pase como `asked` cuando la regla no trae
la suya. Los archivos siguen con basename, que es lo que el 109 midió.

Pruebas en `test/hooks/delivery.test.js`: «revisá la api» **no** pasa `gh pr close 69 --repo o/api` ni `gh workflow run
deploy.yml --repo o/api`, y «revisá prod.yaml» no pasa `kubectl apply -f k8s/prod.yaml` (las tres pasan hoy); y
«corré gh pr close 69 --repo o/api» sigue pasando. Mutación declarada: devolver el basename a la variante pone rojas
las tres primeras.

## Tradeoffs

- Nadie pierde una forma de pedir que funcionara a propósito: nombrar sólo el último tramo de una ruta nunca fue la
  manera documentada de ordenar un comando; la salida del bloqueo dice «nombrando el paso».
- **El 520 cambia el cuadro para `gh pr`**: con su fix, los cinco actos de `gh pr` salen de `named` y pasan a la
  lectura del 280, donde «revisá la api» —que no niega, no pregunta y no nombra PR— **pasa por diseño**, igual que hoy
  con el merge. Este caso no lo arregla para `gh pr`: lo deja en manos de la decisión del 520. Para `gh workflow run`,
  `gh release`, `gh api …/pulls/N/…`, `kubectl`, `helm`, `terraform` y los `deployCommands` el arreglo es éste.
- Quién más usa `named` con ítems que son comandos: `self-approval.js:207` lee con `named` las líneas que el agente
  escribe en `.ops-approval`, y una línea `gh pr close 69 --repo o/api` tiene el mismo basename. Medido al construir:
  `self-approval.js:229` exige antes que el mensaje nombre el propio `.ops-approval`, así que «revisá la api» no
  alcanza; pero «agregá la api a .ops-approval» **sí** le dejaba al agente escribirse esa línea en `main`. Es la misma
  fuga y el mismo arreglo la cierra.

## Contexto de descubrimiento

Revisión de los casos 520-522, 2026-11-19. Al reproducir el 520 por el guard de entrega de Cauce, «arreglá la api»
—escrito como control negativo— aprobó un PR.

## Relacionados

- **103** — sacó el basename para el push, con el mismo argumento.
- **109** — por qué `mentions` exige un verbo; el basename es suyo y está bien para archivos.
- **225** — trajo las reglas de entrega con ítem de comando.
- **451** — el ítem es el tramo entero del comando.
- **520** — su fix saca a `gh pr` de esta lectura, con otro tradeoff.

## Cierre

`mentions` (`engine/hooks/chat.js`) sigue comparando el ítem y su basename, pero el basename **pide** sólo si el ítem es
una ruta: una palabra sola, una ruta absoluta —también con espacios— o un verbo seguido de una ruta absoluta
(`escribe <ruta>`, la forma de `runtime`, `git-internals`, `ops-config` y `shell.js`). Para **negar** sigue contando:
revocar de más es la dirección segura. Antes, en un commit aparte, las órdenes de publicar pasaron a
`engine/hooks/orders.js`, porque `chat.js` estaba en el tope de 500 líneas y el arreglo no entraba.

Línea de base: la reproducción de arriba, con el motor de `origin/main` (0.123.0), por la entrada real de los hooks.

Contra el caso:

- **Fix, una variante de `named` sin basename que `shell.js` pase como `asked`:** se hizo distinto. Esa forma cubría
  sólo `destructive`, y dejaba afuera `workers.js` —su ítem es el comando entero—, las líneas de `.ops-approval` y los
  guards propios. Se decidió en `mentions`, por la forma del ítem, y así lo cubre todo quien lea con `named`.
- **Fix, las pruebas que pedía:** se hicieron, en `test/hooks/delivery.test.js` («nombrar el último tramo de una ruta no
  ordena el comando que la trae»), con la orden que nombra el comando como control. Y una en `test/hooks/chat.test.js`
  para el lado de los archivos, que el caso no pedía y la revisión mostró que hacía falta.
- **Tradeoff, nadie pierde una forma de pedir:** se cumple para los comandos. La primera versión sí le quitaba al chat
  dos formas de pedir un archivo —una ruta relativa con carpeta (`config/credentials.json`, que llega de
  `secrets-shell.js` tras un `cd` que no se resuelve) y una absoluta con espacios—; la revisión independiente lo midió y
  la condición final las mantiene.
- **Tradeoff, el 520 cambia el cuadro para `gh pr`:** sigue en pie. Lo decide el 520, que va después en la tanda.
- **Tradeoff, `self-approval.js`:** medido, y el caso estaba mal: decía que ahí no filtraba. Con el mensaje que nombra
  el archivo —«agregá la api a .ops-approval»— `main` dejaba escribir la línea de `gh pr close`; ahora frena.

Lo que el caso no preveía: un comando de dos palabras con la última absoluta (`bash /srv/deploy.sh`) o una sola palabra
(`./deploy.sh`) se siguen pidiendo por su basename. Ahí el basename es el archivo que el comando corre, y no un
repositorio, y no hay ninguna regla con salida que arme hoy un tramo con esa forma. Tampoco un comando cuya segunda
palabra es absoluta, con más detrás (`cp /a/x /b/api`), que la forma `escribe <ruta>` admite para no perder una ruta con
espacios. Y una ruta relativa con carpeta y con espacios ya no se pide por su basename: llega sólo de `secrets-shell`
tras un `cd` que no se resuelve, donde el bloqueo ya pide la ruta absoluta. Las tres quedan así.

### Qué se corrió

Por la entrada real de los hooks (`engine/hooks/run.js prompt` y después `destructive`, con el JSON de Claude Code), en
el banco `suelto`, una sesión por mensaje; el «antes» con el motor de `origin/main` extraído aparte:

```
antes pasa   | después frena  «revisá la api» → gh pr close 69 --repo o/api
antes pasa   | después frena  «arreglá la api» → gh pr review 69 --approve --repo o/api
antes pasa   | después frena  «mirá cómo está la api» → gh pr comment 69 --body ok --repo o/api
antes pasa   | después frena  «revisá el deploy de la api» → gh workflow run deploy.yml --repo o/api
antes pasa   | después frena  «revisá la api» → gh release create v1 --repo o/api
antes pasa   | después frena  «revisá prod.yaml» → kubectl apply -f k8s/prod.yaml
antes frena  | después frena  «contame de la api» → gh pr close 69 --repo o/api
antes frena  | después frena  «contame de prod.yaml» → kubectl apply -f k8s/prod.yaml
antes pasa   | después pasa   «corré gh pr close 69 --repo o/api» → gh pr close 69 --repo o/api
antes pasa   | después pasa   «corré kubectl apply -f k8s/prod.yaml» → kubectl apply -f k8s/prod.yaml
```

Tras el bloqueo de «revisá la api», un «dale» lo aprueba (`frena` → `pasa`). Por `pre-files`, escribir la línea
`gh pr close 69 --repo o/api` en `.ops-approval`: «agregá la api a .ops-approval», `exit 0` en `main` y `exit 2` en la
rama; «agregá gh pr close 69 --repo o/api a .ops-approval», `exit 0` en las dos.

Mutaciones, en una copia: el basename pide siempre (roja la de `delivery` y la de `chat`); sin la palabra sola (roja
`chat`, la ruta relativa); sin la ruta absoluta (roja `chat`, la de espacios); sin el verbo delante (rojas `chat` y
`runtime`).

**Sin probar:** una sesión real de Claude Code; el guard no depende del modelo, y la entrada de hooks es la misma.

### Lista de cierre

1. hecho: la reproducción del caso por la entrada real de hooks con el motor de `origin/main`, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: las dos pruebas nuevas, rojas con el `chat.js` del commit anterior y verdes con el nuevo.
4. hecho: cuatro mutaciones de la condición, en una copia, todas rojas; ninguna sobrevivió.
5. hecho: lo que se quita es que el basename de un comando pida; la prueba de `delivery` asserta `frena`, vista en
   rojo, y la salida de antes y después está lado a lado arriba.
6. hecho: por la entrada real de los hooks en un banco, sin el arnés de las pruebas.
7. no aplica: no depende de un modelo ni de un runner; `mentions` es la misma en todos.
8. hecho: corrieron las dos pruebas, todas las de `test/hooks`, la entrada real antes y después, el «dale» y
   `self-approval`. No corrió una sesión de Claude Code.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: se recorrieron todos los que leen con `named` (los llamadores de `AP.pending`, `pendingNow` y
    `CHAT.authorized`) y la forma de sus ítems; el comentario de `orders.js` que afirmaba el basename se corrigió.
11. hecho: dos pasadas independientes. La primera midió dos formas de pedir un archivo que la primera versión
    quitaba, y se reescribió la condición; la segunda, sobre la versión final y el commit del refactor, nada que impida
    entregar. Lo que anotó está arriba, en «Lo que el caso no preveía».
12. hecho: uno por uno sobre los tres comentarios del diff, y ninguno pasa de 0,22 con el tokenizador de la puerta.
13. hecho: `npm run ci` con el cambio y este caso stageados, `exit 0`.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.
