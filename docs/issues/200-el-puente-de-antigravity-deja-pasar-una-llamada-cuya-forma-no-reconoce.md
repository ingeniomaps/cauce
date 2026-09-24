---
caso: 200
titulo: El puente de Antigravity deja pasar una llamada cuya forma no reconoce, así que un campo renombrado apaga todos sus guards en silencio
estado: abierto
prioridad: alta
version-detectada: 0.98.0
---

# 200 — Un campo con otro nombre y el puente no juzga nada

**🔴 abierto** · detectado en 0.98.0 · prioridad **alta**. Falla hacia el lado peligroso y sin rastro: la
llamada pasa como si el guard la hubiera mirado.

## Resumen

`normalize()` (`automatization/runners/antigravity/hook.js:130-144`) arma la entrada de los guards leyendo
campos por nombre fijo: `toolCall.args.CommandLine`, `TargetFile`, `AbsolutePath`, `CodeContent`,
`ReplacementContent`, `ReplacementChunks`. Si el JSON es válido pero no trae esos nombres, cada uno cae a `''`
y los guards reciben una llamada sin comando ni archivo. Un guard sin nada que juzgar no frena, y el puente
responde `allow`.

El 198 cerró la mitad ilegible de este problema: un JSON roto ahora se niega. La mitad legible y desconocida
sigue abierta, y es la que va a aparecer sola el día que Antigravity renombre un campo en una actualización:
no rompe nada, no avisa nada, y todos los guards del runner quedan apagados.

## Reproducción

Desde un clon de Cauce en la rama `fix/cases-185-196` (`248489f0`, Node v24.18.0), corrida el 2026-09-23:

```bash
H=automatization/runners/antigravity/hook.js
for j in '{"toolCall":{"args":{"CommandLine":"git push --force origin main"}}}' \
         '{"toolCall":{"args":{"Command":"git push --force origin main"}}}' \
         '{"tool_call":{"args":{"CommandLine":"git push --force origin main"}}}'; do
  printf '%s' "$j" | timeout 10 node $H pre-shell
done
```

## Síntoma

Salida real:

```
{"decision":"deny","reason":"Cauce: 'git push --force' reescribe historia ya publicada. R8 lo prohíbe y runne…
{"decision":"allow"}
{"decision":"allow"}
```

El mismo `push --force` se niega con la forma que el puente conoce y pasa con cualquier otra.

## Causa raíz

- **`automatization/runners/antigravity/hook.js:130-144`, `normalize()`**: cada campo que no encuentra se
  convierte en `''`, y no hay ninguna comprobación de que haya encontrado algo.
- **`hook.js`, `evaluate()`**: corre `executeAll` sobre esa entrada vacía y, si nadie frena, responde `allow`.
  Una llamada que el puente no supo describir se trata igual que una que describió y no tenía nada malo.

## Fix propuesto

Cerrado por defecto (R27): en `pre-shell` y `pre-files`, si `normalize()` no encontró lo que el evento
necesita —un comando en `pre-shell`, un archivo en `pre-files`—, el puente niega y dice qué forma recibió y
cuál esperaba. Lo que queda por decidir es qué hace falta en cada evento:

- `pre-shell`: `CommandLine` presente. Parece suficiente.
- `pre-files`: `TargetFile` o `AbsolutePath`. Una herramienta de archivos de Antigravity que no nombre un
  archivo existe o no; eso hay que comprobarlo contra una sesión real antes de decidir que se niega.
- `stop`: no tiene campos que juzgar; no aplica.

## Tradeoffs

- **Si Antigravity manda llamadas legítimas con otra forma**, el puente empieza a negarlas. Es el costo
  buscado: se ve en el primer intento y se arregla agregando el campo, en vez de quedar sin guards durante
  meses sin que nadie lo note.
- **Los nombres reales de los campos no están comprobados acá**: vienen del código actual del puente. Qué
  manda `agy` hoy es hipótesis hasta correr una sesión real (lo mismo que dice el cierre del 198).

## Prioridad

Alta: es la misma dirección que hizo alta al 198 —un guard que deja pasar lo que no pudo juzgar—, y su
disparador no depende de nadie de este lado: basta una actualización del runner.

## Contexto de descubrimiento

Salió del cierre del 198, el 2026-09-23: al hacer que el puente niegue un JSON ilegible quedó a la vista que
uno legible con otra forma seguía pasando, y el caso lo dejó fuera porque decidir qué campos exige cada
evento es una decisión aparte.

## Relacionados

- **198**: la mitad ilegible del mismo problema, ya cerrada.
- **190**: el mismo contrato, del lado del motor: un guard que no sabe qué juzgar no autoriza.
