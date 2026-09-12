---
caso: 116
titulo: Lo que autorizás en el chat deja de valer en cuanto mandás el mensaje siguiente
estado: resuelto
prioridad: alta
version-detectada: 0.82.0
resuelto-en: 0.83.0
---

# 116 — La autorización del chat dura un mensaje, así que lo mismo se frena una y otra vez

**🟢 resuelto en 0.83.0** · detectado en 0.82.0 · prioridad **alta** — es fricción en el camino principal, y la salida
barata que deja es la insegura: apagar el guard para toda la sesión con una variable de entorno

## Resumen

Desde 0.81.0 los guards consultan el mensaje de la persona: lo que ella pide, pasa. Pero esa autorización
**no sobrevive al mensaje siguiente**. Si en el mensaje N pedís leer el `.env` y el agente lo lee, y en el
mensaje N+1 decís cualquier otra cosa —«gracias, seguí»—, el mismo archivo que acabás de autorizar vuelve a
frenarse. En una conversación de trabajo, donde un pedido ocupa varios mensajes, eso se ve como que el
sistema te bloquea una y otra vez y te obliga a repetir la frase exacta o a contestar «dale» cada vez.

Contradice lo que el propio proyecto declara: los guards contienen al agente cuando trabaja solo, y lo que
la persona pide directo en el chat no se frena ni se le vuelve a preguntar.

## Reproducción

Desde un checkout de Cauce, sobre un banco desechable. Se invocan los guards de verdad, en sus grupos
—`prompt` registra el mensaje, `pre-read` decide la lectura—, con el mismo `session_id` para las seis
llamadas, que es lo que simula una conversación.

```bash
BANCO=$(mktemp -d); R=$PWD; A=$BANCO/acme
node $R/engine/cli/ops.js init $A --mode embedded --runner claude --no-install >/dev/null
printf 'API_TOKEN=secreto\n' > $A/.env
h() { out=$(printf '%s' "$2" | OPS_ROOT=$A node $R/engine/hooks/run.js "$1" 2>&1); echo "exit=$?  ${out%%$'\n'*}"; }

h prompt   '{"cwd":"'$A'","session_id":"s2","hook_event_name":"UserPromptSubmit","prompt":"leé el .env y decime qué credenciales tiene el proyecto"}'
h pre-read '{"cwd":"'$A'","session_id":"s2","hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"'$A'/.env"}}'
h prompt   '{"cwd":"'$A'","session_id":"s2","hook_event_name":"UserPromptSubmit","prompt":"gracias, seguí con eso"}'
h pre-read '{"cwd":"'$A'","session_id":"s2","hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"'$A'/.env"}}'
h prompt   '{"cwd":"'$A'","session_id":"s2","hook_event_name":"UserPromptSubmit","prompt":"dale"}'
h pre-read '{"cwd":"'$A'","session_id":"s2","hook_event_name":"PreToolUse","tool_name":"Read","tool_input":{"file_path":"'$A'/.env"}}'
```

## Síntoma

Salida real, 2026-09-11, sobre `main` 4a60e24f:

```
A) pide leer el .env con todas las letras           : exit=0
B) el agente lo lee (mismo mensaje vigente)         : exit=0
C) la persona dice otra cosa cualquiera             : exit=0
D) vuelve a leer el mismo .env que ella autorizó    : exit=2  BLOQUEADO: …/.env es una credencial: leerla la
                                                              deja en el contexto de la sesión…
E) ella contesta «dale»                             : exit=0
F) reintento tras el «dale»                         : exit=0
```

El paso **D** es el defecto: el archivo es el mismo, la persona es la misma y ya lo había autorizado en el
paso A. Lo único que cambió es que mandó un mensaje en el medio.

## Causa raíz

No es que los guards ignoren el chat —lo consultan—: es que el registro del chat sólo describe **el mensaje
vigente**, y una autorización que se usó sin bloquear no deja rastro.

- `engine/hooks/chat.js:123-136` — `record()` escribe un registro nuevo en cada mensaje. Hereda del anterior
  únicamente su `pending`, y sólo si el texto nuevo matchea `YES` («dale», «sí», «hacelo»…). Todo lo demás
  del mensaje anterior se descarta.
- `engine/hooks/chat.js:161-169` — `pending` lo llena `hold()`, al que **sólo llama un guard que bloqueó**.
  Un pedido que pasó no pasa por ahí: no queda anotado en ningún lado que la persona lo autorizó.
- `engine/hooks/chat.js:141-147` — `said()` devuelve el registro del mensaje vigente, o `null` si el id no
  coincide. No hay forma de que un guard vea lo que la persona dijo dos mensajes atrás.
- `engine/hooks/approval.js:46-49` — `pending()` cruza `.ops-approval` con lo que el chat autorizó, así que
  toda la vigencia del permiso viene de `said()`, que dura un mensaje.

