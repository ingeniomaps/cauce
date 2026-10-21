---
caso: 427
titulo: una escritura a .ops-approval que no llega en tool_input tira el guard de archivos con un TypeError en vez de frenarla
estado: resuelto
resuelto-en: 0.113.3
prioridad: media
version-detectada: 0.113.2
---

# 427 — `resulting` lee `input.tool_input.old_string` sin respaldo, y una escritura a la aprobación por otra vía sale en 1 y no en 2

**🟢 resuelto en 0.113.3** · detectado en 0.113.2 · prioridad **media**. No es lo que manda ningún runner instalado hoy, pero es la
única aprobación que el agente no puede escribirse, y ahí el guard termina con «no pude juzgar» en vez de «no».

## Resumen

`resulting` (`engine/hooks/self-approval.js:83-93`) juzga un `Edit` por el archivo que deja. Empieza con
`const fields = input.tool_input` y lee `fields.old_string` sin comprobar que haya `tool_input`, y su comentario lo da por
seguro: «acá se llega con un archivo que salió de `tool_input`, así que siempre está». No es cierto. El archivo lo
resuelven `fileOf` y `patchOf` (`engine/hooks/input.js:111-126`), que también aceptan `input.file_path`, `input.path`,
`OPS_HOOK_FILE` y un `input.patch` de primer nivel. Con cualquiera de esas formas, `workspace-boundary`
(`engine/hooks/files.js:316`) llega a `selfApproval` → `unnamed`/`unasked` → `added` → `resulting`, y revienta.

El error no es un bloqueo: `run.js:316` sale con `error.blocked ? 2 : 1`, y un `TypeError` no lleva `blocked`. Además
corta el grupo entero: `executeAll` (`run.js:276-297`) relanza y ningún guard que venía después en `pre-files` llega a
correr.

Entró en 0.108.0 con `resulting` (4a8f6de7, «judge an approval edit by the file it leaves behind»). Antes, `added`
leía `contentOf(input)`, que sí tolera un `tool_input` ausente (`input.js:140`).

## Reproducción

Sobre `ops bench suelto` (0.113.2), corriendo el shim instalado tal cual, sin chat y sin aprobación previa. La primera
forma es el control: la de Claude Code, con `tool_input`.

```
$ R=$(node engine/cli/ops.js bench suelto --force); cd "$R"
$ H=automatization/hooks/guard-files.sh

# 1. tool_input (control)
$ printf '{"cwd":"%s","tool_name":"Write","tool_input":{"file_path":"%s/planning/.ops-approval","content":"src/x.js\n"}}' "$R" "$R" | bash $H
BLOQUEADO: …/planning/.ops-approval es la aprobación de una persona, y escribírsela es aprobarse solo. …
exit=2

# 2. file_path de primer nivel
$ printf '{"cwd":"%s","file_path":"%s/planning/.ops-approval","content":"src/x.js\n"}' "$R" "$R" | bash $H
BLOQUEADO: Cannot read properties of undefined (reading 'old_string')
exit=1

# 3. OPS_HOOK_FILE con stdin vacío, la invocación a mano del caso 198
$ OPS_HOOK_FILE="$R/planning/.ops-approval" bash $H </dev/null
BLOQUEADO: Cannot read properties of undefined (reading 'old_string')
exit=1

# 4. patch de primer nivel
$ printf '{"cwd":"%s","patch":"*** Begin Patch\n*** Add File: planning/.ops-approval\n+src/x.js\n*** End Patch\n"}' "$R" | bash $H
BLOQUEADO: Cannot read properties of undefined (reading 'old_string')
exit=1
```

El texto dice «BLOQUEADO», pero el código no. Claude Code lee 2 como bloqueo y cualquier otro código distinto de 0 como
un error que no bloquea (documentado en «Hooks reference», sección *Exit code output*; no lo comprobé en esta corrida).

## Quién manda esas formas

**Verificado** que Antigravity no las manda: `normalize` (`automatization/runners/antigravity/hook.js:131-146`) arma
siempre `tool_input`. Claude Code tampoco (lo dice la forma 1). De Codex y Gemini **no lo comprobé**: los dos entregan su
payload sin adaptador (`automatization/runners/codex/hooks.json`, `gemini/settings.json`). Lo que sí es seguro es la
forma 3: la invocación a mano que `DESCRIBED_BY` (`hook.js:163-176`) y el caso 198 documentan como legítima.

## Fix propuesto

