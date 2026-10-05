---
caso: 252
titulo: autobuild no lee args y lo que se le pide al lanzarlo no llega a nadie
estado: resuelto
resuelto-en: 0.101.0
prioridad: media
version-detectada: 0.100.0
---

# 252 — `autobuild` descarta sus `args`: una instrucción dada al lanzar la corrida no llega a ninguna fase, y nada lo avisa

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **media**.

**Prioridad media**: no rompe una entrega, pero quien lanza la corrida cree haberle dado una instrucción y
la corrida entera se hace sin ella. En globex costó dos commits en `main` que se habían pedido en rama.

## Resumen

Los otros workflows del toolkit leen `args` —`flow`, `onboard`, `agent-eval`, `flow-eval`,
`agent-promote`, `agent-propose`—. `autobuild` no lo nombra en ninguna línea. Lo que se le pase se
descarta en silencio: no falla, no avisa y ningún prompt lo recibe.

## Reproducción

Leído en el fuente de `0.100.0`:

```
$ grep -c '\bargs\b' automatization/workflows/autobuild.js
0
$ grep -l '\bargs\b' automatization/workflows/*.js
automatization/workflows/agent-eval.js
automatization/workflows/agent-promote.js
automatization/workflows/agent-propose.js
automatization/workflows/flow-eval.js
automatization/workflows/flow.js
automatization/workflows/onboard.js
```

No se corrió en el arnés: el arnés no pasa `args`, así que hoy no tiene cómo mostrar la diferencia.

## Síntoma

Corrida real `wf_259e41f0-42d`, globex, 2026-10-05, lanzada con: «Cada tarea se commitea en una rama
propia cortada de origin/main del repo del servicio, nunca sobre main local. Sin push ni PR.» El agente de
Commit devolvió `branch: "main"` en las dos tareas que entregó.

## Causa raíz

`automatization/workflows/autobuild.js` no declara ni lee `args`. No hay más que eso.

## Fix propuesto

Dos formas, y elegir entre ellas es del dueño:

1. **Que avise.** Si `args` trae algo, la corrida para antes de Triage diciendo que `autobuild` no recibe
   instrucciones por ahí y dónde se declaran —la aceptación de la tarea, las reglas, `ops.config.json`—.
2. **Que viaje.** Una instrucción del operador para la corrida, que llega a Plan, Build y Commit rotulada
   como tal.

La primera es chica y no abre nada. La segunda le da a una frase suelta el mismo peso que a la aceptación
y a las reglas, sin pasar por ninguna de las compuertas que ellas pasan.

## Tradeoffs

- Con la primera, quien ya lanza `autobuild` con texto en `args` por costumbre pasa a ver una parada.
- Con la segunda, una instrucción puede contradecir la aceptación o una regla, y hay que decir cuál gana.

## Contexto de descubrimiento

Al validar el 251 el 2026-10-05. El caso lo contaba como parte de su causa —«los `args` no llegan a Build
ni a Commit»—; al buscar por dónde se perdían, no había ningún lugar donde entraran.

## Relacionados

- 251 — el paso de Commit no corta rama y commitea en la rama viva.
- 177 — la descripción de la tarea no viaja a ninguna fase y el plan vuelve a decidir.

## Cierre

**Resuelto en 0.101.0, por la segunda forma: que viaje.** La recomendación de la revisión era la primera
—parar y avisar—, y se eligió la otra por el criterio del dueño del 2026-10-05 de quitar frenos y dejar
sólo los importantes: una parada por haber pedido algo es un freno, y lo que una persona pide al lanzar
la corrida se cumple. **Es una lectura de quien lo construyó**, no una decisión que el dueño haya tomado
sobre este caso.

`autobuild` lee `args` —el texto, o su campo `note`— y lo pasa a Plan, Build y Commit como pedido de
quien lanzó la corrida.

### El recorrido de lo que este caso enumeró

- **Fix 1, que avise — se decidió que no**, por lo de arriba.
- **Fix 2, que viaje — se hizo.**
- **Tradeoff «una instrucción puede contradecir la aceptación o una regla, y hay que decir cuál gana» — se
  hizo**: el prompt dice que mandan la aceptación y las reglas, y que la contradicción se dice.
- **Tradeoff «le da a una frase suelta el mismo peso que a la aceptación» — acotado, no eliminado.** No
  llega a Review, que sigue juzgando contra la aceptación y las reglas. Que un agente real respete el
  orden cuando chocan no está medido.
- **Resumen, «no falla, no avisa y ningún prompt lo recibe» — se fue**: tres lo reciben.

### Qué se corrió

- **Antes y después**: `grep -c '\bargs\b' automatization/workflows/autobuild.js` daba 0; ahora el arnés
  pasa `args` y los prompts de Plan, Build y Commit traen el pedido, como texto y como `{ note }`.
- **Seis mutaciones, las seis en rojo**, en una copia: `args` sin leerse —que es lo quitado—, sólo el texto
  suelto, cada una de las tres fases sin recibirlo, y el pedido sin la línea que lo pone por debajo de la
  aceptación.
- **Lo que no se corrió**: una corrida real lanzada con un pedido.

### Corrida real del 2026-10-05

En un banco sidecar instalado fuera del árbol, sesión de Claude Code con `/autobuild`, tarea `full`, lanzada con «Los mensajes de error del producto van en inglés.»: el código entregado lanza
`Error('email is required')` en un repositorio cuyo resto está en español. La crítica, que no recibía el
pedido, lo marcó como supuesto sin contrastar; ahora lo recibe como dato, en las dos críticas.
