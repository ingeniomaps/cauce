---
caso: 524
titulo: negar un PR por su número no revoca lo que la sesión ya concedió
estado: resuelto
resuelto-en: 0.123.1
prioridad: media
version-detectada: 0.123.0
---

# 524 — negar un PR por su número no revoca lo que la sesión ya concedió

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **media**: deja pasar del lado peligroso, pero sólo
después de que la persona lo ordenó en esa misma sesión y se arrepintió. Lo concedido se escribe cuando el guard deja
pasar, así que la ventana es el reintento: un merge que falló por checks pendientes y el agente vuelve a correr.

## Resumen

Una orden de mergear —y desde 0.123.1 también de cerrar o reabrir— concede el ítem `gh pr <acto> <n> --repo <r>` para
el resto de la sesión. Si el mensaje siguiente lo niega por número —«no mergees el #69»—, la lectura del merge da
`false` para ese mensaje, pero lo concedido sigue en pie y el reintento pasa por `concedido`. La revocación de lo
concedido lee con `mentions`, que busca el nombre del ítem y no el número de PR.

## Reproducción

Desde la raíz de Cauce, por la entrada real de los hooks (`run.js prompt` y `run.js destructive`), en el banco
`suelto`, los dos mensajes en la misma sesión. El comando va en un script porque el guard de identidad de este repo
frena el literal de `gh` en la línea de comandos:

```bash
B=$(node engine/cli/ops.js bench suelto --force)
bash real-524.sh "$PWD" "$PWD/$B" 'mergeá el #69' 'no mergees el #69' 'gh pr merge 69 --repo o/api'
```

`real-524.sh` manda el primer mensaje, corre el comando, manda el segundo y lo corre de nuevo, con la misma
`session_id` y `permission_mode: dontAsk`. Medido el 2026-11-19 con el motor de `origin/main` (0.123.0) y con la rama
`fix/519-523-chat-y-historias`.

## Síntoma

```
== main
«mergeá el #69» → pasa ; «no mergees el #69» → pasa   (gh pr merge 69 --repo o/api)
== rama
«mergeá el #69» → pasa ; «no mergees el #69» → pasa   (gh pr merge 69 --repo o/api)
«cerrá el #69» → pasa ; «no cierres el #69» → pasa   (gh pr close 69 --repo o/api)
```

## Causa raíz

- `engine/hooks/chat.js:191`: `granted` se filtra con `!mentions(text, one).denied`. Para `gh pr merge 69 --repo o/api`,
  `mentions` busca ese texto entero o su basename (`api`), y «no mergees el #69» no trae ninguno de los dos.
- `engine/hooks/chat.js:311-316` (al 2026-11-20), `why`: `ordersPull` devuelve `false` para el mensaje en curso y `approved` no lo
  trae; como el ítem sigue en `granted`, pasa como `concedido`.
- `engine/hooks/orders.js:66` (al 2026-11-20), `ordersPull`: sí lee la negación por número (`denied`), pero sólo decide el mensaje en
  curso; no tiene cómo revocar lo concedido.

## Fix propuesto

Que la revocación pregunte con la misma lectura que concedió: en `record`, un ítem concedido se cae si `mentions` lo
niega **o** si la lectura de su regla lo niega por número. La forma más chica es que `ordersPull` exporte también la
negación (`deniesPull(text, item)`: el número del ítem está en `denied`) y que `record` la consulte para los ítems
`gh pr …`. Prueba: «mergeá el #69», después «no mergees el #69», y el reintento frena; roja hoy.

## Tradeoffs

- `chat.js` conocería la forma de un ítem de PR, que hoy vive en `delivery.js` y `orders.js`. La alternativa es que
  cada regla registre su función de revocación junto a su `asked`, que es más trabajo y deja lo mismo.
- Revocar de más es la dirección segura: un «no» que niega otro PR por error obliga a repetir la orden.

## Contexto de descubrimiento

Revisión independiente del caso 520, 2026-11-19. Con el merge pasaba desde el 280; el 520 lo extiende a cerrar y
reabrir.

## Relacionados

