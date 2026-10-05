---
caso: 257
titulo: verify deja pasar dentro de la sesión un commit que a mano bloquea
estado: abierto
prioridad: alta
version-detectada: 0.100.0
---

# 257 — El guard `verify` no frenó en la sesión un commit con la suite en rojo; el mismo hook, corrido a mano sobre el mismo árbol, bloquea

**🔴 abierto** · detectado en 0.100.0 · prioridad **alta**.

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

**No se encontró.** Lo descartado y lo que queda:

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
