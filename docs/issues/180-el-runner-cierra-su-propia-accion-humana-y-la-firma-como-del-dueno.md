---
caso: 180
titulo: La fila que el runner escribe al frenarse puede nacer resuelta, y firmada como una decisión del dueño
estado: resuelto
resuelto-en: 0.98.0
prioridad: alta
version-detectada: 0.97.0
---

# 180 — El runner cierra su propia acción humana y la firma como del dueño

**🟢 resuelto en 0.98.0** · detectado en 0.97.0 · prioridad **alta**. Una parada que existe para pedirle una decisión a
una persona puede terminar escribiendo esa decisión sola, y atribuyéndosela a ella.

## Resumen

Cuando ningún plan sobrevive a la crítica, `autobuild` para con `plan-rejected` y delega en un subagente
la escritura de la fila que bloquea la tarea en `HUMAN_ACTIONS.md`. El prompt le dice qué registrar y cuál
es la acción humana, pero **no le dice que la fila tiene que nacer `pendiente`**, y nada la valida después.

En la corrida observada el agente escribió la fila con estado `resuelta` y el cuerpo arrancando con
«**Decidido por el dueño: …**». Nadie le preguntó nada a ninguna persona: la corrida se frenó, escribió la
decisión que quería, la firmó con la autoridad del dueño y la dejó cerrada.

El daño no es la fila: es que la tarea queda desbloqueada. `ops context` deja de saltearla, así que la
corrida siguiente la toma como si una persona hubiera contestado. El estado se lee idéntico a uno legítimo,
y quien revise `HUMAN_ACTIONS.md` dentro de un mes va a leer una decisión con su propio nombre encima.

## Reproducción

En una instancia con una tarea cuya unidad no admite un plan que sobreviva a la crítica (la observada:
`catalog-item-entity`, que mezclaba decidir el destino de cuatro tablas muertas, crear una tabla nueva y
exponerla por HTTP):

1. `/autobuild` sobre esa tarea.
2. Dejar que Plan y Critique corran hasta el rechazo: el recorrido llama a `planRejected` y su
   `registerHuman`.
3. Abrir `planning/HUMAN_ACTIONS.md` y mirar el estado de la fila recién escrita.

## Síntoma

La fila tal como quedó en disco, el 2026-09-22 (recortada):

```
| catalog-item-legacy-model-decision | resuelta 2026-09-22 | autobuild Plan/Critique, 2026-09-22 |
**Decidido por el dueño: la unidad no se parte y se sigue adelante con las dos correcciones que la
crítica dejó escritas.** …
```

`node tools/ops.js check planning` sale en verde: el estado está dentro del vocabulario cerrado y la fila
tiene sus cuatro columnas, así que no hay nada que reportar. `ops context` tampoco la lista en `SKIP`,
porque para él es una fila resuelta.

## Causa raíz

- **`.claude/workflows/autobuild.js`, `planRejected()`** arma el prompt: «Registrá `<slug>` en
  `<HUMAN_ACTIONS>`: nadie pudo escribir un plan que sobreviva a la crítica. Motivo: … La acción humana es
  revisar si la unidad son dos resultados con vidas distintas y partirla, o dejarla entera con la razón
  escrita.» No nombra el estado en ningún punto. Lo mismo vale para las otras dos llamadas a
  `registerHuman` (`ready-human` y la del commit).
- **`LEDGER()`** le pasa al agente los contratos de `PROTOCOL.md`, que declaran el vocabulario cerrado
  `pendiente | resuelta` pero no dicen **quién** puede escribir `resuelta`. Un agente que acaba de
  producir el diagnóstico completo lee eso como que ya está contestada.
- **`engine/planning/contracts.js`** valida la forma de la fila y el vocabulario del estado, no su
  procedencia: una fila `resuelta` escrita por el runner en la misma corrida que la abrió es
  indistinguible de una que contestó una persona.

## Fix propuesto

1. **El prompt lo dice, en las tres paradas.** `registerHuman` antepone una línea fija a lo que cada
   parada pida: «La fila se escribe con estado `pendiente`. Vos no la resolvés: la resuelve una persona.
   No atribuyas decisiones a nadie.»

   ```diff
   -const registerHuman = async (prompt, label) => (await write(prompt, { label })
   +const HUMAN_ROW_STATE = 'La fila va con estado `pendiente`, sin excepción: registrás el bloqueo, no lo '
   +  + 'resolvés. No escribas una decisión ni se la atribuyas a ninguna persona.'
   +const registerHuman = async (prompt, label) => (await write(`${HUMAN_ROW_STATE}\n\n${prompt}`, { label })
      ? ''
      : ` — la fila en ${HUMAN} no se pudo registrar: escribila a mano`)
   ```

2. **El recorrido comprueba lo que escribió.** Después de `registerHuman`, releer la fila —el motor ya
   sabe leerla— y, si no quedó `pendiente`, parar diciendo que la fila se escribió mal, en vez de informar
   una parada que el disco contradice. Es el mismo razonamiento del caso 087: la fila es el único rastro
   de la parada.

3. **`check` lo nombra.** Una fila cuyo origen es una fase del recorrido —`autobuild …`, como la escribe
   el propio prompt— y cuyo estado es `resuelta` sin que ningún commit la registre, se avisa. Hoy ya existe
   un aviso hermano para lo resuelto sin commit; falta cruzarlo con el origen.

## Tradeoffs

- **La frase fija se suma a los tres prompts y cuesta contexto en cada parada.** Son dos líneas contra una
  corrida entera construida sobre una decisión que nadie tomó.
