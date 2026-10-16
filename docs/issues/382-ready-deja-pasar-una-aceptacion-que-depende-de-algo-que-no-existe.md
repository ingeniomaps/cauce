---
caso: 382
titulo: Ready deja pasar una aceptación que depende de algo que todavía no existe, y la duda aparece al final
estado: resuelto
resuelto-en: 0.108.1
prioridad: media
version-detectada: 0.106.0
---

# 382 — Una aceptación con «cuando exista X» pasa Ready, se construye, se revisa y se verifica, y recién al cerrar se escala como ambigua

**🟢 resuelto en 0.108.1** · detectado en 0.106.0 · prioridad **media** — la pregunta costó el recorrido entero de la tarea antes
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

## Cierre

**Resuelto en 0.108.1, con una causa que ninguna de las dos lecturas del caso nombraba.** Se leyeron los diarios
de las dos corridas (`journal.jsonl` de `wf_81ce8e36-77f` y de `wf_b32d7c2f-7fb`), siguiendo la aceptación de una fase a la siguiente:

- **Primera ocurrencia.** La línea decía «el del celular cambia con el país». Ready devolvió `ready: true` con un
  `refinedAcceptance` que agregaba «el ejemplo del celular corresponde al país que usa el formulario: hoy el de la
  ruta (…) y, **cuando exista, el del selector**». Verify recibió esa aceptación y marcó como `ambiguous` justamente
  «El ejemplo del celular corresponde, cuando exista, al país del selector». No fue Plan, como suponía la lectura 1.
  La cláusula la escribió Ready, la fase que tenía que frenarla.
- **Segunda ocurrencia.** La línea no traía ninguna nota de fuera de alcance. Ready la refinó agregando «La
  normalización del 9 o el 15 es de `celular-de-argentina-…` y no entra acá. El default «país del aliado» queda
  fuera», y `verify-human` escaló esas dos frases como criterio ambiguo.

Las dos veces, Ready agregó al aclarar algo que no se puede probar y lo dejó como condición. La salida ya existía
desde el caso 140: la marca `(fuera de verify: <razón>)`, que Verify respeta desde el 195 (`declaredOut`). Ready no
sabía que tenía que usarla. Se le preguntó a Manuel cómo arreglarlo, porque había tres caminos, y eligió la consigna
de Ready.

**El arreglo.** La consigna de Ready dice que lo que al aclarar quede fuera de alcance, o dependa de algo que
todavía no existe, no es una condición que se pueda probar: va como tramo propio, separado por «;», con la marca, o
no va.

**Lo que se corrió para saber que funciona.**

- Arnés, `test/workflows/autobuild-queue.test.js`: «Ready escribe lo que no se puede probar como un tramo fuera de
  verify, no como condición». Falla con el `autobuild.js` de antes del cambio y pasa después.
- **Ready real, sobre el escenario saneado de la primera ocurrencia.** Es un banco donde el formulario decide el país
  por la ruta y el selector es otra tarea de la cola que depende de ésta. Se corrió el prompt de Ready volcado del
  arnés con `claude -p`, el 2026-10-16:
  - **Con la línea original** («cambia con el país»), seis corridas, tres con la consigna nueva y tres con la vieja.
    Ninguna escribió la cláusula a futuro: todas acotaron el ejemplo al país de la ruta. No se reprodujo lo que hizo
    la instancia. Una corrida nueva dio `ready: false`, pero porque el banco no le dejaba correr `ops agents list`;
    sobre la tarea dijo que estaba lista.
  - **Con una línea que tienta** («cambia con el país del selector», con el selector sin existir), cuatro corridas.
    Las dos con la consigna nueva dieron `ready: true` y dejaron la cláusula como tramo propio:
    «el ejemplo del celular cambia según el país elegido en el selector (fuera de verify: el selector de país
    todavía no existe, lo trae selector-de-pais-en-el-celular, que depende de esta tarea)».
    Las dos con la vieja dieron `ready: false` y escalaron a una persona con `[PENDIENTE: el selector no existe…]`.
  - USD 0,31 a 0,43 por corrida.

**Recorrido de lo que el caso enumeraba.**

- **Correr la búsqueda de decisiones abiertas antes de Build — se decidió que no.** Agrega una lectura a cada tarea y
  no ataca dónde nace la cláusula, que es Ready.
- **Que Plan no pueda introducir un «cuando exista» sin marcarlo — se hizo distinto.** No fue Plan sino Ready, y la
  marca es `(fuera de verify: …)` y no `(depende:)`. Lo que la cláusula condiciona no es esta tarea sino una parte que
  otra tarea entrega.
- **«Mirar antes de Build agrega una lectura» (tradeoff) — no aplica**: el arreglo no agrega ninguna.
- **«Una nota de fuera de alcance dentro de la aceptación se trata como condición» (segunda ocurrencia) — se hizo**
  en el mismo lugar: es lo que la consigna nueva le pide a Ready al escribirla. Una nota así escrita a mano en la
  línea sigue llegando sin marca. Para eso `check` ya avisa desde el 140 cuando la condición nombra el registro, y
  la marca es la salida documentada en `PROTOCOL.md`.

