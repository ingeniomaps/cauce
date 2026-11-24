---
caso: 564
titulo: un gate que muere por una señal sale como «exit null», y un 137 como un exit más
estado: resuelto
resuelto-en: 0.125.0
prioridad: baja
version-detectada: 0.124.0
---

# 564 — El bloqueo de `verify` no distingue un gate muerto por memoria

**🟢 resuelto en 0.125.0** · detectado en 0.124.0 · prioridad **baja**: el arreglo apunta al tope de tiempo cuando lo que faltó fue memoria.

## Resumen

`engine/hooks/shell.js` (`run`) no devolvía la señal, y `engine/hooks/verify.js` (`failure`, `howItReads`) escribía `exit ${status}`: un gate muerto por `SIGKILL` salía como «exit null», y el 137 con que npm reporta ese mismo SIGKILL, como un exit más. Antes del tope los dos son casi siempre falta de memoria.

## Reproducción

Una raíz con `verify: "kill -KILL $$"` y otra con `verify: "exit 137"`, y un commit.

## Síntoma

`verify (exit null, …)` y `verify (exit 137, …)`, sin más.

## Causa raíz

`engine/hooks/shell.js`, `run`: no pasaba `result.signal`. `engine/hooks/verify.js`, `failure`: tomaba `result.status`.

## Fix propuesto

`run` devuelve la señal; `failure` la muestra en lugar del código, y con una señal o un 137 antes del tope antepone «casi siempre es falta de memoria».

## Tradeoffs

- Es una pista, no un diagnóstico: un 137 puede salir de otro lado.

## Contexto de descubrimiento

Auditoría del 2026-11-24 sobre lo que una instancia real construyó por su cuenta desde la anterior (2026-11-21), buscando lo que sirve a cualquier empresa. Medido acá, no tomado de la instancia. En la instancia, una muerte por memoria se informaba como corte por tiempo y el arreglo apuntaba al tope equivocado.

## Relacionados

- 240 — el tope de los gates.
- 550 — la memoria libre antes de correrlos.

## Cierre

- **Fix, la señal en el bloqueo**: se hizo (`engine/hooks/shell.js` devuelve `signal`; `engine/hooks/verify.js` la muestra).
  La pista de memoria quedó sólo para `SIGKILL` y 137, porque un `SIGTERM` o un `SIGSEGV` no son memoria.
- **Lo que la revisión agregó**: el búfer de los gates pasa de 1 MB a 256 MB —una suite verde y verbosa fallaba en Verify,
  y con la pista se leía como «lo mató SIGTERM»—, el exceso de búfer se nombra y mata al grupo; la señal queda también
  en la evidencia; y la línea de error no se recorta por la pista ni por un rojo vencido.
- **Anotado sin caso**: un gate que no puede arrancar (ENOENT) sigue saliendo como «exit null»; es previo.

Lo que se corrió: `verify` real con `kill -KILL $$`, `exit 137`, `kill -TERM $$` y una salida de 2 MB
(`test/hooks/verify-bounded.test.js`), rojo antes y verde después. Cinco mutaciones en una copia, las cinco rojas: sin la
pista, sin la señal en el estado, toda señal como memoria, el búfer de 1 MB y la evidencia sin señal.

**Sin probar:** un gate de verdad muerto por falta de memoria.

### Lista de cierre

1. hecho: «exit null» y «exit 137» sin más, con el motor anterior.
2. hecho: rama `fix/cases-from-an-instance-audit-2`.
3. hecho: las pruebas nuevas en rojo antes y en verde después.
4. hecho: cinco mutaciones en una copia, las cinco rojas.
5. no aplica: agrega información al bloqueo; no quita nada.
6. hecho: `verify` real sobre commits reales, sin dobles.
7. no aplica: no depende de un modelo, un runner ni un sistema externo.
8. hecho: las pruebas corrieron con el motor final.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: dependían `shell.js` (`run`, que usan otros guards: el campo nuevo no cambia lo que ya leían) y la evidencia de `verify`.
11. hecho: cinco pasadas de `/code-review` sobre el diff de la tanda y una sexta acotada a los últimos cambios; cada hallazgo de lo que esta tanda empeoraba se arregló, y lo previo o menor quedó anotado en el cierre que le toca.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios (repetidos y doce palabras) pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1999 de 1999, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que la revisión agregó.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.125.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.125.0.
