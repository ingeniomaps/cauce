---
caso: 383
titulo: un guard que pide aprobación frena el commit del subagente y la corrida termina en commit-failed
estado: resuelto
resuelto-en: 0.109.0
prioridad: media
version-detectada: 0.106.0
---

# 383 — El commit de una tarea que toca un archivo protegido frena en el subagente, que no puede esperar la aprobación; la corrida termina y deja el trabajo stageado

**🟢 resuelto en 0.109.0** · detectado en 0.106.0 · prioridad **media** — pasó dos veces en el mismo día, en el mismo hito, con
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

El guard es del motor —`engine/hooks/governance.js`, con un patrón fijo de rutas—, aunque el caso lo diera por de la instancia: la aprobación que pide sólo la puede dar la persona en el chat
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

## Cierre

**Resuelto en 0.109.0, con la primera opción y la mitad de la segunda.** Al contrastar el caso apareció lo que cambiaba
la elección: el guard no es de la instancia sino de Cauce (`engine/hooks/governance.js`), y su patrón de rutas es fijo.
El motor sí puede saber antes de construir qué va a frenar, sin pedirle nada a los guards de la empresa. La elección
entre las dos opciones se le preguntó a Manuel, porque cambia cómo se comporta el recorrido, y eligió avisar antes de
Build.

**Lo que se corrió para saber que funciona.**

- Arnés, `test/workflows/autobuild-governance.test.js`: tres pruebas. Con el `autobuild.js` de `main` fallan dos: la
  parada antes de Build y la parada del Commit sin «block». La tercera, que sigue si la pregunta falló o no hay nada
  pendiente, mide que el aviso no pare de más.
- CLI, `test/planning/governed.test.js`: tres pruebas. Las tres fallan antes de que el comando existiera
  (`Comando desconocido: governed`).
- Seis mutaciones en una copia del árbol, las seis en rojo:
  - la parada sin mirar `readOk`;
  - la parada apagada;
  - la aprobación pendiente del Commit por `halt`, que vuelve a hacer el commit «block»;
  - `governedOf` dejando pasar todo;
  - el CLI sin descontar `.ops-approval`;
  - el CLI sin resolver desde el servicio.
- **El guard real contra el comando, sobre un banco** (`ops bench suelto`). Con `automatization/tests/regresion.test.js`,
  `planning/FLOW.md` y `app/alta.js` stageados, se corrió el guard como lo corre un subagente, sin prompt en la sesión, y
  `ops governed` sobre los mismos tres archivos:
  - sin aprobación, los dos nombran `automatization/tests/regresion.test.js` y `planning/FLOW.md`, y el guard frena con
    exit 2;
  - con `planning/FLOW.md` aprobado, los dos nombran sólo la prueba;
  - con las dos aprobadas, `pending: []` y el guard sale con 0.
  - `app/alta.js` no aparece nunca.
- **La consigna de la llamada nueva, con un agente real.** Se corrió con `claude -p` sobre una copia del banco fuera del
  repositorio y devolvió `{"readOk": true, "pending": ["automatization/tests/regresion.test.js"]}` sin escribir nada.
  Costó USD 0,24.
- **Lo que no se corrió de verdad:** que el agente de Commit, frenado por el guard dentro de un recorrido real, reporte
  `needsApproval`. Con `claude -p` no se puede reproducir, porque el prompt cuenta como chat y el guard exime al chat
  (caso 126). Eso queda medido sólo en el arnés: que se le pide, y qué hace el recorrido cuando lo contesta.

**Recorrido de lo que el caso enumeraba.**

- **Preguntarle a los guards antes de Build si los archivos del plan van a pedir aprobación — se hizo distinto**: no se
  le pregunta al guard, que no tiene un modo «sólo decir», sino a `ops governed`, que usa la misma función del guard
  (`governedOf`) y descuenta el mismo `.ops-approval`. La corrida para antes de construir y nombra qué aprobar. Deja su
  fila en `human/`, como pide `PROTOCOL.md` para toda parada que necesita a una persona, y suelta la reserva como las
  otras paradas de antes de construir. El commit de planning dice `await governance approval for <tarea>` y no
  «block». Si la pregunta no se puede hacer, sigue, porque el guard frena igual al commitear. Cuesta un agente de
  oficina por tarea con plan. Una tarea mecánica no pasa por esta pregunta, porque su plan no trae archivos: ahí el
  aviso sigue llegando en el Commit.
- **Que `commit-failed` por una aprobación pendiente deje la tarea reanudable, sin el commit de bloqueo — se hizo la
  mitad**: para con `commit-needs-approval`, sin commit de planning y sin fila, y deja el WIP y el reclamo puestos.
  Es la única parada sin commit de planning, y a propósito: el índice tiene el trabajo de la tarea, así que ese commit
  se lo llevaba puesto o lo frenaba el mismo guard. Reanudar todavía repite Review, Verify y QA. Saltar directo al Commit era la opción que no se eligió: pide guardar en el WIP que esas
  fases pasaron y comprobar que el árbol no cambió.
- **«Los guards que no tengan ese modo siguen frenando al final» — no aplica**: la pregunta no depende de los guards
  sino del motor. Lo que sigue frenando al final es un archivo que el plan no nombró, y ahí aplica la parada del
  Commit.

**Lo que encontró la revisión del conjunto** (`/code-review` sobre la rama entera, antes del PR):

- La parada de antes de construir no dejaba fila en `human/`, y `PROTOCOL.md` la pide para toda parada que necesita a
  una persona. Ahora la deja, suelta la reserva y commitea con un asunto que dice qué espera.
- La primera pasada pidió lo mismo para la parada del Commit, y la segunda mostró por qué no: con el trabajo de la
  tarea stageado, el commit de planning se lo llevaba puesto o lo frenaba el mismo guard. Volvió a parar sin commit, y
  sin fila, porque una fila que nadie resuelve al reanudar queda pendiente sobre una tarea ya cerrada. El porqué quedó
  escrito junto a esa parada.
- `ops governed` elegía una sola lectura de cada ruta: primero la que existía, después la que tenía carpeta, y
  después la que nombraba al servicio. Cada criterio perdía en silencio algún archivo protegido nuevo. Ahora juzga
  las dos lecturas, la de la raíz y la del servicio, y vale cualquiera que sea gobernanza. Descarta sólo la imposible,
  `servicio/servicio/…`. Avisar de más cuesta una aprobación; avisar de menos, la corrida.
- Una ruta que llega por un enlace simbólico se nombraba con el enlace puesto, y no era la del índice. Ahora se
  resuelve real.
- El comando se armaba sin comillas, y un `--service` vacío se comía el `--json`. Ahora va citado, y sin servicio no
  se pasa.

- La partición sin `subtasks` reventaba al contar las partes, y una cola que crecía a medias se leía como «no
  ocurrió». Las dos tienen ahora su caso.
- `commit-needs-approval` pasó a la familia Persona, junto a `governance-approval-needed`: las dos esperan la misma
  aprobación.

Cada arreglo entró con su prueba. Hoy `test/planning/governed.test.js` tiene cinco y
`test/workflows/autobuild-governance.test.js` cuatro. Trece mutaciones en una copia, en dos tandas, las trece en
rojo.

**Lo que el caso no preveía.** `PROTOCOL.md` dice que «toda parada se nombra con una de éstas» y enumera diez razones;
`autobuild` usa treinta y seis. Las dos nuevas siguen la forma del recorrido y no la lista. Salió como caso propio:
[390](./390-protocol-enumera-diez-razones-de-parada-y-autobuild-usa-treinta-y-seis.md).

