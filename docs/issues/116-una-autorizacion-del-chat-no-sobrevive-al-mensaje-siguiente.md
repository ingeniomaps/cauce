---
caso: 116
titulo: Lo que autorizás en el chat deja de valer en cuanto mandás el mensaje siguiente
estado: abierto
prioridad: alta
version-detectada: 0.82.0
---

# 116 — La autorización del chat dura un mensaje, así que lo mismo se frena una y otra vez

**🔴 abierto** · detectado en 0.82.0 · prioridad **alta** — es fricción en el camino principal, y la salida
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
