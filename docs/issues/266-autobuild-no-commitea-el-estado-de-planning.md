---
caso: 266
titulo: autobuild no commitea el estado de planning
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 266 — Al cerrar una tarea, `autobuild` deja el estado de planning escrito y sin commitear

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no pierde nada, pero cada corrida termina con trabajo suelto en la instancia y una
pregunta a la persona —«decidir dónde se commitea el estado de planning»— que la regla del 253 ya contesta.

## Resumen

La fase Done escribe `done/<slug>.md`, saca la tarea de la cola, deja el WIP en IDLE y suelta el reclamo.
Ninguna fase commitea eso. El commit del producto sí tiene su fase; el de planning queda para quien cierra.

## Reproducción

Dos corridas reales de `autobuild` en un banco sidecar instalado, 2026-10-05.

## Síntoma

Al terminar cada una, en la instancia:

```
 M planning/BACKLOG.md
 M planning/HUMAN_ACTIONS.md
?? planning/done/alta-exige-email.md
?? planning/inbox/propuestas/
```

Y la sesión lo devolvió como pendiente: «El estado de planning está sin commitear […] Decidir dónde se
commitea el estado de planning».

## Causa raíz

`automatization/workflows/autobuild.js`: después de Done no hay ningún paso que commitee `planning/`.

## Fix propuesto

Un paso después de Done que commitee el estado de planning de la tarea, con la regla del 253: en la rama
en la que está la instancia, y si ésa es viva y el proyecto no pidió commitear ahí, en la rama de trabajo
de planning que ya exista, o en una nueva si no hay ninguna. Gobernado por `runner.commitPerTask`, como
el commit del producto.

## Tradeoffs

- Toda instancia empieza a recibir commits de planning del recorrido en su próximo `upgrade`.
- Que falle no puede frenar una entrega que ya se hizo: se dice y se sigue.
- En una instancia embebida, planning vive en el repositorio del producto y el commit cae en la rama de la
  tarea.

## Contexto de descubrimiento

Las corridas reales de la tanda 248-263.

## Relacionados

- 253 — a qué rama va el estado de planning.
- 251 — el paso de Commit no corta rama.

## Cierre

**Resuelto en 0.101.0.** Después de Done hay un paso que commitea el estado de planning de la tarea, con
`runner.commitPerTask` como interruptor y la regla de ramas del 253.

### El recorrido de lo que este caso enumeró

- **Fix — se hizo.** La rama de trabajo que corta, si no hay ninguna, es `work/planning`.
- **Tradeoff «toda instancia empieza a recibir commits de planning» — se paga**, y va dicho en el CHANGELOG.
- **Tradeoff «que falle no puede frenar una entrega que ya se hizo» — se hizo**: lo que no se commitea, o
  queda en la rama viva sin que el proyecto lo haya pedido, se avisa y la corrida sigue.
- **Tradeoff de la instancia embebida — no se midió.** Por lectura, cae en la rama de la tarea.
- **Síntoma, la pregunta «decidir dónde se commitea» — se va**: la contesta el paso.

### Qué se corrió

- **Antes y después en el arnés**: no había ningún prompt que commiteara planning; ahora hay uno después
  del de Done, con la regla de rama, que no se lanza con `commitPerTask` apagado.
- **Seis mutaciones en rojo**, en una copia.
- **Dos sondas con un agente real y un repositorio de verdad**, con el prompt literal, comprobadas en el
  disco:
  - Sin ninguna rama de trabajo y parado en `main`: cortó `work/planning` y commiteó ahí los tres archivos
    de planning. `main` quedó en el commit base.
  - Con `work/planning` ya existente, vuelto a `main` con otro cierre sin commitear que chocaba con lo que
    la rama ya tenía: se pasó a `work/planning`, resolvió el choque y commiteó ahí. La rama quedó con los
    dos cierres y `main` no se movió.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: el paso dentro de un `autobuild` entero, y una instancia embebida.

### Corridas enteras del 2026-10-05, en sesiones interactivas

Dos corridas reales de `autobuild` manejadas por una terminal virtual, en modo `auto`, con el motor de
este cambio: un banco sidecar con la raíz declarada como carpeta de repositorios y dos tareas del mismo
servicio, cortado a propósito en Build y retomado; y un banco con una instancia embebida.

Sidecar: la instancia quedó en `work/planning` con dos commits, `close alta-exige-email` y `close
baja-marca-inactivo`, y `main` intacto. Embebida: el commit de planning cayó en la rama de la tarea, con
sólo archivos de planning. Las dos dejaron dos cosas que salieron como casos: `check` contaba ese commit
como trabajo sin anotar (270) y el checkpoint del hito quedaba sin commitear (271).
