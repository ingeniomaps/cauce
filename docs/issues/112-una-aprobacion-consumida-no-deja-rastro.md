---
caso: 112
titulo: Una aprobación consumida no deja rastro: quién aprobó qué push, a qué rama y cuándo
estado: resuelto
prioridad: media
version-detectada: 0.81.0
resuelto-en: 0.83.0
---

# 112 — Un «dale» publica una rama y, un mensaje después, no queda nada que diga que alguien lo aprobó

**🟢 resuelto en 0.83.0** · detectado en 0.81.0 · prioridad **media** — desde 0.82.0 una
aprobación del chat publica (caso 103), y un push no se deshace solo; hoy la única constancia de que una
persona lo autorizó dura hasta que ella manda el mensaje siguiente

## Resumen

Las aprobaciones del 098 —un pedido en el chat, un «dale» a lo que quedó frenado, una línea en
`planning/.ops-approval`— destraban el bloqueo y no dejan registro de haberlo hecho. Con archivos no pesaba
tanto: lo aprobado queda en el diff, y el diff queda en un commit. Con el push del 103 sí pesa: lo aprobado
es un acto sobre un sistema compartido que no vuelve atrás, y después no hay cómo contestar **quién lo
aprobó, qué remoto y qué rama, y cuándo**.

Salió del 103 (Tradeoffs) y del 108 (P4) como mejora del mecanismo de aprobaciones entero, no de un guard.

## Reproducción

Desde un checkout de la rama de 0.82.0, sobre un banco desechable. `TMPDIR` apunta adentro del banco:

```bash
S=$(mktemp -d); mkdir -p "$S/tmp"
node engine/cli/ops.js init "$S/acme" --mode embedded --runner claude --no-install >/dev/null
TMPDIR="$S/tmp" A="$S/acme" REPO="$PWD" node - <<'EOF'
const { spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path')
const { A, REPO } = process.env; const env = { ...process.env, OPS_ROOT: A }; delete env.CI
const hook = (group, input) => spawnSync('node', [path.join(REPO, 'engine/hooks/run.js'), group],
  { input: JSON.stringify({ cwd: A, session_id: 's1', ...input }), env, encoding: 'utf8', cwd: A })
const say = (prompt, id) => hook('prompt', { hook_event_name: 'UserPromptSubmit', prompt, prompt_id: id })
const probe = (label, command, id) => {
  const r = hook('pre-shell', { tool_name: 'Bash', tool_input: { command }, prompt_id: id })
  console.log(`${label.padEnd(40)}: exit=${r.status} ${(r.stderr || r.stdout).split('\n')[0].slice(0, 70)}`) }
const record = () => fs.readFileSync(path.join(process.env.TMPDIR, 'cauce-chat', 's1.json'), 'utf8')
say('subí la rama', 'p1')
probe('1 push sin orden', 'git push origin feat/x', 'p1')
console.log(`  registro: ${record()}`)
say('dale', 'p2')
probe('2 «dale»', 'git push origin feat/x', 'p2')
console.log(`  registro: ${record()}`)
say('ahora corré los tests', 'p3')
console.log(`  registro tras el mensaje siguiente: ${record()}`)
const hits = spawnSync('grep', ['-rl', 'feat/x', A], { encoding: 'utf8' }).stdout.trim()
console.log(`  archivos de la instancia que nombran feat/x: ${hits || '(ninguno)'}`)
EOF
```

## Síntoma

Salida real, 2026-09-11, desde la rama `fix/103-108-push-por-chat`:

```
1 push sin orden                        : exit=2 BLOQUEADO: 'git push' publica cambios y requiere una acción humana. De
  registro: {"id":"p1","text":"subí la rama","human":true,"flow":false,"approved":[],"pending":["push origin feat/x"]}
2 «dale»                                : exit=0
  registro: {"id":"p2","text":"dale","human":true,"flow":false,"approved":["push origin feat/x"],"pending":[]}
  registro tras el mensaje siguiente: {"id":"p3","text":"ahora corré los tests","human":true,"flow":false,"approved":[],"pending":[]}
  archivos de la instancia que nombran feat/x: (ninguno)
```

