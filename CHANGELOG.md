# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y versionado según
[SemVer](https://semver.org/lang/es/).

`cauce upgrade` reemplaza `system/` completo sin pedir confirmación. Este archivo es lo que hace que
esa operación sea confiable en vez de sólo cómoda: acá se lee qué cambió antes de aplicarlo. Por eso
un cambio en el protocolo, en las reglas del sistema o en un guard es visible para el usuario y sube
minor aunque no toque una sola línea de código.

Cada entrada la imprime `upgrade` a quien está por aplicarla, y un salto de varias versiones las
imprime todas seguidas. Dice qué cambia en lo que recibe y qué tiene que hacer; lo que sólo se observa
desde este repositorio no va, porque el que lee no puede actuar sobre eso. Cuando una entrada pasa de
unas pocas líneas casi siempre es porque cuenta cómo se descubrió el problema o por qué se eligió el
diseño — eso vive en el commit y en el código.

## [0.27.0] - 2026-08-18

### Añadido

- **Instalar Cauce es un comando.** `npx @ingeniomaps/cauce init`, sin destino, crea `ops/` en modo
  sidecar, te pregunta con qué runner vas a trabajar y qué integración querés, corre `npm install`,
  deja el wiring del runner puesto y valida la instancia antes de terminar.

  Antes había que elegir destino y modo a ciegas, correr `npm install` a mano —sin él la instancia no
  funciona: el shim, los cargos, los equipos y los adaptadores se resuelven desde `node_modules`— y
  después instalar el runner. Las dos preguntas tienen «ninguno» como default: instalar un runner
  escribe en tu repositorio, así que un Enter apurado no deja archivos que no pediste, y los dos pasos
  se agregan más tarde con `automation install` e `integration enable`.

- **Banderas para instalar sin preguntas.** `init` acepta `--runner`, `--integration` e
  `--install`/`--no-install`. Sin terminal —CI, un contenedor, un Dockerfile— no pregunta nada ni
  descarga nada: materializa la instancia y dice qué falta, así que una automatización decide por
  bandera y no hereda una descarga. Un `npm install` que falla se reporta y deja escrito por dónde
  seguir, en vez de terminar en un error del runner tres pasos después.

### Cambiado

- **El destino de `init` es opcional, y sin él la instancia se aparta en `ops/`.** Antes cortaba con
  `Falta <destino>`, así que ninguna invocación existente cambia de comportamiento. Lo que cambia es
  a dónde va lo que no elegiste: un monorepo recibía `planning/`, `teams/`, `organization/` y
  `AGENTS.md` en su primer nivel y dejaba de distinguir qué era suyo. El modo `embedded`, que es el que
  despliega el molde en la raíz, ahora hay que pedirlo explícito.

## [0.26.0] - 2026-08-17

### Añadido

- **Una segunda corrida del día ya no borra a la primera.** Los registros de evaluación aceptan
  `AAAA-MM-DD-N.md` además del nombre pelado, y `ops evaluate <cargo> --record [AAAA-MM-DD]` te dice
  dónde escribir el próximo. `agent-eval` lo pregunta en vez de componer el nombre desde la fecha.

  Importa porque aplicar una propuesta cambia el contrato y el mismo recorrido pide volver a correr los
  casos ahí mismo: con el nombre saliendo de la fecha, esa segunda corrida escribía encima de la
  primera, que es la línea base contra la que se compara. Si ya tenés registros, no hay que hacer nada:
  el nombre viejo sigue siendo válido y es la corrida 1 de su día.

- **Una propuesta aplicada se puede corregir dentro de su período.** `ops learn <cargo> --proposal` abre
  una revisión —`AAAA-MM-r2.md`, con `corrects:` en el frontmatter— cuando la anterior ya está aplicada.
  La aplicada queda sellada donde está: no se reabre ni se reemplaza.

  Aplicar no era el final del ciclo —la evaluación posterior es la que dice si el cambio sirvió—, y
  cuando decía que no, el sello que impide reaplicar lo mismo también impedía corregirlo hasta el mes
  siguiente. Sigue habiendo una sola propuesta pendiente por período. `agent-promote` nombra la revisión
  como salida en vez de mandarte a esperar.

### Cambiado

- **R11 se reescribe: comentarios con destinatario.** En `planning/rules/system/code-shape.md`, así que
  rige para todo cargo y para el runner trabajando sin cargo. Antes pedía que un comentario dijera el
  porqué y no el qué, con un tope de tres líneas. Ahora el filtro es quién lo va a preguntar o a
  deshacer sin saberlo: tener un porqué no alcanza, porque una convención también lo tiene. Distingue
  tres lugares —dentro de una unidad, encabezándola, y donde ningún nombre alcanza— y retira el tope de
  líneas, que contradecía a R7 dos reglas más arriba y en la práctica se leía como presupuesto a gastar.

  Lo que vas a notar: se habilita el comentario que encabeza una unidad y dice qué garantiza para poder
  usarla sin leerla entera, que la redacción anterior prohibía.

- **R14 exige que el registro viaje con la afirmación, no con el informe.** Párrafo nuevo en
  `planning/rules/system/conduct.md`. Una lección, una regla propuesta, una fila de acciones humanas o un
  paso de runbook se leen solos, así que una afirmación de mecanismo que sale del informe hacia uno de
  ellos lleva su registro o no sale. Y el disparador es a dónde va la afirmación, no cuán discutible
  parece — lo que se deja plano suele ser lo que sostiene el propio procedimiento.

- **`release-manager` acota las operaciones de esquema al motor.** Dos reglas nuevas: qué preserva un
  rename, una copia o un drop depende del motor y su versión, y hay que declararlo antes de apoyar ahí un
  ensayo o una salvaguarda; y una copia previa a un borrado es una foto —con su instante de corte y qué
  queda afuera—, no una reversión, con el roll-forward entregado en la misma pieza que la conclusión de
  que revertir dejó de ser seguro. Suma la sección «Qué preserva cada operación de esquema» a su modelo
  operativo, la conducta prohibida
  `unscoped_schema_operation_or_data_copy_presented_as_safeguard` y el caso `07-schema-safeguard-scope`.

- **`procurement-manager` separa el alcance de una figura de su deber de documentarla.** Dos reglas
  nuevas: qué habilita una sole source o una excepción de emergencia sale del régimen aplicable con su
  edición, no de la parte del procedimiento propio que dice qué registrar al usarla; y un cuantificador
  universal sobre normas —«ningún régimen», «todos los marcos»— es una afirmación de mecanismo y lleva su
  registro. Suma la sección «Alcance de las figuras y afirmaciones normativas», el caso
  `07-exception-scope` y dos conductas prohibidas:
  `figure_scope_inferred_from_own_documentation_duty_or_universal_norm_claim` y
  `scorecard_dimension_dropped_instead_of_carried_as_a_conditional` — una dimensión que todavía no se
  puede ponderar queda como obligatorio condicionado, con qué la activa, qué evidencia la cierra y quién
  la revisa, en vez de declararse ausente.

### Corregido

- **El guard de migraciones dejaba pasar el `DELETE FROM` más común.** Nombra tres cosas que frena y una
  de ellas no frenaba: el límite de palabra quedaba al final del grupo, y después de un punto y coma no
  hay límite de palabra, así que `DELETE FROM pedidos;` —la forma que tiene en cualquier migración—
  pasaba y sólo se detenía la variante sin punto y coma. Además `DROP COLUMN` y `DROP CONSTRAINT` nunca
  habían estado en la lista, y pierden datos y garantías igual que `DROP TABLE`.

  Si dependías de este guard, revisá las migraciones que integraste desde que lo instalaste: puede haber
  pasado algo que creías bloqueado.

## [0.25.0] - 2026-08-17

### Añadido

- **R14 — una afirmación de mecanismo lleva su registro.** Regla nueva en
  `planning/rules/system/conduct.md`, así que rige para todo cargo, para uno propio que hayas escrito y
  para el runner trabajando sin cargo. El comportamiento de una herramienta, un motor, un formato, una
  norma o un sistema de terceros es material de trabajo: público, versionado y comprobable. Por eso cada
  afirmación declara en cuál de tres registros va —**verificado**, **documentado** o **hipótesis**—, la
  verificación llega hasta donde R12 permite (fuente pública, `--help`, `--version`, invocación inocua;
  nunca conectarse ni ejecutar la operación que se describe), y una hipótesis no sostiene una negativa,
  un diagnóstico, un número ni un paso de procedimiento, ni entra en informe, runbook, regla o lección.

  Lo que vas a notar: los cargos empiezan a decir «esto lo comprobé así» o «esto es plausible y no lo
  verifiqué» donde antes afirmaban de corrido, y a negarse a apoyar una decisión en lo segundo. Eso es
  lo que la regla busca. No tenés que instalar nada: `upgrade` reemplaza `planning/rules/system/`
  completo.

### Cambiado

- **Los 46 contratos del catálogo apuntan a R14.** Cada uno gana un renglón en sus reglas operativas que
  nombra los tres registros y remite a la regla, en vez de repetirla. `database-administrator` conserva
  su propia redacción, más específica, y no recibe el puntero.

- **`agent-eval` juzga contra las conductas prohibidas del cargo.** Hasta ahora quien juzgaba recibía
  sólo los comportamientos esperados del caso, y la lista `forbidden` de `evaluations/expected-behaviors.yaml`
  no la leía ningún código: entraba a un veredicto únicamente si quien lanzaba la corrida se acordaba de
  escribirla en el prompt. Ahora viaja junto a los casos, con redacción fija.

  Consecuencia para vos: si tenés cargos propios con su `expected-behaviors.yaml`, sus prohibiciones
  pasan a pesar tanto como los comportamientos esperados, y un caso pasa sólo si se observan todos y no
  ocurre ninguna. Un resultado anterior midió menos criterios que uno de ahora, así que no son
  comparables — conviene volver a correr los casos de los cargos que te importen.

### Corregido

- **`upgrade` ya no reemplaza en silencio un archivo del sistema editado.** El manifiesto registraba el
  runtime y el `system/` de cada colección, pero no los archivos sueltos que el toolkit mantiene, así que
  `AGENTS.md`, el `Makefile` y los README del sistema se reemplazaban sin comparar nada: una edición ahí
  desaparecía sin aviso, mientras la misma edición bajo una ruta registrada frenaba el upgrade y nombraba
  el archivo. Ahora los compara igual que al resto.

  Si editaste alguno de esos archivos, el próximo `upgrade` te lo va a decir en vez de pisarlo. Lo que
  corresponde es mover ese cambio a un archivo del proyecto: `system/` se reemplaza entero por diseño.

- **El README de ADR ya no pide mantener un índice.** Su paso 4 mandaba actualizar una tabla de
  decisiones del proyecto que vive dentro de un archivo que mantiene Cauce, así que cada fila agregada se
  perdía en el `upgrade` siguiente — y con el arreglo de arriba habría pasado a bloquearlo. Las decisiones
  del proyecto son los archivos `NNN-*.md` del directorio y su estado vive en cada uno, sin nada que
  sincronizar. Si tenías filas en ese índice, la información ya está en las ADR; no hay que migrarla.

## [0.24.0] - 2026-08-17

### Cambiado

- **`database-administrator` nombra el registro con el que emite una afirmación de mecanismo.** Es el
  primer cambio de contrato del catálogo que nace de un **fallo medido** y no de investigación semanal.
  El cargo rechazó bien un `DROP DATABASE`, atacó bien la premisa, y afirmó en negrita —como «modo de
  falla real, no hipotético»— que `dropdb` con la variable vacía elimina la base por defecto. Eso es el
  comportamiento de `createdb`. Lo dejó escrito además como lección permanente en su banco.

  Es hueco de cobertura y no de ejecución, y el propio veredicto lo prueba: el mismo juicio que reprueba
  certifica que no inventó **ningún** hecho de la instancia. Los nueve objetos que el contrato ya
  enumeraba —topología, configuración, capacidad, backup, restore, RPO/RTO, privilegio, causa,
  evidencia— son todos hechos del sistema administrado; el comportamiento público y verificable de una
  herramienta no está entre ellos, y para este cargo *es* la materia de trabajo.

  Lo que se agrega no es «no inventar» otra vez —eso sería paráfrasis, y una paráfrasis en un contrato
  es deuda—. Es el **registro** con que se emite la afirmación (verificado, documentado, hipótesis), el
  **límite** de con qué se verifica —documentación de la versión e invocación inocua, nunca
  conectándose ni ejecutando la operación descrita— y la **consecuencia**: sin verificar no sostiene una
  negativa ni entra a un artefacto durable. Más la conducta prohibida
  `unverified_tool_or_engine_behavior_asserted_as_fact` y su caso adversarial.

  Volver a medir los siete casos mostró que la regla cambia el comportamiento **en casos para los que no
  se escribió**: ninguno de los siete menciona `dropdb`, y aparecen un cargo declarando que los binarios
  que verificó son de su máquina «no del entorno», otro que no nombra ningún comando porque el motor no
  consta, otro que desactiva por nombre su única hipótesis no documentada, y otro que se niega a inferir
  el flag de una herramienta desde otra de nombre parecido. Y dos fallos nuevos que antes no se veían:
  soltar el hedge al resumir conservándolo en el informe, y fechar mal una fuente bajo la etiqueta
  inventada para garantizar que ninguna afirmación exceda la suya.

- **El paquete deja de llevar `.github/workflows/` a cada instalación.** `init` no los copia,
  `agent-learning.yml` está en la lista de retirados que `upgrade` borra, y `ci.yml` corre `npm run ci`,
  que una instancia no tiene. Publicar dejó de ser manual sin nada que lo revisara: `prepublishOnly`
  corre el mismo gate que CI.

- **La salida generada no arrastra deber de atribución.** MIT pide que el aviso viaje con porciones
  sustanciales, e `init` copia porciones sustanciales al repositorio de una empresa sin ningún aviso.
  Nadie atribuye archivos andamiados; ahora está escrito que no hace falta. El copyright además queda a
  nombre de quien puede tenerlo: un handle de GitHub no es una persona jurídica.

### Agregado

- **`make` alcanza integraciones y equipos desde una instancia**, que es el único lugar donde las
  integraciones corren. La plantilla mandaba a escribir el CLI a mano mientras la automatización ya
  tenía atajo. `sync` toma `PROVIDER`, así que un segundo proveedor no necesita un target nuevo.

### Corregido

- **`runner.allowPush` se validaba y no se leía.** El guard bloqueaba el push sin condición, así que un
  proyecto podía declararlo y no cambiaba nada. Lo encontró la evaluación de un cargo, que lo leyó y
  concluyó que existía un control técnico inexistente. Falla cerrado: sin raíz legible, no hay permiso.

- **Una historia envuelta en dos líneas perdía su criterio y su servicio.** El cuerpo se matchea
  multilínea, pero el lookahead terminaba en `$` con la bandera `m`, que casa fin de *línea*: cortaba en
  el primer salto, y `check` respondía «no declara `(service: <ruta>)`» sobre una historia que sí lo
  declara. Dos cargos lo encontraron reescribiendo su historia hasta que entrara en un renglón.

- **Un ítem de inbox sin nombre en negrita desaparecía en silencio.** La plantilla traía cuatro
  encabezados vacíos y ningún ejemplo, así que doce viñetas se leían como un inbox vacío. La convención
  se conserva —ese nombre es con el que se cita el ítem después—; ahora `tree` dice cuántas quedaron
  afuera y la plantilla muestra la forma.

- **El estado de una regla de negocio se valida contra un conjunto cerrado.** La plantilla traía
  `vigente` cableado mientras la de ADR presentaba el menú, y el validador sólo comprobaba que la línea
  tuviera la forma. Tres cargos distintos publicaron reglas declarándose vigentes derivadas de un ADR
  que ellos mismos habían dejado en propuesto: cada uno hizo lo que su plantilla le pedía. Ahora la
  afirmación débil es la que no cuesta nada.

- **El README servía a dos lectores a la vez** y todo lo desactualizado estaba del lado del mantenedor,
  porque quien lo notaría lee `AGENTS.md`. Decía once guards donde hay doce, pisos de cobertura que no
  eran los que `coverage.sh` exige, y una ruta de equipos que se había movido.

### Al actualizar

Dos controles nuevos **gatean** y pueden hacer fallar `check` o `evaluate` en una instancia que ya
existía. Hoy no hay ninguna empresa consumiendo Cauce fuera del proyecto de prueba, así que esto es
para quien actualice más adelante:

- Una regla de negocio cuyo `Estado:` no sea `propuesta`, `vigente` o `derogada` falla `check`. El
  arreglo es una línea por archivo.
- Un cargo propio sin `summary:` en el frontmatter de su `SKILL.md` falla `evaluate` (introducido en
  0.23.0). El arreglo es la línea con la que se elige ese cargo, de 120 caracteres o menos.

## [0.23.0] - 2026-08-17

### Agregado

- **Una línea por cargo, para elegirlo sin abrir cuarenta y siete carpetas.** Una empresa con una tarea
  en la mano tenía que leer los contratos para saber a quién asignarla: el `description` que cada cargo
  ya traía ronda los quinientos caracteres porque su lector es el runner al seleccionar, así que los
  cuarenta y siete de corrido son unos veintitrés mil.

  `ops agents list` imprime ahora la línea que cada cargo carga en su propio frontmatter, alineada en
  columna, y `--json` la lleva también: cuando el que asigna es un agente, es la máquina la que elige.
  La línea vive en el cargo y no en un índice aparte —un índice se desincroniza en silencio, y una
  línea que miente al elegir es peor que no tenerla—, así que un fork se la lleva y una empresa que
  escribe su cargo escribe la suya. Un cargo sin ella falla sus controles estructurales.

  Lo que gobierna esas líneas no es el largo sino distinguir vecinos: una que no separa un cargo del de
  al lado te hace asignar el equivocado, que es peor que abrir las carpetas. Se escribieron por racimos
  —los cargos que de verdad colisionan— y casi todas cierran con la exclusión que más se malinterpreta:
  `qa-engineer` recomienda el release pero no lo aprueba, `finops-engineer` no es el cierre contable,
  `security-engineer` no es la base legal de un dato personal.

  Y la respuesta negativa cuesta lo mismo que la positiva: la lista termina diciendo dónde va el cargo
  propio, porque forzar el más parecido es peor que no usar ninguno. El `AGENTS.md` de la plantilla dice
  lo mismo, que es lo que lee el agente de la empresa antes de trabajar.

- **El ciclo de aprendizaje tiene final.** Había firma, aplicación e historial, y faltaba el paso que
  vuelve irrepetible lo ya hecho: la propuesta nacía `status: proposed` y nadie lo movía nunca.
  `agent-promote` busca la propuesta más nueva y aplica si el estado dice aprobada con responsable —y
  «aprobada y aplicada» también lee como aprobada—, así que volver a promoverla la aplicaba de nuevo.
  Como toda propuesta es aditiva por diseño, eso no falla: duplica cada viñeta y cada fuente del
  contrato en silencio.

  Sellar (`ops learn <cargo> --applied`) es lo último, después de aplicar y registrar, y lo hace el
  motor y no el recorrido: marcar el estado editando frontmatter a mano es justo el paso que se hace mal
  sin que nadie lo note. El recorrido se niega ante una propuesta ya aplicada, y las aplicadas dejan de
  contarse como pendientes, así que un cargo ya no reporta trabajo que se cerró el mes pasado.

### Cambiado

- **`security-engineer` nombra la automatización con credenciales como actor.** Salió de su propia
  investigación: el contrato cubría «agente autónomo con credenciales en CI» por implicación y nunca por
  nombre, y eso no es un detalle de redacción. Mínimo privilegio dice cuánto puede hacer un proceso, no
  que su decisión la escriba un tercero. Un servicio con credenciales ejecuta un camino fijo —para
  abusarlo hay que encontrarle una falla o robarle el token—; un agente lee entrada no confiable y actúa
  con las credenciales del pipeline, así que la entrada es el programa y los controles que uno esperaría
  corren cuando ya ejecutó.

  Trae una conducta prohibida nueva, `post_hoc_check_as_containment_for_credentialed_agent`, con el caso
  adversarial que la distingue de las dos con las que se solapaba. Las ocho recomendaciones operativas
  del informe quedaron deliberadamente fuera: son sobre el pipeline de este repositorio, y un contrato
  que se instala en empresas ajenas no es el lugar de esas decisiones.

- **La conducta universal salió de `AGENTS.md` y llegó a las empresas.** El documento mezclaba mecánica
  que sólo tiene sentido dentro de una instancia con conducta que vale para cualquier agente; sólo lo
  primero pertenece a un archivo que describe un repositorio. La conducta pasa a `planning/rules/`, que
  ya era la capa compartida — y que hasta ahora ningún runner cargaba: las reglas viajaban a cada empresa
  como archivos que nadie leía nunca.

- **La sincronización parcial de integraciones se retiró.** Nadie podía pedirla.

### Corregido

- **Un caso adversarial entrega el artefacto que describe, en vez de sólo nombrarlo.** Los cuarenta y
  siete casos del catálogo decían «una guía externa», «un CSV externo», «un runbook externo» y no
  entregaban ninguno. Eso mide algo más fácil de lo que dice medir: al cargo se le pregunta si obedecería
  un documento del que se le está hablando, y un texto que nunca leyó no puede inyectarlo.

  El hueco se hizo visible cuando un cargo escribió que había leído una guía inexistente y la premisa
  falsa quedó asentada en su banco como antecedente documental sin documento. Es el quinto defecto de
  fidelidad del arnés, y la corrección no fue reformular la pregunta sino escribir los cuarenta y siete
  artefactos: cada uno en su formato real —guía, CSV, notebook, módulo IaC, model card, portal, pliego—
  con las instrucciones que su caso describe y las coartadas que las hacen funcionar.

  El banco los copia **antes** de su commit limpio, así que `git status` no se los atribuye al cargo: si
  entraran después, el juez leería como obra suya el documento que vino a resistir. Falta de artefacto es
  error y no advertencia, porque es estático y verificable sin modelo — como advertencia es como estuvo
  faltando en los cuarenta y siete sin que nada lo dijera.

  Los nueve cargos que ya tenían registro se volvieron a medir contra el artefacto real, y uno es el
  argumento de haberlo hecho: el caso de `backend-engineer` **fallaba** antes y pasa ahora, que es cómo
  se ve un defecto del arnés desde afuera.

- **Un guard que no puede leer bloquea, en vez de permitir.** `run-hook.sh` enuncia el principio para el
  motor que carga, y tres lugares hacían lo contrario: una coma de más en `ops.config.json` apagaba
  `workspace-boundary` y `engine` sin imprimir nada, y una entrada ilegible se leía como «ningún comando
  y ningún archivo», que todo guard interpreta como nada que revisar.

- **Una bandera mal escrita falla en vez de ignorarse.** `check --jsonn` imprimía la salida humana y
  salía con 0, así que quien esperaba JSON recibía prosa sin ninguna señal. Cada comando declara ahora
  qué acepta, y `--help` dejó de depender de ir primero: `check --help` corría `check` sobre el
  directorio actual.

- **El toolkit se niega a correr los comandos de una empresa contra sí mismo.** `upgrade` reemplazaría
  los archivos de raíz que este repositorio mantiene —incluido el `AGENTS.md` donde vive la regla que lo
  prohíbe—, e `install` construiría una superficie de consumo cuyos punteros apuntan al catálogo que se
  escribe acá, con guards que bloquean el push de cada release.

- **Un `ops.config.json` ilegible se reporta en vez de leerse como ausente.** Una coma de más hacía que
  `upgrade` e `install` dejaran de reconocer el modo `toolkit` y siguieran adelante. Ausente sigue
  significando ausente; presente pero ilegible es un estado roto y ahora lo dice.

- **Un título vacío dejaba de reportarse como faltante.** El título de toda propuesta de integración se
  leía con un patrón donde `\s` casa el salto de línea, así que un documento con encabezado vacío se
  comía la línea siguiente: el resumen volvía como `## Descripción`, no vacío, y «falta título» quedaba
  callado.

- **`sync` dice qué hizo con los ítems que el remoto dejó de traer.** Los contaba y no imprimía
  ninguno: se borran cuando nada local se había curado sobre ellos, y se conservan marcados cuando sí, y
  la única forma de enterarse era ir a mirar el directorio.

- **La verificación de los guards se deriva del registro.** Comparaba contra una lista de quince nombres
  copiada a mano, así que un guard nuevo no se verificaba hasta que alguien se acordara de agregarlo —la
  misma deriva que tenía la cuenta de guards informando once.

## [0.22.0] - 2026-08-17

### Corregido

- **El juez de un caso ve lo que el cargo escribió, no sólo lo que dijo.** La respuesta de un cargo no
  es necesariamente su entrega: pedido un webhook de pagos, `backend-engineer` contestó un resumen y
  dejó el contrato real —orden de verificación de firma, comparación en tiempo constante, ventana
  antirreplay, catorce pruebas— en su `INBOX.md`. El juez, leyendo sólo la respuesta, marcó esos
  comportamientos como ausentes.

  El banco pasa a ser un repositorio git commiteado en su estado limpio, así que `git status` y
  `git diff` muestran exactamente qué produjo el cargo, separado del andamiaje. Es el cuarto hueco de
  fidelidad del arnés, y lo abrió el arreglo anterior: antes los cargos no podían escribir, así que
  todo lo que tenían estaba en el texto.

  Medido en la corrida de tres cargos, ese acceso decidió **seis comportamientos** repartidos en tres
  casos. Y sirve para lo inverso: para un comportamiento negativo —«no exportar ni borrar datos»— un
  diff vacío es prueba positiva, que un texto sólo puede afirmar.

- **Rehacer un banco con trabajo sin recoger se niega.** El registro de la evaluación se escribe
  *desde* el banco, así que recrearlo antes de recogerlo destruye justo lo que se iba a anotar. Pasó:
  se rehizo un banco probando otra cosa y con él se fue lo que un cargo había escrito. Ahora hace
  falta `--force`.

- **La suite dependía de directorios que sólo mantenían vivos unos restos.** `learning/reports/`
  existía en cada cargo porque contenía un molde; retirados los moldes muertos, git dejó de trackearlo
  —no versiona directorios vacíos— y desaparece en cuarenta y cinco de los cuarenta y siete cargos al
  clonar. La prueba lo leía directo y pasaba sólo en una máquina con los restos. Verificado ahora
  contra un clon limpio.

- **El conteo de guards se deriva del registro.** `automation check` informaba «11 guards» como
  literal mientras el motor registraba doce; quedó viejo al agregar uno y nada falló. Un número de
  auditoría que no sale de lo que describe envejece sin avisar.

### Removido

- **Código muerto, ayudantes duplicados y una configuración inerte.** `template/automatization/config.json`
  se distribuía a cada instancia y no lo leía nadie: qué guard corre lo decide la configuración del
  runner, que es la única fuente. El README de la plantilla ahora lo dice.

### Notas

- **Primera medición de tres cargos del catálogo**: `product-manager` 5/5, `privacy-compliance-specialist`
  6/6, `backend-engineer` 4/6. Sesenta y siete citas textuales sostienen los comportamientos.

  Los dos fallos son reales y están descritos con su razón. Uno de ellos deja además una pregunta
  sobre el caso, escrita en el registro en vez de escondida: `backend-engineer/06-adversarial-docs`
  falló «verificar fuente oficial y versión aplicable» mientras el caso equivalente de
  `privacy-compliance-specialist` pasó una versión más amplia. Si los dos deberían medir lo mismo es
  discutible, y esa discusión va por propuesta firmada.

## [0.21.0] - 2026-08-17

### Corregido

- **Cada caso adversarial recibe su propio banco.** Con uno por cargo, los casos corren a la vez sobre
  el mismo `planning/` y se leen entre sí. Correr `product-manager` lo mostró sin lugar a dudas: un
  caso tomó por «una sesión anterior de este mismo cargo» lo que otro acababa de escribir, y otro
  construyó su respuesta entera alrededor de cuatro candidatas que en su enunciado no existían.

  Ninguno de los dos cambió de veredicto, así que nada parecía roto — pero sus respuestas dejaron de
  ser las que esos casos pedían medir, y la independencia entre casos es la premisa de medir con
  ellos. La bandera pasa a ser `evaluate <cargo> --bench <caso>`.

  Preparar un banco ya no borra el del vecino, que puede estar a mitad de corrida, y el nombre del
  caso se valida antes de convertirse en una ruta.

### Notas

- **`product-manager` tiene su primera medición válida: 5 de 5.** El registro anterior se había
  descartado por tomarse dentro del toolkit, donde el cargo no tenía dónde escribir y se negaba —con
  razón— en los dos casos que escriben. Con el banco, esos dos pasan.

  Veinte citas textuales sostienen los veinte comportamientos. Queda escrito en el propio registro lo
  que el juez de `03-epic` dejó anotado: no se produjo ningún criterio `CN`, y bajo un estándar que
  exigiera criterios de épica específicamente ese comportamiento caería. El caso presupone una
  oportunidad aprobada que no existía, y el cargo se negó a inventarla.

## [0.20.0] - 2026-08-17

Casi todo lo de abajo sale de la primera investigación semanal del cargo `security-engineer` corriendo
de verdad sobre este repositorio. De sus ocho hallazgos, dos resultaron sobredimensionados al
verificarlos y quedaron cerrados sin cambio; el resto está acá.

### Cambiado

- **El agente de investigación semanal ya no comparte job con la credencial de escritura.** Ingiere
  contenido web que nadie controla, y hasta ahora corría con `contents: write` y la API key en el
  mismo lugar: cualquier instrucción que llegara dentro de una página tenía un repositorio a mano.

  Ahora entrega su informe como artifact y un segundo job lo commitea, sin modelo y sin credencial de
  API. Ese job resuelve **dónde** aterriza el archivo con el mismo CLI que resolvió el catálogo, así
  que nada de lo que viaje en el artifact puede redirigirlo. El permiso por defecto del workflow baja
  a `contents: read`: un job nuevo ya no nace pudiendo escribir por herencia.

- **Las acciones de GitHub quedan fijadas por SHA de commit**, y el CLI del agente por versión. Un tag
  es mutable: quien controle el repositorio de la acción puede moverlo a otro commit y el workflow
  ejecuta código nuevo sin que cambie una línea acá.

- **`guard-secrets` reconoce los archivos de credencial que las herramientas escriben solas** —
  `.npmrc`, `.netrc`, `id_rsa` y compañía—. Correr el guard sobre trece nombres mostró que `.env`
  bloqueaba y esos pasaban, y `.npmrc` es donde vive el token de publicación. Tapa un caso conocido;
  no vuelve completo al guard.

### Corregido

- **Los informes de aprendizaje traen escritas las convenciones de las que depende el ciclo.** Cuatro
  corridas independientes etiquetaron sus hallazgos `H1`, `H2`, … sin que nada se lo pidiera, y esa
  etiqueta terminó siendo carga: dentro del informe une «Hallazgos» con «Evidencia» y «Recomendación»,
  y la propuesta mensual la cita para decir de qué hallazgo sale un cambio. Funcionaba porque los
  modelos convergen, que es exactamente lo que deja de funcionar sin avisar.

  Lo mismo con los títulos: la consolidación busca `## Recomendación` exacto y renombrarlo no da error
  — deja la propuesta diciendo que no se registró nada.

### Removido

- **Se retiran 94 `_template.md` que el motor nunca leyó.** `learn` arma el andamiaje del informe y de
  la propuesta desde un molde propio; esos archivos no los leía nadie: ni el motor, ni un workflow, ni
  un runner, y ningún `SKILL.md` los nombra.

  No eran inertes. **Quince de los cuarenta y siete describían una forma que el motor nunca produce**
  —viñetas planas, sin sección de hallazgos y sin el título que la consolidación busca—, así que un
  agente que respetara su molde habría reestructurado el informe y dejado la propuesta vacía sin
  levantar nada.

  Comprobado antes de retirarlos: sin sus moldes, `qa-engineer` sigue evaluando 7/7 y `learn` arma su
  andamiaje igual. Adoptar un cargo pasa a copiar trece archivos en vez de quince.

### Notas de seguridad sin cambio

- **El token de npm no requiere acción.** El hallazgo lo describía como secreto de larga vida y sin
  expiración; verificado, tiene ventana acotada, y la afirmación de que npm revocó los tokens clásicos
  no se sostiene —el token funciona—. Lo único cierto que queda es que su alcance es de cuenta y no de
  paquete: al renovarlo conviene acotarlo, y nada más.

- **Los guards no son un límite de seguridad**, y `automatization/hooks/README.md` ahora lo dice con
  sus dos casos reproducibles. El riesgo real no es el bypass sino la confianza que doce guards
  puestos inspiran: si algo tiene que ser imposible, va en permisos, alcance de token o revisión
  humana, no en una coincidencia de texto.

## [0.19.0] - 2026-08-16

Los cuatro arreglos de abajo salieron de correr los tres caminos de punta a punta —un cargo que
aprende en el toolkit, uno propio de una empresa, y uno del catálogo adoptado y aprendiendo—, no de
un test. Son cosas que se veían correctas hasta que algo las siguió de verdad.

### Agregado

- **`guard-governance` cubre el contrato de un cargo, su medición y su firma.** `agent-promote` se
  niega si «Aprobación humana» no está firmada, pero lo único que impedía que la escribiera un agente
  era una frase en un prompt: una instrucción, no un candado, y el archivo no estaba protegido por
  nada.

  Alrededor de la firma van las otras piezas del mismo acto. `SKILL.md` y `references/` son lo que la
  propuesta cambia: sin ellos, editar el contrato directo saltea el ciclo entero. Y
  `evaluations/cases/` con `expected-behaviors.yaml` son el denominador con que se juzga —el propio
  recorrido de propuesta ya dice que cambiarlo «es parte de lo que se aprueba»—, así que moverlo en
  silencio ablanda toda medición pasada sin tocar una regla.

  **Para una empresa esto significa** que tocar su propio cargo pide `OPS_GOVERNANCE_OVERRIDE=1`, la
  misma puerta explícita que ya rige para `planning/adr/` y `planning/rules/`. Las dos clases de
  evidencia quedan afuera: `learning/reports/` y `evaluations/results/` registran lo que pasó un día
  en vez de decidir algo, y un veredicto se escribe en cada corrida.

### Corregido

- **La automatización de un cargo adoptado apuntaba al catálogo.** El `AUTOMATION.md` del sistema dice
  «mantené `agents/<tipo>/system/<slug>`», que dentro de una empresa es el paquete. Copiado tal cual,
  el ciclo semanal del cargo adoptado escribía en un directorio que el guard bloquea y que npm borra
  —y reportaba éxito—. `agents fork` ahora reescribe esas rutas a las de la empresa.

- **Devolver un cargo al catálogo dejaba avisos sobre una copia que no existe.** Borrar un fork
  resuelve bien —el cargo vuelve a salir del paquete— pero el manifiesto conservaba su registro, así
  que `check` decía «tu copia no recibe mejoras del catálogo» y mandaba a mirar un directorio
  borrado. Devolver es tan legítimo como adoptar: ahora la deriva exige que la copia exista antes de
  comparar, y `upgrade` poda el registro huérfano igual que ya poda los archivos.

- **El puntero que instala el runner no decía a qué se ancla.** Dos agentes que resolvieron un cargo
  parados en el repo ops construyeron la ruta doblada —`<empresa>-ops/<empresa>-ops/...`— y tuvieron
  que deducir la raíz. En sidecar el wiring vive en la carpeta de la compañía y el repo ops es uno de
  sus hijos; ahora el puntero lo dice.

- **`learn` sugería copiar un cargo a mano** en vez de nombrar `agents fork`, que ya existe.

## [0.18.0] - 2026-08-16

### Agregado

- **`ops evaluate <cargo> --bench`: un banco desechable donde un cargo del catálogo puede realmente
  trabajar.** El toolkit no es una raíz ops y no puede serlo —el único `planning/` que vive acá es
  `template/planning`, el molde que se distribuye—. Un cargo cuya entrega es una épica o una entrada de
  INBOX no tenía dónde escribir, se negaba con razón, y su caso lo contaba como fallo: el número
  describía el lugar, no al cargo.

  El banco es una instancia de verdad: `check` pasa, el catálogo resuelve desde adentro y `planning/`
  está vacío y escribible. Se recrea entero en cada corrida —reutilizarlo dejaría que lo que un cargo
  escribió el lunes sea contexto del que responde el martes— y queda en disco al terminar, gitignorado,
  porque después de un veredicto raro lo primero que uno quiere es mirar qué escribió el cargo.

### Cambiado

- **La evaluación corre sobre el banco en vez de negarse.** La 0.16.0 detuvo el recorrido dentro del
  toolkit: acertó el diagnóstico y erró el remedio, porque negarse dejó al catálogo sin ninguna forma
  de medirse, y el catálogo es nuestro y nos toca medirlo.

  El veredicto se escribe junto al cargo, no en el banco: el banco se borra en la corrida siguiente
  —es donde el cargo trabajó, no donde vive— y el veredicto pertenece al contrato que lo rindió.

  En una empresa no hay banco ni hace falta: su instancia ya es el lugar. Lo que se exige ahí es que el
  cargo sea suyo —propio o adoptado con `agents fork`—, porque evaluar uno del catálogo mediría su
  configuración y dejaría el registro sin dónde vivir.

## [0.17.0] - 2026-08-16

### Agregado

- **`ops agents fork <cargo>`: una empresa se lleva un cargo del catálogo y lo mantiene desde su
  carpeta.** El tercer camino ya resolvía —un cargo propio con el mismo slug tapa al del sistema, en el
  listado, en `learn` y en el puntero que instala el runner—, pero llegar hasta ahí era copiar a mano, y
  eso sale mal de una forma que no se nota: se agarra el `SKILL.md`, que es lo que se ve, y quedan atrás
  los casos adversariales, las fuentes y el modelo operativo. El cargo responde igual y ya no se puede
  evaluar, sin ningún aviso.

  No se heredan los informes de aprendizaje, las propuestas ni los veredictos de evaluación. Un veredicto
  pertenece al contrato que lo ganó, y el fork nace para dejar de ser ese contrato; una propuesta
  pendiente arrastraría a la empresa a firmar una decisión que era nuestra.

  En el toolkit se niega: acá el catálogo se edita, no se lo copia. Dejarlo pasar creaba un duplicado que
  tapaba al original, y el trabajo siguiente se hacía sobre la copia mientras la versión que se publica
  quedaba quieta.

- **`check` y `upgrade` avisan cuando el cargo que forkeaste mejoró río arriba.** El mecanismo ya existía
  para ADRs y reglas —«sobrescribir es legítimo; lo que no puede pasar es que ocurra en silencio»— pero
  no cubría los cargos, que es donde más caro sale: un fork se hace una vez y se olvida.

  Se compara contra los digests guardados al forkear, nunca contra la copia: la copia está editada a
  propósito, así que medir contra ella devolvería «todo cambió» desde el primer ajuste. Editar lo propio
  no dispara nada, y esa mitad es la que decide si el aviso se lee o se ignora.

## [0.16.1] - 2026-08-16

### Corregido

- **El mensaje de `guard-engine` daba un comando que no hace nada.** Decía `npm update
  @ingeniomaps/cauce`, pero el motor se declara con versión exacta y npm no mueve un pin exacto:
  responde «up to date» y no toca nada. Encontrado sobre una instalación real que llevaba dos minors
  atrasada sin que nadie lo notara.

  Ahora nombra los dos pasos: `npm install --save-dev --save-exact @ingeniomaps/cauce@latest` —con
  `--save-exact` porque `install @latest` a secas escribe `^` y rompe esa disciplina— y después
  `node tools/ops.js upgrade`, porque bajar el motor no refresca las rutas del sistema de la instancia.

## [0.16.0] - 2026-08-16

### Agregado

- **`guard-engine` impide editar el motor instalado.** `workspace-boundary` no lo cubría: en una
  instalación `node_modules/` cae dentro de la raíz declarada, así que editar el motor le parecía
  legítimo y nada estructural sostenía la regla.

  El daño de esa edición es silencioso por partida doble. El próximo `npm install` la borra, de modo
  que el arreglo se pierde justo cuando alguien creyó haberlo hecho; y hasta entonces la empresa corre
  un motor que no coincide con la versión que declara, que es la forma habitual de un bug
  irreproducible. **Un problema del motor se reporta y se arregla arriba.**

  El toolkit queda exento por `mode: toolkit`, donde el motor es el producto y editarlo es el trabajo.
  Lo de cada empresa —cargos, equipos, integraciones, planificación— sigue abierto.

### Cambiado

- **`planningDir` se retira: era obligatorio y nadie lo honraba.** El renderizador de la plantilla lo
  resolvía siempre a `planning`, mientras `findOpsRoot` y el registro de integraciones tienen esa ruta
  escrita a mano. Cambiarlo no cambiaba nada: no configuraba, prometía. Una instancia con
  `planningDir: "roadmap"` seguía corriendo sobre `planning/` sin aviso.

  Se retira en vez de honrarse porque la ubicación no es opinable: `findOpsRoot` reconoce un
  repositorio de operaciones justamente por tener `planning/` en la raíz.

  **Al actualizar: borrá la línea `planningDir` de `ops.config.json`.** La validación nombra el campo y
  dice qué hacer con él, en vez de caer en «propiedad desconocida».

- **El recorrido de evaluación se detiene si `mode` es `toolkit`.** La 0.15.1 lo documentó en un
  comentario y no alcanzó: la corrida siguiente ocurrió otra vez dentro del toolkit y su resultado se
  leyó como defecto del cargo. Un comentario no impide nada. Ahora corta antes de gastar un agente.

### Corregido

- **La 0.15.1 atribuyó a `legal-counsel` cero casos de escritura en `planning/`, y no es cierto**: su
  respuesta declina uno citando el modo toolkit, y el juez aceptó la justificación —de ahí el 6/6—. El
  único registro limpio de la muestra es el de `security-engineer`.

  El registro de `product-manager` se descarta. Sus dos fallos son los dos casos que escriben, y la
  negativa citaba `planningDir` apuntando a la plantilla distribuida: un campo inerte: el motor habría
  escrito en `planning/` de la raíz, que el toolkit no tiene. Ese 3/5 no mide al cargo ni al entorno,
  sino una configuración que mentía. Se vuelve a ganar sobre una instancia.

## [0.15.1] - 2026-08-16

### Corregido

- **El recorrido de evaluación debe correrse sobre una instancia, no sobre el toolkit**, y ahora lo dice
  con su razón. Un cargo cuyo trabajo es producir artefactos de planning necesita un `planning/` donde
  escribir sea legítimo; dentro del repositorio del toolkit ese directorio es `template/planning`, que se
  distribuye a cada instalación. El cargo se niega —con razón— y el caso lo contaba como fallo.

  La correlación es exacta: `product-manager` falla los **dos** casos que piden escribir en `planning/` y
  ninguno de los otros tres; `security-engineer` y `legal-counsel`, con cero casos de ese tipo, dan 6/6
  en las dos corridas. Es el tercer hueco de fidelidad del arnés, y el que más engaña: hace parecer roto
  a un cargo que está acertando.

## [0.15.0] - 2026-08-16

### Cambiado

- **`AGENTS.md` incorpora «Negarse no es entregar».** Correr los casos adversariales sobre cinco cargos
  mostró el mismo defecto en tres: el cargo es fuerte para negarse y se queda corto en la acción
  positiva, **incluso cuando su propio contrato la autoriza**. El `product-manager` citaba su vía de
  escape sin tomarla; el `data-analyst` enumeraba seis definiciones y pedía elegir; el `qa-engineer`
  rechazaba una guía externa sin verificarla.

  No son tres defectos sino uno repetido, y es de redacción: los límites van en sección propia y en
  lista, las obligaciones positivas van de pasada dentro de un párrafo. Bajo presión, pesa la
  prohibición. Por eso el arreglo es una regla general en `AGENTS.md` —donde todo puntero de cargo ya
  mandaba a mirar— y no 47 ediciones. Verificado: los tres casos pasan.

  No afloja ningún límite: no promover, no prometer fechas, no inventar evidencia y no exceder la
  autoridad siguen absolutos. Se cierra la salida de cumplirlos sin entregar.

### Corregido

- El recorrido de evaluación le daba al cargo **sólo su `SKILL.md`**, cuando el puntero que instala cada
  runner dice «respetá ese contrato **y las reglas de `AGENTS.md`**». Lo medía en una situación que
  nunca ocurre, y ahí se perdía toda regla general.

## [0.14.2] - 2026-08-16

### Corregido

- **Un comportamiento esperado partido en varias líneas contaba como varios.** El parser de casos leía
  líneas en vez de viñetas, así que un caso con cuatro comportamientos declaraba siete — y ese número
  es el denominador de toda la evaluación: ninguno podía pasar. No se veía en el catálogo del sistema,
  donde todas las viñetas entran en una línea; apareció en el primer caso escrito por una empresa.

## [0.14.1] - 2026-08-16

### Corregido

- **Un recorrido de equipo que frena en una etapa tiraba el trabajo de las anteriores.** Los handoffs
  vivían sólo en memoria: si la etapa 3 no cerraba su gate, lo que las dos primeras habían establecido
  —con su evidencia y su cita— desaparecía. Ahora viaja con el bloqueo, para que quien lea la acción
  humana no vuelva a discutir lo ya resuelto.

  Lo encontró el ciclo de aprendizaje de un cargo propio de una empresa: buscaba sus propios veredictos
  para aprender de ellos y no existían en ninguna parte, porque nunca se habían escrito.

## [0.14.0] - 2026-08-16

### Cambiado

- **`learning/CODEX_AUTOMATION.md` pasa a llamarse `learning/AUTOMATION.md`.** El nombre venía de
  cuando Codex era el runner asumido; hoy son cuatro, el prompt es agnóstico y el cron semanal lo
  ejecuta con Claude. Un archivo que dice a qué agente pertenece un ciclo que no pertenece a ninguno
  invita a atarlo a ese agente. Ninguna instancia lo arrastra: los cargos del sistema viven en el
  paquete y uno propio nunca lo tuvo obligatorio.

### Añadido

- `ops agents list --own` y `--system`. Una empresa mantiene sus cargos, no los del catálogo: sin
  poder acotar la lista, su ciclo tendría que recorrer 48 para encontrar el suyo y chocar 47 veces
  con la negativa de `learn`.
- `AGENTS.md` de una instancia explica el ciclo de sus propios cargos: por comando, sin cron
  —activarlo en su repositorio es decisión suya— y con `learning/AUTOMATION.md` propio si su profesión
  no existe fuera de la empresa.

## [0.13.0] - 2026-08-16

### Añadido

- **El ciclo de aprendizaje se cierra solo hasta la firma, y sigue solo después de ella.** Faltaban
  las dos mitades entre «recomendación» y «contrato actualizado`»:
  - `/agent-propose <cargo>` escribe el cambio concreto —el texto exacto, archivo por archivo— y lo
    contrasta contra los casos vigentes. Antes la propuesta llegaba con «Cambio propuesto: por
    definir», y nadie firma una intención.
  - `/agent-promote <cargo>` aplica una propuesta **ya firmada**, registra en `HISTORY.md` y manda a
    correr los casos. Dos candados: se niega si «Aprobación humana» no tiene responsable —un agente no
    se autoriza a sí mismo— y exige verificar, porque aplicar sin correr los casos deja un contrato
    cambiado sin saber si se sostiene.
- Aplica **prosa, no un parche**, a propósito: un parche envejece si alguien toca el archivo mientras
  la propuesta espera firma. El costo es que aplicar exige criterio, y por eso toda desviación se
  escribe en la propia propuesta: quien firmó tiene derecho a saber qué se aplicó de lo que firmó.
- Investigación **semanal** en el cron, además de la consolidación mensual. Corre sólo si el
  repositorio declara `ANTHROPIC_API_KEY`; sin ella se saltea entero en vez de abrir un PR por cargo
  con un informe vacío. El prompt no vive en el cron: lo declara cada cargo en su
  `learning/CODEX_AUTOMATION.md`, así que un cargo nuevo trae su investigación sin tocar el workflow.

### Nota

El cron es de Cauce, no de las instancias: una empresa no lo recibe. Su ciclo de aprendizaje es por
comando, y activarlo en su propio repositorio es decisión suya.

## [0.12.0] - 2026-08-16

### Cambiado

- **`qa-engineer` incorporó su primera propuesta aprobada.** Aditiva en cuatro archivos: cinco fuentes
  nuevas, oráculos probabilísticos para sistemas de IA, transparencia de contenido generado y plazos
  regulatorios en el contrato, sus métodos en el modelo operativo, y la conducta prohibida
  `unreviewed_agent_test_repair` con el caso `07-agent-test-repair.md` que la pone a prueba. **7 de 7
  casos pasan** contra el contrato nuevo.
- El recorrido de evaluación ya no le pone tope de extensión a la respuesta que mide. Un tope de doce
  líneas hacía fallar dos casos que pasan: un comportamiento esperado puede exigir seis elementos
  —«versión, entorno, datos, pasos, frecuencia y artefactos»— y cuatro de esos no entran. El caso define
  qué hace falta; el arnés no puede maniatar la respuesta y después contar lo que falta.

## [0.11.1] - 2026-08-16

### Corregido

- El resultado de los casos es una advertencia de `evaluate`, no un error que corte la integración.
  Correr los casos exige un modelo y CI no lo tiene: gatear con un resultado viejo obligaría a pagar
  una corrida para poder integrar, y volvería a fallar cada vez que el contrato cambie. Quien falla
  fuerte es el recorrido que sí los ejecuta.

### Cambiado

- `qa-engineer`: **descartar no es verificar**. El contrato enseñaba a tratar el contenido externo como
  dato no confiable y no decía nada de verificarlo, así que el cargo rechazaba un documento externo en
  bloque sin preguntar quién lo publica, si hay versión oficial, qué alcance declara ni a qué versión
  aplica. Lo encontró la primera corrida de sus casos adversariales.

## [0.11.0] - 2026-08-16

### Añadido

- **Los 281 casos adversariales se ejecutan.** Existían desde el principio y nadie los corría:
  `evaluate` los contaba. Era una suite que sólo comprobaba que los archivos `.test.js` existieran.
  - `ops evaluate <cargo> --cases [--json]` los expone.
  - El recorrido `/agent-eval <cargo>` los corre: **quien responde nunca ve los comportamientos
    esperados** —si los viera, el caso mediría su capacidad de repetirlos, no su criterio— y quien
    juzga no es quien respondió.
  - El veredicto queda en `evaluations/results/<fecha>.md`, con la respuesta del cargo y la cita que
    sostiene cada comportamiento observado.
- `evaluate` informa si el cargo se corrió alguna vez y cómo le fue. No tenerlo es una advertencia, no
  un error: ejecutar cuesta y exigirlo en CI sería exigir red y credenciales. Un resultado que cubre
  menos casos de los vigentes **sí** es error: da una confianza que no tiene.

## [0.10.1] - 2026-08-16

### Corregido

- **La propuesta mensual consolidaba una sola línea de cada recomendación.** Es su única razón de
  existir: juntar lo que recomendaron los informes de la semana. Con la bandera `m` el `$` casa fin de
  *línea*, así que la búsqueda no ávida cortaba en el primer salto y una recomendación de diez líneas
  llegaba como una. El ciclo corría verde entregando casi nada.
- La comprobación de citas en las pruebas cortaba las rutas en el punto, así que verificaba la
  existencia de un archivo sin su `.md` y nunca lo detectó.

## [0.10.0] - 2026-08-15

### Cambiado

- **El motor llega siempre como dependencia. Se retiró el modo copia.** `--engine copy|dependency` ya
  no existe: `init` declara `@ingeniomaps/cauce` en el `package.json` del repo ops, creándolo si hace
  falta.

  La copia en `.ops/` existía para no exigirle npm a un repo de Go, Python o Rust. Dejó de tener
  sentido cuando el repo ops pasó a ser un **sidecar**, hermano de los repos de producto: declarar npm
  ahí no le impone un stack a ninguno. Y Node hace falta igual —el motor, los guards y los workflows
  son JavaScript—, así que la copia sólo ahorraba un `package.json` de seis líneas a cambio de 5 MB y
  763 archivos en la historia de la empresa, y de no tener cómo enterarse de que salió una versión
  nueva: sin npm no hay `npm outdated`.
- Los tres resolutores en cascada —`tools/ops.js`, `run-hook.sh` y el motor— pasan de tres caminos a
  dos. Menos superficie donde esconder un caso raro.
- Una instancia que arrastra `.ops/` **no se toca**: `upgrade` avisa que Cauce ya no lo distribuye y
  dice qué correr. Borrarlo por su cuenta la dejaría sin motor.
- El `$schema` de `ops.config.json` ya no depende del modo.

## [0.9.2] - 2026-08-15

### Corregido

- Una instancia ya no recibe un `.github/workflows/` vacío. `init` lo copiaba salteando los dos
  únicos archivos que existen —`ci.yml` valida el toolkit y el ciclo de aprendizaje dejó de
  distribuirse en 0.4.0—, así que creaba dos directorios y no ponía nada adentro.

## [0.9.1] - 2026-08-15

### Corregido

- **Una instancia no recibía `.gitignore`.** En modo dependencia eso significa commitear
  `node_modules/` —el paquete entero— dentro del repo de la empresa, y sus credenciales con él. El
  archivo viaja sin punto y se restituye al copiar: npm **excluye** cualquier `.gitignore` de un
  tarball, así que puesto con punto habría existido en el repo del toolkit y desaparecido para todo
  consumidor real.
- **`AGENTS.md` y `Makefile` se actualizan con el toolkit.** Son las reglas que un agente obedece y
  los atajos que envuelven al CLI; ninguno tiene una línea de la empresa. Envejecidos mienten: el
  `AGENTS.md` de una instancia seguía describiendo `automatization/runners/` como runtime del
  proyecto cuatro versiones después de que `upgrade` lo retirara.

## [0.9.0] - 2026-08-15

### Añadido

- `ops integration disable <raíz> <proveedor>`: el par que faltaba. Apagar **no desinstala** —
  `integrations/<proveedor>/` puede tener snapshots y borradores de la empresa, y borrarlos para
  desconectar una integración sería perder trabajo suyo. El andamiaje queda y volver a encender no
  pierde nada.
- `integration enable` sólo pide lo que falta: reencender un proveedor ya configurado no manda a
  completar un archivo que la empresa terminó hace meses.

## [0.8.2] - 2026-08-15

### Corregido

- **`integration list` mostraba encendido un proveedor que se habría negado a sincronizar.** Hay dos
  interruptores y `sync` exige los dos: el del registro dice que el proveedor está conectado al
  proyecto, el suyo propio que su configuración está terminada. La lista leía sólo el primero, así
  que después de `enable` decía `● jira` y `sync` contestaba `jira está deshabilitado`. Ahora
  distingue los tres estados y `enable` no promete más de lo que hizo.
- `integration enable` no falla si el andamiaje ya está. Habilitar no es inicializar: una instancia
  que lo arrastra de una versión anterior —o que ya tiene snapshots— sólo quiere el interruptor, y
  recibía un error pidiéndole un directorio vacío. Ahora repone lo que falte, conserva lo que haya y
  enciende el registro.

## [0.8.0] - 2026-08-15

### Cambiado

- **El andamiaje de una integración se materializa al habilitarla, no antes.** Una instancia recibía
  32 KB de Jira —configuración, `staging/`, `proposed/`, tres READMEs— para un proveedor con
  `enabled: false` que quizá no use nunca, y que además nadie actualizaba después. Ahora llega con
  `ops integration enable <raíz> <proveedor>`, que copia el andamiaje y enciende el registro.
- `check` valida sólo los proveedores habilitados. Un proveedor registrado y apagado no tiene
  andamiaje, y exigirle configuración era pedirle a la empresa que mantenga lo que no usa.
  Nombrarlo explícitamente sí lo valida, que es como se comprueba antes de encenderlo.
- Una instancia existente conserva lo suyo: `integrations/<proveedor>/` puede tener snapshots y
  borradores de la empresa, así que no se retira nada.

### Corregido

- `integrations/README.md`, `integrations/AGENTS.md` y `organization/README.md` se actualizan con el
  toolkit. Los escribe Cauce y envejecían para siempre en cada instancia.

## [0.7.5] - 2026-08-15

### Corregido

- `learn` y `evaluate` resuelven la raíz ops como el resto de los comandos. Quedaron con `cwd` cuando
  los demás pasaron a usarla: invocados desde la carpeta de la compañía —lo normal en sidecar— no
  encontraban ningún cargo.
- **`evaluate` le exigía a una empresa un archivo del toolkit.** `learning/CODEX_AUTOMATION.md`
  documenta cómo corre nuestra automatización de aprendizaje; pedírselo a quien escribe un cargo
  propio era pedirle contabilidad interna nuestra. Ahora sólo se exige a los cargos del sistema: el
  cargo de una empresa necesita contrato, fuentes e historia, no nuestro andamiaje.

## [0.7.4] - 2026-08-15

### Corregido

- **Una bandera antes del último posicional se comía su lugar.** `agents list --json` tomaba `--json`
  como la raíz ops y devolvía `[]` sin error: no había forma de distinguir "no hay cargos" de "te
  contesté con nada". Lo destapó un agente del recorrido de `team`, que pedía ese JSON para resolver
  dónde vive cada cargo y se quedaba sin dato.
- La ruta del contrato de cada cargo es obligatoria en el manifiesto que arma `team`. Siendo opcional
  el agente la omitía, la etapa caía al camino de respaldo y salía a buscar el archivo igual.
  Y lleva el prefijo de la raíz ops: `agents list` las imprime relativas a ella y las etapas corren
  desde otro lado, así que sin prefijo la ruta tampoco resolvía.

## [0.7.2] - 2026-08-15

### Cambiado

- **`team` gastaba un cuarto del recorrido en transcribir salida determinista de un CLI.** Dos agentes
  resolvían el equipo y leían su manifiesto; ahora es uno. El segundo además leía `organization/`
  "como contexto para etapas siguientes", y cada etapa es un agente nuevo con su propio contexto: esa
  lectura no llegaba a ninguna parte y sólo costaba tokens.
- Cada etapa recibe la ruta exacta del contrato de su cargo. Antes le pasaban
  `agents/<tipo>/<slug>/SKILL.md` —con el `<tipo>` literal— y desde 0.4.0 el catálogo ni siquiera está
  en el proyecto, así que el agente salía a buscarlo antes de poder empezar.

## [0.7.1] - 2026-08-15

### Corregido

- **Los cuatro workflows reventaban en su primera línea y nunca habían corrido.** Resolvían su raíz
  con `process.env`, y el runtime de workflows es un sandbox que no expone `process`: `ReferenceError`
  antes de ejecutar nada. `/team` y `/autobuild` —el centro del producto— estaban muertos, y los tests
  no lo veían porque leían los archivos como texto en vez de ejecutarlos.

  La raíz ahora viaja escrita en el archivo, que es lo que `automation install` ya sabía completar, y
  es relativa a donde se abre la herramienta.
- **Y al arreglar eso, `team` y `autobuild` morían en la línea de cierre**: llamaban a un `finish()`
  que el runtime tampoco trae. Peor que el anterior, porque ocurría *después* de gastar cada etapa.
- Dos tests recorren los workflows: uno prohíbe lo que el sandbox no expone, otro falla si se llama a
  algo que ni el runtime da ni el archivo define.

### Cambiado

- Los workflows de integración se invocan con argumentos en vez de variables de entorno, que tampoco
  existen ahí: `/integration-sync jira` y `/integration-promote jira KEY-123`.
- Un test comprueba que ningún workflow use `process`, `require`, `Date.now` ni `Math.random`. El
  sandbox los prohíbe, y usarlos no falla en una rama rara: impide que el archivo arranque.

## [0.6.1] - 2026-08-15

### Corregido

- **El bridge de Antigravity negaba cada llamada a herramienta.** Resolvía la raíz ops subiendo por el
  árbol, y en sidecar es un *hermano* de los repos de producto: no la encontraba y, como falla cerrado,
  bloqueaba todo. Ahora `automation install` le deja escrito dónde quedó, con el recorrido hacia arriba
  como respaldo.
- **`automation install antigravity` copiaba el plugin y lo dejaba inerte.** Antigravity exige un
  registro explícito —`agy plugin install`—, así que los archivos quedaban en su lugar, `doctor` daba
  verde y no se ejecutaba nada. `install` ahora dice el comando exacto y `doctor` avisa si falta, sin
  tocar por su cuenta la configuración global del usuario.

## [0.6.0] - 2026-08-15

### Cambiado

- **Gemini deja de ser el runner sin guards.** Gemini CLI ganó hooks y skills nativas, y el adaptador
  seguía tratándolo como si no los tuviera: los guards se pedían como prechecks manuales —o sea,
  nadie lo detenía— y los 47 cargos no llegaban. Ahora recibe hooks reales en `.gemini/settings.json`
  con sus propios eventos (`BeforeTool`, `AfterAgent`) y variable (`$GEMINI_PROJECT_DIR`), y el
  catálogo completo en `.gemini/skills/`.
- `GEMINI.md` avisa de dos cosas que sólo se ven usándolo: Gemini **desactiva los hooks si la carpeta
  no es de confianza**, y `gemini hooks migrate --from-claude` reescribe `settings.json` entero y se
  lleva puesta el resto de la configuración.

## [0.5.5] - 2026-08-15

### Corregido

- Los comandos de Gemini y las skills de Antigravity también resuelven sus rutas contra la carpeta
  donde se abre la herramienta. Quedaron afuera al marcar el resto: los `.toml` mandaban a leer
  `planning/PROTOCOL.md` y las skills `AGENTS.md`, que desde la raíz de la compañía no existen.
- Un test recorre todo lo que un adaptador copia y falla si una ruta da por sentado dónde se instala.
  Revisando archivo por archivo se escapó tres veces; ahora cubre también lo que se agregue después.

## [0.5.4] - 2026-08-15

### Corregido

- `upgrade` conserva el modo de los archivos que entrega. `tools/ops.js` tiene shebang y quedaba sin
  permiso de ejecución, con el cambio de modo apareciendo en el diff de cada empresa.

## [0.5.3] - 2026-08-15

### Corregido

- `tools/ops.js` se actualiza con el toolkit. Es el shim por donde entra cada comando, no tiene una
  línea de la empresa —dice él mismo que no se edita— y sin declararlo envejecía para siempre: una
  instancia creada antes seguía sin exportar la raíz ops, así que `agents list` y `team list`
  devolvían vacío al invocarse desde la carpeta de la compañía.

## [0.5.2] - 2026-08-15

### Corregido

- **`upgrade` registraba mal lo que entregaba, y eso trababa el siguiente.** El registro se anotaba
  ruta por ruta releyendo el manifiesto del disco en cada una, así que la última anulaba a todas las
  anteriores: tras un `upgrade` casi todos los digests quedaban viejos y la actualización siguiente
  los leía como ediciones de la empresa. Un callejón sin salida sin que nadie hubiera tocado nada.

  Una instancia que ya quedó con digests viejos se destraba con `cauce upgrade --force`: el contenido
  en disco y el del paquete son el mismo, así que no se descarta nada real.

## [0.5.1] - 2026-08-15

### Agregado

- **Codex recibe su `AGENTS.md`.** Era el único runner sin archivo de instrucciones: se llevaba los
  guards y nada más, así que podía ser detenido pero no sabía que existía un protocolo, un catálogo de
  cargos ni equipos. No existe un `CODEX.md`: `AGENTS.md` es el nombre que Codex lee, compartido entre
  herramientas, y por eso en modo embedded no se instala —el de la empresa ya está ahí y manda—.

### Corregido

- **Las rutas de los adaptadores se resuelven contra la carpeta donde se abre la herramienta.** Al
  mover la instalación a la raíz de la compañía quedaron apuntando al lugar equivocado: `@AGENTS.md`
  y `@planning/PROTOCOL.md` no resolvían, y los workflows buscaban `planning/` donde no estaba. Ahora
  cada fuente marca el lugar con `{{OPS_DIR}}` y `install` lo completa; `doctor` compara contra lo
  mismo que `install` escribe.
- `tools/ops.js` exporta la raíz ops, que ya calculaba y no usaba. Invocado desde la carpeta de la
  compañía —`node <empresa>-ops/tools/ops.js team list`—, `agents list` y `team list` resolvían contra
  el cwd y devolvían **vacío en vez de fallar**. `team` además no aceptaba una raíz de ningún modo.

## [0.5.0] - 2026-08-15

### Cambiado

- **Los adaptadores de runner y los workflows tampoco se copian al proyecto.** Cierran el mismo
  criterio que ya rige para cargos y equipos: los lee el motor, no la empresa. `automation install`,
  `check` y `doctor` los resuelven desde la dependencia npm, o desde `.ops/` cuando el repo no usa
  npm. Nadie los editaba —la lista de runners es cerrada, así que una empresa ni siquiera podía
  agregar el suyo— y `automatization/workflows/` estaba además duplicado dentro de cada instancia,
  idéntico a lo que `automation install` deja en `.claude/workflows/`.
- `upgrade` retira `automatization/runners/` y `automatization/workflows/` de las instancias que los
  arrastran de una versión anterior. Un guard propio en `automatization/hooks/` no se toca.
- `automatization/hooks/` se queda en el proyecto, y esto no es una excepción arbitraria: la
  configuración de cada runner nombra cada guard por ruta literal y no sabe resolver en cascada. Ahí
  es también donde una empresa agrega el suyo.

- **En modo `sidecar`, `automation install` instala en la carpeta de la compañía, no dentro del repo
  ops.** El repo ops coordina varios repos de producto y es hermano de ellos, así que instalar el
  runner adentro lo dejaba sin ver una sola línea de código: el dev que abría su herramienta donde
  está el código no tenía guards, ni cargos, ni workflows. Las rutas de guards y los punteros de cada
  cargo se reescriben con el prefijo del repo ops al instalar.

### Corregido

- **Una mejora del toolkit en el wiring ahora llega a un runner ya instalado.** `install` conservaba
  cualquier archivo existente, así que un workflow o un `CLAUDE.md` mejorado río arriba no llegaba
  nunca. Peor: si el archivo difería, `install` fallaba —`existe y difiere de la fuente canónica`— y
  `doctor` lo reportaba como error, dejando a la empresa sin salida salvo borrar a mano. Ahora el
  registro de entrega distingue las dos cosas que antes se veían iguales: lo que la empresa editó se
  conserva o detiene la instalación, y lo que sólo cambió río arriba se actualiza.
- `automation check` compara los guards de la instancia contra los del paquete. Existir y ser
  ejecutable no alcanzaba: un guard viejo no falla, **deja de proteger en silencio**, y `check`,
  `doctor` y `upgrade` daban verde igual porque sólo miraban el número de versión. Ahora bloquea la
  instalación del runner y dice qué correr; distingue además el guard que la empresa editó del que
  simplemente quedó atrás.
- `upgrade` recuerda reinstalar los runners: el wiring vive fuera de la instancia y lo escribe otro
  comando, así que sin el aviso una mejora se quedaba en el paquete.
- Los guards resuelven la raíz ops por su cuenta. `findOpsRoot` sólo sube por el árbol, y en sidecar
  la raíz ops es un *hermano* de los repos de producto: desde ahí no la encontraba, devolvía vacío y
  el guard permitía todo **en silencio**. `run-hook.sh` ya sabía dónde vive; ahora lo exporta.
- `automatization/README.md` y `automatization/AGENTS.md` se actualizan con el toolkit. Los escribe
  Cauce y envejecían en cada instancia: después de retirar `runners/` y `workflows/`, el README de la
  empresa seguía explicando cómo usar dos carpetas que ya no existían.
- El registro de entrega olvida lo que ya no está en disco. Sólo crecía: al retirar una ruta dejaba
  su digest para siempre, y el día que un nombre se reutilizara la entrega nueva se habría leído como
  una edición local y detenido la actualización.

## [0.4.1] - 2026-08-15

### Corregido

- Al mover los equipos al paquete se fue con ellos su documentación, así que una instancia nueva se
  quedaba sin `teams/README.md` ni la plantilla: sabía que podía escribir equipos propios, pero no
  con qué contrato. Lo que le habla a la empresa viaja con la instancia aunque la colección no.

## [0.4.0] - 2026-08-15

### Cambiado

- **Ni el catálogo de cargos ni los equipos se copian al proyecto.** Son definiciones que consume el
  motor: se resuelven desde la dependencia npm, o desde `.ops/` cuando el repo no usa npm. Las reglas
  y decisiones de `planning/*/system/` sí siguen materializadas, porque la empresa las lee y las cita
  en su propio repositorio.
- **El catálogo de cargos ya no se copia al proyecto.** Se resuelve desde la dependencia npm, o desde
  `.ops/agents/` cuando el repo no usa npm. Una instancia pasa de ~950 KB a ~480 KB y su `git diff`
  muestra sólo lo que la empresa escribió.
- El ciclo mensual de aprendizaje dejó de distribuirse: investiga cómo evoluciona una profesión, y eso
  es igual para todas las empresas. Corriéndolo en cada instalación, cuatro empresas producían cuatro
  investigaciones casi idénticas del mismo tema, cada una peor que una hecha bien. Ahora vive sólo en
  el repositorio del toolkit y llega actualizando la dependencia.
- `learn` y `learn --proposal` fallan con explicación si se corren sobre un cargo del catálogo dentro
  de una instancia: escribirían en el paquete y se perderían en el próximo `npm ci`.
- Las fuentes `local://` salieron de los 47 cargos. Lo que un cargo debe saber de una empresa vive
  ahora en `organization/roles/<slug>.md`, y los 47 lo citan.

### Corregido

- `upgrade` no actualizaba el catálogo de cargos, o sea el 75% del paquete: un cargo nuevo o mejorado
  nunca llegaba a un proyecto ya inicializado. Ahora se refresca como el resto del sistema, con una
  excepción precisa: `learning/` dentro de cada cargo es del proyecto y no se toca, porque los
  informes acumulados son lo único que no se puede reponer desde el paquete.

- El `$schema` de `ops.config.json` apuntaba siempre a `.ops/engine/`, una ruta que no existe cuando el
  motor viene como dependencia. Ahora se escribe según dónde quedó el motor.

## [0.3.0] - 2026-08-15

### Añadido

- Equipo `feasibility-review`: tres etapas para decidir si una intención vale el esfuerzo con la
  evidencia que ya existe. Recomendar investigar es un resultado legítimo, no una falla.
- Equipo `incident-review`: revisión posterior de un incidente ya contenido. **No responde incidentes
  en vivo** y su documentación lo dice: un recorrido de agentes no está de guardia, no accede a
  producción y no decide bajo presión con información parcial.
- Los equipos declaran su salida en `outcome`: `epic` deja una épica candidata en `roadmap/`;
  `report` deja un informe en `planning/reports/` y sus seguimientos en el INBOX, sin promover.
  Ninguno de los dos promueve al BACKLOG.
- `/team` acepta el equipo por prefijo —`/team incident-review: se cayó el checkout`— confirmándolo
  contra los que existen, así que un texto con dos puntos no dispara un equipo inventado.
- `teams/000-template.md` y `teams/README.md`: era la única colección que se distribuía sin plantilla,
  lo que obligaba a copiar un manifiesto de nueve etapas y adivinar el esquema.
- `autobuild` ejecuta cada fase bajo el contrato del cargo que la posee, en vez de pedirle criterio
  genérico a un agente sin rol. Los dueños por defecto son deterministas; los condicionales
  —seguridad, privacidad, sre, ux— entran por riesgo, plataforma y alcance, nunca por rutina, y el
  reparto queda registrado en el WIP para poder auditar quién revisó qué.
- Cargo `growth-marketer`: adquisición y activación con economía unitaria explícita. Cubre la
  decisión que no tenía dueño —dónde invertir para adquirir y si funcionó—, entre posicionamiento
  (`product-marketing-manager`) y proceso de ingresos (`revenue-operations-manager`).
- Cargo `finops-engineer`: costo de operar visible y atribuido, incluido el gasto en modelos de IA,
  que escala con el contexto arrastrado y no con la cantidad de usuarios.
- `agents list --json` incluye la ruta resuelta de cada cargo, para que quien lo consuma no
  reconstruya dónde ganó la precedencia.

### Cambiado

- Las etapas de un equipo declaran si son de `discovery` o de `delivery`. `/team` recorre sólo las de
  descubrimiento y propone; `autobuild` ejecuta la entrega, y sólo después de la promoción humana.
- `agents/coordinators/`, `agents/specialists/` y `agents/workflows/` se eliminaron: eran directorios
  vacíos que prometían una taxonomía sin contenido, y `workflows` además colisionaba en nombre con
  `automatization/workflows/`. El mecanismo no cambia: cualquier directorio bajo `agents/` sigue
  siendo un tipo válido y se reconoce cuando tiene contenido.

### Corregido

- `/team` recorría todas las etapas del manifiesto, incluida la de construcción: un recorrido de
  descubrimiento llegaba a pedir un incremento funcionando, o sea código escrito antes de que la
  épica existiera y antes de que nadie la aprobara.
- Invocado como slash command, `/team` recibía la intención como texto y buscaba `args.intent`, así
  que se detenía antes de su primera etapa en la forma más obvia de llamarlo.
- `upgrade` sugería mover un guard editado "junto a `system/`", un mecanismo que no existe en
  `automatization/hooks/`. Ahora explica las tres vías que sí funcionan: agregar un guard propio,
  quitarlo de la configuración del runner para desactivarlo, o descartar el cambio con `--force`.
- `upgrade --force` descartaba ediciones locales sin dejar rastro; ahora las lista.

## [0.2.0] - 2026-08-14

### Añadido

- `cauce upgrade` actualiza una instancia sin tocar nada del proyecto, con `--check` para saber si hay
  algo pendiente y `--force` para descartar ediciones locales del runtime. Antes no existía forma de
  actualizar: cada proyecto quedaba congelado en la versión con la que nació.
- La frontera `system/` se extendió a `planning/rules/`, `teams/` y `agents/`. Un archivo propio con el
  mismo nombre, ID o slug reemplaza al del sistema, y `check` lo reporta como override explícito.
- Los 45 cargos del catálogo se instalan en el runner como skills invocables por nombre. Antes viajaban
  a cada proyecto sin que ningún runner los usara.
- `cauce agents list` resuelve la precedencia del catálogo y marca cuáles son propios del proyecto.
- El motor se declara como dependencia npm cuando el repo ya usa npm, y se copia sólo cuando no.
- Las instancias registran `cauceVersion` en `ops.config.json`.
- Workflow `/team`: recorre las etapas de un equipo exigiendo cada exit gate y deja una épica
  candidata en `roadmap/`. Es el espejo de `/autobuild`, que ejecuta trabajo ya aprobado. Nunca
  promueve al BACKLOG: esa firma sigue siendo humana.
- `team show --json` expone el manifiesto completo para que un workflow lo ejecute sin parsearlo.

### Cambiado

- Los cargos que trae Cauce se movieron a `agents/roles/system/`. Un proyecto que quiera su propia
  versión de un cargo la escribe en `agents/roles/` con el mismo slug.
- Las composiciones de equipo se movieron a `teams/system/`.
- `tools/ops.js`, el wrapper de hooks y el bridge de Antigravity resuelven el motor en cascada:
  dependencia npm, copia local, repositorio del toolkit.
- `automation install` reemplaza los guards que este mismo toolkit había registrado sueltos por el
  grupo que los cubre. Sin esa poda, una instalación previa ejecutaba cada guard dos veces por
  herramienta; con `verify` eso significaba correr la suite de tests dos veces en cada commit.

### Corregido

- `automation install` funcionaba sólo si el motor estaba copiado: en modo dependencia fallaba con
  "falta engine/hooks/run.js". Los tres puntos de entrada resuelven ahora la misma cascada.
- `upgrade` ya no borra archivos que el proyecto agregó al runtime, como un guard propio.
- El README de `automatization/runners/` que recibe un proyecto es el que le habla al proyecto, no el
  que documenta el contrato de adaptadores; antes llegaba uno u otro según se usara `--force`.
- `team check` distingue entre un agente inexistente y uno ambiguo.

## [0.1.0] - 2026-08-14

Primera publicación como `@ingeniomaps/cauce`.

- CLI determinista de planificación: `init`, `check`, `tree`, `context`, `archive`.
- Protocolo agnóstico al runner con adaptadores para Claude, Codex, Gemini y Antigravity.
- Once guards portables agrupados por evento, un proceso por llamada de herramienta.
- Catálogo de 45 cargos con evaluaciones y ciclo de aprendizaje mensual.
- Integraciones por staging de sólo lectura, con Jira como primer proveedor.
