---
caso: 188
titulo: Una negación incidental hace que el bloqueo no quede anotado, y entonces la confirmación siguiente aprueba una lista vacía
estado: abierto
prioridad: alta
version-detectada: 0.98.0
---

# 188 — «Dale, fijate si esto no es de Cauce» deja el bloqueo sin anotar, y el «confirmo» siguiente no aprueba nada

**🔴 abierto** · detectado en 0.98.0 · prioridad **alta**. Falla en silencio: la persona aprueba, el guard sigue
frenando, y nada dice por qué.

## Resumen

El circuito de confirmación tiene dos pasos. Cuando un guard frena, `hold()` (`engine/hooks/chat.js:337-347`)
anota lo frenado en `pending`; en el mensaje siguiente, `record()` (`chat.js:177-206`) mueve ese `pending` a
`approved` si la persona no negó (`chat.js:183-185`, con `refuses` en `chat.js:168`). El segundo paso está bien
protegido. **El primero se cancela con cualquier negación en el mensaje en curso** (`chat.js:341-342`):

```js
const text = saved.text || ''
const open = NEGATION.test(text) || HALT.test(text) ? [] : items
```

Y `NEGATION` (`chat.js:60-62`) busca `no`, `nunca`, `jamás`, `ni`, `sin`, `not`, `never` y las contracciones
inglesas (`don't`, `isn't`…) **en cualquier parte del texto**, no al principio ni como respuesta. `HALT`
(`chat.js:167`) sí está anclado al comienzo (`^\s*`):

```js
const CONTRACTED = String.raw`(?:do|does|did|is|are|was|were|ca|wo|would|should)n'?t`
const NEGATION = new RegExp(
  String.raw`(?:^|[^\p{L}])(?:no|nunca|jam[aá]s|ni|sin|not|never|${CONTRACTED})(?![\p{L}])`, 'iu')
```

Entonces un mensaje que **aprueba y además pregunta otra cosa** —«dale, revisá si esto no es de Cauce»— hace que
el bloqueo que ocurre en ese turno **no quede anotado**. La confirmación del mensaje siguiente encuentra
`pending: []` y aprueba nada. El guard vuelve a frenar y no hay ninguna señal de por qué.

El caso 184 ya quitó la exigencia de una palabra exacta para confirmar. Éste es la otra mitad del mismo
problema, un turno antes: no es que la confirmación no se entienda, es que **no hay nada que confirmar**.

## Reproducción

En una sesión con un guard que frene por aprobación —`verify`, `governance`, `files`—:

1. La persona escribe un mensaje que aprueba **y** contiene una negación incidental, del tipo «dale, y fijate si
   esto no es un defecto» o «dale, sin apuro».
2. El agente reintenta y el guard frena. `hold()` descarta los ítems por la negación.
3. La persona contesta «confirmo», limpio y sin negaciones.
4. El agente reintenta: **sigue frenado**. `approved` quedó vacío porque `pending` estaba vacío.
5. Recién el paso siguiente funciona: el intento del punto 4 vuelve a anotar `pending`, y la confirmación
   **siguiente** sí aprueba.

### Reproducción corrida (2026-09-23, `main` en `83fc8698`, 0.98.0)

Corrida contra las funciones reales de `engine/hooks/chat.js`, sin banco: `chat.js` escribe su estado en
`path.join(os.tmpdir(), 'cauce-chat')` (`chat.js:30`), así que con `TMPDIR` apuntando a un scratch el registro
queda ahí y no toca `/tmp/cauce-chat`. Los `session_id` son inventados (`r188-*`) y se borraron al terminar.
El guard se sustituye por lo que hace al frenar: `unauthorized()` (`chat.js:309-321`) devuelve lo que no pasa, y
el guard llama `hold()` con eso —`push.js:116`, `approval.js:97`, `self-approval.js:92`—.

```js
// repro.js — TMPDIR=<scratch> OPS_ROOT=/nonexistent node repro.js
const chat = require('<repo>/engine/hooks/chat.js')
const ITEM = 'db/migrations/20260923120000_catalog_items.sql'
function run(sid, first) {
  const base = { session_id: sid, cwd: '/nonexistent' }
  chat.record({ ...base, prompt: first, prompt_id: 'p1' })        // 1. mensaje de la persona
  chat.hold({ ...base, prompt_id: 'p1' }, [ITEM])                  // 2. el guard frena
  chat.record({ ...base, prompt: 'confirmo', prompt_id: 'p2' })    // 3. «confirmo»
  const left = chat.unauthorized({ ...base, prompt_id: 'p2' }, [ITEM]) // 4. reintento
  if (left.length) {                                               // 5. el ciclo siguiente
    chat.hold({ ...base, prompt_id: 'p2' }, left)
    chat.record({ ...base, prompt: 'confirmo', prompt_id: 'p3' })
    chat.unauthorized({ ...base, prompt_id: 'p3' }, [ITEM])
  }
}
run('r188-neg-…', 'dale, fijate si esto no es un defecto'); run('r188-ctl-…', 'dale'); run('r188-sin-…', 'dale, sin apuro')
```

Salida real (exit 0), con el registro leído después de cada paso:

```
sesión r188-neg-860278 — primer mensaje "dale, fijate si esto no es un defecto"
  1. hold → true
  tras hold: text="dale, fijate si esto no es un defecto" approved=[] pending=[]
  tras «confirmo»: text="confirmo" approved=[] pending=[]
  2. reintento: unauthorized → ["db/migrations/20260923120000_catalog_items.sql"]
     hold → true
  tras 2º hold: text="confirmo" approved=[] pending=["db/migrations/20260923120000_catalog_items.sql"]
  tras 2º «confirmo»: text="confirmo" approved=["db/migrations/20260923120000_catalog_items.sql"] pending=[]
  3. reintento: unauthorized → []
