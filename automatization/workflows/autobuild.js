// Implementación portable de planning/PROTOCOL.md para runners compatibles con workflows de Claude.
// Descubre proyecto, servicios y límites desde ops.config.json; no codifica rutas ni proveedores.
export const meta = {
  name: 'autobuild',
  description: 'Triage → Pick → Classify → Plan → WIP → Build → Review → Verify → QA → Commit → Done',
  whenToUse: 'Ejecutar un hito aprobado con recuperación por WIP y checkpoint humano entre hitos.',
  // Escritas una por una y no derivadas de una lista: el runtime exige que `meta` sea un literal puro
  // —sin llamadas, variables ni interpolación— y con un `.map` acá rechazaba el archivo entero antes de
  // la primera fase. Escribirlas también les da un detalle propio, que es lo que se lee al autorizar.
  phases: [
    { title: 'Triage', detail: 'Contrato del proyecto y estado de planning' },
    { title: 'Pick', detail: 'La próxima tarea del hito, y la reserva antes de construirla' },
    { title: 'Classify', detail: 'Carril y reparto de la tarea que no los declara' },
    { title: 'Ready', detail: 'Aceptación concreta y sin decisiones pendientes' },
    { title: 'Decompose', detail: 'Partir la tarea que no entra en el tope de horas' },
    { title: 'Plan', detail: 'El cambio más chico que satisface la aceptación' },
    { title: 'Critique', detail: 'El plan atacado antes de escribir código' },
    { title: 'WIP', detail: 'El plan aprobado persistido antes del primer cambio' },
    { title: 'Build', detail: 'Implementación con la prueba en rojo primero' },
    { title: 'Review', detail: 'El diff real revisado por el dueño de cada dominio' },
    { title: 'Verify', detail: 'Los gates del servicio y la aceptación que ninguna prueba codifica' },
    { title: 'QA', detail: 'El comportamiento ejercitado como lo ve quien lo usa' },
    { title: 'Commit', detail: 'Conventional Commits, uno por naturaleza del diff, sin push' },
    { title: 'Done', detail: 'Cierre atómico: evidencia escrita, cola y plan limpios, reserva suelta' },
    { title: 'Closing', detail: 'Check de planning y checkpoint humano del hito' },
  ],
}

{{INCLUDE:shared/workflow-root.js}}
{{INCLUDE:shared/inbox.js}}
{{INCLUDE:shared/acceptance.js}}
const CONFIG = `${ROOT}/ops.config.json`
const P = `${ROOT}/planning`
const ORG = `${ROOT}/organization`
const BACKLOG = `${P}/BACKLOG.md`
// La cola entera: el archivo de siempre más uno por hito (caso 212). Lo que se protege es todo; lo que se
// clasifica, se parte o se cierra es el archivo de la tarea, que `context` dice cuál es. Clasificar toda la cola
// escribía en los hitos de otra línea de trabajo (caso 239).
const QUEUE = `${BACKLOG} y los archivos de ${P}/backlog/`
const queueFile = () => `${P}/${(planning && planning.file) || 'BACKLOG.md'}`
// Una tarea cerrada escribe su propio archivo, así que dos corridas en paralelo no comparten ninguno.
const doneFile = (slug) => `${P}/done/${slug}.md`
const HUMAN = `${P}/HUMAN_ACTIONS.md`
const GATE = `${P}/AWAITING_REVIEW.md`

// Estado de planning tal como lo emite `ops context --json`; ningún modelo parsea BACKLOG ni WIP.
// De a pares, y sin regex: una comilla dentro de un literal de regex desincroniza a las dos puertas que
// leen este archivo sin parsearlo —caso 084—, y de a pares es además lo correcto, porque una comilla
// suelta no es un envoltorio. Por eso también la escapada en vez de alternar el estilo de comillas.
const QUOTES = ['\'', '"']

// Si la fila que registró una parada quedó pendiente. `context` sólo lista las pendientes, así que
// preguntar por la presencia de la tarea alcanza, y no hace falta que un modelo lea el estado.
const HUMAN_ROW = {
  type: 'object', additionalProperties: false, required: ['readOk', 'pending'],
  properties: { readOk: { type: 'boolean' }, pending: { type: 'boolean' } },
}

const CONTEXT = {
  type: 'object', additionalProperties: false,
  required: ['blocked', 'hasTask', 'wipActive', 'queued', 'cast', 'readOk'],
  properties: {
    // Si el comando salió con error no hay estado que reportar, y `hasTask: false, queued: 0` es
    // exactamente lo que un modelo completa cuando no tiene qué poner. Sin este campo esa invención se
    // lee igual que una cola terminada, y Pick la toma como permiso para promover.
    readOk: { type: 'boolean' },
    // Vocabulario cerrado, igual que `lane` acá abajo, y por la misma razón: el motor emite tres valores
    // y nada más —`ops context` los decide con un `existsSync` y un conteo—, así que dejarlo como texto
    // libre le pedía a quien lo transcribe que acertara una convención invisible. Un modelo que rellena
    // «el valor vacío» puede escribir la cadena vacía o **escribir las comillas**, y las dos satisfacían
    // el esquema: medido en una instancia real, 3 de 24 lecturas llegaron como `"\"\""` (caso 083).
    blocked: { type: 'string', enum: ['', 'awaiting-review', 'blocked-on-human'] },
    hasTask: { type: 'boolean' }, wipActive: { type: 'boolean' },
    queued: { type: 'integer' }, slug: { type: 'string' }, hito: { type: 'string' },
    service: { type: 'string' }, acceptance: { type: 'string' }, epic: { type: 'string' },
    // El archivo de la cola donde vive la tarea, relativo al planning: `BACKLOG.md` o `backlog/<hito>.md`.
    file: { type: 'string' },
    // Sin declararlo acá no llega, igual que le pasó a `epicContext`: `additionalProperties: false` lo
    // descarta y las fases lo reciben vacío para siempre.
    description: { type: 'string' },
    // Sin declararlo acá no llega: `additionalProperties: false` lo descartaría, y el aplanado de la
    // épica a su número —dos líneas arriba— hace fácil creer que ya viene. La fase Plan lo pedía en su
    // prompt y planificaba contra el título; `readEpics` cuenta de dónde sale.
    epicContext: { type: 'string' },
    lane: { type: 'string', enum: ['', 'express', 'directo', 'lite', 'full'] },
    // Quién entrega y quiénes miran, decidido al clasificar la tarea y escrito en su línea. Viene
    // siempre, aunque venga vacío: preguntar si el campo existe antes de leerlo es la clase de borde
    // que se olvida en una rama y revienta en la otra.
    cast: {
      type: 'object', additionalProperties: false, required: ['build', 'review'],
      properties: { build: { type: 'string' }, review: { type: 'array', items: { type: 'string' } } },
    },
    blockedTasks: { type: 'array', items: { type: 'string' } },
    // «Qué no se puede romper» como «nombre (dónde vive)», y si la tabla tiene algo sin declarar (caso 205).
    surfaces: { type: 'array', items: { type: 'string' } },
    surfacesPending: { type: 'boolean' },
    // Si la tarea que `context` devolvió ya está reservada a nombre de este runner. Libre no significa
    // que sea nuestra: significa que todavía la puede tomar cualquiera, y dos corridas en paralelo la
    // reciben las dos.
    claimed: { type: 'boolean' },
    // La fecha de hoy según el motor. Este recorrido no tiene reloj propio a propósito.
    today: { type: 'string' },
    // Dónde va el plan de este runner. El nombre sale de su id y el recorrido no lo deriva: lo
    // pregunta, igual que la fecha.
    wipFile: { type: 'string' },
    // La línea de trabajo de esta sesión, o vacío en el árbol principal. De ahí sale si la tarea se
    // construye en un árbol propio (caso 274).
    line: { type: 'string' },
    // Con los nombres que ya hay en el INBOX, Review no vuelve a anotar uno.
    inbox: { ...INBOX_HEADS },
    // Las reglas que rigen el proyecto, con los overrides ya resueltos por el motor (caso 105).
    rules: { type: 'array', items: { type: 'string' } },
    // Cuántos pasos del plan están tildados y cuántos no. Es lo único que separa «esta tarea viene de una
    // corrida que paró a mitad» de «esta tarea no empezó», y sin eso Build se lanzaba igual con los nueve
    // pasos hechos: el agente releía el WIP, miraba el disco y contestaba que no había nada pendiente —
    // medido en 893.000 tokens sobre tres corridas de una sola tarea (caso 154).
    //
    // Viene de `ops context --json`, que ya lo emite; acá sólo hacía falta declararlo, porque
    // `additionalProperties: false` lo descartaba aunque llegara. Es opcional: una instancia sin WIP
    // activo no lo trae, y pedirlo siempre obligaría a inventar ceros donde no hay plan.
    wip: {
      type: 'object', additionalProperties: false, required: ['complete', 'pending'],
      properties: {
        phase: { type: 'string' },
        complete: { type: 'integer' }, pending: { type: 'integer' },
      },
    },
  },
}
// `declined` es la tercera salida: no la tomó otro ni falló el comando, sino que quien lanzó la corrida pidió
// no seguir. Sin ella esa negativa sólo cabía en `claimed: false`, y la corrida terminaba en `claim-stuck`
// —una falla— después de haber cerrado bien lo que se le pidió (caso 293).
const CLAIM = {
  type: 'object', additionalProperties: false, required: ['claimed'],
  properties: { claimed: { type: 'boolean' }, declined: { type: 'boolean' }, details: { type: 'string' } },
}
// El árbol de trabajo de una tarea, como lo devuelve `ops worktree --json`.
const WORKTREE = {
  type: 'object', additionalProperties: false, required: ['ok'],
  properties: {
    ok: { type: 'boolean' }, path: { type: 'string' }, work: { type: 'string' }, branch: { type: 'string' },
    repo: { type: 'string' }, details: { type: 'string' },
  },
}
const READY = {
  type: 'object', additionalProperties: false, required: ['ready', 'needsHuman'],
  properties: {
    ready: { type: 'boolean' }, needsHuman: { type: 'boolean' },
    reason: { type: 'string' }, refinedAcceptance: { type: 'string' },
  },
}
const ESTIMATE = {
  type: 'object', additionalProperties: false, required: ['hours', 'needsSplit'],
  properties: {
    hours: { type: 'number' }, needsSplit: { type: 'boolean' },
    subtasks: { type: 'array', items: { type: 'object', required: ['title', 'acceptance'], properties: {
      title: { type: 'string' }, acceptance: { type: 'string' }, service: { type: 'string' },
    } } },
  },
}
const PLAN = {
  type: 'object', additionalProperties: false, required: ['approach', 'steps', 'files', 'testStrategy'],
  properties: {
    approach: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } },
    files: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } },
    testStrategy: { type: 'string' },
  },
}
// Un veredicto sin manifiesto no se puede contrastar: `consulted` enumera lo que quien revisó abrió de
// verdad, y es lo único que separa al que miró del que aprobó de memoria. No prueba que lo haya leído bien
// —para eso habría que releerlo—, y esa asimetría es la que lo deja barato (R14).
//
// Tres estados porque hay tres cosas distintas que decir, y con un booleano dos se pisan: «no puedo
// aprobar esto» y «apruebo con algo que hay que corregir antes de entregar» caían las dos en el mismo
// `false`, así que la primera gastaba igual una vuelta de corrección sobre algo que la corrección no
// arregla. Y `blocking` separa lo que impide entregar de la mejora opinable, que hasta ahora mandaba a
// tocar código con la misma fuerza que un defecto.
const DECISION = {
  type: 'object', additionalProperties: false, required: ['verdict', 'concerns', 'consulted'],
  properties: {
    verdict: { type: 'string', enum: ['aprobado', 'con-condiciones', 'bloqueado'] },
    concerns: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['detail', 'blocking'],
      properties: { detail: { type: 'string' }, blocking: { type: 'boolean' } },
    } },
    consulted: { type: 'array', items: { type: 'string' } },
  },
}
// La crítica del plan tiene un destino que Review no tiene: la fase que sigue todavía puede cumplir lo que
// falta. Por eso su bloqueante dice además cuál de los dos es —`replan: true` si corregirlo cambia el plan y
// hay que volver a criticarlo, `false` si es una condición que cumple quien construye—. Sin el campo los dos
// eran `blocking: true`, y una condición de dos renombres paraba el recorrido como un plan sin salida
// (caso 248). Extiende el concern por la misma razón que `REVIEWED`.
const CRITIQUED = { ...DECISION,
  properties: { ...DECISION.properties,
    concerns: { ...DECISION.properties.concerns,
      items: { ...DECISION.properties.concerns.items,
        required: [...DECISION.properties.concerns.items.required, 'replan'],
        properties: { ...DECISION.properties.concerns.items.properties, replan: { type: 'boolean' } },
      } },
  },
}
// Qué superficie crítica toca una tarea `express`. Una sola cadena: la entrada de la lista tal cual, o vacía.
const CRITICAL = {
  type: 'object', additionalProperties: false, required: ['critical'],
  properties: { critical: { type: 'string' } },
}
// Review nombra contra qué reglas revisó (caso 105): recibir las rutas no garantiza abrirlas, y esto es lo único
// que deja rastro de que se hizo. Critique no lo lleva porque no recibe la lista.
//
// Y `decision` es el tercer destino, el que R6 le da a lo que aparece y no le toca a este cargo: queda
// registrado con qué lo cierra y quién puede tomarlo. Las otras fases lo tienen —`ready-human`,
// `plan-human`, `verify-human`, y `open-decisions` en Build— y Review no, así que un revisor que
// encontraba una decisión elegía entre frenar la corrida o degradarla a propuesta con tope de tres.
// Elegía frenar, que de las dos es la correcta, y costaba la corrida entera sobre trabajo que estaba
// bien. Es la misma separación que `uncovered` hace en Verify, en el otro extremo del recorrido.
//
// Medido sobre un banco desechable el 2026-09-17, corridas `wf_99130468-2c4` y `wf_5dcc3828-a9f`: las dos
// terminaron en `review-failed` con la suite del producto en verde y los tres casos de la aceptación
// dando lo pedido, y las dos por un hallazgo que el propio revisor describió como una decisión que no le
// tocaba.
const REVIEWED = { ...DECISION, required: [...DECISION.required, 'rules', 'critical'],
  properties: {
    ...DECISION.properties,
    rules: { type: 'array', items: { type: 'string' } },
    // Qué superficie de las que la empresa declaró crítica toca el diff, o vacío. Viaja al hecho de
    // revisión, que llega a `done/`: es lo que dice después con qué rigor se miró la entrega (caso 205).
    critical: { type: 'string' },
    // Extiende el concern de `DECISION` en vez de reescribirlo: copiado entero, un campo nuevo allá no
    // llegaría acá y ninguna prueba lo notaría.
    concerns: { ...DECISION.properties.concerns,
      items: { ...DECISION.properties.concerns.items,
        // `ref` y `verified` son del Review y no de Critique, que critica un plan sin diff que comprobar
        // (caso 206): de dónde sale cada hallazgo —una regla que rige o `criterio`—, y si el revisor
        // comprobó lo que afirma o lo supone.
        //
        // `proposes` separa, entre lo que no bloquea, lo que propone algo de la constancia de haber mirado
        // y encontrado bien. Sin el campo las dos iban al INBOX como propuestas: en una corrida real, dos de
        // las tres entradas eran «la revisión no encontró nada que corregir» (caso 262).
        required: [...DECISION.properties.concerns.items.required, 'ref', 'verified', 'proposes'],
        // `fixable` es de la re-revisión: un bloqueante nuevo cuya corrección el revisor escribió entera compra
        // una corrección más en vez de parar (caso 343). Opcional y cerrado por defecto: sin el campo, para.
        properties: { ...DECISION.properties.concerns.items.properties, decision: { type: 'boolean' },
          ref: { type: 'string' }, verified: { type: 'boolean' }, proposes: { type: 'boolean' },
          fixable: { type: 'boolean' } },
      } },
  } }
// Un exit code dice que el test corrió, no que pruebe lo que la tarea prometió: un test que asercia de
// menos —o que ni existe— sale verde igual, y el guard de verify tampoco lo ve porque también mira exit
// codes. Por eso `uncovered` se contrasta contra la aceptación leyendo el fuente, no la salida (R9).
const VERIFY = {
  type: 'object', additionalProperties: false, required: ['passed', 'commands', 'details', 'uncovered', 'covered'],
  properties: {
    passed: { type: 'boolean' }, details: { type: 'string' },
    // Tres causas que se leen igual en el resultado y piden cosas distintas: a una le falta trabajo que
    // el propio recorrido puede hacer, a otra le falta una decisión que no es suya, y la tercera no tiene
    // prueba posible porque su entregable no se ejecuta —un ADR, una política—. Sin separarlas, la corrida
    // frena por las tres, una persona resuelve lo que se resolvía solo y la tarea de decisión no cierra
    // nunca (caso 189). `reason` es lo que Done escribe en `tests: n/a — <razón>`.
    uncovered: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['criterion', 'cause'],
      properties: {
        criterion: { type: 'string' },
        cause: { type: 'string', enum: ['missing-test', 'ambiguous', 'no-surface'] },
        reason: { type: 'string' },
      },
    } },
    // El mapeo que Verify arma al contrastar y del que sale `tests: CN → prueba`. Sin viajar, Done lo
    // componía de memoria (hallazgo del 189). Viaja por partes y no como una frase: quien verifica sabe qué
    // archivo y qué prueba son, y escrito en prosa ese dato se pierde —después nadie puede distinguir el
    // nombre de la prueba de la aclaración que le sigue— (caso 331).
    covered: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['criterion', 'file', 'name'],
      properties: {
        criterion: { type: 'string' }, file: { type: 'string' }, name: { type: 'string' }, note: { type: 'string' },
      },
    } },
    commands: { type: 'array', items: { type: 'object', required: ['cmd', 'exitCode'], properties: {
      cmd: { type: 'string' }, exitCode: { type: 'integer' }, note: { type: 'string' },
      ranTests: { type: 'boolean' },
    } } },
    regressions: { type: 'array', items: { type: 'string' } },
    preExisting: { type: 'array', items: { type: 'string' } },
  },
}
const QA = {
  type: 'object', additionalProperties: false, required: ['passed', 'evidence'],
  properties: {
    passed: { type: 'boolean' }, evidence: { type: 'string' }, behavioral: { type: 'boolean' },
    bugs: { type: 'array', items: { type: 'string' } },
    // Lo que dio cada mutación que Build declaró sin correr. `red` es lo único que se decide con esto: una
    // que no se puso roja dice que la prueba no cuida lo que nombra (R9).
    mutations: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['detail', 'red'],
      properties: { detail: { type: 'string' }, red: { type: 'boolean' }, output: { type: 'string' } },
    } },
  },
}
// RED/GREEN sin registro es una intención: después nadie distingue el test que se vio fallar del que se
// escribió cuando el código ya andaba, y ese segundo no prueba su aserción, sólo que corre. Por eso
// `redFirst` trae el fallo literal de la corrida roja y no la afirmación de que la hubo (R14).
const BUILD = {
  type: 'object', additionalProperties: false,
  required: ['completed', 'summary', 'redFirst', 'discovered', 'closedTask'],
  properties: {
    completed: { type: 'boolean' }, summary: { type: 'string' }, closedTask: { type: 'boolean' },
    redFirst: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['test', 'failure'],
      properties: { test: { type: 'string' }, failure: { type: 'string' } },
    } },
    blockers: { type: 'array', items: { type: 'string' } },
    // Estricto en el cómo, flexible en el qué: un `kind` por cada uno de los dos destinos que R6 le da a
    // lo que aparece y el plan no previó. Lo que agrega este recorrido es el enganche — el caso que esta
    // tarea puede fijar entra con la prueba que lo fija, y por eso su `test` tiene que estar en `redFirst`.
    discovered: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['kind', 'detail'],
      properties: {
        kind: { type: 'string', enum: ['edge', 'open', 'note', 'debt', 'mutation'] },
        detail: { type: 'string' }, test: { type: 'string' },
      },
    } },
  },
}
const COMMIT = {
  type: 'object', additionalProperties: false, required: ['committed'],
  properties: {
    committed: { type: 'boolean' }, hash: { type: 'string' }, subject: { type: 'string' },
    // `live` lo contesta quien commiteó porque es el único que ve el remoto: la rama por defecto no es
    // siempre `main`, y el recorrido no corre git.
    branch: { type: 'string' }, live: { type: 'boolean' },
    leftovers: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' },
  },
}
// Acompaña a todo prompt que commitea. El guard que revisa un commit lee el índice antes de que el comando
// corra, así que `git add … && git commit` en una sola línea se frena siempre. Sin decirlo, el agente lo
// intentaba así, se frenaba y lo repetía en dos: pasó en cuatro de cinco corridas reales (caso 299).
const TWO_COMMANDS = ' Stageá en un comando y commiteá en otro aparte: juntos en la misma línea se frenan, '
  + 'porque el guard que revisa el commit lee el índice antes de que el comando corra.'
