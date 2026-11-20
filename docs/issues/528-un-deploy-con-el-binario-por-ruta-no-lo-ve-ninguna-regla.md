---
caso: 528
titulo: un deploy o un acto sobre un PR con el binario escrito por ruta no lo reconoce ninguna regla de R10
estado: abierto
prioridad: alta
version-detectada: 0.123.0
---

# 528 — un deploy o un acto sobre un PR con el binario escrito por ruta no lo reconoce ninguna regla de R10

**🔴 abierto** · detectado en 0.123.0 · prioridad **alta**: publica sin ninguna aprobación —ni orden, ni «dale», ni
`.ops-approval`—, y un agente lo escribió solo, sin que nadie se lo pidiera, en una sesión real.

## Resumen

Las reglas de `delivery.js` reconocen el programa sólo al principio del comando o detrás de un espacio, un separador,
un paréntesis o una comilla (`AT`, `engine/hooks/delivery.js:19`). Escrito con su ruta —`/usr/bin/terraform apply`,
`./node_modules/.bin/cdk deploy`, `/usr/bin/gh pr merge 69 …`—, delante del nombre hay una `/` y ninguna regla lo ve.
Lo mismo con `$(which terraform) apply`.

## Reproducción

Por la entrada real de los hooks (`run.js destructive`, JSON de `PreToolUse` sin chat), en un banco propio con
`{ "mode": "embedded", "runner": { "allowPush": false } }`. El literal de `gh` va en un archivo, porque el guard de
identidad de este repositorio lo frena en la línea de comandos.

## Síntoma

Medido el 2026-11-20, igual con el motor de `origin/main` (0.123.0) y con la rama `fix/519-523-chat-y-historias`:

```
frena  terraform apply
pasa   /usr/bin/terraform apply
pasa   /usr/local/bin/kubectl apply -f k8s/
pasa   ./node_modules/.bin/cdk deploy
pasa   ~/.local/bin/helm upgrade api ./chart
pasa   $(which terraform) apply
pasa   /usr/bin/gh pr merge 69 --repo o/api
pasa   /usr/bin/gh release create v1 --repo o/api
```

En una sesión real del caso 527 (Claude Code 2.1.329, `claude -p --model haiku`, 2026-11-20, sesión `e7538ef3`), el
agente desconfió de un `terraform` falso que había en el `PATH` y corrió `/usr/bin/terraform apply -input=false
/tmp/cauce-tfplan`: pasó sin pedir nada.

## Causa raíz

- `engine/hooks/delivery.js:19`: `AT = (?:^|[\s;&|('"\`])`, lo que puede ir antes del programa. No admite el final de
  una ruta.
- Las reglas de git no tienen el problema: buscan `\bgit\s+…`, y `\b` vale detrás de `/` (`/usr/bin/git push` frena).

## Fix propuesto

Que `AT` admita una ruta delante del programa: `(?:^|[\s;&|('"\`])(?:[^\s;&|()'"\`]*/)?`, de modo que
`/usr/bin/terraform`, `./node_modules/.bin/cdk` y `~/.local/bin/helm` cuenten como el programa. `$(which terraform)`
queda afuera: no hay un nombre que leer, y cerrarlo pide decidir si cualquier `$(…)` en posición de comando frena.

Prueba: las siete formas de arriba frenan; rojas hoy. Y que `cat /docs/terraform` o `ls ./kubectl/` sigan pasando.

## Tradeoffs

- Una ruta cuyo último tramo se llama como el programa y no lo es —un directorio `./terraform/` con un script
  `apply`— no existe con esta forma: el programa tiene que ir seguido de su verbo.
- El ítem que se aprueba es el tramo del comando (caso 451), con la ruta adentro: «corré terraform apply» no nombraría
  `/usr/bin/terraform apply`. Hay que decidir si la orden por chat lee el programa sin su ruta.

## Contexto de descubrimiento

Sesión real del caso 527, 2026-11-20: el agente escribió la ruta absoluta del binario por su cuenta, y el reintento del
mismo comando pasaba con el motor de `main` sin ninguna orden.

## Relacionados

- **225** — los actos que publican sin ser un push.
- **527** — la sesión en que apareció.
