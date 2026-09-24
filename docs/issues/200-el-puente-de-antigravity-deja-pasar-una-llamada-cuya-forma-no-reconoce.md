---
caso: 200
titulo: El puente de Antigravity deja pasar una llamada cuya forma no reconoce, así que un campo renombrado apaga todos sus guards en silencio
estado: resuelto
resuelto-en: 0.99.0
prioridad: alta
version-detectada: 0.98.0
---

# 200 — Un campo con otro nombre y el puente no juzga nada

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **alta**. Falla hacia el lado peligroso y sin rastro: la
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

## Cierre

**Resuelto en 0.99.0, por el fix propuesto.** Recorriendo lo que enumeró:

- **`pre-shell` sin comando → se niega.** `undescribed` (`automatization/runners/antigravity/hook.js`) mira si
  `normalize` encontró el campo que el evento juzga, y si no, `evaluate` niega nombrando lo que llegó
  —`toolCall.args trae Command`, o `llegó tool_call` si ni siquiera está `toolCall`—.
- **`pre-files` sin archivo → se niega también.** El caso lo dejaba condicionado a comprobar si Antigravity
  tiene herramientas de archivos que no nombren uno. No se pudo comprobar sin una sesión real, y se eligió el
  lado cerrado: si existe una, se va a ver en el primer intento con el motivo que dice qué llegó, que es el
  tradeoff que el caso ya aceptaba.
- **`stop` → no aplica**, como decía el caso: no tiene campos que juzgar.
- **Tradeoff de las llamadas legítimas con otra forma → aceptado**, y el motivo dice dónde se arregla
  (`normalize()`).
- **Tradeoff de los nombres no comprobados → sigue siendo hipótesis** qué manda `agy` hoy; lo que cambió es el
  costo de que sea falsa: antes apagaba los guards, ahora niega a la vista.

**Lo que el caso no preveía: el sondeo de `install` y `doctor` dependía de este defecto.** `probeBridge`
(`engine/automation/index.js`) le mandaba a cada evento un payload de shell, `CommandLine: 'ls'`. En
`pre-files` eso no describe ningún archivo: pasaba sólo porque el puente dejaba pasar una llamada vacía. Con el
arreglo, tres pruebas de instalación se pusieron en rojo, y el sondeo ahora manda una llamada inocua a
`pre-shell` y una entrada vacía al resto, que es la forma legítima de no describir nada y ejercita igual el
arranque y la raíz.

**Lo que se mantuvo a propósito: la entrada vacía sigue pasando**, como decidió el 198. No describe ninguna
llamada y es como se invoca el puente a mano, con `OPS_HOOK_COMMAND`/`OPS_HOOK_FILE`.

### Qué se corrió

- **La reproducción del caso contra el puente real** (2026-09-23, exit 0 en todas):

  ```
  CommandLine: git push --force  → deny: 'git push --force' reescribe historia ya publicada…
  Command:     git push --force  → deny: la llamada no trae CommandLine … (toolCall.args trae Command)…
  tool_call.args.CommandLine     → deny: la llamada no trae CommandLine … (llegó tool_call)…
  CommandLine: git status        → allow
  </dev/null                     → allow
  ```

- **La prueba nueva en `test/wiring/runners.test.js`, en rojo sobre el código anterior** (la forma renombrada
  pasaba con `allow`), y **tres mutaciones en una copia del árbol, las tres en rojo**: sin la comprobación
  (1 prueba), negando también la entrada vacía (4) y el sondeo de antes (3).
- `npm run ci`, exit 0, 981 pruebas.

