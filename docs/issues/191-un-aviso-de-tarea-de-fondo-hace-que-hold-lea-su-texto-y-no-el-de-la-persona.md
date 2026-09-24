---
caso: 191
titulo: Un aviso de tarea de fondo hace que hold() lea su texto y no el de la persona, y un «seguí» aprueba lo que ella prohibió
estado: resuelto
resuelto-en: 0.99.0
prioridad: alta
version-detectada: 0.98.0
---

# 191 — Con un aviso de tarea de fondo en el medio, «seguí con lo tuyo» aprueba el `.env` que la persona prohibió

**🟢 resuelto en 0.99.0** · detectado en 0.98.0 · prioridad **alta**. Falla en la dirección peligrosa y en silencio: se
aprueba algo que la persona negó con todas las letras, y nada lo registra como negado.

## Resumen

`hold()` decide si lo frenado queda pendiente mirando si el mensaje «en curso» niega: es la protección del 184,
para que un «seguí con lo tuyo» no apruebe lo que la persona acababa de prohibir. Pero el texto que mira no es
el último mensaje **de la persona** sino el último registro que escribió `record()`, y `record()` registra
también los avisos del runner —`<task-notification>…`, con `human: false`—. Si entre la prohibición y el
bloqueo entra un aviso, la negación de ella ya no está en `text`, lo frenado queda en `pending` y el mensaje
humano siguiente lo aprueba aunque no lo nombre.

## Reproducción

Desde un directorio vacío, con un clon de Cauce en `<repo>` (`main` en `83fc8698`, 0.98.0). `chat.js` escribe su
registro en `os.tmpdir()/cauce-chat` (`engine/hooks/chat.js:30`), así que `TMPDIR` lo manda a un directorio
desechable y no se toca `/tmp/cauce-chat`. El guard se sustituye por lo que hace al frenar: `unauthorized()` y,
con lo que no pasó, `hold()` —como `push.js:116`, `approval.js:97` y `self-approval.js:92`—.

```bash
mkdir -p scratch/tmp && cd scratch
cat > notif.js <<'EOF'
'use strict'
const fs = require('node:fs'), path = require('node:path')
const chat = require(process.argv[2])
const rd = (sid) => JSON.parse(fs.readFileSync(path.join(chat.DIR, `${sid}.json`), 'utf8'))
const sid = 'r191-' + process.pid, base = { session_id: sid, cwd: '/nonexistent' }
const NOTE = '<task-notification>\n<status>completed</status>\n<summary>Agent finished</summary>\n</task-notification>'
for (const [first, withNote] of [['no toques el .env', true], ['no toques el .env', false]]) {
  const s = `${sid}-${withNote}`, b = { ...base, session_id: s }
  chat.record({ ...b, prompt: first, prompt_id: 'p1' })
  if (withNote) chat.record({ ...b, prompt: NOTE, prompt_id: 'p1n' })
  console.log(`«${first}»${withNote ? ' → aviso' : ''} → el guard frena .env; hold →`,
    chat.hold({ ...b, prompt_id: withNote ? 'p1n' : 'p1' }, ['.env']))
  const r = rd(s)
  console.log('  tras hold:', JSON.stringify({ text: r.text.slice(0, 20), human: r.human, askable: r.askable,
    pending: r.pending }))
  chat.record({ ...b, prompt: 'seguí con lo tuyo', prompt_id: 'p2' })
  console.log('  tras «seguí con lo tuyo»: approved =', JSON.stringify(rd(s).approved),
    '; reintento: unauthorized →', JSON.stringify(chat.unauthorized({ ...b, prompt_id: 'p2' }, ['.env'])))
}
EOF
TMPDIR=$PWD/tmp OPS_ROOT=/nonexistent node notif.js <repo>/engine/hooks/chat.js
rm -f tmp/cauce-chat/r191-*.json
```

La segunda vuelta es el control: la misma secuencia sin el aviso.

## Síntoma

Salida real, 2026-09-23, exit 0:

