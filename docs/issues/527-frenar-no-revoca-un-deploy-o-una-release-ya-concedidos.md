---
caso: 527
titulo: «pará» o «no despliegues nada» no revocan un deploy, un workflow o una release que la sesión ya concedió
estado: abierto
prioridad: media
version-detectada: 0.123.0
---

# 527 — «pará» o «no despliegues nada» no revocan un deploy, un workflow o una release que la sesión ya concedió

**🔴 abierto** · detectado en 0.123.0 · prioridad **media**: deja pasar del lado peligroso, sobre los actos más caros
de R10, pero sólo en el reintento de algo que la persona ya ordenó en la misma sesión. Sube a alta si aparece en una
sesión real.

## Resumen

Lo que un guard deja pasar por una orden del chat queda concedido para el resto de la sesión (`AP.pending`, caso 116).
Para revocarlo, el mensaje siguiente tiene que nombrar el ítem: `record` (`engine/hooks/chat.js:195`) filtra lo
concedido con `mentions(text, item).denied`. Un «pará» o una negación que no nombra el comando —«no despliegues
nada», «no publiques nada»— no lo nombran, así que `terraform apply`, `gh workflow run …` o `gh release create …`
siguen pasando por `concedido`.

El 524 lo cerró para los PR, que se conceden por número y se revocan con la misma lectura. El push no tiene el
problema: se autoriza sin conceder (`engine/hooks/push.js:205-212`), así que vale para esa operación y no para la
siguiente.

## Reproducción

Por la entrada real de los hooks (`run.js prompt` y `run.js destructive`, `permission_mode: dontAsk`), en un banco
propio con `{ "mode": "embedded", "runner": { "allowPush": false } }`, los dos mensajes en la misma sesión, con
`real-524.sh` del 524 (manda la orden, corre el comando, manda el segundo mensaje y lo corre de nuevo).

## Síntoma

Medido el 2026-11-20, igual con el motor de `origin/main` (0.123.0) y con la rama `fix/519-523-chat-y-historias`:

```
«corré terraform apply» → pasa ; «pará» → pasa   (terraform apply)
«corré terraform apply» → pasa ; «no despliegues nada» → pasa   (terraform apply)
«corré gh workflow run deploy.yml --repo o/api» → pasa ; «pará» → pasa
«corré gh workflow run deploy.yml --repo o/api» → pasa ; «no despliegues nada» → pasa
«corré gh release create v1 --repo o/api» → pasa ; «no publiques nada» → pasa
«corré terraform apply» → pasa ; «gracias» → pasa   (terraform apply)
```

## Causa raíz

- `engine/hooks/chat.js:195`: lo concedido sólo se revoca si el mensaje nombra el ítem (`mentions`), salvo un PR por
  su número desde el 524 (`revokesPull`, `engine/hooks/orders.js`).
- `engine/hooks/chat.js:165`: `HALT` («pará», «esperá», «cancelá», «stop») frena lo que el mensaje en curso ordena y lo
  que queda pendiente, pero no toca lo concedido.

## Fix propuesto

Pide una decisión, porque cambia qué sobrevive de un mensaje al siguiente en toda instancia. Tres formas, de más
angosta a más ancha:

1. **Que `HALT` revoque todo lo concedido.** Es explícito y raro: 31 de 6457 mensajes humanos. Medido el 2026-11-20
   sobre los `.jsonl` de `$HOME/.claude/projects` de esta máquina, con `NEGATION` y `HALT` del motor, contando los
   mensajes de tipo `user` en texto que no empiezan con una etiqueta.
2. **Que la negación vaga revoque sólo la familia de publicar** —PR, workflow, release, deploy—, no los archivos ni los
   comandos comunes: 2945 de esos 6457 mensajes (45,6 %) traen una negación, y revocar todo con eso dejaría lo concedido
   casi sin efecto.
3. **Que la familia de publicar no se herede**, como el push: cada operación pide su orden o su «dale».

Recomendación: 1 y 3 juntas. La 3 es el criterio que el push ya tiene escrito (volver a publicar agrega consecuencia),
y la 1 cubre lo demás sin listas de palabras nuevas.

Prueba: «corré terraform apply», después «pará», y el reintento frena; roja hoy.

## Tradeoffs

- La 3 obliga a repetir la orden para cada deploy de una tanda, como ya pasa con el push.
- La 1 hace que un «pará» le quite también la lectura de un archivo concedida antes; se vuelve a pedir.
- `HALT` está anclado al inicio del mensaje: «ok, pará» no lo dispara. Ampliarlo cambia también lo que frena el
  mensaje en curso.

## Contexto de descubrimiento

Revisión independiente del caso 524, 2026-11-20: al medir si la revocación por número dejaba otros huecos, encontró que
la misma forma vale para lo concedido que no es un PR. Reproducido en la misma sesión con el motor de `main` y el de la
rama.

## Relacionados

- **524** — el mismo hueco, para un PR por su número.
- **116** — lo concedido se hereda en la sesión.
- **225** — los actos que publican sin ser un push.