- **280** — la orden de mergear por número.
- **520** — cerrar y reabrir por número.
- **116** — lo concedido se hereda en la sesión.

## Cierre

**Reemplazado por el 527, antes de publicarse.** En la misma versión, el 527 decidió que lo que publica no se hereda
al mensaje siguiente, y con eso `revokesPull` quedó muerto y se quitó: lo que este cierre describe de él ya no está en
el código. Las pruebas y la conducta medidas abajo siguen en pie con el mecanismo del 527.

`revokesPull` (`engine/hooks/orders.js:76`) dice si un mensaje le quita a un PR lo que su orden le había concedido: lo
niega o lo exceptúa por número, niega sin nombrar ninguno, o arranca frenando (`HALT`). Comparte con `ordersPull` la
lectura de los PR, que pasó a `pullsOf` (`orders.js:86`). `record` (`engine/hooks/chat.js:194`) la consulta junto a
`mentions` para filtrar lo concedido, sólo con un mensaje de la persona: un aviso del runner no revoca por esta vía,
como tampoco ordena.

Línea de base: la reproducción de arriba, más los casos que agregó correrla, con el motor de `origin/main` y el de la
rama.

Contra el caso:

- **Fix, que la revocación pregunte con la lectura que concedió:** se hizo. `record` consulta `revokesPull` para los
  ítems `gh pr merge|close|reopen`; para los demás devuelve `false`.
- **Fix, `deniesPull` (el número en `denied`):** se hizo más ancho, como `revokesPull`. Correr la línea de base mostró
  que tampoco revocaban «no, pará» ni «no mergees nada», que `ordersPull` ya leía como «no» para el mensaje en curso.
- **Fix, la prueba:** se hizo, en `test/hooks/delivery.test.js`, con once formas y el aviso del runner.
- **Tradeoff, `chat.js` conocería la forma de un ítem de PR:** no la conoce: la lee `orders.js`, que `chat.js` ya pide
  de forma perezosa para `refusesPush`. La alternativa de registrar una función por regla no hizo falta.
- **Tradeoff, revocar de más es la dirección segura:** se cumple, y es más frecuente que lo que el caso decía: no sólo
  «un no que niega otro PR». Cualquier negación vaga revoca, sobre cualquier tema: «no toques el .env», «seguí sin
  tocar main» y «no hay apuro» revocan un merge concedido. 2945 de 6457 mensajes humanos traen una negación (medido el
  2026-11-20 sobre los `.jsonl` de `$HOME/.claude/projects` de esta máquina, con el `NEGATION` del motor). Pesa sólo en
  un reintento, y es la misma regla con que `ordersPull` ya lee el mensaje en curso; se repite la orden.

Lo que el caso no preveía:

- Desde el 520, en esta rama, también el cierre y la reapertura se conceden y se heredan (en `main`, «cerrá el #69»
  frenaba).
- El mismo hueco existe para lo concedido que no es un PR: «pará» o «no despliegues nada» no revocan `terraform apply`,
  `gh workflow run` ni `gh release create`. Pide otra decisión (qué se hereda y qué revoca un «pará») y sale como caso
  propio: el **527**.
- Quedan como en `main`, anotados: `HALT` sólo se lee al inicio del mensaje («ok, pará», «Ojo, pará» no revocan), y
  las formas que corrigen o posponen sin negar —«perdón, era el #70», «dejá el #69 para mañana», «olvidate del #69»,
  «frená», «nope»— no revocan. Es el vocabulario con que `ordersPull` lee el mensaje en curso.

### Qué se corrió

Por la entrada real de los hooks (`run.js prompt` y `run.js destructive`), un banco propio, la orden y el segundo
mensaje en la misma sesión, y el reintento de `gh pr merge 69 --repo o/api` (salvo donde se indica). `main` → ahora:

