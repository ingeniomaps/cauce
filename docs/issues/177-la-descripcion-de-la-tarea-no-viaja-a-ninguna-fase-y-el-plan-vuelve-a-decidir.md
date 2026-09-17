---
caso: 177
titulo: La descripción de una tarea no viaja a ninguna fase, así que el plan vuelve a decidir lo ya decidido y la crítica lo bloquea citando lo que el plan nunca vio
estado: resuelto
resuelto-en: 0.97.0
prioridad: alta
version-detectada: 0.96.0
---

# 177 — Una compuerta juzga contra un texto que la otra no recibió

**🟢 resuelto en 0.97.0** · detectado en 0.96.0 · prioridad **alta** — la descripción sale del
BACKLOG y llega a las cuatro fases que deciden

## Resumen

Es el gemelo del caso 027, que se resolvió para la épica y dejó la tarea afuera.

La línea de una tarea tiene dos partes: la **descripción** —lo que hay que hacer, con las decisiones ya
tomadas y lo que quedó fuera de alcance— y la **aceptación**, que por contrato describe estado
observable del producto. Las decisiones de diseño no pueden vivir en la aceptación: P19 y el propio
molde piden que ahí vaya lo que se puede mirar, no cómo se implementa.

Esa descripción **no sale del BACKLOG**:

- `taskFromLine` (`engine/planning/parser.js:200-219`) extrae diez campos —`slug`, `tier`, `cast`,
  `epic`, `service`, `acceptance`, `conditions`, `criteria`, `depends`, `noSplit`— y ninguno es la
  descripción. El texto está en `rest` y no se guarda.
- `ops context <planning> --json` devuelve, en `task`, exactamente esos campos: `slug, hito, tier, cast,
  service, acceptance, epic`.
- `autobuild` le pasa a cada fase `task.acceptance` y nada más: Classify (`autobuild.js:621`), Ready
  (`:702`), Plan (`:777`), el replan (`:803`), el WIP (`:827`) y QA (`:872`).

O sea que el agente que planifica recibe el qué observable y **no** las decisiones que alguien ya tomó
sobre ese trabajo. Vuelve a decidirlas, y decide distinto.

**Lo que lo vuelve caro es la asimetría.** La crítica sí abre `BACKLOG.md` —nada se lo prohíbe: el
preámbulo de `SCOPE` (`autobuild.js:454-459`) sólo pide no releer los cuatro archivos del contrato— y
bloquea el plan citando la línea palabra por palabra. Una compuerta juzga contra un texto que la otra
no recibió, y la corrida entera se paga para descubrirlo.

## Reproducción

1. Una tarea cuya descripción decida algo que la aceptación no puede expresar: dónde vive un símbolo,
   qué queda fuera de alcance, con qué se produce la evidencia.
2. Correr `autobuild`.
3. El plan decide eso otra vez, por su cuenta.
4. La crítica lo bloquea citando la descripción.

## Síntoma

Dos corridas reales sobre la misma tarea, el 2026-09-17:

| Corrida | Parada | Tokens | Qué objetó la crítica |
|---|---|---|---|
| `wf_64836c14-321` | `plan-rejected` | 1,10 M | el plan eligió un método de prueba que la línea ya había descartado |
| `wf_6677a316-390` | `plan-blocked` | 815 k | cuatro objeciones, **todas** «la línea ya decidía esto» |

Las cuatro de la segunda, textuales del veredicto: metió en el alcance una función que la descripción
declara fuera —y con eso rompía una invariante—, no incluyó la sonda que la descripción nombra como
artefacto de `qa:`, puso el vocabulario como constante local en vez del módulo que la descripción
indica, y propuso un doble que la descripción había descartado con su razón.

Ninguna de las cuatro decisiones estaba en la aceptación. Ninguna podía estarlo.

## Causa raíz

- **`engine/planning/parser.js:200-219`**: la descripción se parsea y se descarta.
- **`engine/cli/…` → `ops context`**: emite el `task` sin ella, así que ningún consumidor puede pasarla.
- **`automatization/workflows/autobuild.js`**: seis prompts arman su pedido con `task.acceptance`.

Ninguna de las tres está equivocada por su cuenta. Lo que falta es que el campo exista.

## Fix propuesto

Que la descripción viaje, igual que viajó el contexto de la épica cuando se cerró el 027.

1. `taskFromLine` guarda `description`: lo que hay en `rest` antes de `_Aceptación:`, sin los marcadores
   `(service: …)`, `(cast: …)`, `(depende: …)`.
2. `ops context` la emite dentro de `task`.
3. `autobuild` se la pasa a **Ready, Plan, Critique y Build**. A Ready porque es quien juzga si la tarea
   está lista; a Plan y Build porque son quienes deciden; a Critique porque hoy la lee igual y conviene
   que las dos compuertas miren lo mismo.

Y conviene decir en el prompt qué es: *decisiones ya tomadas sobre esta tarea; no se re-deciden, y lo
que contradiga esto es un hallazgo, no una preferencia*.

## Tradeoffs

La descripción crece con cada corrida que aprende algo —la que originó este caso llegó a 4.800
caracteres— y viaja a cuatro fases, así que se paga varias veces por corrida. Es el mismo costo que el
027 aceptó para el contexto de la épica, y la alternativa se midió acá: casi dos millones de tokens en
dos corridas que terminaron sin escribir una línea.

