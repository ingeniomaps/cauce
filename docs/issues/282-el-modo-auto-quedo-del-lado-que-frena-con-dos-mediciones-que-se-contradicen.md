---
caso: 282
titulo: el modo auto quedó del lado que frena con dos mediciones que se contradicen
estado: resuelto
resuelto-en: 0.103.1
prioridad: media
version-detectada: 0.101.0
---

# 282 — En `auto` el guard no pide el diálogo de Claude Code, y no está establecido si hace falta

**🟢 resuelto en 0.103.1** · detectado en 0.101.0 · prioridad **media**.

## Resumen

Desde 0.101.0, en modo `auto` todo lo que un guard frena vuelve a la confirmación por chat: un mensaje de
la persona en vez de un clic. La razón escrita es que hay dos mediciones que se contradicen —en una sesión
el diálogo apareció, en otra siete pedidos corrieron sin que conste quién los aprobó— y ninguna explicación.

## Reproducción

No hay comandos: lo que falta es la medición. Hace falta una sesión interactiva de Claude Code en modo
`auto`, con una persona delante, sobre un banco con los guards instalados
(`node engine/cli/ops.js bench suelto`), y repetir en una sesión nueva y en una con historia:

1. Pedir algo que un guard frene con salida —`git reset --hard`, leer un `.env`—.
2. Anotar si el diálogo aparece, quién lo contesta y si la herramienta corre cuando se rechaza.
3. Anotar la versión de Claude Code y el `permission_mode` que llega al hook.

## Síntoma

Lo que se ve hoy, medido en el arnés sobre `fix/280-merge-order`: con `permission_mode: 'auto'`,
`CF.native(input)` es falso y el guard bloquea con la oferta de confirmar por chat. Es la conducta
declarada, no un defecto en sí; el defecto es que no se sabe si es necesaria.

## Causa raíz

`engine/hooks/confirm.js`, `ANSWERED` — la lista no incluye `auto`, y el comentario de arriba dice por qué:
«queda afuera sin que esté establecido por qué hace falta». Las dos mediciones están en los casos 257 y 268.

## Fix propuesto

Depende de lo que dé la medición. Si en `auto` el diálogo lo contesta una persona, `auto` entra a
`ANSWERED`. Si Claude Code lo resuelve solo, se queda afuera y el comentario pasa a decir eso, con la
versión medida.

## Tradeoffs

- Devolver `auto` al diálogo sin explicar las dos mediciones reabre el 257: lo frenado corre sin que nadie
  lo apruebe.

## Contexto de descubrimiento

Era el tercer punto del 280. Se separó porque no se puede cerrar desde una sesión de agente: necesita una
persona contestando un diálogo. Con el 280 arreglado dejó de ser urgente para un merge pedido en el chat,
que ya no pasa por acá; sigue costando un mensaje en todo lo demás que un guard frena en `auto`.

## Relacionados

- **257 y 268** — las dos mediciones.
- **280** — el caso del que salió.

## Cierre

**Resuelto en 0.103.1**, entre dos versiones.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo en 0.103.0.** La medición dio que en `auto` el diálogo lo contesta una persona —está en el
  caso 257—, y `auto` entró a los modos con diálogo.
- **Tradeoff, reabrir el 257 — no ocurrió, y apareció otro.** Los siete pedidos que corrieron sin aprobador
  siguen sin explicación y ninguna medición los reprodujo. Lo que sí pasó es que el diálogo se abrió también
  dentro de un recorrido, donde nadie lo mira. Eso es el caso 285, y lo que lo cierra es su división: el
  diálogo sólo para lo que pide autoridad y sólo en la conversación directa.

### Qué se corrió

- **Tres sesiones en `auto` sin nadie al teclado** (caso 257): el diálogo apareció y esperó.
- **Una sesión real en `auto` con la división del 285**: ningún diálogo para lo corregible ni para un
  subagente.
- **La puerta entera**, `npm run ci`.
