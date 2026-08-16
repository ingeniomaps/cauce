# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y versionado según
[SemVer](https://semver.org/lang/es/).

`cauce upgrade` reemplaza `system/` completo sin pedir confirmación. Este archivo es lo que hace que
esa operación sea confiable en vez de sólo cómoda: acá se lee qué cambió antes de aplicarlo. Por eso
un cambio en el protocolo, en las reglas del sistema o en un guard es visible para el usuario y sube
minor aunque no toque una sola línea de código.

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
