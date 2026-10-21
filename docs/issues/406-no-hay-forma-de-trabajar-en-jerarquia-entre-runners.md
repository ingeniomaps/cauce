---
caso: 406
titulo: no hay forma de trabajar en jerarquía (coordinador, líderes, programadores en otro runner)
estado: resuelto
resuelto-en: 0.112.0
prioridad: baja
version-detectada: 0.111.0
---

# 406 — Cauce reparte el trabajo en subagentes de un solo runner: no hay un nivel intermedio ni un traspaso de tareas a otro runner

**🟢 resuelto en 0.112.0** · detectado en 0.111.0 · prioridad **baja**. Es una mejora pedida por una instancia y **pide una
decisión de producto antes de construir**: cambia cuántas sesiones corren a la vez y quién responde por una entrega.
Salió del caso 404, que traía las dos piezas juntas.

## Resumen

Una instancia quiere trabajar en cuatro niveles:

- una persona que decide los cortes;
- una sesión coordinadora que reparte;
- sesiones líderes y revisoras (Claude) que escriben la aceptación y juzgan la entrega;
- sesiones programadoras en otro runner (Antigravity, `agy`) que construyen.

Hoy el recorrido `autobuild` delega en subagentes del runner que lo corre, sin un nivel intermedio ni un traspaso a
otro runner.

## Reproducción

```
$ grep -n "runner" automatization/workflows/autobuild.js | head -1
1:// Implementación portable de planning/PROTOCOL.md para runners compatibles con workflows de Claude.
$ grep -n "RUNNER_NAMES" engine/automation/runners.js
14:const RUNNER_NAMES = ['claude', 'codex', 'gemini', 'antigravity']
```

Los cuatro runners se instalan por separado y cada uno corre sus propios recorridos. Ninguno le pasa una tarea a otro.

## Causa raíz

- **Traspaso entre runners**: `automatization/workflows/autobuild.js:1` se declara para runners con workflows de
  Claude. Los agentes que lanza son de ese runner: `clerk` (`:666`) y `read` (`:758`). El runner `antigravity`
  existe (`automatization/runners/antigravity/README.md`) y trae sus guards por el puente (`engine/hooks/input.js:7`),
  pero corre sus propios recorridos y no recibe tareas de otra sesión.
- **Nivel intermedio**: el recorrido tiene dos niveles, la sesión y sus subagentes. No hay un líder que reciba un
  hito, reparta tareas y responda por ellas ante el coordinador.

## Fix propuesto

Es una propuesta, a decidir antes de construir:

- **Coordinador**: corre el recorrido, promueve según la autorización declarada y reparte por línea.
- **Líder por línea**: sesión Claude que recibe un hito, escribe las aceptaciones con su mutación (R9) y lanza al
  programador.
- **Programador**: sesión `agy` en el árbol de la línea, que recibe la tarea por archivo (el `WIP` o un sobre por
  tarea) y devuelve los commits más su bitácora.
- **Revisores**: sesiones Claude que juzgan el artefacto y la mutación en una copia, no el informe del programador.
- El traspaso es por archivos de planning, que ya son el contrato entre fases, más un estado por tarea que el
  coordinador lee sin abrir el trabajo: asignada, construida, rechazada (con hallazgos), aceptada. Ese estado se
  escribe como contenido, no como presencia de un archivo (R28).
- Lo que viaja entre niveles es sólo lo que el siguiente necesita para decidir (`system/runs.md` → R16).

La aceptación pide la mutación: con el traspaso al runner programador quitado, la tarea queda asignada sin bitácora y
el coordinador la da por construida.

## Tradeoffs

- El control entre runners multiplica sesiones. Sin un tope de líneas en paralelo y sin el lock de máquina de la
  instancia, pasa lo de R26: varias suites a la vez y la máquina se cae.
- Un runner que no corre workflows no tiene cómo devolver un resultado tipado: el traspaso por archivos tiene que
  bastar solo, y eso no está probado.
- Depende de dónde abre `agy` su sesión y desde qué carpeta carga Cauce (392, 393).

