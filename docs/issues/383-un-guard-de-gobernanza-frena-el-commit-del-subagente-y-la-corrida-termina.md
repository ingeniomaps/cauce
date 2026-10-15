---
caso: 383
titulo: un guard que pide aprobación frena el commit del subagente y la corrida termina en commit-failed
estado: abierto
prioridad: media
version-detectada: 0.106.0
---

# 383 — El commit de una tarea que toca un archivo protegido frena en el subagente, que no puede esperar la aprobación; la corrida termina y deja el trabajo stageado

**🔴 abierto** · detectado en 0.106.0 · prioridad **media** — pasó dos veces en el mismo día, en el mismo hito, con
el trabajo revisado y verificado. La sesión que lanzó la corrida commiteó lo mismo sin que el guard la frenara.

## Resumen

Una tarea de la instancia toca un archivo que su guard de gobernanza protege (una prueba de `automatization/tests/`,
o `planning/FLOW.md`). El agente de Commit stagea y commitea; el guard lo frena con «el commit toca gobernanza
protegida» y pide la confirmación de una persona en el chat o una línea en `.ops-approval`. El subagente no puede
esperar una respuesta, así que reporta `commit-failed` y la corrida termina. La tarea queda con Review, Verify y
QA en verde, los archivos stageados, y un commit de planning que la marca bloqueada.

## Reproducción

Instancia `acme-ops`, Cauce 0.106.0:

- `wf_f5bfe724-2e7`, tarea `tanda-lenta-a-pedido`: «guard-shell.sh blocked the commit … It treats
  automatization/tests/regresion.test.js as protected governance. I can't wait for an answer as a subagent».
- `wf_0cede9ec-53e`, tarea `flow-pide-la-regresion`: lo mismo con `planning/FLOW.md` y una prueba nueva.

En los dos casos la sesión principal hizo después ese mismo commit; en el segundo el guard no la frenó.

## Síntoma

- `{"stopped":true,"reason":"commit-failed", …}` con el trabajo bueno.
- Un commit `chore(planning): block <tarea>` que hay que deshacer a mano al cerrar.
- La corrida no sigue con la próxima tarea del hito.

## Causa raíz

El guard es de la instancia, no del motor: la aprobación que pide sólo la puede dar la persona en el chat
principal. Lo del motor es que el recorrido no sabe, antes de Build, que la tarea va a necesitar esa aprobación, y
la pide en el peor momento: con todo pagado y sin nadie que conteste.

## Fix propuesto

- Antes de Build, preguntarle a los guards de commit si los archivos del plan van a pedir aprobación (un modo «sólo
  decir»), y si es así pedirla al lanzar o parar ahí, antes de gastar.
- O que `commit-failed` por una aprobación pendiente deje la tarea en un estado reanudable («lista para commitear»)
  y no bloqueada, sin el commit de bloqueo, para que la sesión sólo tenga que confirmar.

## Tradeoffs

Preguntar antes depende de que los guards de la instancia tengan ese modo; los que no lo tengan siguen frenando al
final.

## Contexto de descubrimiento

Épica de una regresión de autenticación en la instancia: la mitad de sus tareas tocaban pruebas del propio sistema
de procesos, que la instancia protege como gobernanza.

## Relacionados

- 380 — una tarea así es candidata natural a hacerse a mano.
