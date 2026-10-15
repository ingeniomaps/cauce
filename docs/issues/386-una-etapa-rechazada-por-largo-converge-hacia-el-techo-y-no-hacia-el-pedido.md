---
caso: 386
titulo: una etapa rechazada por largo converge hacia el techo y no hacia el pedido
estado: resuelto
resuelto-en: 0.108.0
prioridad: media
version-detectada: 0.108.0
---

# 386 — Cuando el primer intento de una etapa se pasa del techo, los reintentos recortan de a pocos caracteres hacia el número del rechazo y el recorrido muere igual

**🟢 resuelto en 0.108.0** · detectado en 0.108.0 · prioridad **media** — el prompt ya no nombra el techo y `summary`
admite 1500; la misma corrida que murió llegó al final sin un solo `summary` rechazado.

## Resumen

El arreglo del caso 379 pide en el prompt de cada etapa menos de lo que el esquema admite —`summary` hasta 800 con
el techo de 1000 a la vista— y se midió sobre `feasibility-review`, donde las tres etapas entraron al primer intento.
Sobre `change-review` la etapa `exposure` recibió ese mismo prompt y devolvió 1273 caracteres. A partir de ahí el
rechazo del esquema le dice «must NOT have more than 1000 characters (got 1273)», y el agente toma ese número por
objetivo: 1073, 1048, 1011, 1002. Cinco intentos, agotados a dos caracteres del techo, y el recorrido termina en
`stage-unavailable` con cuatro etapas ya escritas y sin `decide`.

El 379 corrige cuánto se pide; esto es cómo se recorta cuando igual se pasó. El rechazo nombra el techo y no el
pedido, así que el margen que el 379 abrió desaparece en el primer reintento.

## Reproducción

Banco por caso de `flow-eval` sobre `change-review`, caso `08-el-arreglo-que-alcanza-una-sola`, con el `flow.js`
renderizado desde la rama que trae el 379 (`make eval-workflows` en el worktree y `workflow({ scriptPath })` hacia
esa copia, porque el registro de la sesión era anterior al arreglo).

- Corrida `wf_832df69b-d21`, 2026-10-15: `scope`, `correctness`, `evidence` y `operability` pasan; `exposure` falla
  con `StructuredOutput retry cap (5) exceeded … /summary: must NOT have more than 1000 characters (got 1002)`.
  El transcript del agente registra los cinco intentos: 1273, 1073, 1048, 1011, 1002. El prompt que recibió
  contiene «summary hasta 800 caracteres (el esquema admite 1000)».

Costo: 1 058 980 tokens, diez agentes, sin veredicto. Las dos corridas del 2026-10-14 sobre el mismo caso, antes del
379, murieron en etapas distintas con 1002 y 1036.

- Corrida `wf_ca470ef7-b45`, mismo día, con una línea más en el prompt que decía que el número del rechazo es el
  techo y no el objetivo y que recortara hasta el pedido: el recorrido llegó al final y el caso pasó, y la línea no
  cambió nada visible. Cinco de seis etapas se pasaron al primer intento —`scope` 1023, `correctness` 1093 y 1004,
  `exposure` 1006, `operability` 1239, 1043, 1016 y 1003, `decide` 1167— y las seis terminaron entre 952 y 994:
  recortaron hasta quedar justo bajo el techo, nunca hasta los 800 pedidos. `operability` entró en el quinto
  intento, con un reintento de sobra. Catorce agentes, 1 567 309 tokens.
- Corrida `wf_163f7913-5b7`, `technical-design` 05 con el prompt del 379 sin la línea: `interface` 1001,
  `decide` 1209, `service` 1129, 1016 y 1001; las tres entraron después. Mismo patrón en otro recorrido.

## Síntoma

```
parallel[2] failed: agent({schema}): StructuredOutput retry cap (5) exceeded — 5 failed calls with no valid
output — last StructuredOutput error: Output does not match required schema: /summary: must NOT have more than
1000 characters (got 1002)
```

y el recorrido devuelve `{"stopped": true, "reason": "stage-unavailable", "detail": "una etapa del nivel no devolvió
resultado"}`.

## Causa raíz

`automatization/workflows/flow.js`, el prompt de etapa: el agente escribe al número más alto que ve. El prompt del
379 le muestra dos —«hasta 800 (el esquema admite 1000)»— y el agente apunta al segundo: primeros intentos entre
1001 y 1273 en tres corridas y dos recorridos, con el pedido de 800 ignorado. Y el rechazo del runtime vuelve a
nombrar el techo, así que cada reintento recorta lo justo para acercarse a él. Con cinco reintentos y 273
caracteres de exceso, no llega.

## Fix propuesto

Dos cosas, y las dos en `flow.js`. El prompt deja de nombrar el techo: pide 800 y nada más, para que el único
número a la vista sea el pedido. Y el esquema sube `summary` a 1500: el margen entre lo que el agente escribe
cuando le piden 800 y el techo tiene que absorber el conteo impreciso, y 1000 no lo absorbía. Sigue lejos de los
6000 en que el modelo envuelve la respuesta como string, que es lo que el comentario del esquema cuida.

