---
caso: 257
titulo: verify deja pasar dentro de la sesión un commit que a mano bloquea
estado: resuelto
resuelto-en: 0.101.0
prioridad: alta
version-detectada: 0.100.0
---

# 257 — El guard `verify` no frenó en la sesión un commit con la suite en rojo; el mismo hook, corrido a mano sobre el mismo árbol, bloquea

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **alta**.

**Prioridad alta**: es la puerta que sostiene «no se commitea en rojo», y dejó pasar tres commits con una prueba roja sin
decir nada. Lo que la hace alta es que no avisa: el commit sale igual que uno verificado.

## Resumen

En una sesión de Claude Code sobre este repositorio, `guard-verify.sh` dejó commitear cambios de código
con `npm test` en rojo. Corrido a mano, con la misma entrada y el mismo árbol, el hook tarda 54 s y sale
con 2. **No está establecido por qué**: lo medido es la diferencia, no la causa.

## Reproducción

Medido el 2026-10-05, dos veces.

1. **En el repositorio de trabajo.** Un commit con código y dos casos de `docs/issues/` que nombraban una
   instancia real se creó sin bloqueo. `test/repo/foreign-names.test.js` recorre lo trackeado y esos
   archivos entraban al índice con ese commit; el `npm run ci` siguiente la mostró en rojo.
2. **En un clon desechable**, para aislarlo: un cambio en `engine/core/repos.js` y un `.md` con un nombre
   prohibido, stageados por nombre, y `git -C <clon> commit` desde la sesión. El commit se creó. En ese
   árbol, `node --test test/repo/foreign-names.test.js` da 1 fallo.
3. **El mismo hook a mano**, sobre otro cambio de código stageado en el mismo clon:

   ```bash
   printf '{"tool_name":"Bash","tool_input":{"command":"git -C %s commit -q -m probe"},"cwd":"%s"}' \
     "$CLON" "$REPO" | automatization/hooks/guard-verify.sh
   ```

## Síntoma

A mano:

```
hook exit=2 en 54 s
BLOQUEADO: Verify falló en clon: test (exit 1, 53.8 s): ✖ ningún comentario empieza ni termina a mitad de una oración
No se commitea en rojo.
```

En la sesión: el commit se crea y no aparece ningún mensaje del guard.

## Causa raíz

**Encontrada después; está en el Cierre.** Lo que sigue es lo que se sabía al registrar el caso:

- `OPS_SKIP_VERIFY` no estaba exportada en la sesión (comprobado con `echo`).
- El guard sí corre en la sesión: en la misma sesión bloqueó otros comandos con sus mensajes propios.
- El stage traía código, así que la salida temprana de `engine/hooks/verify.js` por «sin código» no aplica.
- **Hipótesis, sin comprobar**: que el runner corte el hook por tiempo antes de que termine —la suite
  tarda 54 s— y trate el corte como «no bloquea». `.claude/settings.json` no declara `timeout` para
  ninguno de los tres hooks. No se consultó la documentación del runner ni se midió con una suite más
  corta.
- **Hipótesis, sin comprobar**: que el candado de máquina (`holdMachine`) se rinda y deje pasar.

## Fix propuesto

Primero establecer la causa: correr el mismo commit con un gate que tarde 5 s y otro que tarde 90 s, y
ver cuál bloquea. Si es el tiempo, declarar el `timeout` del hook por encima de `gateTimeoutMinutes` y
hacer que el guard, al acercarse al límite, bloquee diciendo que no llegó a verificar, en vez de callar.

## Tradeoffs

- Un `timeout` largo deja cada commit esperando lo que tarde la suite.
- Bloquear por «no llegué» frena commits correctos en una máquina lenta. Es el lado que este guard ya
  eligió para lo que no puede leer: «un guard que no puede verificar no autoriza».

## Contexto de descubrimiento

Al commitear los casos 248 a 256. La puerta entera (`npm run ci`) sí lo vio, un commit tarde: por eso hubo
que rehacer tres commits locales antes de empujar.

## Relacionados

- 240 — verify corre sin cota y escribe en el árbol.
- 258 — verify opina sobre un repositorio que no es el de la sesión.

## Cierre

**Resuelto en 0.101.0. La causa no era el tiempo: era el modo de permisos.**

Cuando Claude Code tiene diálogo de confirmación, un guard no bloquea: le pide al runner que pregunte
(`permissionDecision: "ask"`, caso 221). En el modo `auto` ese diálogo no lo contesta una persona: el
runner lo resuelve solo y la herramienta corre. Así cada bloqueo que pasaba por el diálogo se volvía un
permiso, sin mensaje. Alcanzaba a todos los guards que piden confirmación —`verify`, la aprobación de
gobernanza, el push a una rama de trabajo, la lectura de credenciales—, no sólo a éste. El push a la rama
viva no: ése es un bloqueo que nunca se vuelve pregunta.

`engine/hooks/confirm.js` usa ahora el diálogo sólo en los modos donde está medido que contesta una
persona —`default` y `bypassPermissions`—. En cualquier otro, incluido uno que todavía no exista, el
guard bloquea y la salida vuelve a ser la confirmación por chat.

### El recorrido de lo que este caso enumeró

- **«Primero establecer la causa» con un gate de 5 s y otro de 90 s — se hizo, y desmintió la hipótesis.**
  El de 5 s también pasó: no es el tiempo. La segunda hipótesis, el candado de máquina, tampoco.
- **«Declarar el `timeout` del hook» y «bloquear al acercarse al límite» — se decidió que no**: no era eso.
- **Tradeoffs del timeout — no aplican.**
- **El tradeoff que sí hay**: en `auto`, `acceptEdits` y `plan` el guard ya no abre diálogo; bloquea y pide
  la confirmación por chat. `acceptEdits` y `plan` quedan afuera por no estar medidos, no porque fallen:
  los suma quien los mida.

### Qué se corrió

- **La medición que encontró la causa.** Con una traza temporal en el guard —quitada después—, un commit
  con el gate en rojo desde la sesión dejó: `gates failures=1 unapproved=["a.js"] mode=auto native=true`.
  El guard vio el rojo, vio que nadie lo había aprobado, pidió el diálogo, y el commit se creó.
- **El mismo commit después del arreglo, desde la misma sesión en `auto`**:

  ```
  BLOQUEADO: Verify falló en sonda257b: test (exit 1, 0.1 s): ROJO
  No se commitea en rojo.
  ```

- **Tres mutaciones en rojo**, en una copia: el diálogo volviendo a pedirse en cualquier modo —lo quitado—,
  `auto` contando como contestado, y `default` dejando de usarlo.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: `bypassPermissions`, que queda por la medición del 2026-10-01 que cita
  `confirm.js`; y los otros modos.

### Una sesión real en `auto`, el 2026-10-05

En un banco sidecar recién instalado fuera del árbol, con el motor de este cambio: una sesión de Claude Code lanzada con `--permission-mode auto`, el gate del producto en rojo y
código stageado, con el pedido de crear el commit. Contestó «el commit **no se creó**. Lo frenó el guard
de Verify», nombró la prueba que fallaba y ofreció la confirmación por chat. Comprobado con `git log`: el
repositorio siguió en el commit anterior, con los dos archivos todavía stageados.