Si el tamaño molesta, el recorte correcto es de quien escribe la línea y no del motor: una descripción
de 4.800 caracteres suele ser una tarea que ya debía partirse.

## Prioridad

**Alta.** No depende de nada raro: pasa siempre que una tarea tenga una decisión que la aceptación no
puede expresar, que es toda tarea que ya sobrevivió a una parada. Y el modo de fallo es el peor de los
baratos — el plan sale razonable, la crítica lo bloquea con razón, y nadie puede señalar qué se hizo
mal, porque nadie hizo nada mal.

## Contexto de descubrimiento

Instancia de venotal (sidecar), 2026-09-17, sobre 0.96.0. Una tarea —`integraciones-status-y-conteo`,
después partida en tres— consumió **siete corridas y ~5 M de tokens sin commitear una línea**. Cuatro
paradas fueron útiles y encontraron defectos reales; dos fueron el caso 176; y las dos de la tabla de
arriba son éste. La tarea terminó construida a mano por una persona y sus subagentes, con la revisión
del cast sobre el diff real: el código salió en un commit, y las decisiones que el recorrido no recibía
estaban escritas desde tres corridas antes.

**Consultado para escribir esto**: `engine/planning/parser.js` (líneas 188-219) del paquete
`@ingeniomaps/cauce@0.96.0` instalado en `venotal-ops/node_modules`; la salida de
`ops context planning --json`; `automatization/workflows/autobuild.js` en su copia instalada (líneas
454-459 y las seis que usan `task.acceptance`: 621, 702, 777, 803, 827, 872); y los veredictos de las dos
corridas nombradas.

## Relacionados

- **027** (resuelto en 0.61.0) — el mismo hueco para la épica: «la tarea llega con su qué y sin su
  porqué». Se cerró agregando `epicContext`; con épica vacía, la tarea vuelve a llegar sin nada.
- **081** (resuelto en 0.77.0) — qué hacer cuando nadie puede planificar la unidad. Funcionó acá: la
  corrida registró la costura. Lo que no dice es que el planificador no tenía los datos.
- **176** — el otro defecto que apareció en la misma tanda: el reclamo que se bloquea a sí mismo.

## Cierre

**Resuelto en 0.97.0, por el camino que el caso propone.** Las tres anclas se abrieron antes de tocar
nada: `taskFromLine` devolvía diez campos y ninguno era la descripción, `context` emitía el `task` sin
ella, y los prompts armaban su pedido con `task.acceptance`.

Recorriendo lo que enumeró:

- **«`taskFromLine` guarda `description`» → se hizo.** Es `rest` sin la aceptación y sin los marcadores
  del contrato. Los marcadores se enumeran por su clave —`epic:`, `service:`, `cast:`, `depende:`,
  `sin partir:` y el criterio `(→ CN)`— y no como «cualquier paréntesis», porque la descripción usa
  paréntesis igual que cualquier prosa y recortarlos se llevaría puesta una aclaración.
- **«`ops context` la emite dentro de `task`» → se hizo.** Con la tarea y no aparte: quien la reciba
  tiene que poder leerla al lado de su aceptación, que es contra lo que se contrasta.
- **«`autobuild` se la pasa a Ready, Plan, Critique y Build» → se hizo, a las cuatro**, y la prueba las
  mide una por una. Que una sola se quede sin ella reproduce el defecto entero: una compuerta juzgando
  contra un texto que la otra no vio.
- **«Conviene decir en el prompt qué es» → se hizo, y es una sola frase en un solo lugar.** «Lo que la
  línea de la tarea ya decidió, y no se re-decide acá». Sin ese rótulo se lee como contexto opinable, que
  es exactamente cómo el plan la trataba cuando la leía la crítica.
- **«El tamaño se paga cuatro veces por corrida» → aceptado, con la razón del propio caso.** El recorte
  correcto es de quien escribe la línea: una descripción de 4.800 caracteres suele ser una tarea que ya
  debía partirse. La alternativa está medida: 1,10 M y 815 k tokens en dos corridas sin una línea escrita.

Y lo que apareció arreglándolo:

- **Una puerta que ya existía atrapó una de las mutaciones.** Al quitarle `description` al schema del
  recorrido, `test/workflows/workflows.test.js` falló con «autobuild lee un campo que el schema no acepta,
  y lo va a recibir vacío para siempre». Es la misma forma que el caso 027 dejó cuidada para
  `epicContext`, y acá sirvió sin que nadie la tocara.

### Qué se corrió

- **Rojo previo en los dos extremos**: el parser devolvía `description: undefined`, y las cuatro fases no
  la recibían.
- **Tres mutaciones, las tres en rojo**, una por eslabón: el parser deja de guardarla; el schema del
  recorrido deja de aceptarla —atrapada por la puerta preexistente—; y una sola fase se queda sin ella.
- Comprobado corriendo que el recorte es el correcto: `taskFromLine` sobre una línea con aceptación y los
  cinco marcadores devuelve `description: "El padrón se consulta por documento; ..."` y
  `acceptance: "el alta responde 409 ante un documento repetido."`, cada uno en su campo.
- `npm run ci` exit 0: **924 pruebas**, 0 en rojo, 0 salteadas.

### De dónde salió

Lo registró otra sesión midiendo una instancia real, con dos corridas y sus números. Es el gemelo del
caso 027, que resolvió lo mismo para el contexto de la épica y dejó la tarea afuera.
