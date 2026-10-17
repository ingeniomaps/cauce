---
caso: 393
titulo: Antigravity no carga Cauce en una sesión abierta en una subcarpeta del workspace o en un repo de producto
estado: resuelto
resuelto-en: 0.110.0
prioridad: media
version-detectada: 0.109.0
---

# 393 — Una sesión de `agy` abierta en una subcarpeta del workspace sin git, o en un repo de producto con git propio, no ve el plugin de Cauce de la carpeta de la empresa: corre sin guards, sin reglas y sin cargos, y nada lo avisa

**🟢 resuelto en 0.110.0** · detectado en 0.109.0 · prioridad **media**. En una sesión así no hay ningún guard, y nada avisa de que
falten. Antes de 0.109.0 la copia global tapaba el hueco, aunque de la forma equivocada (caso 392). Sacarla lo dejó a
la vista. Sube a alta si una instancia sidecar declara repos de producto con git propio y se trabaja abriendo `agy`
dentro de ellos.

## Resumen

`automation install . antigravity` deja el plugin en `<workspace>/.agents/plugins/cauce/`. `agy` 1.4.0 lo descubre
sólo desde la carpeta donde se abre **hasta la raíz del repo git**. De ahí salen dos huecos:

1. **Subcarpeta de un workspace sin git.** No hay raíz de repo, y `agy` mira sólo la carpeta actual. Una sesión en
   `<workspace>/catalogo/` no carga Cauce.
2. **Repo de producto con git propio**, que es la forma normal de una instancia sidecar. La raíz del repo es el
   producto, así que `agy` no sube hasta la carpeta de la empresa. Ahí no corren guards, reglas ni cargos.

Hay un tercer hueco que aparece al resolver los dos primeros: las reglas y las skills del plugin nombran la
instancia con rutas relativas a la carpeta de la empresa (`acme-ops/AGENTS.md`). Desde un repo de producto esas rutas
no existen.

## Reproducción

Con `agy` 1.4.0, el 2026-10-17. Hay un plugin sonda en `empresa/.agents/plugins/sonda/`, cuyo hook sólo guarda el
payload y deja pasar, y se le pide a `agy -p` que corra `echo hola`:

```text
empresa/
├── .agents/plugins/sonda/        el plugin, como lo deja install
├── carpeta/                      subcarpeta sin git
├── prod-a/   (git)               con .agents/plugins.json → {"entries":[{"path":"../.agents/plugins"}]}
└── prod-b/   (git)               sin nada
```

| Dónde se abre `agy` | ¿Corre la sonda? | `workspacePaths` |
|---|---|---|
| raíz de un proyecto sin git | sí | |
| subcarpeta de un proyecto sin git | **no** | |
| raíz de un proyecto con git | sí | |
| subcarpeta de un proyecto con git | sí | |
| `prod-b` (git, nada) | **no** | |
| `prod-a` (git, `plugins.json` apuntando a `../.agents/plugins`) | sí | `[empresa/prod-a]` |
| `prod-b --add-dir empresa` | sí | `[empresa, empresa/prod-b]` |
| `carpeta --add-dir empresa` | sí | `[empresa, empresa/carpeta]` |

Con Cauce real, en una instancia sidecar con su workspace sin git y con 0.109.0 instalado, se pidió correr
`git add --all` sobre un repo desechable creado dentro del workspace:

- Sesión abierta en el workspace: frenada con «`'git add -A/--all/.' está prohibido`».
- Sesión abierta en `<workspace>/catalogo/`: corrió y stageó.
- El puente instalado, alimentado a mano con `workspacePaths: ["<workspace>/catalogo"]`, sí frena. El hueco no está en
  el puente, que nunca llega a correr.

## Causa raíz

- **El descubrimiento de `agy`.** Su skill `agy-customizations` (`SKILL.md`, «Discovery Locations») dice: «The agent
  walks from your current working directory up to the repository root (e.g., the folder containing `.git`)». Sin
  `.git`, lo medido es que mira sólo la carpeta actual.