El push se aprobó (paso 2) y un mensaje después no queda nada: el registro del chat se reescribe entero y la
instancia no nombra la rama en ningún archivo.

## Causa raíz

- `engine/hooks/chat.js:133-134` (`record`): cada mensaje de la persona reescribe el registro de la sesión con
  `approved` y `pending` nuevos. Es a propósito —una aprobación vale para el mensaje siguiente y ninguno
  más—, y la consecuencia es que el registro es un estado, no una historia.
- El registro vive en el temporal del sistema (`chat.js:20-22`), también a propósito: el texto de la persona
  no tiene por qué terminar en un commit.
- `engine/hooks/approval.js:15-19`: `.ops-approval` «se coteja, no se consume», así que tampoco hay un
  momento en que se sepa que una línea se usó.
- `engine/hooks/push.js:128-145` (`publish`): cuando un push pasa por una aprobación, retorna sin anotar
  nada. Ningún guard lo hace: hoy ninguno escribe en el repositorio salvo el registro de gates
  (`engine/core/evidence.js:38`).

## Fix propuesto

La forma, no el diff, porque las dos preguntas de abajo cambian dónde vive:

1. Cuando `publish` deja pasar un push **por una aprobación** —orden del chat, «dale» o línea de
   `.ops-approval`— anexa una línea a un registro: fecha, remoto, rama, por qué vía y el `session_id`. Por
   `allowPush` no, porque ahí la autorización ya está escrita en la configuración.
2. El registro sólo agrega, y no guarda el texto de la persona: la vía y la sesión alcanzan para reconstruir
   qué pasó sin sacar del temporal lo que el 098 decidió dejar ahí.

**Decisión pendiente del usuario:**

- **Dónde vive el registro.** Junto a la evidencia de gates (`core/evidence.js`) queda en la instancia y
  viaja con ella; en el temporal se pierde al reiniciar y no sirve para auditar. La recomendación es la
  instancia, con el mismo formato que la evidencia.
- **¿Vale para todas las aprobaciones o sólo para el push?** Las de archivos ya dejan el diff; extenderlo
  a ellas daría un registro uniforme y bastante más ruido. La recomendación es empezar por el push, que es
  lo irreversible.

## Tradeoffs

- **Un guard que escribe.** Hoy los guards de publicación no escriben nada, y `approval.js` explica por qué
  eso vale algo. Un registro que sólo agrega no cambia qué se decide, pero es una escritura desde un hook de
  pre-ejecución: si falla, no puede frenar el push, porque el push ya estaba autorizado.
- **Anotar antes de que ocurra.** El hook corre antes del comando: lo que se anota es la autorización, no el
  resultado. Un push que después falla queda registrado como aprobado; decirlo en el formato evita leerlo
  como publicado.

## Prioridad

Media mientras las aprobaciones del chat puedan publicar. Sube a alta el día que una instancia necesite
responder quién autorizó un push —una auditoría, un incidente—, porque hoy no hay de dónde sacarlo.

## Contexto de descubrimiento

2026-09-11, cerrando el 103 y el 108: los dos lo nombraban (Tradeoffs del 103, P4 del 108) y lo dejaban para
un caso propio. La reproducción de arriba se corrió con el arreglo de esos dos ya puesto.

## Relacionados

- **103** — la vía por la que el chat publica; es la que vuelve caro no tener rastro.
- **108** — su P4 es este caso.
- **098** — el mecanismo de aprobaciones entero; el rastro le falta a todas, no sólo al push.

## Cierre

Recorrido contra el caso entero, no contra «Fix propuesto».

- **Resumen, «no hay cómo contestar quién lo aprobó, qué remoto y qué rama, y cuándo»** — ahora hay una
  línea por push autorizado, con un límite que conviene decir: contesta **en qué sesión y por qué vía** se
  autorizó, no el nombre de una persona. Cauce no tiene identidad de usuario y el caso pedía el
  `session_id`, que es lo que se anota; para llegar a una persona hay que ir de la sesión a quién la tenía
  abierta. La línea real, de la reproducción del caso corrida con el arreglo puesto:

      {"authorizedAt":"2026-09-12T03:34:16.668Z","remote":"origin","branch":"feat/x","via":"dale","session":"s1"}

