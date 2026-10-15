---
caso: 382
titulo: Ready deja pasar una aceptación que depende de algo que todavía no existe, y la duda aparece al final
estado: abierto
prioridad: media
version-detectada: 0.106.0
---

# 382 — Una aceptación con «cuando exista X» pasa Ready, se construye, se revisa y se verifica, y recién al cerrar se escala como ambigua

**🔴 abierto** · detectado en 0.106.0 · prioridad **media** — la pregunta costó el recorrido entero de la tarea antes
de hacerse, y además no hacía falta: la respuesta estaba en la propia tarea.

## Resumen

La tarea `ejemplo-en-correo-y-celular` decía: «el del celular cambia con el país». La épica decía que el selector de
país es otra tarea, todavía sin construir. Ready la dio por lista (`"ready": true, "needsHuman": false`). Plan,
Build, Review (aprobado), Verify (309 de 309) y QA corrieron. Después, la fase que busca decisiones abiertas escribió
`planning/human/ejemplo-en-correo-y-celular.md` y la corrida paró con `acceptance-ambiguous`:

> El criterio «El ejemplo del celular corresponde, cuando exista, al país del selector» no dice qué habría que
> aserciar.

El trabajo estaba hecho y en verde, sin commit. La persona lo commiteó a mano y resolvió la fila leyendo lo
construido: el ejemplo ya seguía al país del prefijo, que hoy da la ruta y mañana el selector.

## Reproducción

Corrida `wf_81ce8e36-77f`, instancia `acme-ops`, Cauce 0.106.0. Resultado final:
`{"stopped":true,"reason":"acceptance-ambiguous","detail":"El ejemplo del celular corresponde, cuando exista, al país del selector"}`.
Orden de los agentes de esa tarea en el `journal.jsonl`: claim, ready (true), plan, wip, build, build-debt,
review, review-noted, qa, human-row, planning-block. La fila humana se escribe **después** de QA.

## Síntoma

- Una tarea construida y verificada queda sin commit y bloqueada.
- La duda que la frena es de redacción, y la habría frenado Ready antes de gastar Plan y Build.

## Causa raíz

Sin establecer. Dos lecturas:

1. Ready recibe la aceptación de la línea del backlog, y la condición «cuando exista» la agregó Plan al interpretar
   la tarea: Ready no la vio.
2. La búsqueda de decisiones abiertas corre sólo al final, sobre lo que el plan dejó escrito como supuesto.

## Fix propuesto

- Correr la búsqueda de decisiones abiertas **antes de Build**, sobre el plan aprobado: un supuesto que no se
  responde leyendo la tarea, la épica o el código frena ahí.
- O que Plan no pueda introducir un «cuando exista» sin marcarlo como dependencia (`(depende:)`) o fuera de
  alcance.

## Tradeoffs

Mirar antes de Build agrega una lectura a cada tarea; en `express` y `directo` se puede omitir.

## Contexto de descubrimiento

Mismo hito que el caso 380. La persona que destrabó la fila no tuvo que decidir nada: la respuesta estaba en la
línea de la tarea y en el código construido (R13: si la respuesta está escrita, se lee).

## Segunda ocurrencia (2026-10-15)

Corrida `wf_b32d7c2f-7fb`, tarea `selector-de-pais-en-el-celular` (`full`): 14 agentes, ~1,6 M tokens. Ready dio
`true`, la crítica aprobó con condiciones, Build, Review (aprobado) y Verify (417 de 417, tres mutaciones en rojo)
corrieron, y recién `verify-human` escaló el criterio «Fuera de alcance: normalización del 9/15 de AR y default
«país del aliado»» como ambiguo. Las dos exclusiones tenían respuesta escrita: la primera era otra tarea de la misma
cola, y la segunda una regla de la épica sin fuente en el front. Igual que la primera vez, el trabajo quedó en verde y
sin commit, y lo cerró la sesión.

Agrega una forma al caso: una nota de **fuera de alcance** escrita dentro de la aceptación se trata como una condición
que necesita aserción y mutación, cuando sólo marca la costura con otra tarea.

## Relacionados

- 378 — una corrección de la aceptación que no llegaba al replan.
- 380, 381.