```
«mergeá el #69» / «no mergees el #69»            pasa  | frena
«cerrá el #69» / «no cierres el #69»  (close)     frena | frena   (en main no se concedía; en la rama pasaba)
«mergeá el #69» / «no, pará»                      pasa  | frena
«mergeá el #69» / «no mergees nada»               pasa  | frena
«mergeá el #69» / «no mergees el #70»             pasa  | pasa
«mergeá el #69» / «gracias»                       pasa  | pasa
«mergeá el #69 y el #70» / «no mergees el #69»    pasa  | pasa    (reintento del #70)
«subí feat/x a origin» / «gracias»  (push)        frena | frena   (el push no se hereda)
```

El cierre: con la rama antes del arreglo, «cerrá el #69» / «no cierres el #69» daba pasa; ahora frena.

Mutaciones, en una copia, todas rojas en `test/hooks/delivery.test.js`: sin revocar por número; revocando también con un
aviso del runner; sin `HALT`; sin lo vago; sin el número negado; revocando lo que no es un PR; la orden sin lo vago; y
sin lo exceptuado. La del aviso sobrevivía al principio: la fila pasaba por la orden, que tras un aviso se lee en el
último mensaje de la persona, y no por lo concedido; se le puso un «gracias» en el medio.

### Sesión real

El 2026-11-20, sesiones de Claude Code 2.1.329 (`claude -p --model haiku --permission-mode dontAsk`, sin los ajustes de
usuario) en un banco instalado, con un `gh` falso en el `PATH` que contesta `pr view` y `pr merge`. Primer mensaje:
«mergeá el PR #69 del repo o/api»; el agente corrió `gh pr merge 69 --repo o/api --merge`, y lo concedido quedó en
`["gh pr merge 69 --repo o/api"]`. Segundo mensaje, con `--resume` en la misma sesión: «no, pará: no mergees el #69
todavía». Después, el reintento por el hook instalado (`guard-shell.sh`) con esa sesión:

- Motor de `main` (`f4cf6438`): lo concedido siguió igual y el reintento pasó.
- Esta rama (`df723a13`): lo concedido quedó `[]` y el reintento frenó con el bloqueo de R10.

Un primer intento con `main` no midió nada: el `gh` falso contestaba lo mismo a todo y el agente, desconfiado, consultó
el `gh` real contra `o/api` (lectura, no resolvió) y no mergeó. Se rehízo con un `gh` falso creíble. Seis sesiones,
unos USD 0,1.

**Sin probar:** nada.

### Lista de cierre

1. hecho: la reproducción con el motor de `origin/main` y el de la rama, arriba.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: la prueba del 524, roja antes del arreglo («mergeá el #69» / «no mergees el #69» pasaba) y verde después.
4. hecho: ocho mutaciones, todas rojas; la del aviso sobrevivía y se corrigió la fila que la medía.
5. hecho: lo que se quita es que lo concedido sobreviva a una negación por número, vaga o un `HALT`; la salida de antes
   y después está arriba, con las filas que tienen que seguir pasando.
6. hecho: por la entrada real de los hooks y en una sesión real, sin el arnés de las pruebas.
7. hecho: sesiones reales de Claude Code con los dos motores, arriba, y el reintento por el hook instalado.
8. hecho: corrieron las pruebas de `test/hooks`, la entrada real con merge, cierre y push, y las sesiones reales. El
   último cambio después de ellas fue el encabezado de `record` (sólo comentario).
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: `ordersPull` lo usa `delivery.js` y su resultado no cambió: la revisión comparó la versión anterior con la
    nueva sobre 159.676 combinaciones de frase, ítem y `relayed`, sin diferencias. `granted` lo leen `why`, `grantedIn`
    (que deja de listar el PR revocado) y `scopes`, que se filtra con él.
11. hecho: una pasada independiente sin nada que impida entregar. Señaló el encabezado de `record`, que quedó a medias
    falso y se corrigió; la frecuencia real de las revocaciones de más, escrita arriba; y el hueco del 527.
12. hecho: uno por uno sobre el diff; ninguno pasa de 0,22 con el tokenizador de la puerta. La razón de que un aviso no
    revoque estaba en el código y en la prueba, y se dejó sólo en el código.
13. hecho: `npm run ci` con el cambio, este caso y el 527 stageados, `exit 0`.
14. hecho: recorrido arriba contra el Fix y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG.