// Acompaña al prompt de Commit. El repo de un servicio queda en su rama viva después de cada merge, que es
// justo donde arranca la corrida siguiente: sin esto el commit caía ahí, sin PR ni CI (caso 251). Cortar la
// rama no pide permiso a nadie —es lo que la persona iba a hacer a mano—; commitear en la viva sí, y ese
// pedido es `runner.commitToLiveBranch`. Se corta acá y no antes de Build porque `git switch -c` se lleva
// el árbol sin commitear, así que alcanza con un solo lugar.
//
// En un árbol de tarea la rama ya está cortada: es `task/<slug>`, que es el nombre con que `check` sigue si
// un reclamo se mueve. Al commitear se renombra a la forma de siempre, y el árbol se saca: la rama queda,
// que es lo que se lleva a un PR, y la carpeta de la línea no acumula un árbol por tarea cerrada.
//
// Y una rama por tarea. «Si no es viva, commiteá ahí» apilaba la tarea siguiente del mismo servicio sobre la
// rama de la anterior: en una corrida real dos tareas terminaron en una rama con el nombre de la primera, y
// hubo que abrirlas en un solo PR (caso 307). Una rama que la persona eligió y no es de ninguna tarea se
// respeta como antes.
const BRANCHED = (slug, tree, earlier = []) => (tree
  ? ` El repositorio es el árbol de trabajo ${tree.path}, en la rama ${tree.branch}: commiteá ahí, y no en el `
    + `checkout compartido. Antes de commitear renombrá esa rama con \`git branch -m <tipo>/${slug}\`, donde `
    + 'tipo es el del Conventional Commit. Cuando el commit esté verificado y el árbol limpio, sacalo con '
    + `\`git -C ${tree.repo} worktree remove ${tree.path}\`: la rama queda.`
  : contract.commitToLiveBranch
  ? ' Commiteá en la rama en la que esté el repositorio.'
  : ' Antes de stagear mirá en qué rama está el repositorio. Si es una rama viva —main, master o la rama por '
    + 'defecto del remoto— no commitees ahí ni lo consultes: cortá una con `git switch -c <tipo>/' + slug
    + '`, donde tipo es el del Conventional Commit, que se lleva los cambios sin commitear; si esa rama ya '
    + 'existe, pasate a ella. Si el repositorio ya está en una rama que no es viva, commiteá en ésa, salvo que '
    + `sea la rama de otra tarea: ${earlier.length ? `las que esta corrida ya usó —${earlier.join(', ')}—, o ` : ''}`
    + `una cuyo nombre termine en el identificador de una tarea con entrada en ${P}/done/. Ahí cortá igual `
    + '`git switch -c <tipo>/' + slug + '`, desde donde está: cada tarea queda en su rama, y la de la otra no '
    + 'se toca.')
  + ' Reportá en branch la rama donde quedó el commit y en live si es una rama viva.'
// Acompaña al commit del estado de planning. La rama no es por tarea, como la del producto: es una sola que
// se acumula con un PR abierto, así que antes de cortar una se busca la que ya exista.
const PLANNING_BRANCH = () => (contract.commitToLiveBranch
  ? ' Commiteá en la rama en la que esté ese repositorio.'
  : ' Antes de stagear mirá en qué rama está. Si es una rama viva —main, master o la rama por defecto del '
    + 'remoto— no commitees ahí ni lo consultes: pasate a la rama de trabajo de planning que ya exista —la '
    + 'que ya lleva commits de estado de planning sin mergear— y si no hay ninguna cortá `work/planning`. '
    + 'Es una sola rama que se acumula, nunca una por tarea. Si ya está en una rama que no es viva, '
    + 'commiteá en ésa.')
  + ' Reportá en branch la rama donde quedó el commit y en live si es una rama viva.'
// Dueño por defecto de cada fase. Es determinista: no hace falta preguntarle a un modelo quién
// revisa la arquitectura o quién decide si la evidencia de calidad alcanza.
const OWNERS = {
  ready: 'product-manager',
  plan: 'software-architect',
  review: 'software-architect',
  verify: 'qa-engineer',
  qa: 'qa-engineer',
  commit: 'release-manager',
}

// Clasificar decide dos cosas de una: cuántas perspectivas merece la tarea —el lane— y cuáles —el
// cast—. El criterio va escrito porque sin él la clasificación es intuición, y la intuición se
// infla hacia arriba: toda tarea termina pareciendo `full`, que es el carril que no hay que
// justificar. Lo que decide es la superficie del cambio, no su tamaño en líneas: un `if` en el
// chequeo de permisos es `full`, y un componente entero de presentación puede ser `directo`.
const CLASSIFY_RULES = 'Clasificás quién trabaja y cuánta ceremonia merece la tarea; no decidís qué ' +
  'se hace ni lo hacés. Lane: `express` si la aceptación nombra un valor literal y el resultado no ' +
  'lo mira nadie —un typo, un umbral interno, un renombre—; `directo` si es igual de mecánico pero ' +
  'cambia una superficie que alguien ve; `lite` si es comportamiento nuevo ' +
  'dentro de un servicio con superficie conocida; `full` si cruza contratos entre servicios, datos, ' +
  'autenticación o permisos, o si la aceptación tiene un borde sin decidir. Cast: quien implementa ' +
  'según la plataforma del servicio, y los revisores que la superficie realmente justifica ' +
  '—seguridad si toca autenticación, permisos, criptografía o datos sensibles; privacidad si toca ' +
  'datos personales; sre si toca disponibilidad, límites o despliegue; ux si cambia una superficie ' +
  'que usa una persona; el de datos o modelos si los toca—. Sumar un cargo que no aporta es ruido ' +
  'que diluye la revisión. No inventes slugs: usá sólo los que devuelve el CLI.'

const CLASSIFICATION = {
  type: 'object', additionalProperties: false, required: ['classified'],
  properties: {
    classified: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['slug', 'lane', 'build'],
      properties: {
        slug: { type: 'string' }, lane: { type: 'string', enum: ['express', 'directo', 'lite', 'full'] },
        build: { type: 'string' }, review: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
      },
    } },
  },
}

const CONTRACT = {
  type: 'object', additionalProperties: false,
  required: ['project', 'workspaceRoots', 'maxTaskHours', 'commitPerTask', 'humanCheckpoint', 'contracts',
    'rootOk'],
  properties: {
    // `ROOT` viaja escrito en el workflow y lo completa el instalador. Nada comprobaba que esa raíz se
    // pudiera leer, y el recorrido gastaba Triage entero sobre archivos ausentes antes de parar más abajo
    // por otra causa, nombrando el planning en vez de la raíz de la que ese planning cuelga.
    //
    // Lo que rompía era que fuera relativa: abierta la sesión en otra carpeta, todo resolvía a
    // `<raíz>/<raíz>/…` y nada existía. Desde 0.89.0 es absoluta y ese modo de fallo se fue, pero el campo
    // sigue haciendo falta — una raíz absoluta se rompe si alguien mueve el proyecto sin reinstalar.
    //
    // Se pregunta acá porque acá ya se leen los cuatro archivos: cuesta un campo y ningún agente más.
    rootOk: { type: 'boolean' },
    project: { type: 'string' }, workspaceRoots: { type: 'array', minItems: 1, items: { type: 'string' } },
    // La puerta que el proyecto declara, si la declara. Viaja con la raíz porque es de la base de código
    // y no del runner: un monorepo tiene una por servicio, y uno solo tiene una sola.
    gates: { type: 'array', items: { type: 'string' } },
    maxTaskHours: { type: 'number' }, commitPerTask: { type: 'boolean' },
    commitToLiveBranch: { type: 'boolean' },
    humanCheckpoint: { type: 'boolean' }, contracts: { type: 'string' },
    boundaries: { type: 'array', items: { type: 'string' } },
    // Qué archivos de un runner quedaron atrás del motor instalado; por qué importa, donde se lee.
    staleAdapter: { type: 'array', items: { type: 'string' } },
  },
}

// Preámbulo invariante: no depende del proyecto y nunca obliga a leer un archivo.
const BASE = `Nunca inventes credenciales ni decisiones; registrá los bloqueos externos en ${HUMAN}. Nunca ` +
  `ejecutes INBOX por tu cuenta. Nunca hagas push, deploy, amend, force ni git add -A. No edites la gobernanza ` +
  `del proceso, y no toques la contabilidad de planning salvo que este recorrido te lo pida explícitamente.`
// Lo que quien lanza la corrida le pide a la corrida: el texto de `args`, o su campo `note`. Hasta 0.100.0
// este recorrido no leía `args`, así que una instrucción dada ahí no llegaba a ninguna fase y nada lo decía
// (caso 252). Va a las tres fases que deciden cómo se hace el trabajo, y por debajo de la aceptación y de
// las reglas: es un pedido de quien opera, que no pasó por ninguna de sus compuertas.
//
// Y cuántas tareas, que es lo único de un pedido que el recorrido puede cumplir sin interpretarlo: `--max N`
// en el texto, o `max` si `args` es un objeto. «Sólo esta tarea» dicho con palabras lo entiende un agente y
// no este script, que seguía con la siguiente (caso 293).
const RAW = String((typeof args === 'string' ? args : (args || {}).note) || '')
const MAX_FLAG = /(?:^|\s)--max(?:=|\s+)(\d+)(?=\s|$)/
const LIMIT = Number((typeof args === 'object' && args && args.max) || (RAW.match(MAX_FLAG) || [])[1]) || 0
const ASKED = RAW.replace(MAX_FLAG, ' ').trim()
const OPERATOR = ASKED ? ` Quien lanzó esta corrida pidió, para todas sus tareas: «${ASKED}». Cumplilo en lo `
  + 'que le toque a esta fase. No reemplaza la aceptación ni las reglas: si las contradice mandan ellas, y lo '
  + 'decís.' : ''
// A quien critica el plan le llega como dato y no como pedido: en una corrida real la crítica encontró en el
// plan una decisión atribuida a «quien lanzó la corrida», no tuvo contra qué contrastarla y la dejó
// marcada como supuesto.
const OPERATOR_SAID = ASKED ? ` Para que lo contrastes: quien lanzó esta corrida pidió «${ASKED}».` : ''
// A quien reclama el pedido le llega entero, porque es el único que puede declinar una tarea que la persona
// excluyó con palabras. Sin el pedido la instrucción de declinar no tenía contra qué decidir: una corrida real
// lanzada con «sólo esta tarea» reclamó la siguiente, la planificó y frenó en Build (caso 297).
//
// Y con cuántas tareas lleva cerradas la corrida, que sólo lo sabe este script. «Sólo la próxima tarea de la
// cola» describe siempre a la que toca reclamar: sin ese dato una corrida real cerró dos tareas y frenó en
// una tercera, 45 agentes para un pedido de una (caso 304).
const DECLINABLE = (closed) => (ASKED ? ` Quien lanzó esta corrida pidió: «${ASKED}». Esta corrida ya cerró `
  + `${closed.length} tarea(s)${closed.length ? ` —${closed.join(', ')}—` : ''}, y ésta sería la número `
  + `${closed.length + 1}. Si el pedido excluye esta tarea —pide parar antes, una cantidad que ya se cumplió, o `
  + 'que sea sólo otra—, no corras el comando: claimed=false, declined=true y en details la frase que lo pide. '
  + 'Si no dice qué tareas tomar ni cuántas, corré el comando.' : '')
// Acompaña a todo prompt con schema DECISION: el schema obliga a llenar `consulted`, y esto obliga a
// llenarlo con lo que se abrió en vez de con lo que se pensaba mirar.
const MANIFEST = ' Enumerá en consulted cada archivo, diff o comando que hayas abierto de verdad, con su ruta.'
// Acompaña a todo prompt con schema DECISION. Sin el criterio escrito los tres estados son tres nombres
// y el del medio se pierde primero; por qué son tres está donde se declaran.
const VERDICT = ' Cerrá con verdict=aprobado si no queda nada por corregir antes de entregar; ' +
  'verdict=con-condiciones si lo que falta se corrige dentro de este mismo cambio; y verdict=bloqueado ' +
  'si algo no se resuelve acá —el diseño no lo cubre, falta una decisión ajena, o la corrección excede el ' +
  'alcance—. Marcá blocking=true sólo en el hallazgo que impide entregar: el resto queda registrado y no ' +
  'manda a tocar código.'
// Acompaña a todo prompt con schema CRITIQUED.
const REPLANNED = ' En cada hallazgo con blocking=true, replan es true si corregirlo cambia el plan —su diseño, '
  + 'su alcance, sus pasos o cómo se prueba— y hay que volver a criticarlo; y false si el plan queda igual y '
  + 'alcanza con que quien construye lo cumpla al escribir —un nombre, un formato, una regla que aplicar—: ésa '
  + 'viaja como condición y la revisión comprueba que se cumplió. Ante la duda, true. En los demás, false.'
// Acompaña a todo prompt con schema REVIEWED.
const RULED = ' En rules nombrá, por su ruta, cada una de las reglas que rigen contra la que revisaste'
  + ' el diff. Y marcá decision=true en el hallazgo que no te toca resolver a vos —una definición de'
  + ' producto, un contrato público, una autoridad que el cargo no tiene—: ése se registra para una'
  + ' persona y no manda a tocar código. En cada hallazgo, ref es la regla que lo sostiene, con su ruta y su'
  + ' número —<ruta>#<número>— y una de las que rigen, o la palabra criterio si es juicio tuyo sin regla'
  + ' escrita; nunca presentes un criterio como regla. Y verified es true sólo si comprobaste lo que el hallazgo'
  + ' afirma —leíste el código que lo muestra, corriste el comando—; si lo suponés, false: un hallazgo sin'
  + ' comprobar no manda a corregir, se registra. Y en cada hallazgo con blocking=false, proposes es true si'
  + ' propone algo que alguien podría hacer —una mejora, una prueba que falta, una deuda— y false si sólo deja'
  + ' constancia de algo que miraste y está bien: ésa queda en el cierre de la tarea y no va al INBOX.'
  + ' Y marcá fixable=true sólo en el bloqueante comprobado cuya corrección escribiste entera en el'
  + ' hallazgo —qué cambiar y por qué—, de modo que quien corrige no tenga nada que decidir: en la'
  + ' re-revisión eso compra una corrección más en vez de parar. Ante la duda, no lo marques.'
// También acompaña a todo prompt con schema REVIEWED, y es función porque las superficies se leen después.
const SURFACED = () => ((planning && (planning.surfaces || []).length)
  ? ` En critical poné la superficie de esta lista que el diff toca, tal cual, o vacío si no toca ninguna: `
    + `${JSON.stringify(planning.surfaces)}. Son las que la empresa declaró que no se pueden romper: un hallazgo `
    + 'de corrección o de seguridad sobre una de ellas bloquea, y por eso se comprueba antes de afirmarlo; '
    + 'sin comprobar no manda a corregir: frena la entrega y lo decide una persona.'
  : ' En critical poné la cadena vacía: la empresa no declaró superficies críticas.')
// Lo que hay que corregir antes de entregar. El resto de los hallazgos no desaparece: se registra.
// Una decisión no cuenta como bloqueante aunque venga marcada: su destino es la fila, no la corrección.
// Critique no la emite —no está en su esquema— así que para él `one.decision` es siempre `undefined`.
//
// Un hallazgo que el revisor no comprobó tampoco manda a corregir: es R14 —una hipótesis no sostiene una
// negativa— con mecanismo (caso 206). Se compara contra `false` y no por verdad porque Critique no
// declara el campo, y para él todo bloqueante sigue bloqueando; el esquema de Review lo exige.
const blockers = (verdict) => verdict.concerns
  .filter((one) => one.blocking && !one.decision && one.verified !== false).map(cite)
// Lo que la crítica del plan deja para después de aprobarlo, en sus dos clases. Se compara contra `false`
// igual que `verified` arriba: un bloqueante que no dice cuál es pide replan, que es el lado que frena.
const replans = (verdict) => verdict.concerns
  .filter((one) => one.blocking && one.replan !== false).map((one) => one.detail)
