# Cauce — sistema operativo reusable para proyectos

Este repositorio convierte planificación escrita en un flujo verificable y recuperable para humanos y
agentes. Está extraído de sistemas en producción, pero no contiene reglas de negocio de ninguno de ellos:
el contexto de cada empresa vive en su propia instancia.

## Qué resuelve

- Una tarea tiene una sola fuente de verdad durante todo su ciclo de vida.
- Una sesión interrumpida se recupera desde `WIP.md`, sin reconstruir la intención.
- Las ideas del agente no entran solas a la cola: quedan en `INBOX.md` hasta promoción humana.
- Épicas, criterios, tareas y evidencia son validados de forma determinista.
- Funciona como `planning/` embebido en un repo o como sidecar `proyecto-ops` para varios repos.
- Incluye un catálogo tipado en `agents/`; los cargos reutilizables viven en `agents/roles/` y el contexto editable de cada empresa en `organization/`.
- No depende de Claude, Codex, Gemini ni de un stack de aplicación específico.
- Integra herramientas externas mediante adaptadores; Jira es el primer proveedor.

## Inicio rápido del toolkit

Requiere Node.js 24 o superior y no tiene dependencias externas. Desde este repositorio se invoca el CLI
con `node engine/cli/ops.js`:

```bash
node engine/cli/ops.js init /ruta/al/proyecto --name "Mi proyecto" --mode embedded --force
node engine/cli/ops.js init /ruta/al/proyecto-ops --name "Mi proyecto" --mode sidecar
node engine/cli/ops.js check /ruta/al/proyecto/planning
node engine/cli/ops.js tree /ruta/al/proyecto/planning
node engine/cli/ops.js context /ruta/al/proyecto/planning
node engine/cli/ops.js learn product-manager
node engine/cli/ops.js evaluate product-manager
node engine/cli/ops.js team check product-development
node engine/cli/ops.js team show product-development
```

El destino debe estar vacío o no existir. En modo embebido normalmente ya es un repo: `--force` permite
completar archivos faltantes, pero nunca sobrescribe archivos existentes.

El motor llega como dependencia y el lockfile fija la versión. `init` declara `@ingeniomaps/cauce` en el
`package.json` del repo ops —creándolo si no existe— y el proyecto invoca `node tools/ops.js`, que resuelve
el motor sin que nadie tenga que saber dónde está.

Declarar npm ahí no le impone un stack a nadie: el repo ops es un sidecar, hermano de los repos de
producto, y Node hace falta igual —el motor, los guards y los workflows son JavaScript—.

Dentro de un proyecto generado, el CLI autocontenido se invoca con `node tools/ops.js`. En la tabla siguiente,
`ops` representa cualquiera de esas dos formas según el contexto. El binario `cauce` también queda
disponible si este paquete se enlaza o instala mediante npm.

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
| `ops init <destino>` | Materializa una instancia portable. |
| `ops check <planning>` | Valida contratos, unicidad, trazabilidad y estados. |
| `ops tree <planning>` | Muestra roadmap, backlog, WIP, inbox y done sin mutar nada. |
| `ops context <planning>` | Emite el contexto mínimo de la tarea vigente para un runner. |
| `ops agents list <ops-root>` | Lista los cargos visibles resolviendo la precedencia. |
| `ops agents fork <cargo>` | Copia un cargo del catálogo a la empresa, que pasa a mantenerlo. |
| `ops upgrade <ops-root>` | Actualiza `system/` y el runtime sin tocar lo del proyecto. |
| `ops archive <planning> <NNN>` | Archiva el DONE de una épica cerrada de forma idempotente. |
| `ops learn <agent>` | Prepara el informe semanal que completa la automatización de Codex. |
| `ops learn <agent> --proposal` | Consolida informes mensuales en una propuesta sin aplicar cambios. |
| `ops evaluate <agent>` | Valida controles, casos y propuestas del agente. |
| `ops team list` | Lista equipos disponibles. |
| `ops team check <team>` | Valida manifiesto, agentes, dependencias y gates del equipo. |
| `ops team show <team>` | Muestra el recorrido y artefactos del equipo; `--json` para consumirlo. |
| `ops integration list <ops-root>` | Lista proveedores registrados. |
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

