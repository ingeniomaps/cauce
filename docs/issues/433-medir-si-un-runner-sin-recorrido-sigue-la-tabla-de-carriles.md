---
caso: 433
titulo: no está medido si Antigravity, Codex y Gemini corren las fases que la tabla de carriles le da a cada tarea
estado: resuelto
resuelto-en: 0.114.0
prioridad: media
version-detectada: 0.114.0
---

# 433 — Medir si un runner sin recorrido sigue la tabla de carriles de `PROTOCOL.md`

**🟢 resuelto en 0.114.0** · detectado en 0.114.0 · prioridad **media**, subida desde baja por la condición que traía: la medición
encontró un carril que dos runners no respetan del todo.

## Resumen

Desde 0.114.0 (caso 431), `PROTOCOL.md` dice en una tabla qué fases corre cada carril, y una prueba la compara con el
recorrido de Claude. En Antigravity, Codex y Gemini no hay recorrido: el skill de `autobuild` y el comando de Gemini
mandan a esa tabla, y lo que corre lo decide el agente que la lee. Que el agente la siga no está medido.

## Reproducción

1. Una instancia instalada con el runner, fuera del árbol, con identidad de git en cada repositorio y un `app` con
   `npm test`.
2. Una tarea por carril (`express`, `directo`, `lite`, `full`) en la cola, de a una.
3. `agy -p "/cauce:autobuild"`, `codex exec "/autobuild"` o `gemini -p "/cauce:autobuild"` en la carpeta de sesión.
4. Leer la conversación guardada fase por fase —en `agy`, `~/.gemini/antigravity-cli/conversations/<id>.db`, tabla
   `steps`— y anotar, por tarea, si hubo plan, crítica, revisión y QA, contra la fila de su carril.

## Síntoma

Medido el 2026-10-21, con el skill y el comando de 0.114.0. Fueron tres instancias fuera del árbol, una por runner,
cada una con una tarea `express` (subir una constante) y una `full` (una función con un caso de error), corridas con
el recorrido sin rol. Codex corrió con `--dangerously-bypass-hook-trust` (caso 434).

| Runner | `express` | `full` |
|---|---|---|
| `agy` 1.4.4 | Sigue la tabla: nombra «WIP · Build · Verify · Commit · Done, sin fases de planificación, crítica ni QA»; `done/` trae `qa: n/a` y `review: n/a` | Sigue la tabla: cuenta Ready, Decompose, Plan, **Critique** y WIP, después Review, Verify, Commit y QA; `done/` trae la QA ejercitada desde Node y la revisión de dos cargos |
| Codex 0.162.1 | Sigue la tabla: `qa: n/a — el carril express no ejecuta QA`, `review: n/a` | Hizo Ready, la estimación, el plan, la prueba en rojo, la revisión con una mutación y la mención del contrato de QA. **No hay crítica del plan** en su salida. Y paró antes del commit pidiendo una confirmación que ningún texto de Cauce pide («el protocolo exige tu confirmación en este gate») |
| Gemini 0.63.0 | Sigue la tabla: `review: n/a — carril express no convoca revisor según PROTOCOL.md`, y la QA es la comprobación de Verify | Hizo Ready, Decompose, el plan en el WIP, Review, Verify y QA. **No hay crítica del plan** en su salida |

La lectura es de la salida de cada runner y de lo que dejó en `done/`, no de una fase que el motor pueda comprobar. Que
`agy` haya criticado el plan lo dice él: no queda rastro aparte. Que Codex y Gemini no lo hayan hecho es ausencia en su
salida, que es más fuerte que su palabra, pero sigue siendo una muestra de una tarea por runner.

## Causa raíz

En estos runners el carril es una instrucción y no una fase, que es el segundo tradeoff del 431. La tabla dice
«Critique» en `full`, y la fase que la nombra en el protocolo es «Plan y Critique» (`PROTOCOL.md`, paso 6): dos de tres
agentes la leyeron como un solo paso de planificar. La confirmación antes del commit de Codex no sale de ningún texto
instalado (se buscó «confirm» junto a «commit» en el `AGENTS.md`, el protocolo y el skill de esa instancia, sin
resultado): es del agente.