```
«no toques el .env» → aviso → el guard frena .env; hold → true
  tras hold: {"text":"<task-notification>\n","human":false,"askable":true,"pending":[".env"]}
  tras «seguí con lo tuyo»: approved = [".env"] ; reintento: unauthorized → []
«no toques el .env» → el guard frena .env; hold → true
  tras hold: {"text":"no toques el .env","human":true,"askable":true,"pending":[]}
  tras «seguí con lo tuyo»: approved = [] ; reintento: unauthorized → [".env"]
```

Con el aviso en el medio, `hold()` evalúa la negación sobre `"<task-notification>…"`, anota `.env` en `pending`,
y «seguí con lo tuyo» lo promueve: el reintento pasa (`unauthorized → []`). Sin el aviso, la misma prohibición
lo retiene, como pide el 184.

## Causa raíz

- **`engine/hooks/chat.js:338` y `:341`**: `hold()` toma el registro con `present(input)` y lee `saved.text`.
- **`chat.js:227-231`, `present()`**: devuelve el último registro sin mirar de quién es; sólo exige `askable`.
- **`chat.js:180-181` y `:197-198`, `record()`**: un aviso del runner se registra con su propio `text`,
  `human: false` y `askable` heredado del mensaje anterior. Heredar `askable` es deliberado (caso 166: que la
  persona que mira el bloqueo no desaparezca por un aviso), pero `text` no se hereda, así que la negación de
  ella sí desaparece.
- **`chat.js:183-185`**: el mensaje humano siguiente aprueba todo `pending` salvo lo que **él** niegue;
  «seguí con lo tuyo» no nombra el `.env`, así que no lo filtra.

El comentario de `hold()` (`chat.js:333-336`) habla del «mensaje en curso»; la premisa era que el último
registro es siempre el de la persona, y desde el 166 no lo es.

## Fix propuesto

Que `record()` arrastre el último texto humano igual que arrastra `askable`, y que `hold()` lea ése:

```diff
     const askable = human ? !flow : Boolean(previous && previous.askable)
+    const spoken = human ? text : String((previous && (previous.spoken ?? previous.text)) || '')
 …
-      { id: idOf(input), text, human, askable, flow, root: opsRoot(input), approved, granted,
+      { id: idOf(input), text, spoken, human, askable, flow, root: opsRoot(input), approved, granted,
 …
-    const text = saved.text || ''
+    const text = saved.spoken ?? saved.text ?? ''
```

Probado en una copia de los archivos trackeados, no en el árbol real: con el diff, la primera vuelta de la
reproducción da `pending: []`, `approved = []` y `unauthorized → [".env"]`, igual que el control; y
`node --test "test/hooks/*.test.js" "test/planning/*.test.js"` pasa 290/290. Ese verde también dice que **ninguna
prueba cubre esto** —la suite pasa igual con y sin el diff—, así que el arreglo lleva una prueba nueva con la
secuencia de arriba, vista en rojo sobre el código actual.

## Tradeoffs

- **El respaldo a `previous.text` hereda el problema en un borde**: si el registro anterior es un aviso escrito
  antes del cambio, no trae `spoken` y se cae a su `text`. Dura un mensaje humano; si se quiere cerrado, el
  respaldo es `''` cuando `previous.human` es falso, a costa de que un registro viejo no retenga nada.
- **Interactúa con el 188**: allí se discute cómo se lee la negación en `hold()`; cualquiera que se elija tiene
  que aplicarse sobre `spoken`, no sobre `text`. Conviene arreglar éste primero o en el mismo cambio.
- Un campo más en el registro de la sesión; no viaja ni se commitea (`chat.js:28-30`).

## Prioridad

Alta. Es el error en la dirección que el 184 existe para evitar: se ejecuta lo que la persona prohibió, sin que
ella haya dicho nada que lo apruebe. Y el escenario no es raro: un agente que delega en subagentes recibe avisos
de fondo todo el tiempo, y el primer intento después de un aviso es justamente donde un guard frena.

