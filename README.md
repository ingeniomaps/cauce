# Cauce — sistema operativo reusable para proyectos

Este repositorio convierte planificación escrita en un flujo verificable y recuperable para humanos y
agentes. Está extraído de sistemas en producción, pero no contiene reglas de negocio de ninguno de ellos:
el contexto de cada empresa vive en su propia instancia.

## Qué resuelve

- Una tarea tiene una sola fuente de verdad durante todo su ciclo de vida.
- Una sesión interrumpida se recupera desde `WIP.md`, sin reconstruir la intención.
- Las ideas del agente no entran solas a la cola: quedan en `INBOX.md` hasta promoción humana.
- Épicas, criterios, tareas y evidencia son validados de forma determinista.
- Vive en su propia carpeta `ops/` dentro del repo, como sidecar `proyecto-ops` para varios repos, o
  embebido en la raíz.
- Incluye un catálogo de cargos reutilizables; el contexto editable de cada empresa vive en
  `organization/`.
- No depende de Claude, Codex, Gemini ni de un stack de aplicación específico.
- Integra herramientas externas mediante adaptadores; Jira es el primer proveedor.

## Inicio rápido

Requiere Node.js 24 o superior y no tiene dependencias externas. No hace falta clonar este repositorio.

```bash
cd mi-repo
npx @ingeniomaps/cauce@latest init
```

Eso alcanza. `init` crea `./ops`, pregunta con qué runner vas a trabajar y qué integraciones querés,
instala la dependencia, deja el wiring del runner puesto y valida la instancia antes de terminar:

```text
¿Con qué runner vas a trabajar?
1) claude   2) codex   3) gemini   4) antigravity   5) ninguno
[ninguno] > 1

¿Habilitar alguna integración?
1) jira   2) ninguna
[ninguna] >

· npm install (el motor viene de la dependencia)
✓ claude: adaptador operativo (0 advertencia(s))
✓ planning válido: 0 épica(s), 0 tarea(s) en cola, 0 terminada(s)
  listo: el ciclo empieza en ops/planning/FLOW.md
```

El default de las dos preguntas es no hacer nada: instalar un runner escribe en tu repositorio y
habilitar un proveedor deja andamiaje que después hay que completar, así que un Enter apurado no deja
archivos que no pediste. Los dos pasos se pueden agregar más tarde con `automation install` e
`integration enable`.

Queda así, y el resto del repositorio sin tocar:

```text
mi-repo/
├── apps/          tu código, intacto
├── ops/           Cauce: planning/, organization/, teams/, tools/, AGENTS.md, Makefile
├── .claude/       el wiring del runner elegido
└── CLAUDE.md
```

Lo del runner va a la raíz a propósito: ahí abre el dev su herramienta, y uno que sólo viera `ops/` no
tendría acceso a una línea de código.

### Sin preguntas, para un script

Sin terminal —CI, un contenedor, un Dockerfile— `init` no pregunta nada ni descarga nada: materializa la
instancia y dice qué falta. Todo se puede decidir por bandera:

```bash
npx @ingeniomaps/cauce@latest init --runner codex --integration jira --install
```

`--install` es el que corre `npm install`; sin él la instancia queda creada pero todavía no funciona, y
la salida lo dice. La dependencia no es opcional: el shim `tools/ops.js`, los cargos, los equipos y los
adaptadores se resuelven desde `<ops>/node_modules/@ingeniomaps/cauce`, y el lockfile es lo que fija qué
versión del motor corre.

### Dónde vive la instancia

| Situación | Comando | Qué queda |
|---|---|---|
| Un repo: monolito o monorepo | `init` | `ops/` dentro del repo; el runner se instala en la raíz. |
| Varios repos de producto | `init acme-ops --mode sidecar`, desde la carpeta que los contiene | `acme-ops/` hermano de los repos. |
| Planning en la raíz del repo | `init . --mode embedded --force` | `planning/`, `organization/`, `teams/`, `tools/`, `AGENTS.md` y `Makefile` en el primer nivel. |

Los dos primeros son el mismo modo —`sidecar`— y difieren sólo en dónde queda la carpeta: adentro del
repo o al lado. El tercero hay que pedirlo explícito porque es el único que despliega el molde en el
primer nivel del repositorio.

El destino debe estar vacío o no existir. `--force` completa archivos faltantes en un directorio que ya
tiene cosas, y nunca sobrescribe los que ya están.

Declarar npm en el repo ops no le impone un stack a nadie: ese repo coordina, no compila, y Node hace
falta igual —el motor, los guards y los workflows son JavaScript—.

### El primer ciclo