## Contexto de descubrimiento

Pedido de la persona que decide en una instancia real, el 2026-10-19: quiere trabajar como CTO o CEO, con una sesión
coordinadora sobre líderes Claude y programadores Antigravity.

## Relacionados

- 404 — los índices de código, la otra mitad del mismo pedido; rinden solos y conviene que vayan primero.
- 392 y 393 — cómo `agy` encuentra el plugin y desde qué carpeta carga Cauce.
- 198 — el puente de Antigravity que comparte la lectura de los guards.

## Experimento del 2026-10-20

Sin código nuevo, con lo que hay desde 0.111.0, en un banco instalado fuera del árbol (`ops bench sidecar` copiado al
scratchpad, con el motor congelado, `automation install . claude` y `. antigravity`, la línea `web` sobre un frontend sintético
y su Mapa real escrito). Una corrida de cada rol, una por vez. Lo que se escribió antes de correr como lo que refuta cada
hipótesis va con cada una.

- **Líder (Claude, `claude -p`, USD 0,60).** Escribió la aceptación de la tarea en el backlog, concreta y con la mutación
  nombrada, sin tocar el producto; `check` sale 0.
- **H2, los guards en el programador.** Una sesión `agy` 1.4.2 en `lines/web/app` con `--add-dir <workspace>`, en modo por
  defecto: `git add -A` frena con «`tool call denied by pre-tool hook: Cauce: 'git add -A/--all/.' está prohibido`».
  **Confirmada para el shell, refutada para los archivos**: ver el caso 410.
- **H1, el programador sigue el protocolo (`agy -p`).** El pedido sólo nombró los comandos (`ops context`, `ops claim --line
  web`), el WIP y la convención de traspaso, que hoy no está escrita en ningún lado: «dejá en tu WIP phase: Review y no la
  cierres». Lo que quedó en disco: el reclamo; el WIP con la aceptación textual, `lane: directo`, tres pasos tachados (prueba
  en rojo, arreglo, mutación) y `phase: Review`; un commit en `line/web` con los cuatro componentes y la prueba nueva; `done/` y
  el backlog sin tocar; `npm test` 2/2. **Confirmada**, con dos salvedades: escribió en el producto sin que `plan-first` lo
  frenara, porque el puente no ve sus herramientas de escritura (410), y su plan quedó bajo un id que el guard no busca (411).
- **H3, el revisor decide con archivos (Claude, `claude -p`, USD 0,71).** Leyó la aceptación, el WIP y el diff, corrió la
  mutación en una copia temporal, aprobó, escribió una entrada de `done/` completa —`qa` con la mutación y su salida, `review`
  sobre el diff y la mutación— y sacó la tarea del backlog; `check` 0. La mutación, repetida aparte en otra copia: roja,
  «Literal #1e90ff encontrado fuera de src/styles/_variables.scss: src/components/Button.jsx». **Confirmada.**

**Lo que el experimento encontró que falta**, además de 410 y 411:

- **Nadie suelta el reclamo.** Es del id del programador, y en un traspaso nadie tiene dicho a quién le toca: `check` quedó con
  «`claims/unificar-color-primario.md: unificar-color-primario ya está en DONE; soltala con ops release`».
- **La convención de traspaso no está escrita.** `phase: Review` funcionó porque se la pidió el pedido. Es contenido y no
  presencia (R28), y alcanza como estado; lo que falta es que el protocolo la nombre, diga qué hace cada rol con ella y quién
  suelta el reclamo.

**Lo que deja para decidir.** La jerarquía funciona con lo que hay, sin estado nuevo ni motor nuevo: los archivos de planning
alcanzaron como traspaso, y cada rol hizo lo suyo con ellos. Lo que la frena son dos defectos y una convención:

1. **410** — en Antigravity no corre ningún guard de archivos. Es lo primero: sin eso, el programador es el único rol sin
   gobernanza, y es el que escribe el producto.
