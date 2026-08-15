# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y versionado según
[SemVer](https://semver.org/lang/es/).

`cauce upgrade` reemplaza `system/` completo sin pedir confirmación. Este archivo es lo que hace que
esa operación sea confiable en vez de sólo cómoda: acá se lee qué cambió antes de aplicarlo. Por eso
un cambio en el protocolo, en las reglas del sistema o en un guard es visible para el usuario y sube
minor aunque no toque una sola línea de código.

## [0.5.2] - 2026-08-15

### Corregido

- **`upgrade` registraba mal lo que entregaba, y eso trababa el siguiente.** El registro se anotaba
  ruta por ruta releyendo el manifiesto del disco en cada una, así que la última anulaba a todas las
  anteriores: tras un `upgrade` casi todos los digests quedaban viejos y la actualización siguiente
  los leía como ediciones de la empresa. Un callejón sin salida sin que nadie hubiera tocado nada.

  Una instancia que ya quedó con digests viejos se destraba con `cauce upgrade --force`: el contenido
  en disco y el del paquete son el mismo, así que no se descarta nada real.
- `tools/ops.js` se actualiza con el toolkit. Es el shim por donde entra cada comando, no tiene una
  línea de la empresa —dice él mismo que no se edita— y sin declararlo envejecía para siempre: una
  instancia creada antes seguía sin exportar la raíz ops, así que `agents list` y `team list`
  devolvían vacío al invocarse desde la carpeta de la compañía.

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