- **El README del adaptador lo describe de forma imprecisa.** `automatization/runners/antigravity/README.md:12` dice
  «buscando desde la carpeta donde se abre hasta la raíz del proyecto». La raíz es la del repo git, no la del
  proyecto Cauce, y sin git no hay búsqueda hacia arriba.
- **Las reglas y las skills usan `{{OPS_DIR}}`**, una ruta relativa a la carpeta de la empresa:
  `automatization/runners/antigravity/rules/cauce.md:3` y las skills de `automatization/shared/skills/`, con 13
  usos. Es correcto mientras la sesión se abra en esa carpeta, y deja de serlo en cuanto se abre en otra.
- **`install` ya avisa a qué carpeta hay que abrir la sesión**, pero sólo para los recorridos y los cargos
  (`engine/automation/index.js:443`, «los encuentra por nombre una sesión abierta en …»). Para los guards no avisa
  nada, y abrir la sesión en otra carpeta no da error: simplemente no hay Cauce.

## Fix propuesto

Hay tres caminos, que no se excluyen. El orden y el alcance son una decisión: ver «Plan de resolución».

- **A. Documentar y avisar**: dónde se abre la sesión (la carpeta de la empresa) y `agy --add-dir <empresa>` para
  trabajar desde un repo de producto. Corregir la línea 12 del README y decirlo también al terminar `install`.
- **B. Que `install` deje un puntero en cada repo de producto**: un `.agents/plugins.json` con la ruta relativa al
  plugin de la empresa, en cada `workspaceRoots` que sea un repo git. Es la forma que `agy` documenta para compartir
  customizaciones, y lo medido muestra que alcanza. Implica escribir en repos que no son de la instancia.
- **C. Rutas absolutas en las reglas y las skills de Antigravity** (`{{OPS_ROOT}}` en lugar de `{{OPS_DIR}}`), para
  que digan lo mismo desde cualquier carpeta que cargue el plugin. Es lo que ya hacen los recorridos desde 0.89.0
  (caso 139). Sin C, las salidas A y B cargan reglas que apuntan a archivos que no existen.

## Tradeoffs

- **B escribe en repos de producto**, que tienen otro dueño y otro equipo. El puntero queda como un archivo nuevo en
  su árbol, y para cualquiera que clone el repo fuera de la carpeta de la empresa apunta a nada. Por eso pide
  decisión, y probablemente sea opt-in.
- **C ata las reglas a la ruta de la máquina.** Mover el proyecto rompe el plugin hasta reinstalar, el mismo costo que
  ya paga el puente (`runners.js`, comentario de `{{OPS_ROOT}}`). Además pone una ruta absoluta en un archivo que,
  si se commitea, viaja.
- **A no cierra nada solo**: depende de que la persona lea el aviso. Pero no escribe fuera de la instancia y vale
  para cualquier layout.
- No está medido si Claude Code, Codex y Gemini tienen el mismo hueco en una subcarpeta o en un repo de producto. Si
  lo tienen, A es transversal y no un parche de un solo runner.

## Contexto de descubrimiento

Al validar 0.109.0 en una instancia real con Antigravity, después de cerrar el caso 392, quitar la copia global y
reinstalar el adaptador. La sesión en el workspace frenó como debía, y la sesión en una subcarpeta del mismo
workspace corrió sin Cauce.

## Relacionados

- [392](./392-antigravity-corre-cauce-en-toda-carpeta-por-el-registro-global.md): quitar la copia global dejó a la
  vista este hueco, que la copia tapaba.
- [139](./139-el-recorrido-dicta-un-comando-de-claim-que-falla-desde-donde-corre.md): la misma decisión
  entre `{{OPS_DIR}}` y `{{OPS_ROOT}}`, ya tomada para los recorridos.

## Cierre

