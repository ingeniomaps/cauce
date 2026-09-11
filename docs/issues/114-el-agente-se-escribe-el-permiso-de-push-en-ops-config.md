---
caso: 114
titulo: Las dos llaves que deciden un push viven en un archivo que el agente puede escribir
estado: abierto
prioridad: media
version-detectada: 0.82.0
---

# 114 — `ops.config.json` no tiene guard, así que el permiso de push vale mientras el agente decida no tocarlo

**🔴 abierto** · detectado en 0.82.0 · prioridad **media** — el push es lo único de los seis actos de R10 que
el motor comprueba, y lo comprueba contra un archivo que el agente escribe sin que nada se lo diga

## Resumen

Desde 0.82.0 un push se publica si lo autoriza una de estas cosas: `runner.allowPush`,
`runner.pushToLiveBranches`, una línea `push <remoto> <rama>` en `planning/.ops-approval`, o una orden de la
persona en el chat. De las cuatro, tres están fuera del alcance del agente —el registro del chat lo escribe
el runner, y `.ops-approval` tiene un guard propio que le impide escribírselo—. **Las dos primeras viven en
`ops.config.json`, que ningún guard mira.**

O sea que el bloqueo que le dice al agente «esto lo decide una persona» se levanta editando un archivo que
el agente tiene permiso de editar, por `Write` o por `sed -i`, y el mensaje del bloqueo nombra el campo
exacto que hay que agregar. El límite no lo sostiene hoy el mecanismo: lo sostiene que el agente elija no
tocar el archivo.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable. El banco no necesita ser un repositorio: `main`
cuenta siempre como rama viva (`push.js:46`), y el remoto y la rama salen del comando.

```bash
BANCO=$(mktemp -d); REPO=$PWD
node engine/cli/ops.js init "$BANCO/acme" --mode embedded --runner claude --no-install >/dev/null
cat > "$BANCO/r114.js" <<'EOF'
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const A = process.argv[2]
const REPO = process.argv[3]
const env = { ...process.env, OPS_ROOT: A, TMPDIR: path.join(A, '..', 'tmp') }
delete env.CI
fs.mkdirSync(env.TMPDIR, { recursive: true })

const hook = (group, input) => spawnSync('node', [path.join(REPO, 'engine/hooks/run.js'), group], {
  input: JSON.stringify({ cwd: A, session_id: 's1', hook_event_name: 'PreToolUse', ...input }),
  env,
  encoding: 'utf8',
  cwd: A,
})
const show = (label, r) => console.log(
  `${label.padEnd(42)}: exit=${r.status}\n    ${(r.stderr || r.stdout).split('\n')[0].slice(0, 300)}`,
)
const write = (label, file, content) => show(label,
  hook('pre-files', { tool_name: 'Write', tool_input: { file_path: file, content } }))
const sh = (label, command) => show(label,
  hook('pre-shell', { tool_name: 'Bash', tool_input: { command } }))

const CFG = path.join(A, 'ops.config.json')
const cfg = () => JSON.parse(fs.readFileSync(CFG, 'utf8'))

sh('1 push a main, config intacta', 'git push origin main')
const next = cfg()
next.runner.pushToLiveBranches = ['main']
write('2 Write sobre ops.config.json', CFG, JSON.stringify(next, null, 2))
sh('3 sed -i sobre ops.config.json', `sed -i 's/"allowPush": false/"allowPush": true/' ${CFG}`)
write('4 Write sobre planning/.ops-approval', path.join(A, 'planning', '.ops-approval'), 'push origin main\n')
fs.writeFileSync(CFG, JSON.stringify(next, null, 2))
sh('5 push a main, ya con pushToLiveBranches', 'git push origin main')
const both = cfg()
both.runner.allowPush = true
fs.writeFileSync(CFG, JSON.stringify(both, null, 2))
sh('6 push a main, con allowPush ademas', 'git push origin main')
console.log('runner final:', JSON.stringify(cfg().runner))
EOF
node "$BANCO/r114.js" "$BANCO/acme" "$REPO"
```

Los pasos 2 y 3 sólo corren los guards: el hook juzga y no ejecuta, así que la edición que se aplica es la
de las líneas siguientes, y lo que se mide es qué dijo el guard sobre ella.

## Síntoma

Salida real, 2026-09-11, sobre `main` 41673984 —con 0.82.0 ya mergeado y `package.json` todavía en
0.81.0—, banco recién creado:

