---
caso: 559
titulo: en stop, un guard del proyecto que falla o se pasa de tiempo frena el cierre de la sesión
estado: resuelto
resuelto-en: 0.125.0
prioridad: media
version-detectada: 0.124.0
---

# 559 — En `stop`, un guard del proyecto que no contesta frena el cierre

**🟢 resuelto en 0.125.0** · detectado en 0.124.0 · prioridad **media**: con la máquina cargada, un guard de cierre pesado se pasa del plazo y la sesión no puede terminar aunque el planning esté sano.

## Resumen

`engine/hooks/project-guards.js` frena cuando un guard del proyecto falla, no termina o no se puede ejecutar, en todo evento. En `stop` eso contradice el criterio que el motor ya aplica a sus propios guards (`CANNOT_STOP`, `engine/hooks/run.js`, caso 467): un defecto del guard no ata la sesión a no poder cerrar. `stop_hook_active` evita el bucle, pero cuesta una vuelta forzada.

## Reproducción

Una instancia con `guards.stop` declarado, y `executeAll(['planning-drift'])` con tres guards: uno que sale con 1, uno que tarda más que el plazo (0,3 s en la prueba) y uno que frena con 2.

## Síntoma

```
falla.sh: FRENA: [guards/falla.sh] el guard que declara guards.stop en ops.config.json salió con 1: roto, y un guard que no contesta frena.
tarda.sh: FRENA: [guards/tarda.sh] el guard que declara guards.stop en ops.config.json no terminó dentro de los 0.3 s…
frena.sh: FRENA: [guards/frena.sh] no cierres
```

## Causa raíz

`engine/hooks/project-guards.js`, el final de `judge`: el `block` del guard que no contesta no mira el evento.

## Fix propuesto

En `stop`, el que no contesta devuelve un aviso con el mismo diagnóstico y deja cerrar. El que contesta con 2 sigue frenando: eso es una decisión del guard, no un defecto.

## Tradeoffs

- Es una quita (R29): se sostiene con la salida de antes y la de después sobre los mismos tres guards, y con la prueba de que el que frena con 2 sigue frenando.
- Un guard de cierre que de verdad vigila algo y además se cuelga deja de frenar ese cierre; el aviso lo dice, y la parada siguiente lo vuelve a correr.

## Contexto de descubrimiento

Auditoría del 2026-11-24 sobre lo que una instancia real construyó por su cuenta desde la anterior (2026-11-21), buscando lo que sirve a cualquier empresa. Medido acá, no tomado de la instancia. La instancia midió 20,5 s de reloj con 4,7 s de CPU en su guard de cierre, contra los 20 s del plazo.

## Relacionados

- 467 — `CANNOT_STOP`.
- 428 — los guards del proyecto.

## Cierre

- **Fix, en `stop` el que no contesta avisa**: se hizo (`engine/hooks/project-guards.js`, `judge`). El que frena con 2
  sigue frenando.
- **Lo que la revisión encontró y esta tanda empeoraba**: con el plazo compartido, un guard lento dejaba al siguiente en
  1 ms; si ése iba a frenar con 2, vencía y avisaba, y la sesión cerraba. Cada guard de `stop` arranca ahora con un
  mínimo de 2 s, y el aviso dice qué plazo tenía.
- **Tradeoff, la quita**: antes y después lado a lado abajo.
- **Anotado sin caso**: en `stop`, una lista de `guards` mal escrita frena el cierre (`declaredFor`). Se probó cambiarlo
  y no tiene efecto: ahí `planning-drift` rechaza la configuración en `check`, que es su trabajo. Y el mínimo de 2 s
  puede alargar un cierre con muchos guards colgados: 20 s más 2 s por guard.

Lo que se corrió: tres guards de `stop` por `executeAll` con procesos reales. Antes: `falla.sh`, `tarda.sh` y `frena.sh`
frenan. Después: los dos primeros avisan y dejan cerrar, `frena.sh` sigue frenando, y uno lento seguido de uno que
frena sigue frenando. Tres mutaciones en una copia, las tres rojas: frenar en `stop`, sin el mínimo, y sin el mensaje
del mínimo.

**Sin probar:** una sesión real que cierre con un guard colgado.

### Lista de cierre

1. hecho: los tres guards de `stop` frenaban con el motor anterior.
2. hecho: rama `fix/cases-from-an-instance-audit-2`.
3. hecho: las pruebas nuevas en rojo antes y en verde después; la que fijaba que un guard roto frenaba el cierre pasó a fijar lo contrario.
4. hecho: tres mutaciones en una copia, las tres rojas.
5. hecho: es una quita; antes y después sobre los mismos tres guards, y la prueba de que el que frena con 2 sigue frenando.
6. hecho: procesos reales de guard por `executeAll`, sin dobles; lo viejo (frenar por un guard roto) se fue.
7. no aplica: la conducta es del motor; el runner sólo recibe el aviso.
8. hecho: las pruebas corrieron con el motor final.
9. hecho: dos guards en el mismo evento, uno lento y uno que frena.
10. hecho: dependía `project-guards.test.js`, que fijaba el freno en `stop` y se actualizó con su razón.
11. hecho: cinco pasadas de `/code-review` sobre el diff de la tanda y una sexta acotada a los últimos cambios; cada hallazgo de lo que esta tanda empeoraba se arregló, y lo previo o menor quedó anotado en el cierre que le toca.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios (repetidos y doce palabras) pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1999 de 1999, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que la revisión agregó.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.125.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.125.0.