Atajos para desarrollar este toolkit:

```bash
make ci
make test
make coverage
make automation-check
make integration-check
make agent-learn AGENT=product-manager
make agent-propose AGENT=product-manager
make agent-evaluate AGENT=product-manager
make team-check TEAM=product-development
make team-show TEAM=product-development
```

También puedes usar el CLI mediante npm:

```bash
npm run ops -- evaluate product-manager
```

Los comandos resuelven agentes por slug sin exigir su tipo. Los cargos que trae Cauce viven en
`agents/roles/system/`; un cargo propio del proyecto va en `agents/roles/` y, con el mismo slug,
reemplaza al del sistema. Por ejemplo:

```bash
for skill in agents/roles/*/SKILL.md agents/roles/system/*/SKILL.md; do
  basename "$(dirname "$skill")"
done | sort -u
```

Un slug debe ser único entre todas las categorías. Si dos tipos contienen el mismo slug, el CLI falla por
ambigüedad en lugar de elegir uno silenciosamente.

`make ci` valida planning, automatización e integración Jira y después ejecuta pruebas con cobertura. Los
umbrales mínimos son 75% de líneas, 75% de funciones y 45% de ramas; consulta [test/README.md](test/README.md).

## Adaptación por proyecto

Después de inicializar:

1. Edita `ops.config.json`: nombre, modo y raíces de código.
2. Completa `AGENTS.md`: límites de autonomía e integraciones reales.
3. Completa `organization/company.md` y `organization/product.md` con el contexto estable de la empresa.
4. Copia `planning/roadmap/epic-000-template.md` a `epic-001-<slug>.md`.
5. Ejecuta `node tools/ops.js check planning` antes de activar cualquier runner.

`organization/` describe el negocio; `planning/` describe intención y estado; los repos de código siguen
siendo dueños de sus comandos, convenciones y commits.

### La frontera `system/`

Cada colección adaptable separa lo que actualiza el toolkit de lo que escribe el proyecto:

| Directorio | `system/` | Junto a `system/` |
|---|---|---|
| `planning/business-rules/` | `BR-OPS-NNN` | las reglas de la empresa |
| `planning/adr/` | `OPS-NNN` | las decisiones de la empresa |
| `planning/rules/` | proceso, forma del cambio, commits | las convenciones propias |
| `teams/` | composiciones que vienen con Cauce | los equipos propios |
| `agents/<tipo>/` | *(en el paquete, no se copia)* | los cargos propios |

`automatization/hooks/` no tiene `system/`: es runtime que se reemplaza entero. No hace falta, porque lo
que un proyecto necesita ya funciona sin editarlo — un guard propio convive y sobrevive, y desactivar uno
del toolkit es quitarlo de la configuración del runner, que es del proyecto. Editar uno existente detiene
el `upgrade` antes de pisarlo. Los hooks se quedan en el proyecto porque esa configuración los nombra por
ruta literal; los adaptadores de runner y los workflows, que sólo lee el motor, viajan en el paquete.

Un archivo propio con el mismo nombre o ID que uno de `system/` lo reemplaza: el del proyecto manda y
`check` lo reporta como override explícito. Así una mejora del proceso no obliga a forkear el archivo,
y actualizar no exige resolver conflictos: se reemplaza `system/` entero y nada más se toca.

### Dónde vive cada cosa del catálogo

Los cargos que trae Cauce **no se copian al proyecto**: se resuelven desde la dependencia. Evolucionan
como profesión, y esa evolución es la misma para
todas las empresas: investigarla una vez y bien es mejor que repetirla en cada instalación.

| Qué | Dónde | Quién lo mantiene |
|---|---|---|
| El cargo como profesión | el paquete | el toolkit, con `agent-learn` en **este** repositorio |
| Lo que el cargo debe saber de tu empresa | `organization/roles/<slug>.md` | la empresa |
| Un cargo propio, o una versión propia de uno del catálogo | `agents/roles/<slug>/` | la empresa |

