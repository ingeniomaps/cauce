---
caso: 234
titulo: una decisión entra al backlog como tarea
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.99.2
---

# 234 — Nada dice que una decisión pendiente no es una tarea: va a HUMAN_ACTIONS o como precondición

**🟢 resuelto en 0.100.0** · detectado en 0.99.2 · prioridad **baja** — un párrafo en R17, sin regla propia
ni aviso de `check`: la medición mostró un caso en 432.

**Prioridad baja**, y una regla nueva baja a todas las empresas: se mide antes de escribirla.

## Resumen

acme-ops (R19) y globex-ops (P17) tienen la misma regla: al BACKLOG sólo entra trabajo con superficie propia; una decisión va a `HUMAN_ACTIONS.md` y una precondición va dentro de la tarea que la necesita. acme además la acompaña con una heurística en su `check` (una aceptación que niega una acción y se ancla a otra tarea), por una tarea que costó 327k tokens.

## Reproducción

Medido el 2026-10-02 sobre las cuatro instancias reales; los números están en el Cierre.

## Síntoma

Una tarea que no tiene nada que construir gasta una vuelta entera y se cierra sin entregar.

## Causa raíz

R13 y R17 no lo dicen; ninguna regla del sistema habla de qué clase de cosa entra al BACKLOG.

## Fix propuesto

Medir primero; si se confirma, un párrafo en R17 o una regla propia, y la heurística como advertencia de `check`.

## Tradeoffs

- Una regla del sistema cambia lo que recibe cada empresa en su próximo `upgrade`.

## Contexto de descubrimiento

Relevamiento de acme-ops y globex-ops (las dos en Cauce 0.99.2), el 2026-10-01, buscando qué construyeron por fuera de lo que Cauce instala. `acme-ops/planning/rules/process.md` (R19) y `globex-ops/planning/rules/planning.md` (P17).

## Relacionados

- R13 y R17.

## Cierre

Resuelto el 2026-10-02 con un párrafo al final de R17, por decisión de Manuel sobre la medición que el caso
pedía. Lo que la habría desmentido estaba escrito antes de medir: ninguna decisión disfrazada en `done/` ni en
la cola.

**La medición.** Un agente recorrió en sólo lectura `planning/done/` y la cola de cuatro instancias: acme-ops
(207 cerradas, cola vacía), initech (109, 51 en cola), hooli (90, 12) y globex-ops (26, unas 14). Contó como
decisión disfrazada sólo la tarea cuya entrega no construyó nada. Comprobé a mano sus tres citas centrales:

- `initech-ops/planning/done/catalog-item-legacy-model-decision.md:17` y `:22`: «Cerrada a mano tras
  `verify-hollow`» y «su entregable es una decisión escrita»;
- `acme-ops/planning/rules/process.md:415`: «Costó **327k tokens** para que el loop reportara justamente eso».

**Lo que devolvió.** Una estricta en 432 (la de initech, que originó el caso 181), dos dudosas que dejaron un
artefacto o verificaron algo y ninguna en cola. La de acme nunca llegó a `done/`: se plegó como precondición. Es
rara y cara, y eso decidió la forma: una línea en una regla que ya se lee, no una regla nueva.

**Lo que se corrió para saber que llega.** `node engine/cli/ops.js bench suelto --force` armó una instancia
recién creada desde el molde: el párrafo está en su `planning/rules/system/process.md`, y `node tools/ops.js
check planning` sale 0 ahí y sobre `template/planning`.

**Recorrido de lo que el caso enumeraba:**

- **Medir primero** — se hizo; es lo de arriba.
- **Un párrafo en R17 o una regla propia** — un párrafo en R17, que es donde se decide qué entra a la cola y
  cómo se parte. Dice a dónde va la decisión (`HUMAN_ACTIONS.md` o precondición) y por qué pasa las dos barras
  sin ser trabajo. Con un caso en 432, una regla propia sería prosa sin frecuencia que la sostenga.
- **La heurística de acme como advertencia de `check`** — se decidió que no. Con un solo caso en 432 no hay con
  qué calibrar sus falsos positivos, y un aviso que salta sobre tareas legítimas se termina ignorando.
- **Tradeoff: baja a todas las empresas** — aceptado: es un párrafo, y está en el CHANGELOG de 0.100.0.
