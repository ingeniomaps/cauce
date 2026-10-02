---
caso: 244
titulo: aplicar una propuesta escribe casos que nadie firmó
estado: abierto
prioridad: media
version-detectada: 0.100.0
---

# 244 — Aplicar una propuesta escribe casos que nadie firmó

**🔴 abierto** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe nada visible, pero cambia lo que se mide de un cargo sin que nadie lo apruebe, y
lo hace por regla: va a pasar en cada aplicación de una propuesta que agregue una `required` sin traer su caso.

## Resumen

Los dos recorridos del ciclo se contradicen sobre quién decide los casos. `agent-propose` dice que un caso
nuevo se enuncia en la propuesta y **no** se crea, porque «cambiar el denominador de la evaluación es parte de
lo que se aprueba». `agent-promote`, al aplicar, dice que si la propuesta agrega una conducta a `required` y no
pide su caso, el agente lo escribe igual y lo reporta como desviación. El resultado es un caso redactado por el
agente que aplica, sin firma, dentro del contrato.

## Reproducción

`/agent-promote qa-engineer` sobre la propuesta de 2026-10 firmada (corrida `wf_a0107882-07d`, 2026-10-02,
sobre `a820452e`). La propuesta agrega `matches_declared_blocking_force_to_actual_effect` a `required` y da por
suficiente el caso 13, sin pedir uno nuevo.

## Síntoma

La aplicación creó `evaluations/cases/16-blocking-row-scope.md`, que la propuesta no pide. Su propia
desviación dice: «El enunciado, el identificador y los cuatro comportamientos son de redacción mía».

## Causa raíz

- `automatization/workflows/agent-promote.js`, fase «Aplicar»: «Si la propuesta agrega una y no pide el caso,
  escribilo igual […] y reportalo como desviación». Se agregó el 2026-09-02 porque al juez sólo le llegan las
  prohibidas, y una requerida sin caso no la mide nada (medido ese día: 4 de 48 requeridas sin caso).
- `automatization/workflows/agent-propose.js`: pide el enunciado de un caso sólo para una **prohibida** nueva,
  no para una requerida. El hueco que la regla de `agent-promote` tapaba nace acá.

## Fix propuesto

- `agent-promote`: si una requerida no trae caso, no lo escribe. La reporta como desviación («requerida sin
  caso: pedirlo en la propuesta siguiente»).
- `agent-propose`: si agrega una requerida, enuncia también el caso que la ejerce, para que llegue a la firma.

## Tradeoffs

Hasta que la propuesta siguiente la pida, una requerida sin caso queda sin medir. Antes la tapaba un caso sin
firma; ahora queda dicha en la propuesta aplicada. Es lo que decidió Manuel el 2026-10-02.

## Contexto de descubrimiento

Al aplicar las propuestas de 2026-10, el primer cargo (`qa-engineer`) trajo dos casos nuevos. Uno, el 15, estaba
enunciado en la propuesta y entró con su firma. El otro, el 16, no, y se retiró.

## Relacionados

- **242**: el otro camino por el que el ciclo pedía o salteaba firmas que no correspondían.