## Fix propuesto

Ya no es «ninguno antes de medir»: dos runners se saltearon una fase. Hay dos caminos, y elegir es una decisión de
producto, no de este caso:

- **Más texto.** Partir el paso 6 de `PROTOCOL.md` en «Plan» y «Critique», y que el skill diga qué deja la crítica
  escrita. Es barato, y sigue siendo una instrucción.
- **Algo que el motor lea.** Que cada fase deje su marca en el WIP —un renglón por fase corrida— y que `check` compare
  las marcas de una tarea cerrada con la fila de su carril. Es la forma en que el 430 volvió comprobable el rol. Más
  caro: toca el formato del WIP, el skill de los tres runners y `check`.

## Contexto de descubrimiento

Cierre del caso 431, 2026-10-21. Las corridas reales del 430 se instalaron antes del cambio de la tabla, así que no
sirven de medición.

## Relacionados

- 431 (la tabla). 430 (el rol, que en los mismos runners también es una instrucción). 435 y 436, que salieron de
  este cierre.

## Cierre

**Resuelto en 0.114.0**, 2026-10-22. El dueño eligió entre los dos caminos del «Fix propuesto» con la medición a la
vista: el texto partido y, de la otra opción, la pieza chica que sí lee el motor.

- **`PROTOCOL.md`, paso 6.** Ahora dice «Plan» y, aparte y antes del WIP, «Critique»: atacar el plan una vez y dejar la
  objeción más fuerte, y qué cambió por ella, en `## Crítica` del WIP —que ahora está en el contrato de
  `wip/README.md`—. Done la copia a `done/<slug>.md`.
- **Un campo nuevo en `done/`, `critique:`.** Lo lee `engine/planning/parser.js`, y `doneCeremonyWarnings`
  (`engine/planning/done-entry.js`) cuenta las entradas `full` que no lo traen y nombra las que dicen `n/a`. Es un
  aviso y no una falla, por lo mismo que el cruce de `review:`. `done/README.md` explica el campo.
- **El recorrido de Claude** (`automatization/workflows/autobuild.js`) arma la línea con `critiqueLine`: lo que cambió
  el plan, las condiciones y lo anotado, o «aprobado sin objeciones, sobre <lo que miró>». La escribe en `## Crítica`
  del WIP y se la pasa a Done como `critique=`. Si la tarea la cierra otra sesión —la que revisa, o una corrida que se
  reanudó—, Done la copia del WIP. En un carril que no critica, va `n/a — el carril <carril> no corre Critique`.

El caso, sección por sección:

- **Resumen, «que el agente la siga no está medido».** Se midió, y es la tabla del Síntoma.
- **Síntoma, `express` en los tres runners.** Los tres siguieron la tabla. No pide arreglo.
- **Síntoma, `full`: Codex y Gemini sin crítica.** Es lo que se arregló. Se volvió a medir con el texto definitivo
  de la rama, instalado tal cual, sin editar nada en el banco. Fueron cinco instancias fuera del árbol con la misma
  tarea `full`:

  | Runner | Corridas | `critique:` en `done/` |
  |---|---|---|
  | `agy` 1.4.4 | 1 | la objeción («una aserción laxa sobre el error permitiría pasar con `Error` genérico…») y el cambio del plan |
  | Codex 0.163.0 | 1, el 2026-10-22 | «objetó que JavaScript podía devolver `Infinity` si se omitía la guardia; se añadió la aserción de `RangeError` y mensaje exacto» |
  | Gemini 0.63.0 | 3 | dos con la objeción y el cambio; una con `n/a — sin revisión`, y ahí `check` avisó `dividir declara(n) lane: full sin crítica del plan en critique:` |
  | Claude, recorrido | 1, cortada y reanudada | la `## Crítica` del WIP, la misma en la corrida que criticó y en la que cerró |

  Antes de partir el paso, Codex y Gemini no criticaron en ninguna corrida. Con el paso partido, y sin el campo nuevo,
  Codex criticó y escribió `## Crítica`, y Gemini criticó pero no copió la objeción a `done/`. Esa omisión es la que
  justifica el campo y su aviso.

  La corrida de Gemini sin crítica salió mal entera, no sólo en eso. No pudo commitear: el guard de verify rechazó un
  `git -C` con variable, como está diseñado, y Gemini no reintentó con la ruta literal. Además dejó `done/` con
  `tests:` mal formado. Su propio resumen dice que hizo una «fase Critique virtual». En las otras dos corridas de
  Gemini ese guard no lo frenó. Fue una de tres, así que no sale como caso.

  Codex primero no se pudo volver a medir: se quedó sin cuota («try again at Nov 19th, 2026»). Volvió a tenerla el
  mismo 2026-10-22, y la corrida de la tabla —`gpt-5.6-terra`, porque el modelo por defecto de la CLI está rechazado
  para esta cuenta— cerró la tarea con su crítica en `done/` y sin avisos de `check`.