sesión r188-ctl-860278 — primer mensaje "dale"
  1. hold → true
  tras hold: text="dale" approved=[] pending=["db/migrations/20260923120000_catalog_items.sql"]
  tras «confirmo»: text="confirmo" approved=["db/migrations/20260923120000_catalog_items.sql"] pending=[]
  2. reintento: unauthorized → []
sesión r188-sin-860278 — primer mensaje "dale, sin apuro"
  1. hold → true
  tras hold: text="dale, sin apuro" approved=[] pending=[]
  tras «confirmo»: text="confirmo" approved=[] pending=[]
  2. reintento: unauthorized → ["db/migrations/20260923120000_catalog_items.sql"]
     …(igual que la primera: aprueba recién el segundo «confirmo»)
```

Se reproduce tal cual: con la negación incidental `hold()` devuelve `true` —el bloqueo ofrece la salida por chat—
y **no anota nada**; el control con «dale» a secas aprueba al primer «confirmo». El paso 5 también se comprobó:
el segundo `hold()` anota con `text="confirmo"` y el segundo «confirmo» aprueba. Nota: `hold()` devuelve `true`
aunque haya descartado todo, y con eso el guard le ofrece a la persona una salida que no va a funcionar.

**Sobre qué texto mira `hold()`.** El caso da por hecho que es el mensaje humano en curso. No exactamente:
`hold()` lee `present(input)` (`chat.js:227-231`), que devuelve el último registro escrito por `record()` sea de
quien sea, y `record()` registra también los avisos del runner (`<task-notification>…`) con `human: false` y
`askable` heredado (`chat.js:181`, `197-198`). O sea que `text` es **el último mensaje que entró por el hook**.
En el camino de este caso —sin aviso en el medio— coincide con el humano, y la reproducción de arriba lo
confirma. Con un aviso en el medio no coincide, y eso abre un defecto distinto, en la dirección peligrosa:

```
// «no toques el .env» → <task-notification>…completed…</task-notification> → el guard frena .env → «seguí con lo tuyo»
hold → true
tras hold: {"text":"<task-notification>\n","human":false,"askable":true,"pending":[".env"]}
tras «seguí con lo tuyo»: approved= [".env"]
```

Lo que la persona acababa de prohibir queda aprobado por un mensaje que no lo nombra: la protección del 184
(`chat.js:333-336`) mira el texto del aviso y no el de ella. No es este caso —acá se pierde una aprobación; allá
se fabrica una— y **salió como caso propio: el 191**.

## Síntoma

Registro real de la sesión, `/tmp/cauce-chat/<session>.json`, el 2026-09-23, después de que la persona
escribiera «confirmo»:

```
text: 'confirmo'
approved: []
pending: ['db/migrations/20260923120000_catalog_items.sql', 'db/queries/catalog_items.sql', …9 rutas]
```

`approved` vacío con un texto que no niega nada: la lista que debía promoverse no existía. Las nueve rutas que
figuran en `pending` las puso el intento posterior, no el anterior.

Costó tres intentos de commit y cuatro mensajes de la persona sobre trabajo que ya estaba construido,
verificado y con los gates en verde.

## Causa raíz

- **`engine/hooks/chat.js:342`, `hold()`**: descarta los ítems si el texto del último mensaje registrado niega
  (en el camino de este caso, el humano en curso; ver arriba cuándo no lo es). La
  intención está escrita en el comentario (`chat.js:333-336`) y es correcta —que un «seguí con lo tuyo» no apruebe el `.env` que la
  persona acaba de prohibir— pero el instrumento no distingue **una negativa a lo que se está pidiendo** de
  **una negación gramatical sobre otro tema**.
- El efecto se ve un turno después y en otra función, así que desde afuera parece que la confirmación no se
  entendió. No hay traza que conecte las dos cosas.

## Fix propuesto

1. **La negación se mide sobre la cláusula que responde, no sobre todo el mensaje.** `chat.js` ya tiene el
   separador de cláusulas que hace falta (`CLAUSE`, usado por `mentions`): aplicar `NEGATION` sólo a la primera
   cláusula, que es donde vive la respuesta —«dale», «no», «pará»—, y no a la pregunta que viene detrás.

   ```diff
   -    const open = NEGATION.test(text) || HALT.test(text) ? [] : items
   +    const head = String(text).split(CLAUSE)[0]
   +    const open = NEGATION.test(head) || HALT.test(head) ? [] : items
   ```

   `CLAUSE` está en `chat.js:65` y lo usan `mentions` (`chat.js:118-119`) y `ordersPush` (`chat.js:146`).

2. **Y si aun así se descarta, que quede dicho.** Hoy el descarte es invisible: ni el agente ni la persona
   pueden saber que el bloqueo no se anotó. Anotar el motivo en el registro —`heldNone: 'negación'`— le permite
   al próximo bloqueo decir «tu mensaje anterior traía una negación, así que esto no quedó anotado; confirmalo
   de nuevo» en vez de repetir el mismo texto.

3. **Alternativa más conservadora**, si tocar la detección parece riesgoso: anotar siempre en `pending`, y
   aplicar la negación en `record()`, que es donde ya se filtra lo denegado. Ahí la persona que niega sigue
   protegida —su negativa se aplica al promover— y la que aprueba deja de perder el bloqueo.

### Qué hace cada fix, corrido (2026-09-23)

Cada variante se aplicó en una **copia** de los archivos trackeados (`git ls-files | rsync`) en el scratch, nunca
en el árbol real, y se corrió `node --test "test/hooks/*.test.js" "test/planning/*.test.js"` con `TMPDIR` al
scratch. Línea base sin cambios: 26/26 en `chat.test.js`, `chat-effects.test.js` y `grants.test.js`.

**Qué deja `split(CLAUSE)[0]`** (con `NEGATION` sobre la cabeza):

| mensaje | cabeza | niega hoy | niega la cabeza |
|---|---|---|---|
| `dale, fijate si esto no es un defecto` | `dale` | sí | no |
| `dale fijate si esto no es un defecto` (sin coma) | el mensaje entero | sí | **sí** |
| `dale sin apuro` (sin coma) | el mensaje entero | sí | **sí** |
| `no, dale` | `no` | sí | sí |
| `dale pero no el .env` (sin coma) | el mensaje entero | sí | sí |
| `dale, pero no el .env` | `dale` | sí | **no** |
| `seguí, no toques el .env` | `seguí` | sí | **no** |

- **Fix 1 tal cual**: cierra la reproducción (los tres escenarios aprueban al primer «confirmo»; `unauthorized →
  []`) y pasa **290/290**. Pero **reabre el hueco que el 184 cerró**, y ninguna prueba lo ve:

  ```
  actual "seguí, no toques el .env" → «listo» approved= []
  actual "dale, pero no el .env"    → «listo» approved= []
  fix1   "seguí, no toques el .env" → «listo» approved= [".env"]
  fix1   "dale, pero no el .env"    → «listo» approved= [".env"]
  ```

  Una prohibición explícita en la segunda cláusula queda pendiente y el «listo» siguiente la aprueba. Eso no es
  el tradeoff que la sección de abajo describía («raro», «esto no lo apruebes» al final): «sí, pero no el .env»
  es una forma habitual y ya figura en `test/hooks/chat.test.js:71`, sólo que esa prueba no mira el mensaje
  siguiente. Además, sin coma el fix no cambia nada: «dale fijate si esto no es…» sigue perdiendo el bloqueo.
- **Fix 3 ingenuo** (`const open = items`, sin mover nada más): rompe 4 de 290 —«lo que la persona nombró en
  el chat pasa…», «un «dale» aprueba exactamente lo que quedó frenado…», «lo que la persona autorizó sigue
  valiendo…» y la del 184 en `chat.test.js:290`—. Es esperable: `record()` filtra lo denegado con el texto
  **nuevo** (`chat.js:184`), no con el del mensaje en que se frenó, así que «aplicarla en `record()`» exige
  guardar ese texto junto al `pending` y volver a leerlo al promover. Tal como está escrito, el punto 3 no es
  «más conservador»: saca la protección.
- **Variante probada, 1b** (cabeza para la negación general + negación por ítem en todo el mensaje):

  ```diff
  -    const open = NEGATION.test(text) || HALT.test(text) ? [] : items
  +    const head = String(text).split(CLAUSE)[0]
  +    const open = NEGATION.test(head) || HALT.test(head) ? []
  +      : items.filter((item) => !mentions(text, item).denied)
  ```

  Cierra la reproducción, pasa 290/290 y mantiene frenados «seguí, no toques el .env» y «dale, pero no el
  .env». Deja abierta la prohibición genérica que no nombra el ítem: `"dale, pero no toques nada más" → «listo»
  approved= [".env"]` (hoy `[]`). Y para un push `mentions` compara el basename de la rama (`chat.js:111`,
  ver 103), así que «dale, pero no subas nada» tampoco lo retiene. Ninguna variante léxica separa sola la
  negativa al pedido de la negación sobre otro tema.

## Decisiones abiertas

1. **Qué precio se paga, y de qué lado.** Hoy el error es el caro para la persona (pierde una aprobación, en
   silencio); fix 1 lo cambia por el caro para la seguridad (aprueba lo que ella prohibió en la segunda
   cláusula), que es lo que el 184 decidió no aceptar. **Recomendación**: no fix 1 tal cual. Fix 2 (hacer
   visible el descarte) siempre, porque es seguro y ataca lo que vuelve alta la prioridad —el silencio—; y si
   además se quiere recuperar la aprobación, 1b, con pruebas nuevas que fijen en rojo los tres mensajes de
   arriba (el mensaje siguiente, no el actual) y la prohibición genérica declarada como tradeoff.
2. **Fix 3 bien hecho** (guardar el texto del mensaje que frenó junto a `pending` y aplicar su negación al
   promover) vuelve a dejar la negación en un solo lugar, pero es un cambio de formato del registro; decidirlo
   frente a 1b.
3. **El hallazgo de `present()` ya es el 191**: `hold()` mira el texto de un `<task-notification>` y no el de
   la persona. Cualquier lectura de la negación que se elija acá tiene que aplicarse sobre el último texto
   humano que propone el 191, así que conviene arreglarlo primero o en el mismo cambio.
4. **`hold()` devuelve `true` cuando descartó todo** (`chat.js:345`): el guard ofrece contestar «dale» a un
   bloqueo que ninguna respuesta va a aprobar. Entra naturalmente en fix 2.

## Tradeoffs

- **Mirar sólo la primera cláusula deja pasar una negativa escrita después de una coma.** El caso la daba por
  rara; corrido, no lo es: «dale, pero no el .env» y «seguí, no toques el .env» quedan aprobados por el
  «listo» siguiente (ver «Qué hace cada fix, corrido»).
- **El punto 3 cambia dónde se aplica la negación**, y en su forma literal rompe 4 pruebas, entre ellas la
  del 184; hace falta llevar el texto del mensaje que frenó hasta `record()`.
- Cualquiera de los dos deja el circuito en una sola lectura de la negación, que hoy está en dos lugares y sólo
  uno se ve.

## Prioridad

Alta, por cómo falla más que por cuánto. **Es un fallo silencioso sobre la aprobación de una persona**: ella dijo
que sí, el sistema no lo tomó, y lo que se ve es un guard que repite el mismo bloqueo. La salida que queda a mano
es la variable que apaga el guard para toda la sesión, que es el permiso más ancho de todos — exactamente el
resultado que los casos 116 y 184 vinieron a evitar.

## Contexto de descubrimiento

Instancia `gouduet-ops`, Cauce 0.98.0, tarea `catalog-item-table`. El commit estaba construido, revisado y con
`make test` y `make lint` en verde, frenado por el falso positivo del caso 187. La persona aprobó tres veces;
las dos primeras no sirvieron por esto. Se diagnosticó leyendo `/tmp/cauce-chat/<session>.json`, no por el
mensaje del guard, que en los tres intentos fue idéntico.

## Relacionados

- **184**: confirmar dejó de exigir una palabra exacta. Este caso es el turno anterior: que haya algo que
  confirmar.
- **166**: distinguir «hay alguien a quien preguntarle» de «esta persona lo pidió». Misma familia: qué se
  conserva entre mensajes.
- **191**: la misma línea de `hold()` en la dirección peligrosa —con un aviso de tarea de fondo en el
  medio, lee el texto del aviso y aprueba lo prohibido—. Salió de revisar este caso.
- **116**: lo que un guard dejó pasar queda anotado para no repetir el bloqueo. Acá lo que no queda anotado es
  lo que el guard frenó.