const carried = (verdict) => ({
  conditions: verdict.concerns.filter((one) => one.blocking && one.replan === false).map((one) => one.detail),
  noted: verdict.concerns.filter((one) => !one.blocking).map((one) => one.detail),
})
// El hallazgo con la regla que lo sostiene al lado: es lo que llega a quien corrige y a `done/`.
const cite = (one) => (one.ref ? `${one.detail} [${one.ref}]` : one.detail)
// Un `ref` que nombra una regla que no rige es una cita sin base. No se borra ni se corrige en silencio
// —R14: sigue viaje marcada—; pasa a criterio diciendo qué citó, y el hallazgo conserva su peso.
// La ruta se compara sin el `./` inicial y por sufijo, porque el revisor la escribe como la ve —con la raíz
// delante o sin ella— y marcar «no rige» una regla que sí rige sería afirmar algo falso en `done/`.
const governs = (ref) => {
  const file = ref.split('#')[0].replace(/^\.\//, '')
  return governing.some((rule) => file === rule || file.endsWith(`/${rule}`))
}
const grounded = (verdict) => {
  for (const one of verdict.concerns) {
    const ref = String(one.ref || '').trim()
    if (ref && !/^criterio\b/i.test(ref) && !governs(ref)) {
      one.ref = `criterio (citó ${ref}, que no rige)`
    }
  }
  return verdict
}
// Lo que una parada tiene que nombrar es todo lo que el revisor señaló, no sólo lo que manda a corregir:
// con `blockers` solo, un veredicto cuyo único hallazgo es una decisión paraba diciendo que nadie nombró
// ninguna condición. El motivo es lo único que queda para leer cuando la corrida terminó.
const named = (verdict) => verdict.concerns.filter((one) => one.blocking).map((one) => one.detail)
// El resultado de Build cuando no hubo nada que construir en esta corrida. Devuelve lo que de verdad
// pasó y nada más: `redFirst` y `discovered` van **vacíos** porque acá no hubo ningún rojo nuevo que
// mostrar ni ningún borde nuevo que fijar, y rellenarlos para que se parezca a una construcción sería
// fabricar la evidencia que este recorrido exige justamente para no tener que creerle a nadie.
//
// `completed: true` afirma que el plan no tiene pasos pendientes, que es lo que el WIP dice y lo único
// que se está usando. No afirma que lo construido esté bien: eso lo miran Review, Verify y QA sobre el
// diff real, que existe en disco venga de la corrida que venga.
const reusedBuild = (wip) => ({
  completed: true,
  closedTask: false,
  redFirst: [],
  discovered: [],
  summary: `sin construir en esta corrida: el WIP traía ${wip.complete} paso(s) tildado(s) y ninguno `
    + 'pendiente, así que lo que sigue revisa lo que ya estaba en disco',
})
// Atajo para reconocer un gate que corrió pruebas sin preguntarle a nadie. No alcanza solo y no
// pretende hacerlo: `mvn verify`, `gradle build`, `tox`, `bin/rails t` y cualquier `make` con nombre
// propio corren pruebas y no se parecen a esto, así que el que corrió el comando además lo declara en
// `ranTests` y vale cualquiera de los dos. Una lista de nombres siempre le va a faltar el siguiente;
// lo que no puede es frenar una corrida legítima por no conocerlo.
//
// El borde izquierdo va explícito en vez de `\b` porque `\b(?:` se lee igual que una llamada a `b()`
// y la comprobación de identificadores del paquete de pruebas la marca como función inexistente.
const RUNS_TESTS = /(?:^|[\s/:=-])(?:tests?|specs?|pytest|jest|vitest|mocha|rspec|phpunit|ci|check)\b/i
{{INCLUDE:shared/workflow-finish.js}}

// Por qué fases pasó esta corrida. Existe porque auditar una tarea no puede exigir leer este archivo:
// para saber si Review había corrido hubo que abrir el fuente y cruzarlo con los commits del día.
//
// Se envuelve `phase` en vez de anotar en sus quince llamadas: una que se olvidara de anotar dejaría
// un registro incompleto, que se lee igual que uno completo. Y se envuelve reasignando en vez de
// declarar, porque `phase` llega como parámetro del wrapper que arma el runner y redeclararlo con
// `const` es un SyntaxError; reasignar un parámetro sí es legal, y `announce` guarda el original.
const ran = []
const announce = phase
phase = (name) => { ran.push(name); announce(name) }

// El paso de oficina: correr un comando del CLI y devolver lo que imprimió. No decide nada, así que no
// necesita lo que carga un agente que sí trabaja. Medido sobre una instancia, la primera llamada de un agente
// del recorrido trae 73.159 tokens de entrada, y 40.782 son lo que la instancia importa; `cauce-clerk` —un
// agente propio con sólo Bash y sin las instrucciones del proyecto— arranca en unos 3.450 (caso 295). En una
// corrida real, nueve de veinticuatro agentes eran pasos así.
//
// Los guards corren igual: son de la sesión y no del tipo de agente, y se comprobó con éste.
//
// Por acá va sólo lo que no deja nada a criterio: un comando y su salida. Lo que redacta —una entrada, un
// commit— no, porque ahí rige lo que la empresa haya escrito, y este agente no lo carga. En 0.103.4 commiteó
// el estado de planning y el asunto salió en inglés donde la regla de la empresa pedía otro idioma (caso 302).
const clerk = (prompt, options = {}) => agent(prompt, { ...options, agentType: 'cauce-clerk' })
phase('Triage')
// El contrato se lee una sola vez por corrida y viaja como texto: ningún subagente relee AGENTS.md,
// workspace.md, ops.config.json ni PROTOCOL.md. `ops check` y el guard planning-drift siguen validando
// el resultado.
//
// Lo deriva `ops contract`, parseando esos cuatro archivos, y el paso sólo lo trae. Hasta 0.103.2 lo hacía un
// agente que los leía y los transcribía: el comando existía desde 0.91.0 y el cableado esperaba saber cuánto
// transcribía de verdad ese agente (caso 154). Medido sobre una instancia: los ocho campos de configuración
// salieron iguales, `contracts` igual salvo el `##` del título, y en `boundaries` el agente sumaba nueve
// frases del resto de `AGENTS.md` a los tres párrafos que enuncian los límites —2.079 bytes contra 732—. O sea
// que lo que viajaba a cada subagente era lo que alguien había elegido copiar. Y cuesta la décima parte.
const contract = await clerk(
  `Corré "node tools/ops.js contract ${ROOT} --json" desde ${ROOT} y copiá cada campo de su salida tal cual, ` +
  `sin resumir, reformular ni reordenar. Si el comando sale con un código distinto de 0, poné rootOk en ` +
  `false y el resto en sus valores vacíos, sin deducirlos de otra fuente ni abrir ningún archivo.`,
  { schema: CONTRACT, label: 'contract-digest' },
)
if (!contract) return stop('contract-unavailable', `no se pudo leer ${CONFIG} ni ${P}/PROTOCOL.md`)
// Falla acá y nombrando la raíz, que es lo que hace falta para arreglarlo: parar más abajo mandaba a
// revisar el planning, y el planning está bien — lo que no existe es la carpeta de la que cuelga.
if (!contract.rootOk) {
  return stop('root-unreadable', `${ROOT} no se pudo leer entero. Es la raíz absoluta que escribió `
    + `"automation install": comprobá que exista y, si moviste el proyecto de carpeta, reinstalá el adaptador.`)
}

// Después de `upgrade` hay que reinstalar el runner, y nada lo obligaba: `doctor` lo avisa como advertencia y
// la corrida anda igual, con el recorrido y los agentes de la versión anterior. Quien actualizó cree tener el
// arreglo y no lo tiene. Este script es justamente una de esas copias, así que el aviso llega con la versión
// siguiente a la que lo trae: una copia más vieja que ésta no sabe preguntar (caso 308).
const stale = (contract.staleAdapter || []).filter((file) => file.includes('.claude/'))
if (stale.length) {
  return stop('adapter-stale', `El motor se actualizó y el adaptador de Claude quedó en la versión anterior: `
    + `${stale.join(', ')}. Reinstalalo con "node tools/ops.js automation install . claude" desde ${ROOT} —o `
    + '"make install-claude"—, abrí una sesión nueva y volvé a lanzar.')
}

const bounds = contract.boundaries || []
const limits = bounds.length ? ` Límites del proyecto: ${bounds.join('; ')}.` : ''
// Las reglas que rigen el proyecto (caso 105). Las lista `context`, que se lee después del contrato, así que
// entran al preámbulo cuando esa lectura vuelve. Viajan las rutas y no el texto: el preámbulo se reenvía a cada
// subagente que toca código, y el texto de las reglas multiplicaría su tamaño por cada uno.
let governing = []
// Alcance de escritura: para subagentes que tocan código o ejecutan gates del producto.
const SCOPE = () => `${BASE}\n\nProyecto ${contract.project}. workspaceRoots es el límite completo de escritura ` +
  `del producto: ${contract.workspaceRoots.join('; ')}.${limits} Este preámbulo ya trae el contrato; ` +
  `no vuelvas a leer ${ROOT}/AGENTS.md, ${ORG}/workspace.md, ${CONFIG} ni ${P}/PROTOCOL.md.` +
  (governing.length ? ` Las reglas que rigen este proyecto son éstas, relativas a ${ROOT}: ${governing.join(', ')}. ` +
    'Leé las que toquen tu fase antes de planificar, construir o revisar; donde una propia contradice a una del ' +
    'sistema, rige la propia.' : '')
// Lo que una revisión declara haber abierto viene con la ruta de esta máquina, y `review` va textual a
// `done/`: no se le puede pedir a quien escribe que las acomode. Se les cambia el prefijo acá, a cada ruta
// que cuelga de una raíz del proyecto; lo demás —el motor, un temporal— queda como vino (caso 321).
//
// Angosto a propósito, porque el campo es lo que después se audita. Sólo sobre lo que se declaró abierto,
// nunca sobre lo que el revisor escribió en prosa: ahí una ruta puede ser justamente de lo que habla. Sólo
// una ruta entera —que empiece una palabra y termine en una barra o en el fin de un nombre—, para que otra
// carpeta que empieza igual, o una ruta que la contiene, no se toque. Y sólo con la raíz absoluta que escribe
// `automation install`: con una relativa no hay prefijo de máquina que sacar.
const resolved = (given) => (given.startsWith('/') ? given : `${ROOT}/${given}`).split('/')
  .reduce((out, part) => (part === '..' ? out.slice(0, -1) : part && part !== '.' ? [...out, part] : out), [])
  .join('/')
// De la más larga a la más corta, para que una raíz que contiene a otra no se lleve sus rutas. A igual largo
// va primero la que se declaró primero: planning, los servicios, y la instancia al final.
const homes = () => [[P, 'planning'], ...contract.workspaceRoots.filter((one) => one.includes(' → '))
  .map((one) => [`/${resolved(one.slice(one.lastIndexOf(' → ') + 3))}`, one.slice(0, one.lastIndexOf(' → '))]),
[ROOT, '']].filter(([from]) => from.length > 1).sort((a, b) => b[0].length - a[0].length)
const local = (text) => (ROOT.startsWith('/') ? homes().reduce((out, [from, to]) => out.replace(
  new RegExp(`(^|[\\s'"=(])${from.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')}(?:/|(?=$|[\\s'"):,;]))`, 'g'),
  (whole, lead) => `${lead}${whole.endsWith('/') ? to && `${to}/` : to || '.'}`), text) : text)
// Formatos de planning: sólo para subagentes que escriben roadmap, BACKLOG, WIP, DONE o gates.
const LEDGER = () => `${SCOPE()}\n\nContratos de planning, textuales de ${P}/PROTOCOL.md:\n${contract.contracts}`

// Un subagente puede morir —error terminal tras reintentos, o alguien que lo saltea— y entonces el
// runtime devuelve `null`. Sin comprobarlo, la primera propiedad que se le pide revienta el recorrido
// con un TypeError en la fase que sea, y lo que quedó a medias es una tarea con WIP escrito y código
// sin revisar. Cada llamada corta con su etapa puesta: «no contestó» no es lo mismo que «dijo que no»,
// y sólo la segunda significa que alguien juzgó algo.
//
// Y cada llamada lleva su `label`. Sin él el runtime muestra el arranque del prompt, que acá es el
// preámbulo compartido: en cinco corridas reales el journal repitió treinta veces la misma cadena
// —«Nunca inventes credenciales ni decisiones; registrá »— y un bucle de veintiocho agentes pidiendo
// la misma tarea se vio igual que trabajo. Al revés que `phase`, esto no se puede envolver: el nombre
// de la fase no alcanza —Critique planifica y critica, Review revisa y manda a corregir— y esa es
// justo la distinción que hace falta. Lo que evita el olvido es el arnés, que rechaza la llamada sin
// etiqueta en las cuatro suites del recorrido.
const read = (prompt, options = {}) => agent(`${BASE}\n\n${prompt}`, options)
const run = (prompt, options = {}) => agent(`${SCOPE()}\n\n${prompt}`, options)
const write = (prompt, options = {}) => agent(`${LEDGER()}\n\n${prompt}`, options)
// El paso de escritura: volcar en planning lo que el recorrido ya decidió —el plan aprobado en el WIP, la
// evidencia en `done/`, la compuerta del hito— y commitear ese estado. Lo corre `cauce-scribe`, un agente
// propio con pocas herramientas que **sí carga las instrucciones y las reglas del proyecto**: lo que redacta
// lo redacta como la empresa lo pide, y eso gana sobre lo que este recorrido dicte. En 0.103.4 no las cargaba,
// y lo que el agente de siempre hacía por tenerlas a la vista se fue sin que nadie lo notara (casos 301 y 302).
// Lo que juzga —Ready, Plan, Build, Review, Verify, QA— sigue con el agente de siempre.
const scribe = (prompt, options = {}) => write(prompt, { ...options, agentType: 'cauce-scribe' })
const scribeCommit = (prompt, options = {}) => run(prompt, { ...options, agentType: 'cauce-scribe' })

// Las paradas que dejan una fila en HUMAN_ACTIONS delegan esa escritura a un agente, y esa fila es el
// único rastro de la parada: sin ella el recorrido informa un estado que el disco no tiene. Por eso se
// espera —lanzarla y volver en la línea siguiente la abandona— y por eso se mira si contestó (caso 087).
// Devuelve lo que hay que agregarle al detalle, vacío cuando la fila quedó como tiene que quedar.
//
// Contestar no alcanza: el agente que acaba de escribir el diagnóstico entero lo lee como ya resuelto, y
// en una corrida real escribió la fila `resuelta` y la firmó como «decidido por el dueño», desbloqueando
// la tarea sin que nadie decidiera nada (caso 180). Por eso cada pedido arranca diciendo que la fila nace
// pendiente, y cuando la fila es de la propia tarea se relee en `context`, que sólo lista las pendientes.
const HUMAN_ROW_STATE = 'La fila nace con estado `pendiente`, sin excepción: registrás el bloqueo, no lo '
  + 'resolvés —lo resuelve una persona—. No escribas una decisión ni se la atribuyas a nadie.'
const registerHuman = async (prompt, label, slug = '') => {
  if (!(await write(`${HUMAN_ROW_STATE}\n\n${prompt}`, { label }))) {
    return ` — la fila en ${HUMAN} no se pudo registrar: escribila a mano`
  }
  if (!slug) return ''
  const row = await clerk(
    `Corré "node tools/ops.js context ${P} --json" desde ${ROOT}. Poné pending en true sólo si humanActions `
    + `trae una fila cuya task sea ${slug}, y readOk en true sólo si el comando salió con código 0 y devolvió `
    + 'JSON. El comando es la fuente de verdad: no abras archivos de planning.',
    { schema: HUMAN_ROW, label: 'human-row' },
  )
  if (!row || !row.readOk) return ` — no se pudo comprobar la fila de ${slug} en ${HUMAN}: revisala a mano`
  return row.pending ? ''
    : ` — la fila de ${slug} en ${HUMAN} no quedó pendiente: la resuelve una persona, revisala a mano`
}

// Una parada también escribe en planning —la fila, y antes el cargo que Classify anotó en la cola—, y sólo
// el cierre de una tarea lo commiteaba: la corrida que frenaba dejaba la instancia sucia (caso 279). Mismo
// interruptor y misma regla de ramas que el commit del cierre, y tampoco frena: la parada ya está dicha.
// Va después de soltar el reclamo cuando la parada lo suelta: commiteado antes, soltarlo volvía a ensuciar.
const commitBlocked = async (slug, subject = `block ${slug}`) => {
  if (!contract.commitPerTask) return
  const stated = await scribeCommit(
    `Commiteá el estado de planning que la parada de ${slug} dejó sin commitear en el repositorio que `
    + `contiene a ${P}: stageá por nombre sólo lo que cambió bajo ${P} —también lo que se borró—, nunca `
    + `archivos del producto, y creá un solo commit "chore(planning): ${subject}". Nunca amend ni `
    + `push.${TWO_COMMANDS}${PLANNING_BRANCH()}`,
    { schema: COMMIT, label: 'planning-block' },
  )
  if (!stated || !stated.committed) {
    log(`el estado de planning de la parada de ${slug} quedó sin commitear: `
      + `${(stated && stated.reason) || 'sin respuesta'}`)
  }
}

// Toda parada con una tarea tomada commitea, no una lista de paradas. El 279 enumeró las cinco que registran
// una fila, y la primera corrida real que frenó por otra —`verify-hollow`— dejó sin commitear la fila, el
// reclamo y una propuesta (caso 289). Desde que la tarea se toma hay estado escrito, pare por lo que pare.
// `holding` es esa tarea; vuelve a vacío cuando el cierre la commitea.
let holding = ''
// La corrida terminó porque se le pidió, con el hito todavía abierto: no hay checkpoint de hito que escribir.
let cut = false
const halt = async (reason, detail = '') => {
  if (holding) await commitBlocked(holding)
  return stop(reason, detail)
}

// Gate, mutex de WIP y selección de tarea salen de un comando determinista: AWAITING_REVIEW, BACKLOG,
// WIP y HUMAN_ACTIONS nunca entran al contexto de un modelo, y su tamaño deja de costar tokens.
const readContext = () => clerk(
  `Corré "node tools/ops.js context ${P} --json" desde ${ROOT} y reportá sólo lo que imprimió. Derivá hasTask ` +
  `de si task es null, wipActive de si wip es null, claimed del campo claimed, today, wipFile y line de sus ` +
  `campos —line vacío si viene null—, rules del campo rules tal cual, wip con sus campos complete y ` +
  `pending tal cual si viene —y ` +
  `omitilo entero si wip es null, sin inventar ceros—, y lane ` +
  `de task.tier; copiá slug, ` +
  `hito, service, acceptance, ` +
  `epic, cast, description y file de task, epicContext de epic.context —vacío si no hay épica— e inbox tal `
  + `cual. surfaces sale de surfaces.declared, una entrada por fila con la forma "<surface> (<lives>)", y `
  + `surfacesPending de surfaces.pending. El comando es ` +
  `la fuente de ` +
  `verdad: no abras archivos de planning para completarlo. Poné readOk en true sólo si el comando salió ` +
  `con código 0 y devolvió JSON; si falló, readOk en false y el resto en sus valores vacíos, sin ` +
  `deducir el estado de ninguna otra fuente.`,
  { schema: CONTEXT, label: 'planning-context' },
)

let planning = await readContext()
if (!planning) return halt('context-unavailable', `no se pudo leer el estado de ${P}`)
// Que el agente conteste no significa que haya leído: el schema se completa igual con ceros. Parar acá
// cuesta una corrida; seguir sobre una lectura fallida escribe en el BACKLOG, y eso no se revierte solo.
if (!planning.readOk) return halt('context-unavailable', `${P} no se pudo leer; revisá la ruta y el cwd`)
// La fecha de la primera lectura, para lo que se escribe después de la última: la relectura que cierra la
// cola puede volver sin `today`, y una fila fechada `undefined` no se puede leer (caso 214).
const startedOn = planning.today
// `blocked` se lee por su valor y no por su verdad. Como verdad, **cualquier** cadena no vacía frenaba la
// corrida con el mismo motivo, y eso mentía dos veces: con `blocked-on-human` —la cola trabada por
// acciones humanas, que es otra cosa— mandaba a mirar un gate que no existe, y eso no era intermitente;
// y con la cadena `""` que a veces llega del transcriptor, frenaba sin que hubiera nada que resolver.
//
// El vacío se normaliza antes porque sus formas equivocadas no son ambiguas: dos comillas o unos espacios
// no son ningún bloqueo legítimo. Lo que no se reconoce **no se adivina**: para diciendo que el contexto
// llegó fuera del vocabulario, que es lo que esta familia de casos —056, 074, 075— pide para lo que no se
// pudo determinar.
let blocker = String(planning.blocked || '').trim()
while (blocker.length > 1 && QUOTES.includes(blocker[0]) && blocker[blocker.length - 1] === blocker[0]) {
  blocker = blocker.slice(1, -1).trim()
}
if (blocker === 'awaiting-review') {
  return halt('awaiting-human-review', `${GATE} tiene un checkpoint humano sin resolver`)
}
if (blocker === 'blocked-on-human') {
  return halt('blocked-on-human', `toda la cola espera una acción humana. Está en ${HUMAN}`
    + `${(planning.blockedTasks || []).length ? `, sobre ${planning.blockedTasks.join(', ')}` : ''}`)
}
if (blocker) return halt('context-unavailable', `${P} contestó blocked=${JSON.stringify(planning.blocked)}, `
  + 'que no es del vocabulario. No se sabe si hay bloqueo, así que no se sigue como si no lo hubiera.')
governing = planning.rules || []

let currentMilestone = planning.wipActive ? planning.hito : ''
const completed = []
// Las ramas donde esta corrida ya commiteó una tarea: la siguiente no se apila ahí (caso 307).
const usedBranches = []
// Tope de tareas por corrida. No protege de un hito grande —cincuenta tareas en un hito es un problema
// de planificación, no de ejecución— sino de un ciclo: una tarea que vuelve a quedar elegible corre
// para siempre. Se corta con motivo porque agotarlo en silencio se lee igual que haber terminado.
const MAX_TASKS = 50
let rounds = 0
// Lo dicen las dos vueltas que cambian de tarea a mitad de corrida —la carrera perdida y la partición—,
// que no son errores y por eso no salen por `stop`.
const nextUp = (state) => (state.hasTask ? state.slug : '(nada más en cola)')
// Tareas que ya pasaron por el clasificador en esta corrida. Sin esto, una que vuelve sin lane
// —porque la escritura falló o el modelo la salteó— se reclasifica en cada vuelta del bucle.
const classified = new Set()

while (rounds++ < MAX_TASKS) {
  phase('Pick')
  // Sin tarea y con la cola vacía, la corrida termina. **No expande la próxima épica**, y eso no es una
  // limitación sino la regla: el roadmap llama `open` a «candidata editable que aún no fue promovida al
  // backlog», así que pegarla en la cola es promoverla — y BR-OPS-002 deja una propuesta fuera de la cola
  // hasta que la apruebe una persona. El prompt que hacía esto pedía «la próxima épica abierta y
  // aprobada», y «aprobada» no correspondía a ningún dato: una épica declara `epic`, `title`, `status` y
  // `service`, y ninguno registra una aprobación.
  //
  // `context` nombra la que sigue, igual que nombra una recurrencia vencida y por el mismo motivo: la
  // máquina calcula y la persona encola.
  // Una cola con trabajo y sin tarea disponible no es una cola terminada. Romper el bucle igual deja la
  // corrida informando que no había nada que hacer sobre una cola que sí tiene tareas —reclamadas por otro
  // runner, o esperando una dependencia—, que es la forma del caso 075: una respuesta vacía que se lee
  // como un hecho del dominio. El dato ya venía: `queued` cuenta la cola entera, y `context` además la
  // nombra con su dueño en la línea TAKEN.
  //
  // Se paga sobre todo después de una parada que espera a una persona: ahí el reclamo se queda puesto a
  // propósito —quien paró va a volver, y `claim` le es idempotente—, así que cuando la persona contesta es
  // un runner distinto el que pregunta y el que se va sin nada.
  if (!planning.hasTask && planning.queued > 0) {
    return halt('queue-unavailable', `la cola tiene ${planning.queued} tarea(s) y ninguna disponible para `
      + 'este runner. Mirá la línea TAKEN de "ops context": lo reclamado por otro se suelta con '
      + '"ops release" o se retoma desde el runner que lo tiene; lo que espera una dependencia, no.')
  }
  if (!planning.hasTask || (currentMilestone && planning.hito !== currentMilestone)) break
  if (LIMIT && completed.length >= LIMIT) {
    log(`La corrida cerró las ${LIMIT} tarea(s) que se le pidieron: sigue ${nextUp(planning)}, sin tomarla`)
    cut = true
    break
  }
  // Las decisiones que la línea ya tomó, dichas como lo que son. Sin ese rótulo se leen como contexto
  // opinable y el que planifica las re-decide igual, que es el defecto entero: la crítica abre el
  // BACKLOG por su cuenta y bloquea el plan citando la línea palabra por palabra (caso 177).
  const DECIDED = () => (task.description
    ? ` Lo que la línea de la tarea ya decidió, y no se re-decide acá: ${task.description}`
    : '')
  // Sobrevive al bloque del plan porque Build vive afuera —y porque una corrida que reanuda desde un WIP
  // no tiene plan en memoria—. Sin esto la estrategia no era que se descartara: es que no estaba en
  // alcance, que es la forma que ninguna prueba de la fase ve.
  let testStrategy = ''
  // Lo que la crítica aprobó con condiciones y lo que anotó sin bloquear: salen de Critique y los leen WIP,
  // Build y Review. Hasta 0.100.0 no pasaban de la crítica (caso 249).
  let approved = { conditions: [], noted: [] }
  const task = {
    id: planning.slug, hito: planning.hito, service: planning.service,
    acceptance: planning.acceptance, epic: planning.epic, epicContext: planning.epicContext || '',
    description: planning.description || '',
  }
  // Reservar antes de construir, y antes de fijar el hito de la corrida. Sin esto dos corridas en
  // paralelo trabajan la misma tarea: `context` sólo puede saltear lo que alguien ya reclamó, y el
  // primero en preguntar todavía no reclamó nada. La ventana entre preguntar y reservar existe igual, y
  // por eso perder la carrera no es un error: se relee y se sigue con la que quedó libre.
  if (!planning.claimed && !planning.wipActive) {
    phase('Claim')
    const claim = await clerk(
      `Corré "node tools/ops.js claim ${P} ${task.id}" desde ${ROOT}. No escribas ningún archivo vos: lo ` +
      `escribe el comando. claimed=true sólo con exit 0; si falla porque la tomó otro, claimed=false y ` +
      `copiá el mensaje en details.${DECLINABLE(completed)}`,
      { schema: CLAIM, label: `claim:${task.id}` },
    )
    // No es una falla ni una carrera perdida: la corrida termina como cuando se queda sin tareas.
    if (claim && claim.declined) {
      log(`${task.id} no se tomó, a pedido de quien lanzó la corrida: ${claim.details || '(sin detalle)'}`)
      cut = true
      break
    }
    if (!claim || !claim.claimed) {
      planning = await readContext()
      if (!planning) return halt('context-unavailable', `no se pudo releer el estado de ${P}`)
      // Perder la carrera es legítimo y se ve en que la cola pasa a ofrecer **otra** tarea: quien la
      // tomó ya la reclamó, así que `context` la saltea. Que vuelva a ofrecer la misma significa lo
      // contrario — que nadie la tiene y el reclamo falló por su cuenta—, y eso no mejora repitiendo.
      //
      // Reintentar igual costó 28 de los 50 agentes de una corrida real, trece sobre un slug y quince
      // sobre otro, sin construir nada y sin que nada lo dijera: el único tope es `MAX_TASKS`, así que
      // el presupuesto de reintentos **es** el de tareas y una tarea irreclamable se lleva la corrida
      // (caso 071).
      //
      // La parada nombra las dos cosas que hacen falta para saber cuál de los dos defectos fue: el slug
      // que `context` entregó y lo que el reclamo contestó. Si el mensaje dice que ese slug no está en
      // BACKLOG, los dos comandos discrepan sobre la misma cola; si dice otra cosa, el comando se compuso
      // distinto del que se pidió.
      if (planning.hasTask && planning.slug === task.id && !planning.claimed) {
        return halt('claim-stuck', `${task.id} sigue siendo la próxima tarea y no se pudo reclamar. `
          + `context la ofrece y claim la rechaza, así que repetir no cambia nada. `
          + `El reclamo contestó: ${(claim && claim.details) || '(sin detalle)'}`)
      }
      // Con qué sigue, que es lo que cambia respecto de lo que esperaba quien autorizó la corrida: se
      // pidió un hito y se va a construir otra tarea de ese hito. Sin decirlo, el cambio sólo aparece al
      // final, en un cierre que nombra algo que nadie mandó a hacer.
      log(`${task.id} la tomó otro: la corrida sigue con ${nextUp(planning)}`)
      continue
    }
  }
  currentMilestone = task.hito
  holding = task.id

  // Ver la tarea y, si no está clasificada, clasificarla antes de ejecutarla. Se hace una vez por
  // tarea y se escribe en su línea, así que la decisión sobrevive a la corrida y la puede corregir
  // una persona antes de que se ejecute nada — al revés que la fase Cast, que la tomaba en caliente,
  // costaba una llamada por tarea y la tiraba al terminar. Clasifica el hito entero de una sola
  // llamada: lo que cuesta una vez no debería costar una vez por tarea.
  //
  // Un WIP activo no se reclasifica: la tarea ya está en vuelo con las fases que le tocaron, y
  // cambiárselas a mitad de camino la deja con un plan aprobado bajo otro carril.
  const unclassified = !planning.lane || !planning.cast.build
  if (unclassified && !planning.wipActive && !classified.has(task.id)) {
    phase('Classify')
    classified.add(task.id)
    const classification = await write(
      `${CLASSIFY_RULES}${(planning.surfaces || []).length ? ` Una tarea que toca alguna de estas superficies, que la `
        + `empresa declaró que no se pueden romper, nunca va por express: ${JSON.stringify(planning.surfaces)}.` : ''}`
        + `\n\nRun "node tools/ops.js agents list ${ROOT} --json" and choose only from the slugs ` +
      `it lists.\nClasificá en ${queueFile()} todas las tareas en cola que no declaren lane o no declaren cast, ` +
      `empezando por ${task.id} en ${task.service} —aceptación: ${task.acceptance}—. El lane va entre ` +
      `corchetes después del slug y el reparto al final de la línea, con la forma ` +
      `"(cast: quien-entrega → quien-revisa, otro)". No toques nada más de la línea, ni el orden del hito, ` +
      `ni las tareas que ya declaran las dos cosas. Reportá lo que escribiste.`,
      { schema: CLASSIFICATION, label: 'classify' },
    )
    if (classification && classification.classified.length) {
      log(`Clasificadas: ${classification.classified
        .map((one) => `${one.slug} [${one.lane}] ${one.build}`).join(' · ')}`)
      planning = await readContext()
      if (!planning) return halt('context-unavailable', `no se pudo releer el estado de ${P}`)
      continue
    }
    // Sin clasificación no se frena la tarea: `full` es el carril que no saltea nada, así que lo que
    // se pierde es tiempo y no evidencia. Frenar acá cobraría una interrupción por lo único que el
    // recorrido puede resolver solo.
    log(`${task.id} sigue sin clasificar: corre por el carril completo`)
  }

  // Quién puso el carril, que es lo que justifica saltear Ready y no el carril en sí: el clasificador
  // leyó la aceptación en esta corrida y dijo que nombra un valor literal. Escrito a mano en la línea,
  // ese lector no existió —`Classify` sólo corre si falta lane o cast—, y saltear la única fase que
  // pregunta si la tarea está lista quedaba apoyado en una premisa que nadie comprobó.
  const vouched = classified.has(task.id)
  // Una tarea que toca una superficie que la empresa declaró que no se puede romper no va por `express`,
  // que no convoca revisor (caso 205). El piso lo aplica el recorrido y no el clasificador: el carril
  // también se escribe a mano, y ahí nadie leyó la tabla. Se pregunta sólo cuando hay algo que
  // decidir —carril `express` y superficies declaradas—, y lo que no se puede determinar sube de carril:
  // un `null`, o cualquier respuesta no vacía aunque no esté en la lista, cuestan una revisión de más, y
  // suponer lo contrario costaría una entrega sin mirar sobre lo que no se puede romper.
  const surfaces = planning.surfaces || []
  let critical = ''
  if (planning.lane === 'express' && surfaces.length) {
    phase('Surface')
    const touched = await read(`¿La tarea ${task.id} toca alguna de estas superficies que la empresa declaró que `
      + `no se pueden romper? ${JSON.stringify(surfaces)}. Servicio: ${task.service}. Aceptación: `
      + `${task.acceptance}. ${task.description ? `Decisiones de la línea: ${task.description}. ` : ''}`
      + 'Contestá en critical la entrada de la lista tal cual si la toca, o la cadena vacía si no toca ninguna.',
    { schema: CRITICAL, label: 'critical-surface' })
    critical = !touched ? 'no se pudo determinar' : touched.critical.trim()
    if (critical) log(`${task.id} toca una superficie crítica (${critical}): sube de express a directo`)
  }
  const express = planning.lane === 'express' && !critical
  const direct = planning.lane === 'directo' || (planning.lane === 'express' && Boolean(critical))
  // El carril que corrió, que es el que va al WIP y a `done/`: decir `express` de una tarea que pasó por
  // Review deja un registro que contradice lo que pasó. Va el valor a secas —`check` sólo acepta los del
  // vocabulario— y el porqué viaja en el hecho de revisión, que nombra la superficie.
  const lane = critical ? 'directo' : planning.lane || 'sin clasificar'
  const lite = planning.lane === 'lite'
  // Lo mecánico no se planifica ni se pregunta si está listo: el clasificador ya leyó la aceptación y
  // dijo que nombra un valor literal. Volver a preguntarlo son dos llamadas para llegar al mismo lado.
  const mechanical = express || direct

  // Quién ejecuta cada fase. Los dueños por defecto son fijos y no gastan una llamada; quien
  // implementa y quiénes revisan por riesgo salen de la línea de la tarea. Los revisores valen en
  // todos los carriles: los nombró quien ya sabía cuál era el carril, y descartarlos acá sería un
  // segundo filtro que contradice al primero.
  const cast = { ...OWNERS, build: planning.cast.build }
  cast.review = [OWNERS.review, ...planning.cast.review].filter(Boolean).join(', ')
  log(`Cargos: build=${cast.build || '(sin asignar)'} · review=${cast.review} · qa=${cast.qa}`)
  // Nombrar el cargo no alcanza: hay que decir dónde está su contrato, y `agents/` no es la respuesta.
  // El catálogo no se copia a la instancia —viaja en el paquete— así que esa carpeta no existe en la raíz
  // y la instrucción anterior mandaba a leer una ruta ausente. El workflow tampoco puede resolverla por
  // su cuenta: su runtime no lee archivos. Lo que sí puede es decir con qué comando se resuelve, y el
  // agente la obtiene dentro de su propia vuelta, sin costar una llamada más.
  const asRole = (slugs) => (slugs
    ? `Actuá como ${slugs}, respetando el contrato de cada uno y sus límites: un cargo que no puede ` +
      `decidir solo, no decide solo.\n\n` +
      `Leé ese contrato antes de empezar, no lo supongas por el nombre del cargo. El catálogo no se copia ` +
      `a esta instancia, así que no hay carpeta \`agents/\` en la raíz: la ruta la da ` +
      `"node tools/ops.js agents list ${ROOT} --json" en el campo \`path\` del slug, y el contrato es ` +
      `\`<path>/SKILL.md\`.\n\n`
    : '')

  // Un plan que no sobrevive a la crítica deja de reintentarse a ciegas. Se registra la tarea como acción
  // humana, y eso hace dos cosas con un solo acto: `context` deja de ofrecerla —una acción pendiente saca
  // esa tarea de la cola y ofrece la siguiente, sin frenar la corrida— y alguien ve la fila.
  //
  // Antes, relanzar repetía **la corrida entera**: Ready y Decompose volvían a pasarla, porque su criterio
  // no cambió y la tarea tampoco, y Critique volvía a rechazarla. Medido en dos corridas consecutivas
  // sobre la misma tarea: idénticas, 9 agentes y ~780 k tokens cada una, sin escribir una línea (caso 081).
  //
  // Es el razonamiento de `claim-stuck`: si repetir no puede cambiar el resultado, no se repite. Y la
  // evidencia ya está completa dentro de una corrida —el rechazo llega después de una crítica, una
  // corrección y una segunda crítica—, así que no hace falta contar entre corridas ni inventar dónde
  // guardar ese contador: cuando esto ocurre, el WIP todavía no existe.
  //
  // Lo que la fila le pide a una persona lo dice R17: dos rechazos sobre lo mismo son el disparador
  // posterior de división. No se parte acá porque partir es una decisión, y ésa no le toca al recorrido.
  // Una parada que registra la fila **bloquea** la tarea: la fila pendiente la saca de la cola. Si además
  // el reclamo se queda puesto, el runner queda ocupado por algo que nadie puede tomar, y la corrida
  // siguiente —que hace bien en no reintentarla— muere reclamando la que sigue: `claim` le contesta «este
  // runner ya tiene …». Es la forma del 163 por la otra puerta, y la diferencia es que el estado lo creó
  // esta corrida, así que soltarlo también le toca (caso 176).
  //
  // Sólo las paradas de **antes** de construir. Las de después —`verify-regression`, `qa-failed`,
  // `commit-failed`— dejan el WIP en disco y es resumible: ahí el reclamo es lo único que dice de quién es
  // ese trabajo, y soltarlo lo abandonaría.
  //
  // Cuesta un agente, porque el recorrido no tiene con qué correr un comando. Un agente contra una
  // corrida entera.
  const releaseBlocked = async () => clerk(
    `Corré "node tools/ops.js release ${P} ${task.id}" desde ${ROOT}: quedó bloqueada por la fila que `
    + 'acabás de registrar y todavía no hay nada construido, así que su reserva no reserva trabajo. No '
    + 'escribas ningún archivo vos: lo escribe el comando.',
    { label: `release:${task.id}` },
  )

  // Sobre una superficie que la empresa declaró que no se puede romper, una sospecha bloqueante sin comprobar
  // no se corrige —sería cambiar código por una hipótesis (R14)— ni se entrega —sería fallar abierto sobre lo
  // crítico (R27)—: frena y la decide una persona. Fuera de esas superficies va al INBOX como el resto. La
  // reserva no se suelta: hay trabajo construido, y otro runner tomaría la tarea sobre un árbol con cambios.
  const uncheckedOnCritical = async (verdict) => {
    if (!verdict.critical) return null
    const unchecked = verdict.concerns.filter((one) => one.blocking && !one.decision && one.verified === false)
    if (!unchecked.length) return null
    const detail = unchecked.map(cite).join('; ')
    const note = await registerHuman(`Registrá ${task.id} en ${HUMAN}: el diff toca la superficie crítica `
      + `${verdict.critical} y la revisión señaló sin poder comprobarlo: ${detail}. La acción humana es `
      + 'comprobarlo antes de reanudar: si es un defecto, se corrige antes de entregar; si no lo es, se deja '
      + 'escrito por qué.', 'critical-human', task.id)
    return halt('review-unverified', `${verdict.critical}: ${detail}${note}`)
  }

  // Las dos paradas no dicen lo mismo. Tras la corrección hubo dos planes y dos rechazos, que es la tercera
  // barra de R17. Un `bloqueado` en la primera crítica es un plan y un motivo que corregirlo no toca, y casi
  // siempre es una decisión que falta: ahí «nadie pudo escribir un plan» es falso y mandar a partir la unidad
  // pide lo que no era. La crítica no tiene otra salida para una decisión, y en una corrida real además la
  // había anotado ella, así que quedaron dos filas por un solo bloqueo (caso 278).
  const planRejected = async (reason, unit, found) => {
    const detail = found.join('; ') || 'sin condiciones nombradas'
    const note = await registerHuman(reason === 'plan-blocked'
      ? `Registrá ${unit.id} en ${HUMAN}: la crítica frenó el plan por algo que corregirlo no resuelve. `
        + `Motivo: ${detail}. La acción humana es resolver ese motivo: si es una decisión, tomarla; si es que `
        + 'la unidad son dos resultados con vidas distintas, partirla o dejarla entera con la razón escrita. '
        + `Es una sola fila: si ${unit.id} ya tiene una pendiente por este mismo motivo, completala en vez de `
        + 'agregar otra.'
      : `Registrá ${unit.id} en ${HUMAN}: nadie pudo escribir un plan que sobreviva a la crítica. `
      + `Motivo: ${detail}. La acción humana es revisar si la unidad son dos resultados con vidas `
      + `distintas y partirla, o dejarla entera con la razón escrita.`, 'plan-human', unit.id)
    await releaseBlocked()
    return halt(reason, `${detail}${note}`)
  }

  // En una línea de trabajo la tarea se construye en un árbol propio. Las líneas comparten por enlace el
  // mismo checkout del producto, así que cortar la rama ahí lo dejaba parado en la tarea de una para todas
  // las demás (caso 274). Fuera de una línea no hay con quién pisarse y se trabaja en la carpeta que está:
  // un árbol aparte es para cuando dos sesiones se tocan.
  //
  // `declared` es el servicio como lo nombra planning, que es lo que viaja al WIP y a `done/`; `task.service`
  // pasa a ser dónde se trabaja. El comando reusa el árbol si ya existe, así que retomar cae en el mismo.
  const declared = task.service
  let tree = null
  if (planning.line) {
    phase('Worktree')
    tree = await clerk(
      `Corré "node tools/ops.js worktree ${P} ${task.id} --json" desde ${ROOT} y reportá sólo lo que imprimió: ` +
      `ok=true con exit 0, y path, work, branch y repo de sus campos. Si falla, ok=false y el mensaje en ` +
      `details. No crees ni toques ningún archivo vos: el árbol lo arma el comando.`,
      { schema: WORKTREE, label: `worktree:${task.id}` },
    )
    if (!tree || !tree.ok || !tree.work) {
      return halt('worktree-failed', `${task.id}: ${(tree && tree.details) || 'el comando no devolvió el árbol'}`)
    }
    task.service = tree.work
  }
  // Acompaña a toda fase que mira o toca el trabajo: sin esto buscan el diff en el checkout compartido, que
  // en una línea no tiene nada.
  const WHERE = tree ? ` El trabajo de ${task.id} está en ${tree.work}, un árbol de trabajo de ${tree.repo} en ` +
    `la rama ${tree.branch}: el diff, las pruebas y el commit son ahí y no en el checkout compartido, que no ` +
    'se toca.' : ''
  const resumedFromWip = Boolean(planning.wipActive)
  if (!planning.wipActive) {
    if (!mechanical || !vouched) {
      phase('Ready')
      const ready = await read(
        `${asRole(OWNERS.ready)}Revisá que ${task.id} tenga aceptación concreta, dependencias resueltas y ` +
        `ninguna decisión pendiente: ${task.acceptance}.${DECIDED()} Aclará la redacción y nada más; ` +
        `nunca amplíes el ` +
        `alcance.`,
        { schema: READY, label: 'ready' },
      )
      if (!ready) return halt('agent-unavailable', 'Ready no devolvió resultado')
      if (!ready.ready) {
        const note = await registerHuman(
          `Registrá ${task.id} en ${HUMAN} con el motivo y una acción humana exacta: ${ready.reason}.`,
          'ready-human', task.id)
        await releaseBlocked()
            return halt('not-ready', `${ready.reason}${note}`)
      }
      if (ready.refinedAcceptance) task.acceptance = ready.refinedAcceptance
    }

    if (!mechanical && !lite) {
      phase('Decompose')
      const estimate = await run(
        `Inspeccioná ${task.service} y estimá ${task.id}. Partila sólo si supera ${contract.maxTaskHours} horas.`,
        { schema: ESTIMATE, label: 'estimate' },
      )
      if (!estimate) return halt('agent-unavailable', 'Decompose no devolvió resultado')
      if (estimate.needsSplit) {
        // Una tarea que viene de una épica es además una historia suya, y la lista de historias no se
        // actualizaba sola: quedaba nombrando un slug que ya no existe en ninguna parte. Medido sobre un
        // banco, eso rompe por los dos lados según qué escriba el agente — con las subtareas declarando
        // la épica, `check` se pone en rojo en el acto («BACKLOG <sub>: no existe en epic-NNN»); sin
        // declararla pasa en verde y la épica **no puede cerrar nunca**, porque `closed` exige evidencia
        // de cada historia y la original jamás la va a tener.
        //
        // Es lo que R25 pide al decir que la unidad partida se cierra diciendo en qué se partió, y el
        // lugar donde eso se dice es la épica: ahí es donde la unidad vivía. En `done/` no va —su README
        // declara que es la evidencia de lo que una tarea **entregó**, y una partida no entregó nada—
        // (caso 169).
        const historias = task.epic
          ? ` ${task.id} es una historia de la épica ${task.epic}: reemplazá también ahí su historia por `
            + 'las de las subtareas, con el mismo criterio y el mismo service que traía.'
          : ''
        await write(`Reemplazá sólo ${task.id} en ${queueFile()} por subtareas ordenadas y verificables de forma ` +
          `independiente: ${JSON.stringify(estimate.subtasks)}.${historias}`, { label: 'split' })
        planning = await readContext()
        if (!planning) return halt('context-unavailable', `no se pudo releer el estado de ${P}`)
        // Misma forma que en Claim: si la cola sigue ofreciendo lo mismo, el estado no cambió y repetir
        // no lo va a cambiar. Acá lo que no cambió es una escritura que se le pidió a un agente, y darla
        // por hecha manda al bucle a partir la misma tarea otra vez.
        if (planning.hasTask && planning.slug === task.id) {
          return halt('split-not-applied', `se pidió reemplazar ${task.id} en ${queueFile()} por sus `
            + 'subtareas y la cola sigue ofreciéndola: la escritura no ocurrió como se pidió.')
        }
        // La tarea partida ya no existe, así que su reclamo no reserva nada: lo único que hace es dejar
        // al runner ocupado por un slug que no está ni en la cola ni en lo hecho. Ahí el Claim de la
        // primera subtarea se niega —«este runner ya tiene …»— y la corrida entera para con
        // `claim-stuck` sin construir nada. El reclamo lo puso esta corrida; soltarlo también le toca.
        //
        // Va **después** de la guarda de arriba y no antes de leer el contexto: si el reemplazo no
        // ocurrió, la tarea sigue viva y su reclamo tiene que seguir puesto (caso 163).
        await clerk(
          `Corré "node tools/ops.js release ${P} ${task.id}" desde ${ROOT}: quedó partida y su reserva `
          + 'ya no aplica. No escribas ningún archivo vos: lo escribe el comando.',
          { label: `release:${task.id}` },
        )
        log(`${task.id} quedó partida: la corrida sigue con ${nextUp(planning)}`)
        continue
      }
    }

    // El plan de un cambio mecánico es el cambio, y la aceptación ya lo nombra. Pedirlo igual costaba
    // dos llamadas —planificar y criticar el plan— para llegar a lo que la línea de la tarea ya decía.
    let plan = { steps: [`Aplicar en ${task.service} lo que nombra la aceptación: ${task.acceptance}`] }
    if (!mechanical) {
    phase('Plan')
    plan = await run(
      `${asRole(OWNERS.plan)}Inspeccioná el código real, las instrucciones del repositorio, las convenciones ` +
      `vecinas y el git status de ${task.id}.` +
      `${task.epicContext ? ` Contexto de la épica: ${task.epicContext}` : ''}` +
      ` Producí el plan más chico que satisfaga ` +
      `${task.acceptance}.${DECIDED()} Un archivo de planning no puede ser un archivo de implementación. ` +
      `El plan cubre ` +
      `sólo el cambio dentro de ${task.service}: correr los gates del repositorio, hacer QA, commitear y ` +
      `cerrar la tarea son fases posteriores de este recorrido, cada una con su dueño, así que no van como ` +
      `pasos.${OPERATOR}`,
      { schema: PLAN, label: 'plan' },
    )
    if (!plan) return halt('agent-unavailable', 'Plan no devolvió resultado')
    if (!lite) {
      phase('Critique')
      let critique = await read(
        `Atacá este plan por correctitud, alcance, seguridad, pruebas y conflictos con el código ` +
        `existente.${DECIDED()}${OPERATOR_SAID}${MANIFEST}${VERDICT}${REPLANNED} Plan: ${JSON.stringify(plan)}`,
        { schema: CRITIQUED, label: 'critique' },
      )
      if (!critique) return halt('agent-unavailable', 'Critique no devolvió resultado')
      // Un plan bloqueado no se corrige: lo que lo bloquea está fuera de lo que una segunda pasada puede
      // tocar, así que insistir gasta dos llamadas para llegar al mismo lugar.
      if (critique.verdict === 'bloqueado') {
        return planRejected('plan-blocked', task, blockers(critique))
      }
      // Sólo lo que cambia el plan compra la corrección: una condición para quien construye no necesita
      // otro plan ni otra crítica, y pedirlos costaba dos llamadas para volver al mismo plan.
      let kept = []
      if (replans(critique).length) {
        const first = carried(critique)
        kept = first.conditions
        // La corrección recibe también lo que no la pidió. La primera crítica de una corrida real resolvió
        // una decisión que el plan había dejado abierta, sin bloquear; el replan no se enteró, repitió lo
        // mismo y la segunda crítica frenó por eso (caso 249). El límite va escrito porque lo anotado suele
        // traer más cosas que lo bloqueante, y sin él la corrección se vuelve una ampliación (R3).
        plan = await read(
          `Corregí el plan una vez por: ${replans(critique).join('; ')}.`
          + (first.noted.length
            ? ` La crítica anotó además esto sin bloquear: ${first.noted.join('; ')}. Aplicá lo que ahí ya `
              + 'venga decidido y no amplíes el plan por el resto.' : '')
          + ` Plan: ${JSON.stringify(plan)}`,
          { schema: PLAN, label: 'replan' },
        )
        critique = await read(
          `Volvé a criticar el plan corregido contra ${task.acceptance}.${DECIDED()}${OPERATOR_SAID}${MANIFEST}` +
          `${VERDICT}` +
          `${REPLANNED} Plan: ${JSON.stringify(plan)}`,
          { schema: CRITIQUED, label: 'critique' },
        )
        if (!plan || !critique) return halt('agent-unavailable', 'la revisión del plan no devolvió resultado')
        if (critique.verdict === 'bloqueado' || replans(critique).length) {
          return planRejected('plan-rejected', task, replans(critique))
        }
      }
      // Lo anotado sale de la última crítica y no de las dos: lo de la primera ya viajó a la corrección, y
      // es sobre un plan que dejó de existir. Las condiciones de la primera sí se conservan: no cambian el
      // plan, así que la corrección no las recibe y la segunda crítica no tiene por qué repetirlas.
      approved = carried(critique)
      approved.conditions = [...kept, ...approved.conditions]
      // Acá el plan ya está aprobado por los dos caminos posibles, así que el contraste va una sola vez.
      if (!critique.consulted.length) return halt('critique-unbacked', 'aprobó el plan sin declarar qué inspeccionó')
    }
    }
    testStrategy = plan.testStrategy || ''
    phase('WIP')
    // Esta llamada escribe un archivo y nada más, y hay que decirlo con todas las letras. En una corrida
    // real hizo el trabajo entero: leyó los pasos del plan como una orden, implementó, corrió RED/GREEN,
    // cerró la tarea en DONE y dejó el WIP en IDLE. Build encontró todo hecho y lo atribuyó a «una corrida
    // anterior», así que Review, Verify y QA nunca vieron ese código y el recorrido terminó reportando algo
    // distinto de lo que decía planning. El permiso venía del preámbulo de escritura; lo que faltaba era el
    // límite. `wipActive` es el contraste: si el WIP no quedó activo, esta fase hizo otra cosa.
    // La ruta va escrita. El archivo del WIP sale del id de la sesión, y sin nombrarlo quien lo escribe lo
    // buscaba en el fuente del motor: cuatro o cinco llamadas por corrida, medidas.
    const persisted = await scribe(
      `Escribí el WIP en ${P}/${planning.wipFile} y nada más: es el archivo de esta sesión, y su formato es ` +
      `el contrato de WIP de este preámbulo; no los busques en otro lado. ` +
      `No toques código, no corras pruebas, no cierres la tarea y no escribas ` +
      `en DONE. Los pasos van numerados y sin tildar, uno por línea —«1. [ ] paso»—, porque todavía no ` +
      `ocurrieron y porque así los cuenta el motor; nada más en el archivo lleva esa forma. task=${task.id}, ` +
      `hito=${JSON.stringify(task.hito)}, phase=Build, service=${declared}, ` +
      `acceptance=${JSON.stringify(task.acceptance)}, lane=${lane}, ` +
      `pasos sin tildar=${JSON.stringify(plan.steps)}, ` +
      // La estrategia de prueba es `required` en el plan y hasta acá se descartaba, así que un paso que
      // decía «correr la mutación declarada en testStrategy» apuntaba a un lugar que no existía: quien
      // revisa no podía distinguir la mutación corrida de la pensada, y la única salida que le quedaba
      // era rehacer la revisión. R9 pide la mutación **declarada**, y el WIP es donde queda escrita.
      //
      // Es la tercera vez que algo decidido no llega a quien decide después: el contexto de la épica
      // (027), la descripción de la tarea (177) y esto. Las tres se arreglan igual — que viaje.
      `testStrategy=${JSON.stringify(testStrategy)}. ` +
      // Van al WIP porque es lo que lee una corrida que se reanuda: ahí `approved` vuelve vacío.
      (approved.conditions.length ? `Anotá en las decisiones del WIP, como condiciones con las que la crítica ` +
        `aprobó el plan y que quien construye tiene que cumplir: ${JSON.stringify(approved.conditions)}. ` : '') +
      (approved.noted.length ? `Y aparte, como anotado por la crítica sin bloquear, que no manda a tocar ` +
        `código: ${JSON.stringify(approved.noted)}. ` : '') +
      `Registrá el reparto de cargos ${JSON.stringify(cast)} en las decisiones del WIP, para que después se ` +
      `pueda auditar quién revisó qué. Seguí el contrato de WIP exactamente. Al terminar corré ` +
      `"node tools/ops.js context ${P} --json" desde ${ROOT} y reportá con qué status quedó y, en steps, ` +
      `cuántos pasos pendientes cuenta ese comando en su campo wip. Tienen que ser ${plan.steps.length}: si ` +
      `cuenta otra cantidad, el formato de los pasos está mal; corregilo sin cambiar su texto y volvé a correrlo.`,
      { label: 'wip', schema: {
        type: 'object', additionalProperties: false, required: ['wipActive', 'steps'],
        properties: { wipActive: { type: 'boolean' }, steps: { type: 'integer' }, note: { type: 'string' } },
      } },
    )
    if (!persisted) return halt('agent-unavailable', 'la persistencia del WIP no devolvió resultado')
    if (!persisted.wipActive) {
      return halt('wip-not-persisted', `${task.id} entra a Build sin WIP activo: ${persisted.note || ''}`)
    }
    // Un WIP activo no alcanza: el motor cuenta los pasos por su forma, y uno escrito como lista sin
    // numerar se lee como un plan vacío. Pasó en una corrida real y lo descubrió un guard al cerrar el turno,
    // con la tarea ya construida sobre un plan que el motor no veía (caso 305).
    if (persisted.steps !== plan.steps.length) {
      return halt('wip-malformed', `${task.id}: el plan tiene ${plan.steps.length} paso(s) y el motor cuenta `
        + `${persisted.steps} en el WIP: ${persisted.note || 'sin nota'}`)
    }
  }

  // Un WIP que viene de una corrida anterior con todos sus pasos tildados no tiene nada que construir, y
  // lanzar el agente para que lo confirme cuesta lo mismo que construir. El recorrido delegaba la
  // reanudación en el prompt —«retomá en el primer paso pendiente»—, así que el agente hacía lo correcto
  // y lo caro era haberlo llamado (caso 154).
  //
  // **La fase no se saltea: se saltea la llamada.** Los cuatro contrastes de abajo —la tarea cerrada en
  // Build, el rojo sin su fallo literal, el borde sin prueba, las decisiones abiertas— son lo único que
  // vuelve a mirar el disco, y darlos por buenos porque el WIP dice que está todo hecho camina al modo de
  // fallo que registra la fase WIP acá arriba: alguien construyó todo y Review, Verify y QA no lo vieron.
  // Por eso lo que sigue no afirma que la construcción estuvo bien, sólo que en **esta** corrida no hubo
  // ninguna: lo que ya estaba en disco lo revisan igual las fases siguientes, sobre el diff real.
  // Y la fase se anuncia distinto, que es la otra mitad del caso: hoy «Build corrió y construyó» y «Build
  // corrió, miró y no hizo nada» se ven idénticos salvo por el costo, así que R21 —que manda comprobar la
  // reanudación en vez de suponerla— no se puede cumplir sobre este recorrido sin abrir el `.output` y
  // sumar tokens a mano. El nombre viaja por el mismo canal que las otras quince fases: entra en `ran`,
  // que va al resultado de la corrida y a la entrada de DONE.
  const resumed = planning.wip && planning.wip.pending === 0 && planning.wip.complete > 0
  phase(resumed ? 'Build (reanudado)' : 'Build')
  const build = resumed ? reusedBuild(planning.wip) : await run(
    `${asRole(cast.build)}Implementá sólo ${task.id} dentro de ${task.service}. Retomá en el primer paso ` +
    `pendiente del WIP; comprobá en el disco los pasos ya hechos y tildá cada uno que salga bien. Para cada ` +
    `comportamiento escribí primero la prueba, corréla y anotá en redFirst el test y el fallo literal que ` +
    `dio; recién después implementá. Un test que pasa antes de que exista el código no asercia lo que dice ` +
    `aserciar: endurecelo y volvé a correr hasta verlo fallar. Corré las pruebas que necesites para ver ese ` +
    `rojo y ese verde, y nada más: los gates completos, el QA, el commit y el cierre son fases posteriores, ` +
    `así que no toques ${P}/done/ ni ${QUEUE} ni el status del WIP. Lo que el plan no previó va en discovered y ` +
    `no en el código a secas: kind=edge si esta tarea lo puede fijar —y entonces entra con su prueba, que ` +
    `nombrás en test y anotás en redFirst—. Lo que notaste y no impide entregar la aceptación es una de ` +
    `tres cosas, y el recorrido sigue con las tres. kind=open sólo si es una decisión que le toca a una ` +
    `persona: elegir entre opciones que cambian el rumbo del producto, el gasto, una obligación externa o ` +
    `el riesgo; ésa va a una fila que alguien tiene que contestar, así que no la uses para lo demás. ` +
    `kind=debt si es trabajo identificado que no es de esta tarea —un archivo sobre el umbral, un ` +
    `dependiente fuera del servicio—: queda anotado como deuda. kind=mutation si es una mutación que ` +
    `declarás y no corriste: decí qué se rompe y qué prueba tiene que ponerse roja, y la corre QA. ` +
    `kind=note si no hay nada que decidir ni que hacer —una elección de redacción, un supuesto que ya ` +
    `tomaste, algo que se acepta como está—: queda escrito en el cierre de la tarea. Si dudás entre open y ` +
    `otra, es open: una pregunta de más cuesta menos que una decisión que nadie vio. Si de verdad no podés ` +
    `entregar sin esa decisión, eso no va en discovered: es completed=false con su blocker. ` +
    `Aceptación: ${task.acceptance}.${DECIDED()}`
    + (testStrategy ? ` Estrategia de prueba que el plan fijó: ${testStrategy}` : '')
    + (approved.conditions.length ? ` La crítica aprobó el plan con estas condiciones, que cumplís al `
      + `escribir: ${approved.conditions.join('; ')}.` : '')
    + OPERATOR + WHERE,
    { schema: BUILD, label: 'build' },
  )
  if (!build) return halt('agent-unavailable', 'Build no devolvió resultado')
  if (!build.completed) return halt('build-blocked', (build.blockers || []).join('; ') || build.summary)
  // Construir no es cerrar. Pasó en una corrida real: el plan traía «VERIFY», «QA» y «Cierre — commit» como
  // pasos, quien construyó los ejecutó, y la tarea salió del BACKLOG y entró a DONE sin que Review, Verify
  // ni QA la miraran. El plan ya no los pide; esto detecta que igual hayan ocurrido.
  if (build.closedTask) {
    return halt('build-closed-task', `${task.id} se cerró en Build, sin pasar por Review, Verify ni QA`)
  }
  // Nombrar el test sin traer su fallo es volver a afirmar que hubo rojo, que es lo que el campo evita.
  const unproven = build.redFirst.find((entry) => !entry.failure.trim())
  if (unproven) return halt('build-unproven', `${unproven.test} se declara en rojo sin el fallo que lo muestra`)
  // Lo que queda abierto no lo cierra quien lo encuentra, pero tampoco frena lo que sí se pudo entregar.
  // Tres corridas reales terminaron acá y las tres traían `completed: true`: el hueco nunca fue «no puedo»
  // sino «hay un borde que alguien tiene que decidir», y una aceptación escrita en prosa siempre tiene uno.
  // Frenar por eso frenaba siempre, que es el freno que R6 desaconseja. Lo que de verdad bloquea ya
  // tiene camino —`completed: false` con su blocker—; esto se registra y sigue.
  //
  // Y lo que se registra tiene tres destinos, los mismos que ya tenía Review. Con uno solo, todo lo que
  // Build notaba y no arreglaba era por definición una pregunta a una persona: en una instancia fueron 18
  // filas en dos días para 6 tareas, y 2 pedían el criterio de alguien (caso 250). El tope es el de
  // Review y por lo mismo; lo que no entra queda contado en el hecho que viaja a `done/`.
  const found = (kind) => [...new Set(build.discovered.filter((entry) => entry.kind === kind)
    .map((entry) => entry.detail))]
  const kept = (kind) => found(kind).slice(0, INBOX_CAP)
  const spilled = ['open', 'debt', 'note', 'mutation'].map((kind) => [kind, found(kind).length - kept(kind).length])
    .filter(([, extra]) => extra > 0).map(([kind, extra]) => `${extra} ${kind} sin volcar`)
  const buildNotes = kept('note')
  // Una mutación declarada y no corrida no es una pregunta ni deuda: es trabajo que un agente puede hacer
  // en una copia, y la fase que ya trabaja así es QA. Como fila se cerraba pidiendo que alguien la corriera
  // (caso 256).
  const unrun = kept('mutation')
  const buildFact = build.summary + (spilled.length ? ` · ${spilled.join(' · ')}` : '')
  if (kept('debt').length) {
    const origin = inboxOrigin('autobuild', task.id, planning.today)
    await write(`Registrá en ${inboxWhere(P, 'Deuda')} el trabajo que el build de ${task.id} identificó y ` +
      `no es de esta tarea, sin promover ninguno. ${INBOX_FILES} ` +
      `${inboxAsk(['Deuda'], planning.inbox, origin)} ` +
      // Entero y no recortado, a diferencia de lo que anota Review: aquello sigue completo en `done/`, y
      // esto no queda en ningún otro lado. Recortado, la entrada terminaba en «…» y la revisión siguiente
      // proponía completarla (caso 272).
      `Lo anotado: ${JSON.stringify(kept('debt').map((detail) => `${detail.split('\n')[0].trim()} ${origin}`))}`,
    { label: 'build-debt' })
  }
  const openDecisions = kept('open').map((detail) => ({ detail }))
  if (openDecisions.length) {
    // Y la fila no puede nombrar a la tarea que la produjo. El motor bloquea por esa primera celda
    // exacta, así que escribirla ahí registra «esto no impide entregar» y produce el bloqueo igual —lo
    // contrario de lo que este registro decidió dos líneas arriba—. No se nota mientras la corrida vive,
    // porque el WIP activo manda sobre la acción humana; aparece cuando el WIP cierra, y entonces la
    // tarea queda frenada por una pregunta que ya se había resuelto seguir sin contestar. En la corrida
    // que lo mostró la atrapó Review, tres fases después de escribirla.
    await write(`Registrá en ${HUMAN} una fila por cada decisión que ${task.id} dejó abierta, con qué la ` +
      `cierra y quién puede tomarla. La primera columna nunca es ${task.id}: el motor bloquea por esa ` +
      `celda exacta y estas decisiones no impiden entregarla. Va la épica, el hito o el recorrido al que ` +
      `alcanza la decisión. No inventes responsables ni fechas: ` +
      `${JSON.stringify(openDecisions.map((entry) => entry.detail))}`, { label: 'open-decisions' })
  }
  // Y un caso que sí se fijó acá entra con su prueba o no entró: sin ella el comportamiento nuevo queda
  // sin nada que lo sostenga, y nadie sabe después que debía existir.
  //
  // Los dos campos salen de la misma respuesta pero se escriben por separado, así que pedirles la misma
  // cadena exacta frena una tarea correcta por haber nombrado el test de dos formas —`TestAlta` acá y
  // `users_test.go::TestAlta` allá—. Alcanza con que uno nombre al otro; lo que sigue frenando, que es de
  // lo que se trata, es el caso que no aparece en ningún rojo.
  //
  // Y la contención sola no alcanza, porque el caso que aparece no es que uno esté contenido en el otro:
  // los dos nombran el mismo test y cada uno le agrega **su propia** anotación entre paréntesis —dónde
  // está la línea de un lado, por qué se vio en rojo del otro—. Ahí ninguno contiene al otro y la puerta
  // frenaba una entrega correcta, que es lo que R26 dice que termina apagándola. Se compara sin esa
  // anotación final; una que esté en el medio se conserva, porque ahí sí es parte del nombre.
  //
  // Tampoco alcanzó, dos veces más y en corridas reales: los dos nombran el mismo caso con otra ruta hasta
  // él. Uno pone el `describe` en el medio —«archivo › Servicio.metodo › caso» contra «archivo › caso»— y el
  // otro junta dos casos del mismo archivo en un rojo —«archivo — 'caso A' y 'caso B'»— (caso 306).
  //
  // Se compara por tramos enteros: todo tramo con que el borde nombra su prueba tiene que estar, igual,
  // entre los del rojo. Buscar el nombre del caso como texto dentro del rojo era la salida fácil y daba verde
  // de más: «rechaza el token» está dentro de «no rechaza el token de servicio», y el mismo archivo en otra
  // carpeta pasaba por tener el mismo nombre. Un falso verde acá es un borde que entra sin prueba.
  const core = (name) => String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  const bare = (part) => part.replace(/^['"`«]+|['"`»]+$/g, '').trim()
  const parts = (name) => core(name).split(/\s+(?:›|>|—)\s+|::/).map(bare).filter(Boolean)
  // En un rojo que junta varios casos, cada uno va entre comillas: también cuentan como tramos.
  const quoted = (name) => [...core(name).matchAll(/'([^']+)'|"([^"]+)"|`([^`]+)`|«([^»]+)»/g)]
    .map((found) => (found[1] || found[2] || found[3] || found[4]).trim())
  const sameCase = (red, item) => {
    const named = new Set([...parts(red.test), ...quoted(red.test)])
    return parts(item.test).every((part) => named.has(part))
  }
  const namesTest = (red, item) => Boolean(core(item.test))
    && (core(red.test).includes(core(item.test)) || core(item.test).includes(core(red.test)) || sameCase(red, item))
  const loose = build.discovered.find((entry) => entry.kind === 'edge'
    && !build.redFirst.some((red) => namesTest(red, entry)))
  // El motivo dice qué comprobó la puerta y no una conclusión sobre el trabajo: pegarle al detalle del
  // build un «entró sin la prueba que lo fija» producía una parada que se contradecía sola cuando el
  // detalle contaba que la prueba sí estaba —la frase del agente y la de la puerta hablaban de cosas
  // distintas y se leían como una—.
  if (loose) {
    return halt('edge-unproven', `${loose.detail} — su campo "test" (${loose.test || 'vacío'}) no nombra `
      + `ninguno de los rojos declarados: ${build.redFirst.map((red) => red.test).join(' | ') || '(ninguno)'}`)
  }

  // Qué revisión hubo, para que el cierre no pueda inventar una. Nace diciendo que no hubo porque
  // `express` no convoca a nadie, y ése es el caso que se escribió como si un cargo hubiera aprobado.
  let reviewFact = 'no corrió (el carril express no convoca revisor)'
  if (express && planning.surfacesPending) reviewFact += ' · «Qué no se puede romper» tiene filas sin declarar'
  if (!express) {
    phase('Review')
    let review = await run(
      // La aceptación va en el prompt: es contra lo que se juzga el diff, y la del BACKLOG no trae lo que Ready
      // pudo haber refinado en esta corrida (caso 210).
      `${asRole(cast.review)}Revisá el diff real de ${task.id} contra su aceptación —${task.acceptance}— y por ` +
      `regresiones, seguridad, arquitectura, código ` +
      `generado, migraciones y alcance accidental. Cada cargo revisa su dominio, no el ajeno.${WHERE}` +
      (approved.conditions.length ? ` La crítica aprobó el plan con estas condiciones; comprobá sobre el ` +
        `diff que cada una se cumplió, y la que no, es un hallazgo: ${approved.conditions.join('; ')}.`
        // Una corrida que retoma no pasó por la crítica, así que no las trae en memoria: están en el WIP,
        // que Build lee y Review no. Sin esto quien tenía que comprobarlas no se enteraba (caso 267).
        : resumedFromWip ? ` Esta corrida retomó desde el WIP. Abrí ${P}/${planning.wipFile}: si registra ` +
          'condiciones con las que la crítica aprobó el plan, comprobá sobre el diff que cada una se ' +
          'cumplió, y la que no, es un hallazgo.' : '') +
      `${MANIFEST}` +
      `${VERDICT}${RULED}${SURFACED()}`,
      { schema: REVIEWED, label: 'review' },
    )
    if (!review) return halt('agent-unavailable', 'Review no devolvió resultado')
    grounded(review)
    // Se junta apenas cada pasada contesta, y no al final: las paradas de abajo salen antes de llegar al
    // registro, y sin esto lo que el revisor señaló se iba con la corrida.
    const reviewDecisions = review.concerns.filter((one) => one.decision)
    // Lo que esta pasada manda a corregir, con su regla al lado. Se guarda antes de la re-revisión, que
    // reasigna `review`: sin esto lo corregido no llegaba a `done/` y la misma falla corregida en diez
    // tareas no dejaba rastro en ninguna (caso 207).
    // Se acumula por vuelta: desde el 343 puede haber dos, y `done/` registra las dos.
    const fixed = [...blockers(review)]
    // Lo que esta pasada sospechó sin comprobar va al INBOX y no a corregir. Se guarda por lo mismo que
    // `fixed`: si la re-revisión no lo repite, sin esto no llegaba a ningún lado.
    const suspected = review.concerns.filter((one) => one.blocking && !one.decision && one.verified === false)
    let decidedNote = ''
    if (review.verdict === 'bloqueado') {
      return halt('review-blocked', named(review).join('; ') || 'sin condiciones nombradas')
    }
    const unproven = await uncheckedOnCritical(review)
    if (unproven) return unproven
    if (blockers(review).length) {
      // «Sólo estos hallazgos» acota el alcance (R6) y por sí solo deja un cabo suelto: una corrección
      // tiene dependientes y no se anuncian —el conteo que enumeraba lo que cambió, el comentario que
      // describía la forma vieja, la fila que la afirmaba—. Es R9 leído al derecho: lo que deja de valer
      // se lleva puesto a quien lo daba por cierto, y eso vive casi siempre en otro archivo.
      //
      // Sin pedirlo, la vuelta siguiente rechaza por la deriva que la corrección acabó de crear, y como
      // la vuelta es una sola eso termina en `review-failed` sobre trabajo correcto. Medido: una
      // corrección agregó una mutación y un caso de prueba, y la re-revisión frenó porque la fila de
      // acciones humanas seguía diciendo el número viejo y dos comentarios seguían contando los casos
      // anteriores —corrida `wf_99130468-2c4`, 2026-09-17, sobre un banco desechable—. Traerlos no
      // amplía el alcance: es terminar la corrección.
      //
      // Y la vuelta ya no es una sola: una re-revisión `con-condiciones` cuyos bloqueantes son nuevos,
      // comprobados y traen su corrección entera —`fixable`— compra una corrección más, con tope de dos por
      // tarea. Medido sobre los diarios de esta máquina: 24 de 40 correcciones terminaban en `review-failed`
      // con un bloqueante que la primera pasada no había visto, y en la corrida que originó el 343 lo que
      // faltaba era una frase de un comentario. Lo que no declara `fixable`, y `bloqueado`, paran como antes.
      const ROUNDS = 2
      for (let round = 1; blockers(review).length; round += 1) {
        await write(`Corregí sólo estos hallazgos con evidencia y actualizá el WIP: ${blockers(review).join('; ')}. `
          + 'Traé también lo que tu propia corrección deje desactualizado —un conteo, un comentario que '
          + `describa la forma vieja, una fila que la enumere— y nada más que eso.${WHERE}`,
          { label: 'review-fix' })
        review = await run(`Volvé a revisar el diff corregido de ${task.id} contra su aceptación `
          + `—${task.acceptance}—.${WHERE}${MANIFEST}${VERDICT}${RULED}${SURFACED()}`,
          { schema: REVIEWED, label: 'review' })
        if (!review) return halt('agent-unavailable', 'la re-revisión no devolvió resultado')
        grounded(review)
        const unprovenAgain = await uncheckedOnCritical(review)
        if (unprovenAgain) return unprovenAgain
        reviewDecisions.push(...review.concerns.filter((one) => one.decision))
        const again = review.concerns.filter((one) => one.blocking && !one.decision && one.verified !== false)
        const buys = round < ROUNDS && review.verdict === 'con-condiciones'
          && again.every((one) => one.fixable === true)
        if (review.verdict === 'bloqueado' || (again.length && !buys)) {
          return halt('review-failed', named(review).join('; ') || 'sin condiciones nombradas')
        }
        if (!again.length) break
        fixed.push(...blockers(review))
      }
    }
    // Con reglas que rigen, aprobar sin nombrar contra cuáles es la misma falla que la de abajo en otro eje.
    if (governing.length && !(review.rules || []).length) {
      return halt('review-unbacked', 'aprobó el diff sin nombrar contra qué reglas revisó')
    }
    if (governing.length) log(`Review contra: ${review.rules.join(', ')}`)
    // Aprobar sin declarar qué se abrió no se arregla mandando a tocar código: falló quien revisó.
    if (!review.consulted.length) return halt('review-unbacked', 'aprobó el diff sin declarar qué inspeccionó')
    // Contra qué reglas se revisó va también a la entrada de DONE, y no sólo al journal: el journal muere
    // con la corrida y la entrada queda, así que sin esto no había cómo reconstruir contra cuáles se
    // revisó cuando alguien audita la entrega meses después (caso 122).
    // Lo que la revisión encontró y no le toca resolver va a la fila que una persona lee. No al INBOX, que
    // es para propuestas: quien lo lea ahí puede promoverlo, y esto no se promueve, se decide.
    //
    // Se acumula desde la primera pasada y no se lee sólo de la última: al corrector se le pasa nada más
    // lo que manda a corregir, así que nunca se entera de la decisión y no la puede cerrar. Leyendo sólo
    // la re-revisión, una decisión que el agente no repitiera desaparecía sin dejar rastro, y el mismo
    // camino la perdía entera cuando la revisión paraba antes de llegar acá.
    //
    // El tope es el mismo del INBOX y por la misma razón: una revisión que deja treinta filas en una tabla
    // que lee una persona no está priorizando (caso 101). Lo que no entra queda contado en el hecho.
    const decided = [...new Set(reviewDecisions.map((one) => one.detail))]
    const filed = decided.slice(0, INBOX_CAP)
    if (filed.length) {
      // La nota que devuelve viaja al hecho: sin ella la entrega afirma una fila que el disco no tiene,
      // que es el caso 087 entrando por otra puerta.
      const note = await registerHuman(`Registrá en ${HUMAN} una fila por cada decisión que la revisión de `
        + `${task.id} dejó abierta, con qué la cierra y quién puede tomarla. La primera columna nunca es `
        + `${task.id} —el porqué es el mismo que en Build—: va la épica, el hito o el recorrido al que `
        + `alcanza. No inventes responsables ni fechas: ${JSON.stringify(filed)}`, 'review-human')
      decidedNote = `${note}`
    }
    // El árbol de la tarea primero, que puede colgar de la raíz: si no, la entrada nombraría uno que al
    // cerrar ya no existe (caso 277).
    const seated = (one) => [tree && tree.work, tree && tree.path]
      .reduce((out, from) => (from ? out.split(from).join(declared) : out), one)
    reviewFact = `${review.verdict} por ${cast.review}, sobre `
      + review.consulted.map((one) => local(seated(one))).join(', ')
      + (filed.length ? ` · ${filed.length} decisión(es) registrada(s)${decidedNote}` : '')
      + (decided.length > filed.length ? ` · ${decided.length - filed.length} decisión(es) sin volcar` : '')
      + ((review.rules || []).length ? ` · reglas: ${review.rules.join(', ')}` : '')
    // Qué superficie crítica tocó, dicho siempre: «no toca ninguna» también es lo que se miró. Y si la tabla
    // está sin declarar se dice acá, que es lo que llega a `done/`, en vez de suponer que no hay ninguna.
    reviewFact += review.critical ? ` · toca la superficie crítica ${review.critical}`
      : surfaces.length ? ' · no toca superficies críticas' : ''
    if (planning.surfacesPending) reviewFact += ' · «Qué no se puede romper» tiene filas sin declarar'
    // El tope y el conteo de lo que no entra son los del INBOX, más abajo, y por la misma razón.
    if (fixed.length) {
      reviewFact += ` · corregido: ${fixed.slice(0, INBOX_CAP).join(' | ')}`
        + (fixed.length > INBOX_CAP ? ` · y ${fixed.length - INBOX_CAP} más` : '')
    }
    // Lo que no impide entregar no manda a tocar código, y tampoco desaparece: la mejora opinable que se
    // corrige a las apuradas cuesta una vuelta y un riesgo que nadie pidió. Va a Propuestas y no a
    // Lecciones porque lo que la revisión anotó es un cambio del producto —su evidencia es la de la
    // tarea, que queda en `done/`—; Lecciones es sobre cómo trabajamos, y ahí el hallazgo queda
    // esperando una promoción que nadie va a hacer.
    // De qué vía salió cada una: este recorrido, la tarea que la dejó anotada y la fecha del motor. La
    // arma el recorrido, que es el único de los dos que sabe las tres cosas (caso 115).
    const origin = inboxOrigin('autobuild', task.id, planning.today)
    // Lo marcado como decisión ya tiene destino y no se duplica acá: escrito en los dos lados, además de
    // aparecer dos veces, le come una ranura del tope a una propuesta que sí lo era.
    // Un bloqueante sin comprobar cae acá y no en la corrección, marcado: quien lo lea sabe que es una
    // sospecha y no un defecto establecido.
    // La constancia —lo que se miró y dio bien— no propone nada: va al hecho de revisión y no al INBOX, donde
    // le comía una ranura del tope a lo que sí era una propuesta. Se compara contra `false` para que un
    // hallazgo que no lo declare siga yendo al INBOX, que es donde alguien lo lee.
    const isRecord = (one) => !one.blocking && !one.decision && one.proposes === false
    const records = [...new Set(review.concerns.filter(isRecord).map(cite))]
    if (records.length) {
      reviewFact += ` · constató: ${records.slice(0, INBOX_CAP).join(' | ')}`
        + (records.length > INBOX_CAP ? ` · y ${records.length - INBOX_CAP} más` : '')
    }
    const noted = [...new Set([...review.concerns, ...suspected]
      .filter((one) => !one.decision && !isRecord(one) && (!one.blocking || one.verified === false))
      .map((one) => withOrigin(`${one.blocking ? '[sin verificar] ' : ''}${cite(one)}`, origin)))]
    const kept = noted.slice(0, INBOX_CAP)
    // Lo que pasa del tope no se escribe y tampoco desaparece: queda contado en el hecho de revisión, que
    // viaja a `done/`. Una revisión que anota treinta y seis cosas no está priorizando, y el INBOX no las
    // iba a leer (caso 101).
    if (noted.length > kept.length) {
      reviewFact += ` · ${noted.length - kept.length} anotado(s) sin volcar al INBOX`
    }
    if (kept.length) {
      await write(`Registrá en ${inboxWhere(P, 'Propuestas')} lo que la revisión de ${task.id} dejó ` +
        `anotado sin frenar la entrega, sin promover ninguna. ${INBOX_FILES} ` +
        `${inboxAsk(['Propuestas'], planning.inbox, origin)} ` +
        `Lo anotado: ${JSON.stringify(kept)}`, { label: 'review-noted' })
    }
  }

  phase('Verify')
  // Lo declarado `(fuera de verify: …)` se separa acá y no se le explica a Verify: la aceptación es texto
  // conocido antes de preguntar, y dejar que el modelo reconozca la marca en la respuesta es apostar a que
  // enumere los criterios con el mismo corte. `check` ofrecía la marca y el recorrido la mandaba igual,
  // así que la condición terminaba en `uncovered` y la corrida en `verify-hollow` (caso 195).
  const conditions = acceptanceConditions(task.acceptance)
  const outOfVerify = conditions.filter((one) => OUT_OF_VERIFY.test(one))
  const checkable = outOfVerify.length
    ? conditions.filter((one) => !OUT_OF_VERIFY.test(one)).join('; ')
      || 'ninguna: todas se declararon fuera de verify'
    : task.acceptance
  // Lo declarado fuera de verify tampoco frena cuando Verify lo trae igual. No se le manda, pero la tarea
  // entera está en el WIP y en la cola, así que la lee de ahí y la devuelve sin cubrir: en una corrida real
  // `verify-hollow` paró por «el job e2e del CI queda en verde», que la aceptación marcaba fuera (caso 290).
  // Verify la reescribe a su modo —le pone número, le saca la marca—, así que se compara por palabras.
  const wordsIn = (text) => new Set(String(text).replace(OUT_OF_VERIFY, ' ').toLowerCase()
    .split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3))
  const declaredOut = (criterion) => outOfVerify.some((condition) => {
    const said = wordsIn(criterion)
    const declared = wordsIn(condition)
    const shared = [...said].filter((word) => declared.has(word)).length
    return shared > 0 && shared >= 0.6 * Math.min(said.size, declared.size)
  })
  // La causa se pide por criterio. Atada al diff —`no-surface` sólo si la tarea no tocaba nada ejecutable—,
  // la condición que se cumple en un documento salía `missing-test` apenas viajaba con código: el rebote
  // pedía una prueba para prosa, y o la conseguía o la corrida paraba en `verify-hollow` (caso 345). Lo que
  // sigue sosteniendo que no se use para cerrar código sin pruebas es `check`, que juzga el `n/a` entero
  // contra lo que tocó el commit; en la tarea mixta, cada `n/a` queda en `done/` con su razón al lado.
  const VERIFY_ASK = `${asRole(cast.verify)}Abrí el fuente de los tests que la tarea agregó o cambió y ` +
    `contrastá cada criterio ` +
    `de aceptación contra sus aserciones: en uncovered va el criterio que ningún test codifica, con su causa ` +
    `—missing-test si el test falta o no asercia la propiedad, ambiguous si el criterio no dice qué habría ` +
    `que aserciar, no-surface si ese criterio se cumple en un artefacto que no se ejecuta (un archivo que ` +
    `termina en ${NON_EXECUTABLE.join(', ')}, un comentario o una decisión escrita), y con reason diciendo ` +
    `cuál y dónde quedó—. La causa es de cada criterio y no de la tarea: que el diff toque código no vuelve ` +
    `missing-test al que se cumple en un documento, y el criterio que describe una conducta del código es ` +
    `missing-test aunque el resto de la tarea sea documentación. En ` +
    `covered va cada criterio que un test sí codifica, por partes: en file, la ruta del archivo de pruebas ` +
    `desde la raíz de ${task.service}; en name, el nombre de la prueba tal como está escrito en ese archivo ` +
    `—el texto de su it, test o función, sin los describe que la contienen ni lo que el runner le agrega al ` +
    `mostrarla—; y en note, sólo si hace falta, una aclaración corta. Una entrada por prueba: si dos pruebas ` +
    `cubren un criterio, van dos. Si lo que lo cubre no es un archivo de pruebas, file va vacío y name dice qué. ` +
    `Un test que pasa sin aserciarla no la cubre. Después corré los gates reales de ${task.service}.${WHERE} ` +
    // Descubrir la puerta es trabajo de modelo repetido en cada tarea sobre una respuesta que no cambia,
    // y encima adivinable: el proyecto la declara en `verify` y ahí deja de adivinarse. Cuando no la
    // declara se vuelve a descubrir, que es lo que pasaba siempre.
    (contract.gates && contract.gates.length
      ? `El proyecto las declara y no hay que descubrirlas —${contract.gates.join(' · ')}—: corré la de ` +
        `la raíz que contiene ese servicio, tal cual y desde esa raíz. Si falla por algo que la tarea no ` +
        `tocó, decilo en vez de arreglarlo. ` +
        // La puerta nombra al servicio por su ruta en la raíz, y en una línea esa ruta es el checkout que
        // comparten todas: corrida tal cual da verde sobre un código que no tiene la tarea (caso 276).
        (tree ? `Esa puerta nombra al servicio por su ruta en la raíz, que acá es el checkout compartido y ` +
          `no tiene este trabajo: corré el mismo comando con esa ruta cambiada por ${tree.work}, y reportá ` +
          `el comando como lo corriste. Un verde sobre el checkout compartido no cuenta. ` : '')
      : `El proyecto no declara con qué se verifica, así que descubrilo: primero las instrucciones del ` +
        `repositorio, después el test, lint, typecheck y build que apliquen. `) +
    `Leé los exit codes de verdad. ` +
    `passed=true exige comandos corridos y ninguna regresión causada por la tarea. Marcá ranTests en el ` +
    `comando que haya corrido las pruebas, sea cual sea su nombre. ` +
    `Aceptación: ${checkable}.`
  let verified = await run(VERIFY_ASK, { schema: VERIFY, label: 'verify' })
  if (!verified) return halt('agent-unavailable', 'Verify no devolvió resultado')
  // Un criterio que nadie sabe cómo aserciar no es trabajo que falta sino una definición que falta, y
  // definirla acá sería inventarla. Escribir la prueba que falta, en cambio, es trabajo del recorrido:
  // hacer parar a una persona por eso le cobra una interrupción por algo que se resolvía solo.
  const ambiguous = verified.uncovered
    .find((entry) => entry.cause === 'ambiguous' && !declaredOut(entry.criterion))
  if (ambiguous) {
    const note = await registerHuman(
      `Registrá ${task.id} en ${HUMAN}: el criterio "${ambiguous.criterion}" no dice qué habría ` +
      `que aserciar, y hace falta la decisión que lo fija.`, 'verify-human', task.id)
    return halt('acceptance-ambiguous', `${ambiguous.criterion}${note}`)
  }
  // Lo que no tiene superficie no frena ni rebota: viaja a Done, que lo escribe como `tests: n/a`. Se filtra
  // por exclusión y no por `missing-test` para que una causa que no se conozca siga frenando (R27).
  //
  // Salvo cuando es todo lo que hay y la tarea escribió pruebas: ahí `no-surface` en cada criterio contradice
  // al propio Build, y `check` lo rechazaría recién en Done, con el trabajo entero hecho. Frena acá.
  const allNoSurface = () => build.redFirst.length > 0 && !(verified.covered || []).length
    && verified.uncovered.every((entry) => entry.cause === 'no-surface')
  const lacking = () => verified.uncovered
    .filter((entry) => (entry.cause !== 'no-surface' || allNoSurface()) && !declaredOut(entry.criterion))
  if (lacking().length) {
    await run(`${asRole(cast.build)}Escribí sólo las pruebas que faltan en ${task.id}, con el mismo rojo ` +
      `previo, y no toques el código de producción: ${lacking().map((e) => e.criterion).join('; ')}`,
      { label: 'missing-tests' })
    verified = await run(VERIFY_ASK, { schema: VERIFY, label: 'verify' })
    if (!verified) return halt('agent-unavailable', 'la segunda pasada de Verify no devolvió resultado')
  }
  if (!verified.passed || !verified.commands.length) return halt('verify-failed', verified.details)
  // Verde por ausencia: los gates pasaron y ninguno corrió las pruebas que esta tarea escribió. El exit
  // code de lint o de build no dice nada del comportamiento, y la corrida cerraba igual.
  const ranTests = verified.commands.some((entry) => entry.ranTests || RUNS_TESTS.test(entry.cmd))
  if (build.redFirst.length && !ranTests) {
    return halt('verify-untested', `${task.id} escribió pruebas y ningún gate corrió una`)
  }
  if (lacking().length) {
    return halt('verify-hollow', `sin test que lo codifique: ${lacking().map((e) => e.criterion).join('; ')}`)
  }
  const noSurface = verified.uncovered.filter((entry) => entry.cause === 'no-surface')
  // La traza la arma el recorrido, siempre igual: `archivo › «nombre» — aclaración`. Así `ops evidence` lee el
  // archivo y el nombre sin adivinar dónde termina uno y empieza la prosa. Lo que partiría esa forma no viaja
  // adentro: el `;` separa trazas en `tests:`, `»` cierra el nombre, y `›` separa el archivo.
  const plain = (text) => String(text || '').replace(/\s+/g, ' ').replace(/;/g, ',').trim()
  // La ruta como está en disco desde su raíz: sin el prefijo de la máquina ni el del árbol de la tarea, y sin
  // cambiarlo por el nombre del servicio, que puede no ser el de su carpeta. `ops evidence` busca por cómo
  // termina la ruta.
  const roots = [tree && tree.work, tree && tree.path, ...(ROOT.startsWith('/') ? homes() : []).map(([from]) => from)]
  const fromRoot = (file) => roots.filter(Boolean)
    .reduce((out, from) => (out.startsWith(`${from}/`) ? out.slice(from.length + 1) : out), file)
  const covered = (verified.covered || []).map(({ criterion, file, name, note }) => {
    const where = fromRoot(plain(String(file || '').replace(/[›«»]/g, ''))).replace(/^\.\//, '')
    const what = plain(name).replace(/»/g, '"')
    // Una ruta con espacios no cabe en la forma, y sin nombre no hay prueba que buscar: van en la aclaración.
    const loose = where && (/\s/.test(where) || !what)
    const said = [loose ? `archivo: ${where}` : '', plain(note), `criterio: ${plain(criterion)}`]
      .filter(Boolean).join(' · ')
    return { criterion, trace: `${where && !loose ? `${where} › ` : ''}${what ? `«${what}» — ` : ''}${said}` }
  })
  const onlyDocument = noSurface.length > 0 && !covered.length

  // QA ejercita comportamiento, y lo mecánico no lo cambia: el valor literal que la aceptación nombra
  // ya lo comprobó Verify contra el test, y en `directo` además lo mira el revisor que nombra el cast.
  let qa = { passed: true, evidence: 'carril mecánico: la aceptación queda comprobada en Verify' }
  if (!mechanical) {
    phase('QA')
    qa = await run(onlyDocument
      ? `${asRole(cast.qa)}${task.id} no tiene superficie ejecutable: comprobá que el documento existe y cubre ` +
        `cada elemento que la aceptación enumera, y en evidence decí cuáles encontraste y dónde. ` +
        `Aceptación: ${checkable}.`
      : `${asRole(cast.qa)}${lite
        ? 'Hacé la comprobación de aceptación real más barata'
        : 'Ejercitá el comportamiento real que ve quien lo usa'} para ` +
      `${task.id}. Las pruebas unitarias solas no son QA. Levantá el mínimo runtime necesario y bajalo ` +
      `después. Aceptación: ${checkable}.${WHERE}`
      + (unrun.length ? ' El build declaró estas mutaciones y no las corrió. Corré cada una en una copia '
        + 'desechable del repositorio, nunca en el árbol de trabajo, y reportala en mutations con red=true si '
        + `la prueba que nombra se puso roja y la salida que lo muestra en output: ${JSON.stringify(unrun)}. `
        + 'Una que no se ponga roja no hace fallar el QA: se reporta con red=false.' : ''),
      { schema: QA, label: 'qa' },
    )
    if (!qa) return halt('agent-unavailable', 'QA no devolvió resultado')
    if (!qa.passed) return halt('qa-failed', qa.evidence)
  }

  // Lo que pasó con cada mutación declarada, dicho siempre: la que se puso roja, la que sobrevivió y la que
  // nadie corrió —porque el carril no pasa por QA, o porque QA no la reportó— se leen distinto en `done/`.
  const ranMutations = (qa.mutations || []).slice(0, unrun.length)
  const mutationFact = unrun.length ? [
    ...ranMutations.map((one) => `${one.detail}: ${one.red ? 'roja' : 'SOBREVIVIÓ, la prueba no la ve'}`
      + (one.output ? ` (${one.output})` : '')),
    ...(unrun.length > ranMutations.length
      ? [`${unrun.length - ranMutations.length} declarada(s) sin correr`] : []),
  ].join(' | ') : ''

  phase('Commit')
  const commit = contract.commitPerTask ? await run(
    `${asRole(OWNERS.commit)}Encontrá el repositorio git dueño de ${task.service}, inspeccioná status y diff, ` +
    `stageá por nombre los archivos de la tarea, creá un solo Conventional Commit con el footer ` +
    `"Task: ${task.id}" y después verificá log y status. Nunca amend ni push; reportá lo que quedó suelto ` +
    `y no era de la tarea.${TWO_COMMANDS}${BRANCHED(task.id, tree, usedBranches)}${OPERATOR}`,
    { schema: COMMIT, label: 'commit' },
  ) : { committed: true, reason: 'runner.commitPerTask está apagado' }
  if (!commit) return halt('agent-unavailable', 'Commit no devolvió resultado')
  if (!commit.committed) return halt('commit-failed', commit.reason)
  // El commit ya existe, así que esto no lo evita: lo que evita es que la entrada de DONE lo dé por bueno
  // y la corrida siguiente arranque sobre una rama viva adelantada del remoto.
  if (commit.live && !contract.commitToLiveBranch) {
    return halt('commit-failed', `el commit ${commit.hash || ''} de ${task.id} quedó en la rama viva `
      + `${commit.branch || ''}: movelo a una rama propia antes de reanudar`)
  }

  phase('Done')
  // El árbol de la tarea ya no existe y su rama se renombró al commitear, pero la revisión y la verificación
  // los citan como los vieron. A `done/` va lo que quedó: el servicio como lo nombra la tarea y la rama del
  // commit. Si no, la entrada nombra una rama que el repositorio no tiene y una ruta de esta máquina
  // (caso 277).
  const settled = (text) => (tree ? [[tree.work, declared], [tree.path, declared], [tree.branch, commit.branch]]
    .reduce((out, [from, to]) => (from && to ? out.split(from).join(to) : out), text) : text)
  // `lane` y `review` se piden textuales: en una corrida real el agente resumió el hecho de revisión y
  // perdió las reglas, la decisión y la superficie crítica, mientras el prompt —lo que mide el arnés— sí
  // las traía (caso 211).
  await scribe(settled(
    `Cerrá ${task.id} de forma atómica: escribí ${doneFile(task.id)} con su evidencia —acept, ` +
    `fecha: ${planning.today}, done, qa, tests, commit, lane y review, en el formato de entrada que trae ` +
    `este preámbulo—; ` +
    `sacala junto con sus notas indentadas de ${queueFile()} —si es un archivo de ${P}/backlog/ y su hito queda ` +
    'sin tareas, borrá ese archivo—; cerrá su épica sólo si no queda ' +
    `ninguna tarea etiquetada; dejá ${P}/${planning.wipFile} en status IDLE —una línea «status: IDLE» en su ` +
    // Dicho con su forma: sin eso quien cierra la buscaba en el fuente del motor, una llamada por tarea.
    `frontmatter es lo que lee el motor—; y soltá la reserva corriendo ` +
    `"node tools/ops.js release ${P} ${task.id}". lane y review van textuales, copiados de estos hechos sin ` +
    'resumir ni recortar: son lo que después se audita, y un resumen elige qué perder. ' +
    // `done` y `qa` no van textuales, y hay que decirlo: lo que llega se escribió con la tarea abierta. Sin
    // decirlo dependía de que quien escribe lo acomodara por su cuenta, y cuando en 0.103.4 cambió quién
    // escribe, la entrada pasó a decir «sin commit ni push» al lado de su commit, con la ruta de la máquina
    // (caso 301).
    'done y qa no van textuales: se escribieron con la tarea abierta y la entrada se lee con la tarea cerrada. ' +
    'En done decí qué quedó entregado —qué archivos cambiaron y qué hace cada cambio, y los comandos de verify ' +
    'con su salida—, sin lo que build contaba de su momento: que no había commit, en qué fase estaba, qué pasos ' +
    'del WIP tildó o qué no tocó. En qa, el veredicto y lo observado, sin presentar al cargo ni citar su ' +
    `contrato. En done, qa, tests y decisions las rutas van relativas, empezando en ${declared}/, nunca la ruta ` +
    'absoluta de esta máquina. No agregues nada que no esté en estos hechos. ' +
    (buildNotes.length ? 'Cada entrada de notas-de-build va en decisions, con [supuesto: …]. ' : '') +
    `En decisions no nombres una fase ni un cargo ` +
    `que no figure en estos hechos. Hechos: lane=${lane}; ` +
    `review=${reviewFact}; fases=${ran.join(' → ')}; build=${buildFact}; ` +
    (buildNotes.length ? `notas-de-build=${JSON.stringify(buildNotes)}; ` : '') +
    `verify=${JSON.stringify(verified.commands)}; cubiertos=${JSON.stringify(covered)}; ` +
    (noSurface.length ? `sin-superficie=${JSON.stringify(noSurface.map(({ criterion, reason }) => ({
      criterion, reason: reason || 'no se ejecuta' })))}; ` : '') +
    (outOfVerify.length ? `fuera-de-verify=${JSON.stringify(outOfVerify)}; ` : '') +
    `qa=${qa.evidence}${mutationFact ? ` · mutaciones: ${mutationFact}` : ''}; ` +
    `commit=${commit.hash || commit.reason}` +
    // El sufijo es el del contrato de DONE, `(repo@rama)`: `check` saca de ahí en qué repositorio buscar el
    // commit, y escrito en prosa lo leía como si no nombrara ninguno.
    `${commit.branch ? ` (${declared}@${commit.branch}), con ese sufijo copiado tal cual` : ''}. ` +
    `En tests rastreá cada criterio con lo que cubiertos le asigna: la etiqueta del criterio, « → » y su ` +
    `trace copiada tal cual, sin agregarle ni sacarle nada —ya trae el archivo, el nombre de la prueba y la ` +
    `aclaración—` +
    (noSurface.length ? ', y los de sin-superficie con tests: n/a — <razón>' : '') +
    (outOfVerify.length ? '; cada condición de fuera-de-verify queda cumplida en tests, qa o commit' : '') + '. ' +
    // La entrada se valida antes de commitearla. Sin esto el formato lo descubría `closing`, con la entrada
    // ya commiteada: una traza escrita «A (condición) → prueba» dejó `check` en rojo y un arreglo suelto.
    'Cada traza de tests empieza con «A →» o «C<n> →» y sigue con la prueba; la condición, si la nombrás, va ' +
    `después. Al terminar corré "node tools/ops.js check ${P}" desde ${ROOT}: si marca esta entrada, corregí ` +
    'el formato del campo que nombra, sin cambiar los hechos, y volvé a correrlo. Si marca la entrada de otra ' +
    // En una corrida real quien cerraba una tarea «arregló» la entrada de otra y le sacó una condición de la
    // traza: evidencia ajena editada de paso, y commiteada con el cierre de la propia (caso 310).
    'tarea, no la toques: es evidencia que no escribiste, y la mira el cierre de la corrida.'),
    { label: 'done' },
  )
  // El cierre deja la cola, `done/`, las acciones humanas y el INBOX escritos, y nadie los commiteaba: cada
  // corrida terminaba con la instancia sucia y preguntándole a la persona dónde iba eso (caso 266). Va con
  // el mismo interruptor que el commit del producto y con la regla de ramas de planning: una sola rama de
  // trabajo que se acumula, nunca una por tarea.
  //
  // No frena: la tarea ya se entregó, y lo que quedó sin commitear se dice. Frenar acá dejaría una entrega
  // completa reportada como parada.
  if (contract.commitPerTask) {
    const stated = await scribeCommit(
      `Commiteá el estado de planning que el cierre de ${task.id} dejó sin commitear en el repositorio que ` +
      `contiene a ${P}: stageá por nombre sólo lo que cambió bajo ${P} —la cola, done/, las acciones humanas, ` +
      `el INBOX—, nunca archivos del producto, y creá un solo commit "chore(planning): close ${task.id}". ` +
      `Nunca amend ni push.${TWO_COMMANDS}${PLANNING_BRANCH()}`,
      { schema: COMMIT, label: 'planning-commit' },
    )
    if (!stated || !stated.committed) {
      log(`el estado de planning de ${task.id} quedó sin commitear: ${(stated && stated.reason) || 'sin respuesta'}`)
    } else if (stated.live && !contract.commitToLiveBranch) {
      log(`el estado de planning de ${task.id} quedó commiteado en la rama viva ${stated.branch || ''}: movelo`)
    }
  }
  holding = ''
  if (commit && commit.branch && !usedBranches.includes(commit.branch)) usedBranches.push(commit.branch)
  completed.push(task.id)
  planning = await readContext()
  if (!planning) return halt('context-unavailable', `no se pudo releer el estado de ${P}`)
}

if (rounds > MAX_TASKS) {
  return halt('milestone-too-long', `la corrida agotó el tope de ${MAX_TASKS} tareas sin cerrar el hito`)
}

phase('Closing')
// Si el planning quedó válido lo dice `check`, y se lee de su salida: `ok`, los errores y los avisos. Hasta
// 0.103.5 lo contestaba un agente completo que corría el comando y contaba qué había visto: en treinta y un
// cierres reales treinta fueron eso y nada más, y el recorrido creía lo que el agente decía en vez de lo que
// el comando devolvió. Los avisos que no hacen fallar a `check` se perdían: el agente los comentaba y este
// script tiraba ese texto cuando el cierre pasaba (caso 310).
//
// El mismo paso trae las lecciones, y no uno aparte: es un comando más en la misma vuelta, y una llamada
// por corrida para una lista que casi siempre viene vacía no se paga (R16).
const CHECK_FIELDS = {
  ok: { type: 'boolean' },
  errors: { type: 'array', items: { type: 'string' } }, warnings: { type: 'array', items: { type: 'string' } },
}
const CHECKED = {
  type: 'object', additionalProperties: false, required: ['ok', 'errors', 'warnings', 'lessons'],
  properties: {
    ...CHECK_FIELDS,
    lessons: { type: 'array', items: { type: 'object', additionalProperties: true,
      required: ['name', 'ref', 'tasks'],
      properties: { name: { type: 'string' }, ref: { type: 'string' },
        tasks: { type: 'array', items: { type: 'string' } }, reopened: { type: 'boolean' } } } },
  },
}
const checkedBy = `Corré "node tools/ops.js check ${P} --json" desde ${ROOT} y copiá de su salida ok, errors y `
  + 'warnings tal cual, sin resumir ni reordenar. Que salga con un código distinto de 0 no es una falla tuya: es '
  + 'lo que hay que devolver.'
const readCheck = () => clerk(
  `${checkedBy} No arregles nada. Después corré "node tools/ops.js lessons ${P} --json" y copiá su campo ` +
  'proposals tal cual en lessons, vacío si no hay.',
  { label: 'closing', schema: CHECKED },
)
let closing = await readCheck()
if (!closing) return halt('agent-unavailable', 'Closing no devolvió resultado')
const failures = (verdict) => (verdict.errors || []).join(' | ') || 'check salió en rojo sin decir por qué'
// Reparar sí es juzgar —qué es estado derivado y qué no se toca—, y eso lo hace quien carga las reglas. Entra
// sólo cuando hay algo que reparar, que en esos treinta y un cierres fue una vez.
if (!closing.ok) {
  const broken = failures(closing)
  const repaired = await write(
    `"node tools/ops.js check ${P}" salió en rojo al cerrar la corrida, con estos errores: ${broken}. Reparás ` +
    'sólo estado derivado determinista —un formato, un campo que se deduce de otro, una referencia que quedó ' +
    'vieja—; nunca reescribas aceptación, evidencia ni decisiones para forzar el verde, y si un error pide eso ' +
    'lo dejás como está. En fixed, cada archivo que tocaste; vacío si ninguno.',
    { label: 'closing-repair', schema: {
      type: 'object', additionalProperties: false, required: ['fixed'],
      properties: { fixed: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } },
    } },
  )
  if (!repaired) return halt('agent-unavailable', 'la reparación del cierre no devolvió resultado')
  // Si quedó en verde lo vuelve a decir el comando, no quien reparó: es la misma lectura de arriba, y de
  // paso trae las lecciones como quedaron después de la reparación.
  closing = await readCheck()
  if (!closing) return halt('agent-unavailable', 'Closing no devolvió resultado después de reparar')
  // Lo que no se pudo reparar necesita a una persona, y sin una fila la parada no dejaba rastro en disco: la
  // corrida terminaba, la sesión se cerraba y el planning seguía en rojo sin que nada dijera por qué.
  if (!closing.ok) {
    const left = failures(closing)
    // La primera columna es fija: con el nombre del hito, `check` la rechaza cuando ese nombre contiene el
    // de una tarea en cola, y esta fila no frena ninguna.
    const noted = await registerHuman(
      `Registrá en ${HUMAN} una fila: al cerrar la corrida` +
      `${currentMilestone ? ` del hito ${currentMilestone}` : ''}, ` +
      `"node tools/ops.js check ${P}" quedó en rojo y repararlo pedía algo que no es estado derivado. Los ` +
      `errores, textuales: ${left}. La primera columna es autobuild, nunca una tarea: esto no frena ninguna en ` +
      'particular. Decí qué lo cierra —quien pueda aportar lo que falta, o decidir qué se hace con la entrada— ' +
      'sin inventar responsables ni fechas.',
      'closing-human',
    )
    // Un solo commit para la parada: lo hace éste, que barre todo lo que cambió, y `halt` no lo repite.
    await commitBlocked('autobuild', 'record a closing check left red')
    holding = ''
    return halt('planning-check-failed', left + noted)
  }
  const touched = repaired.fixed || []
  // La reparación se commitea. El cierre corre después del commit de planning de cada tarea, así que lo que
  // se arreglaba acá quedaba suelto en la instancia: pasó, y lo commiteó a mano quien lo encontró.
  if (touched.length && contract.commitPerTask) {
    const kept = await scribeCommit(
      `Commiteá lo que la reparación del cierre dejó sin commitear en el repositorio que contiene a ${P}: ` +
      `stageá por nombre lo que cambió bajo ${P} —la reparación dice haber tocado ${touched.join(', ')}—, ` +
      'nunca archivos del producto, y creá un solo commit "chore(planning): repair closing state". Nunca amend ' +
      `ni push.${TWO_COMMANDS}${PLANNING_BRANCH()}`,
      { schema: COMMIT, label: 'closing-commit' },
    )
    if (!kept || !kept.committed) {
      log(`la reparación del cierre quedó sin commitear: ${(kept && kept.reason) || 'sin respuesta'}`)
    } else if (kept.live && !contract.commitToLiveBranch) {
      log(`la reparación del cierre quedó commiteada en la rama viva ${kept.branch || ''}: movela`)
    }
  } else if (touched.length) {
    log(`la reparación del cierre tocó ${touched.join(', ')} y quedó sin commitear: `
      + 'el proyecto no commitea por tarea')
  }
  log(`check salió en rojo al cerrar y se reparó: ${broken}`)
}
const warned = closing.warnings || []
// Lo que `check` avisa sin fallar llega a quien lanzó la corrida, textual. El tope es el del INBOX: una
// instancia con muchos avisos fijos no tapa el resto del registro, y lo que no entra queda contado.
warned.slice(0, INBOX_CAP).forEach((warning) => log(`check avisa: ${warning}`))
if (warned.length > INBOX_CAP) log(`check avisa ${warned.length - INBOX_CAP} cosa(s) más`)
// Una regla que la revisión mandó a corregir en varias tareas vuelve como lección, sin promover: es lo
// que el registro de lo corregido (caso 207) existe para alimentar (caso 214). El tope es el del INBOX.
const learned = (closing.lessons || []).slice(0, INBOX_CAP)
if (learned.length) {
  const day = planning.today || startedOn
  const origin = inboxOrigin('autobuild', 'lecciones', day)
  // La pregunta va antes que la lista de tareas: si la entrada no entra en una línea, lo que se recorta es
  // la lista, que sigue entera en la fila de `LESSONS.md`.
  const entries = learned.map((one) => withOrigin(`${one.name}: la revisión corrigió ${one.ref} en `
    + `${one.tasks.length} tareas${one.reopened ? ', con tareas nuevas desde que se rechazó' : ''}; ¿le falta `
    + `a la regla un ejemplo, claridad o visibilidad? (${one.tasks.join(', ')})`, origin))
  await write(`Registrá en ${inboxWhere(P, 'Lecciones')} una entrada por cada una de éstas, con el `
    + `nombre que trae antes de los dos puntos, sin promover ninguna. ${INBOX_FILES} `
    + `${inboxAsk(['Lecciones'], planning.inbox, origin)} `
    + `Y por cada una, una fila en la tabla de la sección Registro de ${P}/LESSONS.md —actualizando la que ya `
    + `tenga esa regla—: | <ref> | propuesta | <tareas separadas por coma> | ${day} |. Si el archivo `
    + 'no existe, crealo con un título «# Lecciones de lo que se corrige», una sección «## Registro» y la tabla '
    + `con encabezado | Regla | Estado | Tareas | Fecha |. Lecciones: ${JSON.stringify(learned)}. Entradas: `
    + `${JSON.stringify(entries)}`, { label: 'lessons-noted' })
}
// El archivo nace con su estado escrito porque la compuerta lo lee de ahí —R28, y el porqué vive junto a
// esa lectura—. Sin decirlo acá la fase escribe prosa sin `status`, y la instancia queda con una compuerta
// que sólo se destraba borrando: la forma que la regla prohíbe, escrita por el propio recorrido.
//
// Sólo cuando el hito terminó. Cortada a pedido, la corrida deja tareas del mismo hito en la cola: escribir
// la compuerta ahí decía «hito terminado» sobre uno que no lo estaba, y frenaba la corrida siguiente hasta
// que alguien la destrabara a mano —visto en la primera corrida real con `--max 1` (caso 293)—.
if (completed.length && contract.humanCheckpoint && !cut) await scribe(
  `Creá ${GATE} con el hito terminado, las tareas ${completed.join(', ')}, la evidencia, las acciones humanas ` +
  `pendientes y las instrucciones exactas para continuar. Arrancá el archivo con un frontmatter ` +
  `"status: pendiente", y decí que se destraba cambiándolo a "resuelta" —no borrando el archivo, que es ` +
  `lo que deja leer después qué se revisó—. Nunca hagas push ni deploy.` +
  // El checkpoint también es estado de planning, y se escribe después del último commit de planning: sin
  // esto cada hito terminaba con ese archivo suelto en la instancia (caso 271).
  (contract.commitPerTask ? ` Después commiteá ese archivo, y sólo ése, con el mensaje "chore(planning): await ` +
    `review of ${currentMilestone}".${TWO_COMMANDS}${PLANNING_BRANCH()}` : ''),
  { label: 'human-checkpoint' },
)
return finish({ done: completed, count: completed.length, hito: currentMilestone, phases: ran })