2. **411** — el id de la línea depende de desde dónde se corra `ops`.
3. Escribir en el protocolo el traspaso por `phase: Review`: qué hace el programador, qué hace el revisor y quién suelta el
   reclamo. Es un caso chico, y conviene abrirlo cuando 410 y 411 estén cerrados, para medirlo con la jerarquía entera.

El caso sigue abierto hasta esa decisión.

**Actualización, el mismo día:** 410 y 411 quedaron resueltos en 0.112.0, y el punto 3 salió como el caso 412.

## Matriz de roles por runner, 2026-10-20

¿Puede cualquier runner tomar cualquier rol? Primera pasada, en un banco instalado fuera del árbol, con los cuatro runners
instalados (Claude 2.1.304, agy 1.4.3, Gemini 0.63.0, Codex 0.162.1 con `gpt-6-luna`), la línea `web` y una tarea sin
aceptación. Cada rol corre con un pedido mínimo que sólo nombra el rol, y con `CI=1`, para que el pedido no tenga la autoridad
de la persona (ver abajo). El resultado se leyó en disco y en el registro de cada sesión, no en su informe. El evaluador
automático dio cuatro falsos negativos —una mutación pensada para una implementación que el programador no eligió, un hito
que el revisor borró al vaciarse y una aceptación que nombra su mutación sin la palabra «mutación»— que se descontaron leyendo
los registros.

**Guards por runner** (sonda: stagear todo en el árbol de la línea y editar el producto sin plan): los cuatro frenan las dos
cosas, después del arreglo del caso 414. Antes, stagear todo pasaba en Claude, agy y Codex.

| Runner | Líder | Programador | Revisor |
|---|---|---|---|
| Claude | ✓ (406, 412) | no corrido en la matriz: es el `autobuild` de siempre | ✓ (406, 412) |
| agy | ✓ | ✓ (solo agy, y en 406 y 412) | ✓ (solo agy: juzgó con sus propias mutaciones en rojo y cerró entero) |
| Codex | ✓ (dos veces) | **construyó y no pudo commitear**: su sandbox deja `.git/worktrees/app` de sólo lectura; lo dejó como bloqueo en el WIP | ✓ en solo Codex (no aprobó: el WIP seguía en Build y sin commit, que es lo correcto); ✗ en Codex con agy (afirmó que `ops/planning` no existía, y existe) |
| Gemini | ✓ | **no arrancó**: la red falló («fetch failed») y su política negó la terminal; `--allowed-tools` está deprecado y no surte efecto | sin dato: no hubo nada que revisar |

La combinación Codex líder, agy programador y Codex revisor no llegó a probar nada: agy se cortó por el tiempo límite (15 min)
con el plan escrito y sin construir, y el revisor no tenía qué juzgar.

**Lo que el traspaso por archivos aguanta**: en todas las corridas que llegaron a construir, el programador terminó en
`phase: Review` sin cerrar, y el revisor cerró o se negó a cerrar según lo que había en disco. Ningún rol necesitó saber qué
runner era el otro.

**Lo que falta para completar la matriz**, todo de entorno y no de Cauce:

1. Codex como programador, con una configuración de sandbox que deje escribir el `.git` del worktree. Qué opción lo permite está
   por comprobar en la documentación de Codex.
2. Gemini como programador, con su motor de políticas permitiendo la terminal y sin cortes de red.
3. Repetir Codex con agy, con más tiempo para el programador.

**Lo que la matriz encontró en Cauce**:

- 414 — los guards de commit no juzgaban el árbol de una línea. Resuelto.
- 413 — agy lee credenciales con su herramienta de lectura sin pasar por ningún guard. Abierto.
- **Un pedido lanzado con `-p` tiene la autoridad de la persona** en Claude, Codex y Gemini: `said` (`engine/hooks/chat.js:272-281`)
  da por dicho por la persona cualquier mensaje de la sesión que no sea un comando de flujo, y eso apaga `plan-first` para toda
  la sesión. Sin `CI=1`, la primera sonda dejó a Claude editar el producto sin plan. Para la jerarquía importa: un coordinador
  que lanza a un programador con un pedido en texto libre lo deja sin ese guard, y con `/autobuild <línea>` no. En agy no pasa
  porque no tiene hook de chat. Queda para un caso propio, con una salida que sólo quite permisos: una variable que el
  coordinador exporte al lanzar un rol y que `said` lea como «este pedido no es de una persona».