Lo que se probó antes y no sirvió: una línea en el prompt diciendo cómo recortar ante un rechazo —que el número
del rechazo es el techo y no el objetivo, que baje hasta el pedido—. Medida en `wf_ca470ef7-b45`: cinco de seis
etapas se pasaron igual y recortaron igual, de a pocos caracteres hasta quedar justo bajo 1000.

Lo refuta una corrida en la que una etapa acumule dos o más rechazos, o en la que los primeros intentos suban
hacia 1500 en vez de quedarse cerca de 800.

## Tradeoffs

- Viaja más entre etapas en el peor caso: hasta 1500 caracteres por `summary` en vez de 1000, reenviados a cada
  etapa posterior (R16). Lo que decide es el pedido de 800, no el techo; el techo es el margen.
- El 379 cerró diciendo «no subir el techo», y esto lo sube. La razón de aquel cierre era el envoltorio a 6000 y
  el costo del handoff; 1500 no toca el primero y el segundo queda dicho arriba.
- Los otros campos con tope —`missing`, `humanAction`, `evidence`— dejan de ver su techo en el prompt y lo
  conservan en el esquema. No se midió que fallaran; se les quita el número por la misma razón y no se les sube
  el margen hasta que una corrida lo pida.

## Contexto de descubrimiento

Segunda ola de los casos traídos del pull de una empresa el 2026-10-14: `change-review` 08 y `technical-design` 05
esperaban al 379 para correr. Con el 379 adentro, el 08 murió en `exposure` mientras el 05 seguía corriendo.

## Relacionados

- 379: el pedido por debajo del techo, que cubre el primer intento.

## Cierre

**Resuelto en 0.108.0**, la misma versión que el 379, que todavía no se publicó: los dos salen juntos. El prompt de
etapa pide `summary` hasta 800, `missing` y `humanAction` hasta 400 y cada evidencia hasta 160, sin nombrar ningún
techo. El esquema sube `summary` de 1000 a 1500 y deja los demás topes como estaban. Los porqués están junto al
esquema y junto al prompt, en `automatization/workflows/flow.js`.

**Lo que se corrió para saber que funciona.** El mismo caso que murió —`change-review` 08, banco por caso de
`flow-eval`, el `flow.js` renderizado desde esta rama— se lanzó el 2026-10-15 como `wf_f766d231-70b`. Los seis
agentes de etapa recibieron el prompt nuevo y ninguno vio la palabra «admite». Resultado, contra las dos corridas
anteriores del mismo día:

| Corrida | Prompt | Techo | `summary` rechazados | Final por etapa | Resultado |
|---|---|---|---|---|---|
| `wf_832df69b-d21` | 800, con el techo a la vista | 1000 | 5, en una etapa | — | muere en `exposure` |
| `wf_ca470ef7-b45` | lo mismo, más cómo recortar | 1000 | 11, en cinco etapas | 952–994 | pasa |
| `wf_f766d231-70b` | 800, sin el techo | 1500 | 0 | 749–1445 | pasa |

El único rechazo de la última fue una suposición de `operability` con 164 caracteres sobre 160, que entró al
intento siguiente. El veredicto del caso fue «pasa» en las dos que llegaron. 1 640 800 tokens, catorce agentes.

**Lo que el caso no preveía.** Sin el techo a la vista los agentes tampoco escriben 800: tres de seis etapas
pasaron de 1000 y `decide`, que sintetiza, llegó a 1445. Eso cumple a medias la refutación que el caso escribió
—«que los primeros intentos suban hacia 1500»—: ninguno la cruzó, y la síntesis quedó a 55 caracteres. El margen
alcanza hoy y es justo para la etapa que más escribe. Si una corrida muere en `decide` por `summary`, lo que sigue
no es subir el techo otra vez sino darle a esa etapa su propio pedido, porque es la única que resume a todas.

Y la línea que decía cómo recortar ante un rechazo no movió nada medible —once rechazos con ella, todos recortando
de a pocos caracteres—, así que se sacó: una instrucción que no cambia la conducta sólo alarga el prompt.

**Recorrido de lo que el caso enumeraba.**

- **Que el prompt deje de nombrar el techo — se hizo**, en los tres campos y no sólo en `summary`.
  `test/flows/flow.test.js` fija que pida 800 y que no aparezca ningún «admite»; se vio en rojo con el prompt
  anterior.
- **Subir `summary` a 1500 — se hizo.** `workflows.test.js` sigue fijando que ningún campo quede sin tope.
- **La refutación — corrida**, con la tabla de arriba: ninguna etapa acumuló rechazos de `summary`; la síntesis
  se acercó al techo, y eso queda dicho como el borde que sigue.
- **Tradeoff, viaja más entre etapas — aceptado**: el pedido sigue siendo 800 y lo que sobra vive en el análisis.
- **Tradeoff, el 379 decía no subir el techo — se hizo distinto**, con la razón arriba; el 379 lo anota.
- **Tradeoff, los otros topes sin margen nuevo — se conserva**: el único rechazo de la última corrida fue uno de
  ellos y entró al reintento siguiente, así que no hay medición que pida moverlos.