- **Síntoma y Causa raíz, la confirmación que Codex inventó antes del commit.** Es del agente y no de un texto. No se
  pudo volver a medir, por la cuota. Sale como caso propio, el **435**. Se aplazó hasta que Codex tuviera cuota, y con cuota no se
  reprodujo: está descartado.
- **Fix propuesto, «algo que el motor lea».** Se tomó una parte y la otra se descartó:
  - Se tomó la crítica. Es la fase que faltaba, y tiene contenido verificable: la objeción misma.
  - Se descartó una marca por fase en el WIP. El WIP se limpia en Done, así que la marca tendría que vivir en
    `done/`. La escribe el mismo agente, así que atrapa la fase que admite haber salteado y no la que dice haber hecho
    sin hacerla. Ese mismo límite vale para `critique:`, y comprobar la crítica contra el diff salió como caso propio,
    el **436**. Se aplazó, y se resolvió el mismo día a pedido del dueño.
- **Prioridad, subida a media por «un carril que dos runners no respetan».** Ese carril es el que se arregló.

Lo que el caso no preveía:

- **Un riesgo de lectura en el separador, que la corrida real no mostró.** `critiqueLine` unía las objeciones con
  «; », que es también el separador de los hechos del prompt de Done. Lo vi al leer el prompt de la corrida real y lo
  di por defecto. Después se comprobó en `done/dividir.md` de esa corrida: las tres objeciones llegaron enteras, con
  sus «; ». Lo mismo pasó con el `review=` de la misma corrida, que traía «salió con exit 0; los dos casos aparecen»
  y llegó completo. El agente que escribe la entrada no corta ahí. Igual se separan ahora con « | », y un «;» dentro
  de una objeción pasa a «,», que no cuesta nada y saca la ambigüedad.
- **La primera corrida de Claude se cortó con Done ya lanzado**: la sesión `claude -p` terminó antes que el
  recorrido. Reanudarla en el mismo banco probó, de paso, el camino de copiar desde el WIP: su diario no tiene ninguna
  llamada `critique`, y Done recibió `critique=la sección ## Crítica del WIP, copiada tal cual…`.

**La revisión de los commits de este cierre** (`/code-review 975cf880..HEAD`) trajo nueve hallazgos:

- **El corte por fecha fija nombraba tareas que la instancia cerró antes de recibir el campo.** Una instancia
  guarda de qué versión salió (`cauceVersion`), no cuándo actualizó. Con el corte fijo del 2026-10-22, quien
  actualizara un mes después iba a ver nombradas todas sus tareas `full` de ese mes, sin forma de arreglarlas. Ahora
  la fecha la pone el propio registro: la primera entrada de la instancia que trae `critique:`. Lo anterior se
  cuenta, como un campo nuevo; lo posterior sin el campo, o con `n/a`, se nombra. Así también desaparece otro
  hallazgo, el de la entrada sin `fecha:` que pasaba sin aviso: sin `fecha:` ya era un error de `check`.