La conducta es idéntica para todo lo que pasa por `AP.pending`: credenciales (`secrets-read`), límites de
escritura y el resto. El `.env` es sólo donde más se siente, porque es lo que una persona pide nombrando.

## Fix propuesto

Las opciones, con su costo; cuál conviene es una decisión del proyecto.

1. **Que lo autorizado quede anotado, como queda lo frenado.** Cuando un guard deja pasar algo porque el
   mensaje lo pedía, se escribe en el registro —un `granted` junto al `pending` de hoy—, y ese registro se
   hereda mensaje a mensaje. Es el cambio más chico y cierra el caso entero. Cuesta decidir hasta cuándo
   vale: la sesión entera, N mensajes, o hasta que la persona diga otra cosa sobre ese ítem.
2. **Vigencia por tarea y no por mensaje.** Lo autorizado vale mientras la sesión siga en lo mismo, y se
   limpia cuando cambia el trabajo. Más fiel a cómo se conversa y más difícil de definir sin inventar un
   concepto de «tarea» que el chat no tiene.
3. **Que el bloqueo no se repita para lo ya autorizado en esta sesión.** Una lista por sesión de lo que la
   persona pidió al menos una vez. Simple, y el precio es que nada la revoca salvo cerrar la sesión.
4. **No tocarlo y mejorar el mensaje**, para que quede claro que alcanza con «dale». No cierra nada: el
   trabajo sigue interrumpido a cada rato, que es el costo que este caso mide.

## Tradeoffs

- **Lo que se gana en fluidez se pierde en acote.** Hoy el permiso es angosto por construcción: vale para
  ese ítem y ese mensaje. Cualquiera de las opciones lo ensancha, y ensancharlo de más convierte un pedido
  puntual en una llave abierta que nadie recuerda haber dado.
- **La fricción empuja a la salida peor.** Cuando el bloqueo se repite, la salida cómoda que el propio
  mensaje ofrece es `OPS_SECRETS_READ_OVERRIDE=1`, que apaga el guard **para toda la sesión** y para todos
  los archivos. Es decir: el diseño estricto termina produciendo el permiso más ancho de los dos.
- **Lo que se anote hay que poder auditarlo.** Si la autorización persiste, hace falta saber quién la dio y
  cuándo, que es exactamente lo que el **112** dice que hoy no queda registrado.

## Prioridad

**Alta.** No rompe datos ni publica nada, pero ocurre en el camino principal —una persona pidiendo algo en
su sesión— y se repite cada vez. Lo que la sube de media a alta es el segundo tradeoff: la salida barata que
el bloqueo ofrece es apagar el guard entero por la sesión, así que la fricción no sólo molesta, empeora la
postura de seguridad que el guard existe para sostener.

## Contexto de descubrimiento

2026-09-11, reportado por el dueño del repositorio mientras usaba el sistema: le pedía a una sesión que
trabajara con credenciales y lo frenaba una y otra vez, «toca ser demasiado preciso». La reproducción de
arriba se escribió para establecer el mecanismo, y mostró que el pedido explícito **sí** funciona: lo que
falla es que deje de valer al mensaje siguiente.

## Relacionados

- **098** y **109** — abrieron la vía del chat y después la acotaron a los pedidos con verbo. Este caso es
  la dimensión que ninguno de los dos miró: cuánto dura lo que se autorizó.
- **112** — una aprobación consumida no deja rastro. Es la misma carencia vista desde la auditoría: acá
  duele porque el permiso se pierde, allá porque no se puede reconstruir quién lo dio.
- **114** — el permiso de push vive en un archivo sin guard. Los tres dibujan el mismo mapa: dónde vive un
  permiso, cuánto dura y qué rastro deja.

## Cierre

Recorrido contra el caso entero, no contra «Fix propuesto».

- **Resumen, «la autorización no sobrevive al mensaje siguiente»** — arreglado. La reproducción del caso,
  corrida tal cual en un banco desechable, antes y después del arreglo:

      antes (main 2a651ad4)              después (esta rama)
      D) vuelve a leer el .env : exit=2  D) vuelve a leer el .env : exit=0

  El paso D es el que el caso señalaba como el defecto, y es el único de los seis que cambió.

- **Resumen, «te obliga a repetir la frase exacta o a contestar dale cada vez»** — ya no: en la misma
  corrida, los pasos C y D muestran que un mensaje cualquiera en el medio deja de frenar lo autorizado.
  Lo que no cambió es lo que la persona no pidió: eso se sigue frenando igual.

- **Resumen, «contradice lo que el proyecto declara»** — cerrado por el mismo arreglo: lo que ella pide
  directo en el chat no se vuelve a frenar mientras la sesión siga y ella no lo niegue.

- **Reproducción** — se corrió tal cual. Se le agregaron dos pasos que el caso no traía —G, «no toques el
  .env», y H, el reintento— porque la decisión incluía que la negación revoque y sin ellos eso no se medía.
  Con el arreglo puesto, H da `exit=2`: la negación revoca y lo revocado no vuelve solo.