### Segunda pasada, el mismo día: la matriz completa

Las tres combinaciones que la primera no pudo probar, con el entorno corregido y 30 minutos por rol. Cada banco se guardó para
leerlo después. Las configuraciones son de cada runner, no de Cauce:

- **Codex** con `-s danger-full-access`, sólo en el banco desechable. Con `workspace-write` su sandbox deja de sólo lectura el
  `.git` del worktree, y agregarlo a `sandbox_workspace_write.writable_roots` no alcanza: una sonda dejó el archivo sin stagear.
  Con acceso total lo stagea. Eso apaga el sandbox de Codex: lo que lo contiene son los guards de Cauce, que siguen corriendo.
- **Gemini** con una regla temporal en `~/.gemini/policies/` que deja usar la terminal (`toolName = "run_shell_command"`,
  `decision = "allow"`), creada para la corrida y borrada al terminar. La documentación de Gemini dice que la carpeta del
  workspace «currently non-functional», y que en modo sin interfaz lo que pediría confirmación cuenta como `deny`. Aun así el
  programador recibió diez «denied by policy» y ocho cortes de red, y terminó igual.

| Runner | Líder | Programador | Revisor |
|---|---|---|---|
| Claude | ✓ | `autobuild` de siempre | ✓ |
| agy | ✓ | ✓ (tres veces: solo agy, Codex con agy, 406/412) | ✓ |
| Codex | ✓ (tres veces) | ✓ con acceso total: `phase: Review`, un commit, `npm test` verde | ✓ dos veces, **rechazando con hallazgos reales** |
| Gemini | ✓ (dos veces) | ✓ en la segunda: `phase: Review`, un commit, `npm test` verde | ✓: cerró entero y soltó el reclamo |

Los dos rechazos de Codex son lo más valioso de la matriz. En solo Codex: «la prueba no comprueba que cambiar `$primary`
actualice el color», mostrado con su propia mutación (`$primary` a `#663399`: la prueba quedó verde). En Codex con agy: la
prueba pasa porque arma el módulo SCSS con un hook propio, y la aplicación no puede importarlo (lo reprodujo:
`ERR_UNKNOWN_FILE_EXTENSION`). En los dos anotó el hallazgo en `## Bloqueos` y devolvió la tarea a `Build`, que es la otra
salida del traspaso del 412. En la segunda además intentó soltar el reclamo, y `release` se lo negó, que es lo correcto: la
tarea sigue en curso. `teamwork.md` ahora lo dice («sin soltar el reclamo»).

Las mutaciones que el evaluador automático no pudo aplicar —cada programador resolvió el color a su manera: `var(--primary)`,
el valor leído de `_variables.scss`, `getPrimaryColor()`— se corrieron a mano contra cada implementación, en una copia: rojas.

**Conclusión.** Cualquiera de los cuatro runners que Cauce soporta puede tomar cualquiera de los tres roles, con los guards de
Cauce corriendo y el traspaso por archivos, con dos condiciones que son del entorno:

1. Codex necesita acceso total para commitear en el árbol de una línea, o que el commit lo haga otro rol.
2. Gemini necesita que la persona le permita la terminal en su política de usuario.

Y una que es de Cauce y queda en el caso 415: el rol lanzado con un pedido en texto libre tiene que lanzarse sin la autoridad
de la persona. En la matriz se hizo con `CI=1`.

## Cierre

**Resuelto en 0.112.0, sin un motor de coordinación nuevo.** La jerarquía que el caso pedía se arma con lo que hay: líneas de
trabajo (394), el traspaso por el WIP con `phase: Review` (412), `CAUCE_DELEGATED=1` para los roles que lanza otro agente
(415), y los guards corriendo en los cuatro runners también en los árboles de las líneas (410, 411, 413, 414).
`template/planning/delivery/teamwork.md` lo cuenta en «Una sesión construye y otra revisa», y su tabla «Qué runner puede tomar
qué rol» dice qué necesita cada runner.