```
1 push a main, config intacta             : exit=2
    BLOQUEADO: 'git push' publica cambios en main, la rama viva, y requiere una acción humana: ni runner.allowPush ni una orden en el chat llegan ahí sin un permiso por rama. Decile a la persona qué se frenó y esperá: un «dale» no lo destraba. Lo da ella, nombrando la rama en runner.pushToLiveBranches d
2 Write sobre ops.config.json             : exit=0

3 sed -i sobre ops.config.json            : exit=0

4 Write sobre planning/.ops-approval      : exit=2
    BLOQUEADO: /tmp/.../b114b/acme/planning/.ops-approval es la aprobación de una persona, y escribírsela es aprobarse solo. Si la persona quiere autorizar algo, que lo diga en el chat —nombrándolo, o contestando «d
5 push a main, ya con pushToLiveBranches  : exit=2
    BLOQUEADO: 'git push' publica cambios y requiere una acción humana. Lo destraba una persona pidiéndolo en el chat con el remoto y la rama.
6 push a main, con allowPush ademas       : exit=0
runner final: {"maxTaskHours":4,"humanCheckpointBetweenMilestones":true,"commitPerTask":true,"allowPush":true,"pushToLiveBranches":["main"]}
```

Tres cosas, en orden:

- **El bloqueo nombra la salida.** El mensaje del paso 1 dice qué campo la levanta —`runner.pushToLiveBranches`
  de `ops.config.json`— y a quién le toca ponerlo. Lo segundo es una frase; lo primero es una instrucción que
  se puede ejecutar.
- **Los dos canales se tratan al revés de como se parecen.** Escribir la aprobación de la persona se frena
  con un mensaje que explica por qué (paso 4). Escribir el archivo que contiene el mismo permiso, en forma
  permanente y para todas las ramas, sale `exit=0` por las dos vías (pasos 2 y 3).
- **Con las dos llaves puestas, el push que se frenaba pasa** (pasos 5 y 6). Agregar la rama a
  `pushToLiveBranches` levanta el bloqueo de rama viva y deja el push como el de una rama de trabajo —por eso
  el paso 5 sigue en 2, con otro mensaje—; `allowPush: true` levanta el que queda.

## Causa raíz

- `engine/hooks/push.js:134-135` y `:142` — las dos llaves salen de `configOf(root).runner`:
  `pushToLiveBranches` arma el conjunto de ramas vivas exentas, y `allowPush === true` retorna sin preguntar
  nada más. El archivo se lee en cada invocación, así que el cambio vale desde el comando siguiente.
- `engine/hooks/self-approval.js:24-28` — el único canal con un guard propio es `planning/.ops-approval`. Lo
  preguntan los dos guards de límites, `workspaceBoundary` (`engine/hooks/files.js:248`) y `shellBoundary`
  (`engine/hooks/shell.js:318`), que son los que ya deciden dónde puede caer una escritura. Ninguno de los
  dos pregunta nada equivalente sobre `ops.config.json`.
- `engine/hooks/files.js:192-195` — `INSTANCE_CONFIG` exime a `ops.config.json` de `plan-first` **por
  nombre**, porque su mensaje manda a editarlo y frenarlo era un candado cuya llave está adentro (caso 090).
  La exención es correcta para lo que resolvía y deja el archivo sin ningún guard que lo mire.
- `engine/hooks/run.js:60-63` — los otros guards del grupo `pre-files` tampoco lo alcanzan: `secrets` y
  `generated` deciden por nombre de archivo, `engine` sólo mira `node_modules/@ingeniomaps/cauce`,
  `migrations` e `integration-snapshot` por ruta, `test-evidence` por archivo de prueba, y
  `workspace-boundary` lo da por bueno porque está **dentro** de la raíz declarada.
- `engine/hooks/shell.js:339-346` — el guard `governance` frena commitear gobernanza, y su `governedPattern`
  no incluye `ops.config.json`: cubre `planning/rules/`, `adr/`, `PROTOCOL.md`, `METHODOLOGY.md`, `FLOW.md`,
  `automatization/`, `engine/` y los contratos de cargo. Leído del fuente, sin correr: la reproducción de
  arriba mide la escritura, no el commit.

## Fix propuesto

Las opciones con su costo, sin elegir: cuál conviene depende de cuánto se quiera pagar en el camino que hoy
es trabajo normal, y esa es una decisión del proyecto.

**A — Mover el permiso de rama viva al canal que ya tiene guard.** `pushToLiveBranches` deja de vivir en
`ops.config.json` y pasa a ser lo que ya es `.ops-approval`: una línea que escribe una persona. Cierra la vía
entera para la rama viva y no toca nada más del archivo. Cuesta que un permiso permanente pase a vivir en un
archivo que hoy es por operación —`.ops-approval` «se coteja, no se consume» (`approval.js:15-19`), así que
una línea permanente ahí es otro contrato— y que `check` lo avisa mientras exista.