Desde el runner, `/team` recorre un equipo y deja escrita una épica candidata en `planning/roadmap/`, y
`/autobuild` toma una tarea ya promovida y la ejecuta fase por fase. Sin runner el recorrido es el
mismo: la [tabla de comandos](#comandos) y [FLOW.md](template/planning/FLOW.md) lo operan a mano.

Dentro del proyecto el CLI se invoca con `node tools/ops.js` —o `npx cauce`, que la dependencia deja
disponible—; desde este repositorio, con `node engine/cli/ops.js`. En la tabla de abajo `ops` representa
cualquiera de esas formas.

## Flujo

```text
idea → INBOX → roadmap → BACKLOG → WIP → DONE → done/epic-NNN.md
                    aprobación     ejecución      archivo histórico
```

1. Captura ideas, deuda o lecciones en `INBOX.md`.
2. Especifica el resultado de producto en una épica de `roadmap/`. El workflow `/team` puede recorrer
   un equipo —una etapa por dueño de decisión, con su exit gate— y dejar la épica candidata escrita;
   si falta evidencia o autoridad, para y registra la acción humana en vez de suponer.
3. Promueve historias listas a un `## Hito` de `BACKLOG.md`.
4. Un runner toma una sola tarea y persiste su plan en `WIP.md`.
5. Tras Build, Review, Verify y QA, mueve la entrada a `DONE.md` con evidencia.
6. Al cerrar la épica, ejecuta `ops archive` para mover su evidencia a un histórico inmutable.

Lee [template/planning/PROTOCOL.md](template/planning/PROTOCOL.md) para el contrato completo y
[template/planning/FLOW.md](template/planning/FLOW.md) para operar el ciclo.

## Comandos

| Comando | Función |
|---|---|
| `ops init [destino]` | Materializa una instancia y la deja usable; sin destino, en `ops/` y modo sidecar. |
| `ops check <planning>` | Valida contratos, unicidad, trazabilidad y estados. |
| `ops tree <planning>` | Muestra roadmap, backlog, WIP, inbox y done sin mutar nada. |
| `ops context <planning>` | Emite el contexto mínimo de la tarea vigente para un runner. |
| `ops upgrade <ops-root>` | Actualiza `system/` y el runtime sin tocar lo del proyecto. |
| `ops archive <planning> <NNN>` | Archiva el DONE de una épica cerrada de forma idempotente. |
| `ops agents list [ops-root]` | Lista los cargos visibles resolviendo la precedencia. |
| `ops agents fork <cargo>` | Copia un cargo del catálogo a la empresa, que pasa a mantenerlo. |
| `ops learn <agent>` | Prepara el informe de aprendizaje del período. |
| `ops learn <agent> --proposal` | Consolida los informes en una propuesta, sin aplicar cambios. |
| `ops evaluate <agent>` | Valida controles, casos y propuestas del cargo. |
| `ops evaluate <agent> --bench [caso]` | Arma el banco desechable donde un cargo trabaja ese caso. |
| `ops team list` | Lista equipos disponibles. |
| `ops team check <team>` | Valida manifiesto, agentes, dependencias y gates del equipo. |
| `ops team show <team>` | Muestra el recorrido y artefactos del equipo. |
| `ops integration list <ops-root>` | Lista proveedores registrados. |
| `ops integration enable\|disable <ops-root> <prov>` | Activa o desactiva un proveedor. |
| `ops integration check <ops-root>` | Valida configuración y staging sin conectarse. |
| `ops integration sync <ops-root> jira` | Lee Jira y actualiza staging. |
| `ops integration promote <ops-root> jira KEY` | Promueve un draft `ready` al roadmap. |
| `ops integration reset <ops-root> jira KEY` | Descarta curación y adopta el remoto. |
| `ops integration rebase <ops-root> jira KEY` | Recalcula el borrador canónico sin avanzar la base remota. |
| `ops integration reconcile <ops-root> jira KEY` | Conserva curación sobre la nueva base remota. |
| `ops integration writeback-plan <ops-root> jira` | Muestra escrituras posibles sin ejecutarlas. |
| `ops automation list <ops-root>` | Lista adaptadores y su instalación. |
| `ops automation list-hooks <ops-root>` | Describe los guards portables disponibles. |
| `ops automation check <ops-root>` | Valida guards, permisos y configuraciones. |
| `ops automation install <ops-root> <runner>` | Instala el wiring de Claude, Codex, Antigravity o Gemini. |
| `ops automation doctor <ops-root> <runner>` | Diagnostica una instalación materializada. |

`ops --help` lista las banderas de cada uno. En un proyecto generado, `make help` muestra los atajos
equivalentes.

## Adaptación por proyecto

Después de inicializar:

1. Edita `ops.config.json`: nombre, modo y raíces de código.
2. Completa `AGENTS.md`: límites de autonomía e integraciones reales.
3. Completa `organization/company.md` y `organization/product.md` con el contexto estable de la empresa.
4. Copia `planning/roadmap/epic-000-template.md` a `epic-001-<slug>.md`.
5. Ejecuta `node tools/ops.js check planning` antes de activar cualquier runner.

`organization/` describe el negocio; `planning/` describe intención y estado; los repos de código siguen
siendo dueños de sus comandos, convenciones y commits.

Los cargos, su adopción y su evaluación están en [agents/README.md](agents/README.md).

### La frontera `system/`

Cada colección adaptable separa lo que actualiza el toolkit de lo que escribe el proyecto:

| Directorio | `system/` | Junto a `system/` |
|---|---|---|
| `planning/business-rules/` | `BR-OPS-NNN` | las reglas de la empresa |
| `planning/adr/` | `OPS-NNN` | las decisiones de la empresa |
| `planning/rules/` | proceso, forma del cambio, commits, conducta | las convenciones propias |
| `teams/` | composiciones que vienen con Cauce | los equipos propios |
| `agents/<tipo>/` | *(en el paquete, no se copia)* | los cargos propios |

Un archivo propio con el mismo nombre o ID que uno de `system/` lo reemplaza: el del proyecto manda y
`check` lo reporta como override explícito. Así una mejora del proceso no obliga a forkear el archivo,
y actualizar no exige resolver conflictos: se reemplaza `system/` entero y nada más se toca.

`automatization/hooks/` no tiene `system/`: es runtime que se reemplaza entero. Un guard propio convive
y sobrevive, desactivar uno del toolkit es quitarlo de la configuración del runner, y editar uno
existente detiene el `upgrade` antes de pisarlo.

### Versionado

Como `upgrade` reemplaza `system/` sin pedir confirmación, un cambio en el protocolo, en una regla del
sistema o en un guard es visible para el usuario y sube minor aunque no toque código. `upgrade` y
`upgrade --check` imprimen las entradas de [CHANGELOG.md](CHANGELOG.md) que hay entre la versión
instalada y la que se recibe, para que la actualización se lea antes de aplicarse.

## Integraciones

Cada proveedor implementa únicamente autenticación, lectura paginada y normalización. El núcleo comparte el
resto del recorrido:

```text
proveedor → snapshot remoto → borrador local → validación → promoción al roadmap
```

La plantilla incluye Jira deshabilitado. Para activarlo, edita `integrations/config.json` y
`integrations/jira/config.json`, configura `JIRA_EMAIL`/`JIRA_API_TOKEN` en el entorno y ejecuta:

```bash
node tools/ops.js integration check . jira
node tools/ops.js integration sync . jira
```

La sincronización solo lee Jira. `writeback-plan` calcula intención local, no llama la API de escritura, y
`writeBack` permanece en `false`. Consulta el [recorrido de Jira](template/integrations/jira/README.md) antes
de conectar una instancia real.

Para añadir otra herramienta se crea un adaptador en `engine/integrations/providers/` con `validateConfig`,
`fetchItems` y `normalizeFixture`, y se registra en `engine/integrations/registry.js`. Staging, revisión,
promoción y validación no se reimplementan. Consulta [integrations/README.md](integrations/README.md).

## Hooks y runners

Los guards portables viven en `automatization/hooks/` y comparten el motor `engine/hooks/run.js`. Una
instancia nueva los recibe sin activar ningún runner en silencio:

```bash
node tools/ops.js automation check .
node tools/ops.js automation install . claude    # o codex / gemini / antigravity
node tools/ops.js automation doctor . claude
```

La instalación fusiona la configuración propia del runner y conserva las entradas existentes; sólo
reemplaza los guards que el propio toolkit había registrado sueltos por el grupo que ahora los cubre, y
lista cuáles quitó. Nada que no haya escrito el toolkit se toca.

Qué comprueba cada guard, qué no puede comprobar y cómo se agrupan por evento está en
[automatization/hooks/README.md](automatization/hooks/README.md).

## Arquitectura del toolkit

- `engine/`: código determinista del CLI, planning, integraciones y aprendizaje de agentes.
- `automatization/`: guards, workflows y adaptadores de runner.
- `integrations/`: documentación del contrato para herramientas externas.
- `template/`: estructura materializada dentro de cada proyecto.
- `agents/`: el catálogo de cargos, que viaja con el paquete en vez de copiarse.
- `teams/`: composiciones de cargos, con orden, handoffs y responsabilidades compartidas.
- `test/`: pruebas del toolkit; ver [test/README.md](test/README.md).

Cualquier directorio bajo `agents/` es un tipo válido y se reconoce cuando tiene contenido, sin
registrarlo en ningún lado. Hoy existe `agents/roles/`.

El toolkit no guarda contexto real de ninguna empresa. `template/organization/` es el molde que cada
proyecto recibe como `organization/`. De igual forma, `planning/` pertenece a la instancia generada:
conserva su intención, estado y evidencia, mientras el motor reusable permanece en la dependencia.

Para trabajar sobre este repositorio, lee [AGENTS.md](AGENTS.md).

## Licencia

[MIT](LICENSE). Sin dependencias: no hay licencias de terceros que arrastrar.

Lo que `ops init` genera en tu repositorio —`planning/`, `AGENTS.md`, el `Makefile`, `tools/ops.js` y
el resto del molde— es tuyo: usalo, editalo y distribuilo sin obligación de atribuir ni de incluir este
aviso. La condición de MIT aplica a redistribuir Cauce, no a lo que construyas con él.