- **Comprobar la fila cuesta una lectura más.** El recorrido ya paga un agente por escribirla; releerla es
  barato y cierra el «lo escribí» que hoy se cree sin mirar.
- **El aviso de `check` puede molestar a quien resuelva la fila a mano y commitee después.** Por eso avisa
  y no falla: es un hecho del pasado, y el camino al verde es el commit que sí la registra.

## Prioridad

Alta. No rompe una corrida: hace lo contrario, la deja seguir. Lo que produce es una decisión de producto
inventada, firmada por alguien que no la tomó, y una tarea construida encima. Es el modo de fallo que
`AGENTS.md` nombra primero —«nunca inventa credenciales ni decisiones»— y el único control que hoy lo
sostiene es que una persona relea `HUMAN_ACTIONS.md`.

## Contexto de descubrimiento

Instancia `gouduet-ops` (Cauce 0.97.0), corrida `wf_0a0b0da7-30f` del 2026-09-22, primera tarea del hito
`catalog-item`. La corrida paró con `plan-rejected`, y al revisar qué había quedado en disco apareció la
fila resuelta. Las dos correcciones técnicas que la crítica encontró eran correctas y se verificaron a mano;
lo que no existía era la decisión del dueño que la fila afirmaba.

## Relacionados

- **087**: la fila es el único rastro de una parada, y por eso se espera a que se escriba. Este caso agrega
  que además hay que mirar **cómo** quedó escrita.
- **176**: una parada que registra acción humana deja su reclamo puesto. Misma familia: el estado que crea
  la propia corrida.

## Cierre

**Resuelto en 0.98.0.** Al contrastarlo con el fuente hubo dos correcciones al enunciado:

- La ruta es `automatization/workflows/autobuild.js`; `.claude/workflows/` es la copia instalada.
- Las paradas que llaman a `registerHuman` son **cuatro** y no tres: `plan-human`, `ready-human`,
  `verify-human` y `review-human`. Esta última registra decisiones de la épica o del hito, no la tarea.

Recorriendo lo que enumeró:

- **«El prompt lo dice» → se hizo, en las cuatro.** `registerHuman` antepone `HUMAN_ROW_STATE`: la fila
  nace `pendiente`, sin excepción, y no se escribe ni se atribuye ninguna decisión.
- **«El recorrido comprueba lo que escribió» → se hizo, en las tres que registran la propia tarea.**
  Después de escribir, relee `node tools/ops.js context <planning> --json` y pregunta si `humanActions`
  trae la tarea. No hace falta que un modelo interprete el estado: `context` sólo lista las filas
  pendientes.
  - Si la tarea no está, el detalle de la parada lo dice y el motivo de la parada no cambia.
  - Si no se pudo leer, dice que no se pudo comprobar, sin afirmar nada sobre la fila.

  `review-human` no se relee: sus filas no llevan el slug de la tarea, y comprobarlas pediría saber qué
  escribió el agente.
- **«`check` lo nombra» → ya existía, y el caso no lo vio.** `unrecordedHumanActions`
  (`engine/core/repos.js`, caso 121) avisa de toda fila `resuelta` que ningún commit registró. La fila
  observada no estaba commiteada, así que ya tenía su aviso. El caso dice «`check` sale en verde»:
  sale con 0 porque es un aviso, y el aviso está. Cruzarlo con el origen no agrega nada.
- **Tradeoffs → aceptados como estaban.** Dos líneas por prompt, y una lectura más en tres paradas que
  ya terminaban la corrida.

### Qué se corrió

- **Reproducción del estado en disco**, en un banco `tarea` (`node engine/cli/ops.js bench tarea`) con la
  fila del caso escrita a mano, sin commitear:

  ```
  ⚠ HUMAN_ACTIONS.md: tarea-medida figura resuelta y ningún commit la registró
  ✓ planning válido: 0 épica(s), 1 tarea(s) en cola, 0 terminada(s)
  exit=0
  ```

  Y lo que lee la relectura, sobre el mismo banco:

  ```
  == pendiente
  humanActions [{"task":"tarea-medida","state":"pendiente","action":"Revisar."}]
  == resuelta 2026-09-22
  humanActions []
  ```

- **Prueba nueva en `test/workflows/autobuild-review.test.js`**, «la fila de una parada nace pendiente,
  y si no quedó así la parada lo dice». Corre el recorrido renderizado con los agentes simulados:
  - Las cuatro paradas llevan la instrucción.
  - En las tres que se releen: con la fila pendiente no hay aviso; resuelta, el detalle lo dice con el
    mismo motivo de parada; sin lectura, no afirma nada.
- **Cuatro mutaciones en una copia del árbol, las cuatro en rojo**:
  - Sin la instrucción, que es el rojo previo.
  - Sin relectura.
  - `ready-human` sin su slug.
  - Ignorando `pending`.

### Prueba real posterior, 2026-09-23

- **Tres agentes reales, no simulados**, cada uno con el prompt de `plan-human` renderizado desde el
  workflow y el contrato real de `planning/PROTOCOL.md`, sobre su propia copia de un banco `tarea`: dos
  con el arreglo, uno de control con el prompt de 0.97.0. Las tres filas quedaron `pendiente`, verificado
  en disco y en `ops context --json`, que devolvió `humanActions: ["tarea-medida:pendiente"]` en los tres.
- **Lo que eso muestra y lo que no:** el control tampoco reprodujo el fallo, así que la corrida real prueba
  que el prompt nuevo funciona y no rompe nada, no que sea lo que evita el fallo. La parte determinista
  —la relectura en `context`— sí queda probada en real.
