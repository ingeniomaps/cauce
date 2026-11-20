---
caso: 524
titulo: negar un PR por su número no revoca lo que la sesión ya concedió
estado: abierto
prioridad: media
version-detectada: 0.123.0
---

# 524 — negar un PR por su número no revoca lo que la sesión ya concedió

**🔴 abierto** · detectado en 0.123.0 · prioridad **media**: deja pasar del lado peligroso, pero sólo después de que la
persona lo ordenó en esa misma sesión y se arrepintió nombrando el número. Sube a alta si aparece en una sesión real.

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
- `engine/hooks/chat.js:308-314`, `why`: `ordersPull` devuelve `false` para el mensaje en curso y `approved` no lo
  trae; como el ítem sigue en `granted`, pasa como `concedido`.
- `engine/hooks/orders.js:65`, `ordersPull`: sí lee la negación por número (`denied`), pero sólo decide el mensaje en
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