## Contexto de descubrimiento

Salió revisando el 188 el 2026-09-23: al comprobar la premisa de que el `text` que mira `hold()` es el del
mensaje humano en curso, `present()` resultó devolver cualquier último registro, y la reproducción con un aviso
en el medio mostró la aprobación de lo prohibido.

## Relacionados

- **188**: la misma línea de `hold()` en la dirección opuesta —una negación incidental hace perder una
  aprobación—. Comparten función, no causa.
- **166**: hizo que `askable` sobreviviera a los avisos del runner; `text` no se arrastró con él, y de esa
  asimetría sale éste.
- **184**: la protección que este caso esquiva.

## Cierre

**Resuelto en 0.99.0, por el camino propuesto y con una mitad que el caso no preveía.** Recorriendo lo que
enumeró:

- **Fix propuesto → se hizo, con otro respaldo.** `record()` arrastra `spoken`, el último texto de la persona, y
  `hold()` lee ése (`engine/hooks/chat.js`, `record` y `hold`). El respaldo no es `previous.spoken ??
  previous.text` sino `previous.spoken ?? (previous.human ? previous.text : '')`: un registro de antes del
  cambio que escribió la persona sigue reteniendo con su `text`, y uno que escribió un aviso no aporta la
  etiqueta del runner como si fuera ella.
- **Prueba nueva vista en rojo → se hizo.** «un aviso en el medio no borra lo que dijo la persona», en
  `test/hooks/chat.test.js`, corre la secuencia del caso con los hooks reales —`chat` y `secrets-read`—.
- **Tradeoff del respaldo → se cerró** con el respaldo de arriba, y tiene su propia mitad en la prueba: un
  registro reescrito sin `spoken`.
- **Tradeoff de la interacción con el 188 → queda resuelto por construcción.** La negación que el 188
  discute se evalúa donde `hold()` la lee, y `hold()` ya lee `spoken`: cualquiera de sus fixes hereda esto sin
  tocarlo.
- **Tradeoff del campo extra → aceptado.** Vive en el registro de la sesión en el temporal y no viaja.

**Lo que el caso no preveía: el aviso también borraba lo pendiente.** `record()` escribía `pending: []` en
cada registro, también en el de un aviso. Si el guard frenaba en el turno de la persona, el agente se lo
reportaba y antes de que ella contestara entraba un aviso de fondo, su «dale» encontraba `pending: []` y no
aprobaba nada: la misma pérdida silenciosa del 188, por otra causa. Tiene la misma raíz que éste —el aviso no
arrastra lo que era de la persona— y se arregló en el mismo lugar: un aviso conserva `pending` entero. No se le
aplica la negación del aviso, porque un aviso que diga «no toqué el .env» no es una persona negando.

### Qué se corrió

- **La reproducción del caso, tal como está escrita arriba, contra el motor arreglado** (2026-09-23, exit 0):

  ```
  «no toques el .env» → aviso → el guard frena .env; hold → true
    tras hold: {"text":"<task-notification>\n","human":false,"askable":true,"pending":[]}
    tras «seguí con lo tuyo»: approved = [] ; reintento: unauthorized → [".env"]
  «no toques el .env» → el guard frena .env; hold → true
    tras hold: {"text":"no toques el .env","human":true,"askable":true,"pending":[]}
    tras «seguí con lo tuyo»: approved = [] ; reintento: unauthorized → [".env"]
  ```

  La primera vuelta ahora da lo mismo que el control: `pending: []` y el reintento frenado.
- **La prueba nueva, en rojo sobre el código anterior** —el «seguí» pasaba (`Missing expected exception`)— y
  **tres mutaciones en una copia del árbol, las tres en rojo**, una por mitad: `hold()` leyendo `text` otra vez
  (falla el «no»), un aviso escribiendo `pending: []` otra vez (falla el «dale» que espera) y el respaldo sin
  mirar `text` (falla el registro viejo).
- `npm run ci`, exit 0.