El enunciado, ítem por ítem:

- **Coordinador** (corre el recorrido, promueve, reparte por línea): se hizo distinto. No hay un proceso coordinador: lo es
  la persona, o la sesión principal, que promueve hitos y los reparte con `line:`. Lo que el caso pedía de él —leer el
  estado sin abrir el trabajo— ya lo dan `ops lines` y `ops context --line`.
- **Líder por línea**: cualquier runner, no sólo Claude. Medido en la matriz: los cuatro escribieron aceptaciones con su
  mutación y `check` en verde.
- **Programador**: cualquier runner, no sólo `agy`. Los cuatro construyeron en el árbol de la línea y dejaron
  `phase: Review`, con las condiciones de la tabla para Codex y Gemini.
- **Revisores**: cualquier runner. Juzgaron con lo que había en disco: cerraron entero o rechazaron con hallazgos reales
  (los dos de Codex, arriba).
- **El estado por tarea —asignada, construida, rechazada, aceptada—, escrito como contenido (R28)**: se hizo con lo que ya
  existía, sin un estado nuevo. Asignada es el reclamo; construida, el WIP en `phase: Review`; rechazada, el WIP de vuelta
  en `phase: Build` con `## Bloqueos`; aceptada, la entrada en `done/`. Todo es contenido de un archivo.
- **Lo que viaja entre niveles (R16)**: cada rol lee la aceptación, el WIP y el diff; ninguno lee el informe del anterior.
  En la matriz los revisores no recibieron nada más que el nombre de su rol.
- **La mutación del caso** («con el traspaso quitado, la tarea queda asignada sin bitácora y el coordinador la da por
  construida»): no hay un traspaso que quitar, porque no se construyó un coordinador. Las mutaciones que sostienen lo que sí
  se construyó están en los cierres de 410–415, y la de cada aceptación se corrió a mano contra cada implementación de la
  matriz.
- **Tradeoff, sesiones en paralelo y R26**: el lock de máquina ya existe (`engine/hooks/machine-lock.js`, caso 240: un gate
  por vez en la máquina). Dentro de una línea los roles no corren a la vez sobre la misma tarea (412). No se midió cuántas
  líneas en paralelo aguanta una máquina: la matriz corrió los roles de a uno.
- **Tradeoff, un runner sin workflows no devuelve un resultado tipado**: se probó que el traspaso por archivos alcanza. Los
  roles en `agy`, Codex y Gemini no devolvieron nada tipado, y lo que se leyó para decidir fue el disco.
- **Tradeoff, dónde abre `agy` su sesión (392, 393)**: resueltos antes de este caso; en la matriz `agy` corrió en la carpeta de
  sesión y en el árbol de la línea con `--add-dir`.

**Lo que se corrió para saber que funciona**: el experimento y las dos pasadas de la matriz de arriba, con sesiones reales de
Claude 2.1.304, agy 1.4.3, Gemini 0.63.0 y Codex 0.162.1 (`gpt-6-luna`), leídas en disco y en el registro de cada sesión; las
sondas de guards en los cuatro; y las pruebas reales de cada caso que salió de acá (410–415), cada una lado a lado con el
motor de `main`.

**Lo que agregó la prueba real del conjunto**, el 2026-10-20, con Gemini 0.63.0 sobre una instancia instalada desde el
tarball: una sesión `gemini -p --skip-trust` corrió dos escrituras de `app/.npmrc` que el guard frena, y las dos se hicieron,
con el shim de `pre-shell` sin una sola llamada. La misma sonda con `GEMINI_CLI_TRUST_WORKSPACE=true` llamó al hook cuatro veces
y recibió las dos negativas («Tool execution blocked: BLOQUEADO: …/app/.npmrc es un archivo de credenciales…»). Sin confiar
en la carpeta, Gemini no carga la configuración del proyecto, que es donde están los hooks. La fila de Gemini en la tabla de
`teamwork.md` lo dice ahora: es configuración del runner, como su política de terminal.