Por eso `learn` falla si lo corrés sobre un cargo del catálogo dentro de una instancia: escribiría en
el paquete y se perdería. El ciclo mensual de aprendizaje tampoco se distribuye — vive sólo acá.

#### Quedarse con una versión propia de un cargo del catálogo

```bash
npm run ops -- agents fork product-manager
```

Copia el cargo entero a `agents/roles/<slug>/` y desde ahí lo mantenés vos: `learn`, `evaluate` y el
puntero que instala el runner pasan a resolver contra tu copia. **Copiarlo a mano no es equivalente**
—se agarra el `SKILL.md`, que es lo que se ve, y quedan atrás los casos, las fuentes y el modelo
operativo: el cargo responde igual y ya no se puede evaluar—.

Lo que no viaja son los informes de aprendizaje, las propuestas y los veredictos de evaluación. Un
veredicto pertenece al contrato que lo ganó, y el fork nace para dejar de ser ese contrato.

A partir de ahí tu copia deja de recibir las mejoras del catálogo, que es lo que elegiste, pero no en
silencio: `check` y `upgrade` avisan cuando el original cambia río arriba. Editar tu propia copia no
dispara nada — se compara contra lo que el catálogo tenía el día del fork, no contra lo que vos
escribiste después.

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

## Arquitectura del toolkit

- `engine/`: código determinista del CLI, planning, integraciones y aprendizaje de agentes.
- `automatization/`: contratos, workflows y wiring neutral de runners.
- `integrations/`: documentación del contrato para herramientas externas.
- `template/`: estructura materializada dentro de cada proyecto.
- `agents/`: catálogo fuente de agentes, organizado por tipo.
  - `agents/roles/`: cargos empresariales persistentes y sus evaluaciones.
  - `agents/workflows/`: futuros agentes orientados a una tarea o flujo concreto.
  La taxonomía es extensible: cualquier directorio bajo `agents/` es un tipo válido y se reconoce
  cuando tiene contenido, sin registrarlo en ningún lado. `agents/roles/` es el único que viene con
  cargos; un coordinador que enrute agentes o un especialista acotado sólo necesitan su directorio
  el día que existan.
- `teams/`: composiciones de agentes, con orden, handoffs y responsabilidades compartidas.
- `teams/product-development/`: primera composición end-to-end desde discovery hasta aprendizaje posterior al release.

El toolkit no guarda contexto real de ninguna empresa. `template/organization/` es el molde que cada proyecto
recibe como `organization/`. De igual forma, `planning/` pertenece a la instancia generada: conserva su
intención, estado y evidencia, mientras el motor reusable permanece en la dependencia.

## Hooks y runners

Los once guards portables viven en `automatization/hooks/` y comparten el motor
`engine/hooks/run.js`. Los runners los invocan por grupo —`guard-shell.sh` y `guard-files.sh`— para gastar
un solo proceso por herramienta; cada guard sigue siendo invocable suelto por su propio wrapper. Una
instancia nueva los recibe sin activar ningún runner silenciosamente:

```bash
node tools/ops.js automation check .
node tools/ops.js automation install . antigravity   # recomendado para Google
node tools/ops.js automation install . codex         # o claude / gemini
```

Atajos equivalentes disponibles en cada proyecto generado:

```bash
make install-claude
make install-codex
make install-gemini
make install-antigravity
```

Después de instalar, diagnostica el wiring real con `make doctor-claude`, `make doctor-codex`,
`make doctor-gemini` o `make doctor-antigravity`.

La instalación fusiona la configuración propia del runner y conserva las entradas existentes, con una
sola excepción: reemplaza los guards que el propio toolkit había registrado sueltos por el grupo que
ahora los cubre, y lista cuáles quitó. Sin esa poda un proyecto ya instalado ejecutaría cada guard dos
veces por herramienta —con `verify` eso significa correr la suite de tests dos veces en cada commit—.
Nada que no haya escrito el toolkit se toca. En Antigravity materializa un plugin nativo de workspace
bajo `.agents/plugins/cauce/`.