- **Síntoma** — la salida pegada en el caso se reprodujo idéntica. El caso la había medido sobre `main`
  4a60e24f y acá se volvió a medir sobre 2a651ad4, la base de esta rama: mismo resultado.

- **Causa raíz** — las cuatro citas se contrastaron contra el fuente de la base y las cuatro son exactas:
  `chat.js:123-136` (`record`), `chat.js:161-169` (`hold`), `chat.js:141-147` (`said`) y
  `approval.js:46-49` (`pending`). Ninguna necesitó corrección.

- **Fix propuesto, opción 1** — es la que el dueño decidió y la que se construyó: lo que un guard deja
  pasar queda anotado como `granted` y se hereda mensaje a mensaje. Las otras tres quedan descartadas:
  la 2 («vigencia por tarea») pedía inventar un concepto de tarea que el chat no tiene; la 3 («lista por
  sesión sin revocación») es lo mismo que la 1 pero sin poder revocar, que es justo lo que el tradeoff
  del acote pedía; la 4 («mejorar el mensaje») no cierra nada, como el propio caso dice.

- **El detalle fino que el caso dejaba abierto** — decidido acá, y escrito en el código:
  - **Qué se anota**: el ítem *tal como el guard lo nombró*, que es la ruta en la forma que ese guard
    tiene a mano. Es el mismo alcance que ya tiene una línea de `.ops-approval`; la misma credencial
    nombrada de dos formas son dos concesiones, y se prefirió angosto de más antes que de menos.
  - **Cuándo deja de valer**: al cerrarse la sesión —el registro vive en el temporal y es por sesión—, o
    cuando la persona lo niega. Además no vale nunca para un subagente, para CI ni para un recorrido de
    Cauce, porque eso ya lo decidía `said` y no se tocó.
  - **Qué lo revoca**: la negación, leída con `mentions`, que es lo que el caso proponía. Se hereda aun
    cuando el mensaje no lo escribió una persona —un aviso del runner en el medio no le quita a nadie lo
    que autorizó— y la negación se aplica venga de donde venga, porque revocar es la dirección segura.
  - **Qué no se concede**: la publicación. Volver a leer lo que ya se leyó no agrega consecuencia y volver
    a publicar sí, así que una orden de push vale para esa operación (R10). Es una decisión mía sobre el
    alcance, no sobre el mecanismo, y está probada por su propio caso.

- **Tradeoff «lo que se gana en fluidez se pierde en acote»** — es el que gobernó las cuatro decisiones de
  arriba: el permiso sigue siendo por ítem, por sesión, revocable, y sin alcanzar a publicar.

- **Tradeoff «la fricción empuja a la salida peor»** — la fricción que empujaba a
  `OPS_SECRETS_READ_OVERRIDE=1` se fue. La variable **no se tocó**: sigue existiendo y sigue apagando el
  guard para toda la sesión. Sacarla es otra decisión y no la pedía este caso.

- **Tradeoff «lo que se anote hay que poder auditarlo»** — es el **112**, resuelto en esta misma versión y
  sobre este mismo mecanismo: lo que acá se anota como concedido es lo que allá alimenta el rastro.

- **Prioridad** — se mantuvo alta y lo que la sostenía era el segundo tradeoff, que es el que cerró.

- **Relacionados** — el **112** cierra junto a éste. El **114** (el permiso de push vive en un archivo sin
  guard) **sigue abierto**: este arreglo no lo toca y no lo empeora, porque la publicación no se concede.
  El **098** y el **109** quedan como estaban: este cambio no toca qué cuenta como pedir algo.

- **Lo que el caso no preveía** — dos cosas, y las dos son parte del arreglo:
  - Una prueba existente afirmaba el comportamiento viejo con todas las letras («la aprobación era de esa
    respuesta: el mensaje siguiente empieza de cero»). No se borró: se reescribió al contrato nuevo, que
    es lo único que hace visible que lo que cambió fue una decisión y no un descuido.
  - `self-approval` también preguntaba por esta vía, y conceder ahí habría convertido «agregá src/x.js a
    .ops-approval» en permiso para escribirle después cualquier otra línea a la aprobación —aprobarse solo
    por la puerta de al lado—. Se lo movió a preguntar sin conceder.

- **Cómo se probó** — cinco mutaciones sobre copias desechables, cada una apagando a mano una parte del
  arreglo, y todas en rojo: no heredar lo concedido (2 pruebas), heredar sin filtrar la negación (3), que
  lo que pasa no quede concedido (2), que lo concedido no cuente como autorización (2) y que preguntar
  también conceda —o sea, que la publicación heredara— (3). Las pruebas nuevas se vieron en rojo contra un
  `git archive` de la base antes del arreglo. `npm test` 747/747 y `npm run ci` en 0.