**Resuelto en 0.110.0.** `install` dice en qué carpeta tiene que abrirse la sesión para que corran los guards, y en
Antigravity da la salida para trabajar desde un repo de producto o una subcarpeta: `agy --add-dir <workspace>`. No se
escribe nada en los repos de producto, y las reglas siguen con rutas relativas, porque con `--add-dir` alcanzan.

**Lo que se corrió para saber que funciona.**

- `test/wiring/session-folder.test.js`, con el CLI real:
  - en sidecar, `install` de los cuatro runners avisa con la ruta del workspace, y sólo el de Antigravity trae
    `agy --add-dir <workspace>`;
  - embebido en la raíz de un repo git, no avisa.
- Cuatro mutaciones en una copia del árbol, las cuatro en rojo: sin el aviso, el aviso siempre, sin el flag, y el
  flag para todos los runners.
- La salida real de `install` en un banco sidecar: `antigravity: los guards corren en una sesión abierta en
  <workspace>, no en una subcarpeta sin git ni en un repo de producto con git propio; desde ahí abrila con agy
  --add-dir <workspace>`.
- **Sesiones reales de `agy` 1.4.0** en la instancia donde se encontró, con 0.109.0 instalado, el 2026-10-17. Se pidió
  correr `git add --all` sobre repos desechables creados dentro del workspace y borrados después:

  | Dónde se abre `agy` | Resultado |
  |---|---|
  | una subcarpeta sin git, con `--add-dir <workspace>` | frenado: «`'git add -A/--all/.' está prohibido`» |
  | un repo de producto con git propio, con `--add-dir <workspace>` | frenado igual |

  En esa misma sesión del repo de producto se le pidió abrir el `AGENTS.md` que nombran las reglas, y lo abrió por
  su ruta absoluta dentro del workspace. La regla dice `acme-ops/AGENTS.md`, y el agente la resolvió contra la
  carpeta agregada.

**Recorrido de lo que el caso enumeraba.**

- **A, documentar y avisar — se hizo.** El README del adaptador corrige la línea que decía «hasta la raíz del
  proyecto» y explica `--add-dir`. El README general dice dónde se abre la sesión. `install` lo avisa en todo runner
  con hooks nativos, salvo cuando la instalación es la raíz de un repo git, donde toda subcarpeta queda adentro y no
  hay repos de producto aparte. El flag sale de `addDir` en el manifiesto, que hoy sólo declara Antigravity.
- **B, puntero en cada repo de producto — se decidió que no.** Funciona (lo midió la sonda), pero escribe en repos
  con otro dueño, y para quien los clone fuera de la carpeta de la empresa apunta a nada. `--add-dir` resuelve lo
  mismo sin tocarlos. Lo decidió el dueño al aprobar el plan.
- **C, rutas absolutas en las reglas y las skills — se decidió que no hacía falta.** Era necesario para B. Con
  `--add-dir`, el agente resolvió la ruta relativa contra la carpeta agregada, como muestra la sesión de arriba.
- **«No está medido si Claude Code, Codex y Gemini tienen el mismo hueco» — se midió.** Con un hook sonda por
  runner: Claude Code y Gemini corren el hook en la raíz del workspace y no en la subcarpeta ni en el repo de
  producto. Codex no se pudo medir, porque la cuenta llegó a su límite de uso; su documentación
  (learn.chatgpt.com, «config-advanced») dice que busca hasta la raíz con `.git`. Por eso el aviso es para todos los
  runners y no un parche de Antigravity.
- **El escalamiento de la prioridad** —«sube a alta si se trabaja abriendo `agy` dentro de repos de producto»— queda
  cubierto: ese caso ahora tiene salida y aviso.

**Lo que el caso no preveía.** En Claude Code y en Gemini, los flags que suman carpetas (`--add-dir` e
`--include-directories`) no cargan los hooks de la carpeta agregada: medido con la misma sonda, desde el repo de
producto el hook no corrió. Para ellos la única salida es abrir la sesión en el workspace, y así lo dice el aviso.