`const fields = input.tool_input || {}`: sin `old_string`, `resulting` ya cae en `contentOf(input)`, que es lo que se
hacía antes de 0.108.0. El comentario se reemplaza por lo que el código hace. La prueba manda la forma 2 y la 4 a
`workspace-boundary` sobre la aprobación y espera el bloqueo `SELF` con `blocked`. Mutación: volver a
`input.tool_input` sin respaldo y verla en rojo con el `TypeError`.

## Tradeoffs

- Con `|| {}`, la forma 3 sin contenido llega a `unnamed` sin líneas y sin cuerpo, y ahí frena con `SELF`
  (`self-approval.js:109`, «sin cuerpo no hay nada que juzgar, y se frena»). Es la dirección segura, pero hay que
  comprobarlo corriendo, no deducirlo.
- Vale la pena mirar si algún otro guard de `pre-files` lee `input.tool_input.<campo>` sin respaldo: el mismo supuesto
  pudo copiarse.

## Contexto de descubrimiento

La pasada de comentarios (R11) sobre lo agregado entre 0.107.0 y 0.113.2, el 2026-10-21. Un revisor contrastó el
comentario de `self-approval.js:84` contra `fileOf`/`patchOf` y lo encontró falso. La reproducción de arriba es de
esta sesión.

## Relacionados

- 098 y 119 — por qué el agente no puede escribirse la aprobación, y por qué se compara línea por línea.
- 198 — la invocación a mano con `OPS_HOOK_FILE`.
- 200 — la otra forma en que una llamada con otra forma apagaba los guards sin rastro.

## Cierre

**Resuelto en 0.113.3**, a pedido del dueño el 2026-10-21 («resuelve el caso 427»). No había ninguna versión abierta, y
es un patch: corrige un guard que se caía en vez de frenar, sin guard nuevo, regla ni protocolo, como los arreglos de
guards de 0.106.1. El encabezado del CHANGELOG dice que un cambio en un guard sube minor; la práctica lo lee como un
cambio de conducta visible, y la versión la eligió el dueño con esa lectura.

`resulting` (`engine/hooks/self-approval.js:83`) lee `input.tool_input || {}`. Sin `old_string` cae en `contentOf`,
que es lo que hacía `added` antes de 0.108.0, y el comentario que daba `tool_input` por seguro dice ahora de dónde
más puede llegar el archivo.

El caso, sección por sección:

- **Resumen, los dos daños.** El primero, salir en 1 en vez de bloquear: se fue, las tres formas salen en 2 con el
  motivo `SELF`. El segundo, cortar el grupo `pre-files`: el error ya no ocurre, así que el grupo sigue como con
  cualquier otra escritura. Un bloqueo también detiene los guards que vienen después (`executeAll`), pero eso es un
  bloqueo funcionando, no el defecto.
- **Fix propuesto**: se hizo tal cual. La prueba manda las formas 2, 3 y 4, no sólo la 2 y la 4: la 3 es la que el
  primer tradeoff pedía comprobar.
- **Tradeoffs, la forma 3 sin contenido.** Frena con `SELF`: sin líneas y sin cuerpo, `unnamed` no tiene qué anotar y
  frena (`self-approval.js:110`). Se comprobó corriendo, en la prueba y en el banco de abajo.
- **Tradeoffs, otro guard con el mismo supuesto.** Se buscó en `engine/hooks/` y `automatization/` toda lectura de
  `input.tool_input` sin `&&` ni `|| {}` delante: la de `resulting` era la única. Las demás pasan por `fileOf`,
  `patchOf`, `contentOf` o `rawCommandOf`, que ya lo toleran.
- **Quién manda esas formas.** Lo de Codex y Gemini sigue sin comprobarse, y no hace falta para cerrar: el arreglo
  vale para cualquier forma, venga de quien venga.
- **Prioridad.** No traía condición de escalada.

**Lo que se corrió para saber que funciona.**

- La prueba nueva, en `test/hooks/chat-effects.test.js` («una escritura a la aprobación sin tool_input se frena como
  cualquier otra»). Vista en rojo antes del arreglo: `workspace-boundary lanzó algo que no es un bloqueo: Cannot read
  properties of undefined (reading 'old_string')`.
- Una mutación en una copia fuera del árbol: con la copia en verde, volver a `input.tool_input` sin respaldo puso la
  prueba en rojo con el mismo error.
- La reproducción del caso sobre `ops bench suelto`, con el motor arreglado. El control y las formas 2, 3 y 4 dan las
  cuatro `BLOQUEADO: …/planning/.ops-approval es la aprobación de una persona, y escribírsela es aprobarse solo. …` con
  `exit=2`. Una escritura sin `tool_input` a `README.md` sigue pasando con `exit=0`.