- **Reproducción** — se corrió tal cual en un banco desechable, antes y después. La última línea es la que
  cambió:

      antes:   archivos de la instancia que nombran feat/x: (ninguno)
      después: archivos de la instancia que nombran feat/x: …/acme/planning/.push-log

- **Síntoma** — la salida pegada se reprodujo idéntica sobre la base de esta rama. El registro del chat
  sigue reescribiéndose entero en cada mensaje, que era correcto y no se tocó: lo que faltaba no era
  memoria en el temporal sino una línea en la instancia.

- **Causa raíz** — las cuatro citas se contrastaron contra el fuente y **dos estaban corridas**, las dos
  corregidas en este mismo cambio: `chat.js:133` es la escritura del registro y ocupa `133-134`, y
  `publish` no está en `push.js:127-144` sino en `128-145`. `approval.js:15-19` y `evidence.js:38` son
  exactas.

- **Fix propuesto, punto 1** — implementado tal cual: `publish` anexa una línea cuando deja pasar un push
  **por una aprobación**, con fecha, remoto, rama, vía y sesión. Las tres vías se distinguen: `orden` (el
  mensaje que lo pidió con su remoto y su rama), `dale` (la respuesta al bloqueo) y `.ops-approval` (la
  línea exacta del archivo). Por `allowPush` no se anota nada, que es lo que el punto pedía.

- **Fix propuesto, punto 2** — el registro sólo agrega y no guarda el texto de la persona. Las dos mitades
  están medidas por mutación, no por lectura: sobrescribir en vez de anexar pone en rojo la prueba, y
  hacer que el rastro guarde el texto del chat también.

- **Decisión pendiente, «dónde vive el registro»** — la instancia, con el formato de la evidencia de gates:
  una línea JSON por entrada. Queda **gitignoreado**, como `.verify-log`, y eso es una decisión con razón
  escrita: lo que contesta se pregunta en la máquina donde corrió la sesión que publicó, y committearlo
  sería un conflicto por push a cambio de nada. Se declaró en `template/gitignore` y en el anillo «Local»
  de `teamwork.md`, que es donde la instancia enumera sus artefactos locales.

- **Decisión pendiente, «¿todas las aprobaciones o sólo el push?»** — sólo el push, que es lo irreversible
  y lo que el dueño decidió. Las de archivos siguen sin rastro propio y siguen dejando el diff, que es el
  argumento del propio caso; el **098** queda con esa dimensión abierta a propósito.

- **Tradeoff «un guard que escribe»** — sostenido y **probado**: el rastro nunca puede frenar un push que
  ya estaba autorizado. Se montó una raíz donde escribir adentro falla —`planning` como archivo y no como
  directorio— y el push pasa igual; la mutación que hace que ese fallo se propague pone esa prueba en rojo.

- **Tradeoff «anotar antes de que ocurra»** — esta dimensión casi se cierra sin cumplirse. Pedía que el
  formato dijera que lo anotado es la autorización y no el resultado, y el campo se llamaba `at`, que es
  una fecha a secas y se lee como «esto se publicó». Se renombró a `authorizedAt`, y el comentario de
  `trail` dice por qué. Un push que después falla queda registrado igual, que es correcto y ahora se lee
  como lo que es.

- **Prioridad** — era media «mientras las aprobaciones del chat puedan publicar», y su condición de
  escalada —el día que una instancia necesite responder quién autorizó un push— queda contestable, con el
  alcance del primer ítem: la sesión y la vía, no el nombre.

- **Relacionados** — el **103** y el **108** (su P4) quedan cerrados por este rastro. El **098** no: se
  decidió arriba que el rastro empieza por el push. El **116** se resolvió junto a éste y comparte el
  mecanismo: lo que allá se anota como concedido es la materia prima de esta línea.

- **Cómo se probó** — siete mutaciones sobre copias desechables, todas en rojo: no escribir el rastro,
  anotarlo también por `allowPush`, guardar el texto de la persona, sobrescribir en vez de anexar, anotar
  todas las vías igual, que un rastro que falla frene el push, y que el archivo deje de estar gitignoreado.
  Las pruebas nuevas se vieron en rojo contra un `git archive` de la base antes del arreglo. `npm test`
  747/747 y `npm run ci` en 0.