**B — Proteger `ops.config.json` entero**, con el mismo tratamiento que `.ops-approval`: lo escribe una
persona, o el agente cuando ella lo nombra en el chat. Es la forma más simple y la más cara: `workspaceRoots`
y `writableOutsideRoots` se editan como trabajo normal, y el mensaje de `workspace-boundary` manda
explícitamente a declarar la ruta ahí (casos 089 y 090). Un guard que frena eso reintroduce el candado que el
090 sacó, en el mismo archivo.

**C — Proteger sólo los dos campos.** El guard compara el valor entrante contra el del disco y frena si
cambian `runner.allowPush` o `runner.pushToLiveBranches`; lo demás del archivo pasa. Conserva el trabajo
normal y cuesta un guard que parsea JSON —y que tiene que decidir qué hacer cuando el contenido entrante no
es JSON válido—. Por shell no hay contenido que comparar: un `sed -i` no dice qué va a quedar, así que ahí la
única forma es frenar todo comando que escriba en ese archivo, que es la opción B para la mitad de las vías.

**D — Dejarlo como está y decirlo.** R10 ya declara que de sus seis actos el motor comprueba uno; esto
acotaría esa frase: lo que se comprueba es el push contra un archivo que el agente puede escribir. No cuesta
código y no cierra nada. Tiene a favor lo que la propia regla argumenta —una norma que se presenta como
comprobada donde no lo está enseña a no creerle al resto—, y en contra que el mensaje del bloqueo seguiría
nombrando el campo que lo levanta.

Cualquiera de las cuatro deja abierto un borde que conviene mirar aparte: **el mensaje del bloqueo nombra el
campo.** Que lo nombre es correcto para la persona, que es a quien le habla; lo que no está medido es qué
hace un agente que lee esa instrucción y puede ejecutarla. Hay antecedente en el archivo hermano: el
comentario de `push.js:103-104` y el de `approval.js:70-72` dicen que el mensaje se redactó así —hablándole a
la persona— porque, medido en una sesión real, con el imperativo el agente se ofrecía a escribirse la
aprobación. Ahí el guard lo frenaba; acá no hay guard.

## Tradeoffs

- **Cerrar esta vía no cierra las otras cinco de R10.** Merge, deploy, tags y rollback siguen sin forma
  reconocible en un comando. Arreglar el push mejor puede dar la impresión de que el conjunto está
  comprobado, y no lo está.
- **B y C le cobran a la persona lo que le quitan al agente.** Hoy, cuando el límite de raíces frena algo, la
  salida escrita es editar `ops.config.json`; con el archivo protegido, esa salida pasa a necesitar una
  aprobación, y el camino que el 089 y el 090 abrieron se vuelve a cerrar a medias.
- **A cambia dónde vive un permiso permanente**, y `.ops-approval` está pensado para lo puntual: `check`
  avisa mientras el archivo exista, así que una instancia que publica en `main` a diario convive con un aviso
  permanente.
- **Ninguna opción alcanza a una instancia ya creada** hasta que corra `upgrade`: `ops.config.json` es del
  proyecto y el motor lo lee tal como está.

## Prioridad

**Media.** No hay daño observado —esto es lo que el mecanismo permite, no algo que haya pasado— y la persona
sigue viendo el push en su sesión. Pesa en contra que lo que queda del otro lado es irreversible y compartido:
un push a la rama viva no se deshace, y el 112 ya dice que después no queda rastro de quién lo autorizó.

Sube a **alta** el día que una instancia corra recorridos sin una persona mirando —un loop, CI, una sesión
larga de `autobuild`— sobre un repositorio cuya rama viva se pueda publicar. Ahí la conducta deja de ser lo
que sostiene el límite, porque no hay quien la observe.

## Contexto de descubrimiento

2026-09-11, con el 0.82.0 recién mergeado (PR #367, que cerró el 103 y el 108). Al revisar qué sostiene el
permiso nuevo se vio la asimetría: `.ops-approval` tiene guard y `ops.config.json` no. Quien lo midió primero
reportó `exit=0` tanto con una edición de archivo como con un `sed -i`; la reproducción de este caso se
escribió desde cero sobre un banco nuevo y agrega los pasos 5 y 6, que muestran que el push efectivamente
pasa con las llaves puestas.

## Relacionados

- **103** — abrió la vía del chat para publicar. Junto con este caso: el agente no puede escribir el registro
  del chat, pero sí el archivo que da el mismo permiso de forma permanente.
- **108** — el que introdujo `pushToLiveBranches`. Lo que aquél cerró como «la rama viva necesita un permiso
  por rama» es exactamente lo que acá se puede escribir solo.
- **112** — una aprobación consumida no deja rastro. Si el permiso se lo escribe el agente, no hay ni rastro
  ni aprobación: los dos casos se leen juntos el día que haya que reconstruir quién publicó qué.