- **Un `;` dentro de una objeción podía cortar la crítica en el prompt de Done.** La primera respuesta fue mandar el
  hecho con `JSON.stringify`. La segunda pasada mostró que eso era peor: el pedido dice copiar textual, y Done podía
  copiar también las comillas, con las que `n/a` deja de reconocerse. Quedó texto sin comillas, con los «;» pasados
  a «,».
- **El contrato del WIP no tenía `## Crítica`**, y el prompt pide seguirlo exactamente. Se agregó a
  `wip/README.md`, con por qué vive ahí y no sólo en DONE.
- **«Antes del WIP» y «en el WIP» en el mismo paso 6.** Ahora dice «antes de Build», y que la sección va en el WIP
  que persiste el paso 7.
- **Los docs decían «la objeción más fuerte» y el recorrido escribe todas.** Ahora dicen «al menos la más fuerte».
- **El WIP no viaja entre sesiones, así que quien revisa no vería `## Crítica`.** No hace falta cambiar nada:
  `teamwork.md:239` ya exige que quien revisa use el id de quien construyó, porque `--role review` toma sólo el WIP de
  su propio id. Es el mismo camino por el que viaja `## Evidencia de Build` desde el caso 430.
- **Dos sobre el arreglo de `EPIPE`, que es del 428.** Están anotados en su cierre.

**La segunda pasada, sobre los arreglos de la primera**, trajo siete:

- **Las comillas del JSON.** Es lo de arriba, y se volvió atrás.
- **El pedido de copiar del WIP iba entre los hechos como si fuera el valor.** Ahora es una frase aparte, y la
  `critique=` sólo aparece cuando hay un valor.
- **Contar diluía la omisión nueva entre las viejas.** Con 200 entradas de antes, la tarea de hoy sin crítica se
  perdía en el número. De ahí sale la fecha por instancia de arriba, que vuelve a nombrarla.
- **El texto de ejemplo de `## Crítica` en el contrato del WIP se habría copiado como si fuera una crítica.** Ahora
  el ejemplo es `n/a — todavía no corrió`. Si la crítica no lo reemplaza, Done copia el `n/a` y `check` lo nombra.
- **La prueba había perdido el borde de lo viejo.** Volvió: una entrada anterior a la primera con el campo se cuenta
  y no se nombra.
- **`review=` y `build=` también llevan texto de agente sin proteger.** No se cambió: la corrida real de hoy
  trajo un `;` dentro de `review=` y llegó entero a `done/`. Medido no es un defecto, así que no sale como caso.
- **`failureOf` se exporta sólo para la prueba.** No hace falta cambiarlo: es el patrón del archivo, que ya exporta
  `limits` por lo mismo.

**Prueba.**

- `test/planning/done.test.js`, «una tarea full sin crítica del plan se nombra desde que la instancia escribe el
  campo, y lo de antes se cuenta». Cuenta la entrada anterior a la primera con el campo. Nombra la posterior sin el
  campo y la que tiene `n/a`. No nombra ni la que tiene crítica, ni la `lite`. Y es aviso, no error.
- `test/workflows/autobuild-critique-record.test.js`. Cubre:
  - la crítica sin objeciones, en el WIP y en Done;
  - lo que cambió el plan, más una condición con `;` adentro, que llega con `,`, y dos anotadas separadas por « | »;
  - `lite` con `n/a`;
  - y el rol `review`: no lleva `critique=` entre los hechos, y el pedido dice que la copie del WIP.
- Catorce mutaciones, todas en rojo en una copia del árbol con las pruebas nuevas, corridas sobre el código final
  después de las dos pasadas:
  - no nombrar la `n/a`;
  - no nombrar lo posterior sin el campo;
  - nombrar todo, sin la fecha de la instancia;
  - contar en cualquier carril;
  - que el parser no lea el campo;
  - dejar el `;` dentro de la objeción;
  - `critique=` vacío entre los hechos;
  - sacar el pedido de copiar del WIP;
  - no guardar la crítica;
  - perder lo que cambió el plan;
  - no escribirla en el WIP;
  - que el rol `review` diga `n/a`;
  - y las dos del `EPIPE` del 428.
- Las corridas reales de la tabla de arriba, que costaron USD 7,00 y USD 4,52 las dos de Claude.
