---
caso: 117
titulo: No hay forma de registrar una autorización que la persona ya dio, ni de concederla con alcance
estado: resuelto
resuelto-en: 0.86.0
prioridad: media
version-detectada: 0.81.0
---

# 117 — La aprobación existe en dos formas y falta la del medio: por operación, o por sesión entera

**🟢 resuelto en 0.86.0** · detectado en 0.81.0 · prioridad **media** — 0.83.0 sacó la fricción que caía
sobre la persona y dejó en su lugar una exención por sesión sin alcance, sin procedencia y que `check` no
mostraba; 0.86.0 cierra la mitad que lo sostenía —la visibilidad— y el alcance y la procedencia salen como
caso **127**

## Resumen

Hoy autorizar algo tiene exactamente dos formas, y son los dos extremos:

| forma | alcance | quién la pone |
|---|---|---|
| `planning/.ops-approval` | **una operación**: vale para el conjunto que nombra y deja de valer en cuanto ese conjunto cambia | sólo una persona, a mano |
| `OPS_*_OVERRIDE=1` | **toda la sesión**, y el guard entero | una persona, en el entorno del runner |

Falta la del medio: **conceder una capacidad concreta, con alcance, sin apagar nada.** «Podés leer esta
identidad declarada mientras dure esta tarea» no se puede expresar.

Y hay un segundo hueco, que el operador nombró mejor de lo que estaba escrito: **una cosa es que el agente
se escriba la aprobación por iniciativa propia, y otra es que la persona diga «usá ese archivo» y el agente
lo registre.** 0.81 cerró las dos juntas — «El agente ya no puede escribirse la aprobación» — y la segunda
no era el problema.

## Reproducción

Instancia sidecar, 0.81.0.

1. Con el WIP activo, el agente intenta escribir `planning/.ops-approval` después de que el operador
   autorizó por chat, nombrando el archivo:

```
BLOQUEADO: …/planning/.ops-approval es la aprobación de una persona, y escribírsela es aprobarse solo.
Si la persona quiere autorizar algo, que lo diga en el chat —nombrándolo, o contestando «dale» al
bloqueo— o que edite el archivo ella.
```

   Las dos vías que ese mensaje ofrece son de chat, y en esa sesión el chat no destrababa (caso **118**),
   así que la única salida real era la edición manual.

2. Terminada la operación, el agente borra el archivo siguiendo la guía: `AGENTS.md` dice que «no se borra
   sola, así que un commit frenado por otra cosa no te obliga a rehacerla. `check` te avisa mientras exista,
   y **borrarla es parte de terminar**». La siguiente operación vuelve a frenarse, y la persona vuelve a
   pegar la misma línea.

En la sesión medida eso pasó con tres archivos distintos y el operador lo dijo así: «es muy feo estar
aprobando a cada rato cuando ya te di aprobacion».

## Síntoma

- **La fricción no cae sobre el agente, cae sobre la persona**, y es repetitiva: una línea por archivo, y
  otra vez después de cada limpieza.
- **La salida que queda a mano es la peor**: apagar el guard por sesión. Un permiso de grano fino que
  cuesta cinco mensajes se cambia por uno de grano grueso que cuesta uno.
- **El agente borra lo que la persona concedió.** La guía le pide limpiar «como parte de terminar», y no
  distingue una línea que él pidió para una operación de una que la persona dejó puesta a propósito.

### Medido en una sesión, 2026-09-11/12

**Seis pegadas de la persona, todas para permisos que ya había dado.** En orden, cada una tras un bloqueo
distinto: la identidad de Infisical, el respaldo `.env.bak`, el `.env` del servicio, el `.env` de la raíz
del workspace, el `package.json` que cambió sin lockfile, y siete rutas de gobernanza que traía la propia
actualización de Cauce. Ninguna fue una decisión nueva: todas estaban autorizadas en el chat desde antes.

**El aviso de `check` no se puede silenciar.** Sale de `engine/cli/planning.js:183`, que lo empuja a la
lista de advertencias sin consultar configuración alguna: no hay opción, ni archivo, ni variable. Una
concesión que la persona dejó puesta **a propósito** queda reportada como riesgo en cada corrida —
incluidas las de `autobuild`—, así que el operador aprende a ignorar las advertencias de `check`, que es
el peor resultado posible para una herramienta cuyo valor es avisar.

**Y el principio que el operador nombró, textual**: «si te digo haz o acepto, tú deberías poder poner los
archivos y ejecutar». Su lectura del sistema fue que «Cauce ha estado dañando en vez de mejorando». Vale
registrar las dos mitades, porque la respuesta honesta no es darle la razón entera: en esa misma sesión el
guard de secretos impidió que el agente escribiera credenciales en archivos, el de lectura evitó que tres
tokens entraran en el contexto de la conversación —y por eso siguen siendo rotables sin sospechar de ese
transcript—, y el de gobernanza frenó un commit que incluía **las reglas y los guards que limitan al
agente**. Esos tres límites son correctos y ninguno se discute acá. Lo que sobra es que ejercerlos cueste
una pegada manual por archivo cuando la autorización ya existía.

## Causa raíz

`approval.read()` devuelve una lista de rutas y `pending()` compara contra ella
(`engine/hooks/approval.js:31-42`). No hay campo para alcance ni para procedencia: una línea es una ruta y
nada más. De ahí salen las tres consecuencias: no se puede decir «hasta cuándo», no se puede decir «quién
lo autorizó», y por lo tanto no se puede permitir que el agente escriba una línea sin que sea
indistinguible de aprobarse solo.

## Fix propuesto

**1. Procedencia en la línea, y que la escriba el hook que oyó a la persona.** No el agente: el propio
`guard-chat`, que ya corre sobre el mensaje. Con la marca de dónde salió:

```
…/venotal/platform/.env.bak   # vía chat, 2026-09-12, sesión 5c17daac
```

Así la garantía se mantiene —el agente no firma nada— y la fricción desaparece: la persona dice «usá ese
archivo» una vez y queda escrito, con su origen a la vista para quien audite después.

**2. Una concesión con alcance, aparte de la lista por operación.** Un archivo propio, que el agente no
escribe ni borra:

```
# planning/.ops-grants
<ruta>   <guard>         <alcance>
.env.infisical   secrets-shell   task:platform-rename
.env.bak         secrets-shell   session
```

`ops check` las lista en cada corrida —una exención que no se ve es un límite que ya no existe— y al
cerrar la tarea las de alcance `task:` caducan solas.

**3. Que la guía deje de pedirle al agente que borre lo que no escribió.** La regla correcta es: borra las
líneas que él pidió para una operación terminada; no toca las que tienen procedencia de chat ni las de
`.ops-grants`.

**4. Que `check` liste la concesión durable como estado y no como advertencia.** Hoy toda ruta aprobada y
sin borrar es un `warning` (`engine/cli/planning.js:183`), sin forma de distinguir la que quedó olvidada
de la que alguien dejó puesta con alcance. Con `.ops-grants` la distinción existe: lo de alcance declarado
se informa —«estas rutas están concedidas hasta X»— y lo que sigue en `.ops-approval` después de cerrar la
operación sigue avisando, que es el caso que el aviso vino a cazar.

## Tradeoffs

- **Un permiso durable es, por definición, menos estricto que uno por operación.** Se compensa con dos
  cosas: alcance explícito y visibilidad en `check`. Lo que hoy pasa es peor que eso: el atajo real es
  apagar el guard por sesión, que no tiene ni alcance ni rastro.
- **La procedencia se puede falsificar si la escribe el proceso equivocado.** Por eso la escribe el hook
  del prompt y no el agente, y por eso conviene que la línea lleve la sesión: sin eso, «vía chat» es una
  afirmación que nadie puede contrastar.
- **Dos archivos en vez de uno** es superficie nueva. La alternativa —un campo de alcance en
  `.ops-approval`— mezcla lo efímero con lo durable en el mismo lugar, y es justo la distinción que este
  caso viene a hacer.

## Contexto de descubrimiento

Instancia real (sidecar, 0.81.0), 2026-09-11/12, armando el contrato de secretos de un proyecto con
Infisical. La observación que ordena el caso es del operador: «una cosa es yo decirte usa el archivo, que
eso ya es autorización y es suficiente para que tú escribas en el archivo, y otra cosa es que tú lo hagas
solo sin yo decirte usa el archivo».

## Contra 0.83.0

Medido el 2026-09-11 sobre el código de hoy —0.82.0 publicada, 0.83.0 lista y sin publicar—, en un banco
sidecar. **Es una medición, no un cierre: el caso sigue abierto.** 0.83.0 agregó, por el **116**, que lo
que un guard deja pasar quede anotado y se herede mensaje a mensaje. Eso toca los tres puntos de «Fix
propuesto» y no cierra ninguno.

- **Punto 1, «una concesión con alcance, sin apagar nada» — sigue vivo.** Lo que se agregó es `granted`,
  un array plano de rutas en el registro de la sesión (`engine/hooks/chat.js:136` lo hereda,
  `engine/hooks/chat.js:173-178` lo escribe). No tiene alcance declarado por la persona, no tiene
  procedencia, no caduca salvo con la sesión o con una negación, y **no se ve**: `ops check` no dice nada
  de lo concedido, mientras que por una sola línea en `.ops-approval` avisa «N ruta(s) aprobadas y sin
  borrar; el archivo sigue autorizándolas» (`engine/cli/planning.js:183`). O sea que la exención durable
  que este caso pedía existe a medias y del lado que no se audita. Lo que 0.83.0 sí hizo fue sacar la
  fricción que volvía urgente al caso: la persona ya no pega una línea por cada vuelta.
- **Punto 2, «que la persona diga "usá ese archivo" y el agente lo registre» — parcial.** Si la persona
  **nombra** el archivo con un verbo reconocido, la escritura pasa. Lo que sigue frenado son las otras dos
  mitades: la forma deíctica —«usá ese archivo», «registralo donde haga falta»—, que `mentions()` no puede
  resolver porque compara el nombre del ítem contra el texto; y la persistencia, porque `self-approval`
  consulta el chat con `CHAT.authorized` (`engine/hooks/self-approval.js:28`), que pregunta y **no
  concede** —conceder ahí era aprobarse solo por la puerta de al lado, y el cierre del 116 lo dice—.
- **Punto 3, «que la guía deje de pedir borrar lo que el agente no escribió» — sigue vivo, intacto.**
  `template/AGENTS.md:137` sigue diciendo «borrarla es parte de terminar», sin distinguir la línea que el
  agente pidió para una operación de la que la persona dejó puesta a propósito.

**Prioridad: se mantiene media, con otra razón.** La que estaba escrita era la fricción repetida sobre la
persona, y ésa se fue. La sostiene ahora lo que quedó en su lugar: una exención que vale por toda la
sesión y que no aparece en ninguna corrida de `check` —«una exención que no se ve es un límite que ya no
existe», que es lo que el propio punto 2 de «Fix propuesto» pedía evitar—. No sube a alta porque no
bloquea a nadie ni ensancha el permiso más allá de la sesión; no baja a baja porque el agujero de
auditoría es nuevo y nadie lo va a notar solo.

## Relacionados

- **118** — la salida por chat no funciona. Con 118 arreglado, el punto 1 de acá es el que evita que la
  persona tenga que pegar nada. Medido el 2026-09-11, hoy funciona para la mayoría de los textos y falla
  para los que no traen un verbo de la lista cerrada.
- **116** — «una autorización del chat no sobrevive al mensaje siguiente», resuelto en 0.83.0. Es el que
  trajo `granted`, o sea la mitad sin auditar del punto 1 de acá.
- **112** — una aprobación consumida no deja rastro. La procedencia que el punto 1 pide es lo mismo visto
  desde la auditoría.
- **089** — la aprobación por ruta también falla cuando la forma de la ruta no coincide; 0.80 lo mejoró
  imprimiendo la línea exacta.
- **127** — lo que este caso pedía y no se construyó: alcance declarado y procedencia.

## Cierre

**🟢 resuelto en 0.86.0** · `engine/hooks/chat.js`, `engine/hooks/approval.js`, `engine/cli/planning.js`,
`template/AGENTS.md`, `test/planning/grants.test.js`

La decisión del dueño fue **hacer visible lo concedido**. Eso cierra lo que sostenía al caso y **no** cierra
el caso entero, así que lo que queda se nombra abajo en vez de quedarse adentro.

### Contra lo que el caso enumeró

**Punto 1, «procedencia en la línea, escrita por el hook que oyó a la persona» — no se construyó.** Sale
como caso **127**. Lo que sí se hizo es la mitad que lo volvía urgente: lo concedido ya no es invisible.

**Punto 2, «una concesión con alcance, en un archivo aparte» — no se construyó.** Sale como caso **127**.
El registro sigue siendo un array plano de rutas, así que «vale mientras dure esta tarea» sigue sin poder
escribirse.

**Punto 3, «que la guía deje de pedirle al agente que borre lo que no escribió» — hecho.**
`template/AGENTS.md` decía «borrarla es parte de terminar»; ahora dice que se borra **la línea que el agente
pidió para una operación ya terminada**, y que la que dejó puesta la persona no se toca.

**Punto 4, «que `check` liste la concesión durable como estado y no como advertencia» — hecho a medias, y
la mitad que falta es por una razón y no por olvido.** `check` ahora lista lo concedido en el chat, que es
lo que no existía. Sigue saliendo como advertencia y no como estado aparte, porque la distinción que el
punto pedía —«la que quedó olvidada» contra «la que alguien dejó puesta con alcance»— **no se puede hacer
mientras el alcance no exista**: es el punto 2, y está en el 127. Distinguirlas hoy sería inventar una
categoría sin dato que la sostenga.

**Síntoma «la fricción no cae sobre el agente, cae sobre la persona»** — ya se había ido en 0.83.0 con el
116, y el propio caso lo registra. No se tocó nada de eso.

**Síntoma «la salida que queda a mano es la peor: apagar el guard por sesión»** — sin cambios acá. Lo que sí
cambió, y fue en 0.85.0 por el 124, es que los guards que no ofrecían ninguna salida angosta ahora la
ofrecen, que ataca la misma causa por el otro lado.

**Síntoma «el agente borra lo que la persona concedió»** — cerrado con el punto 3.

**«El aviso de `check` no se puede silenciar», y este cambio agrega un aviso más.** Es la objeción más
seria contra lo que acabo de hacer y por eso va dicha: el caso denuncia que el operador aprende a ignorar
las advertencias de `check`, y yo sumé una. Lo que las distingue es que la nueva **no se acumula**: lo
concedido vive en el registro de la sesión, así que desaparece cuando la sesión termina, mientras que una
línea olvidada en `.ops-approval` sigue ahí para siempre. Y no aparece en las corridas automáticas:
`said()` devuelve nada en CI, en un recorrido de Cauce y en un subagente, así que ahí no se concede nada y
no hay qué listar. O sea que el aviso nuevo sólo lo ve la persona que está conduciendo, sobre permisos que
ella misma acaba de dar. Silenciar el viejo sigue sin poder hacerse y sigue sin decidirse.

**Tradeoff «un permiso durable es menos estricto; se compensa con alcance explícito y visibilidad en
`check`»** — de las dos compensaciones se entregó una. La otra es el 127, y hasta que exista el permiso
sigue durando lo que dura la sesión.

**Tradeoff «la procedencia se puede falsificar si la escribe el proceso equivocado»** — no aplica todavía:
no hay procedencia. Cuando la haya, la escribe el hook del mensaje, y eso viaja al 127.

**Tradeoff «dos archivos en vez de uno es superficie nueva»** — no se pagó: este cambio no agrega ningún
archivo. `granted` ya existía desde el 116; lo único nuevo es que se lee desde `check`.

**«Contra 0.83.0», punto 1 — cerrado en su mitad de auditoría.** Aquella medición decía que `granted` «no se
ve: `ops check` no dice nada de lo concedido, mientras que por una sola línea en `.ops-approval` avisa».
Ahora avisa por las dos, desde el mismo lugar.

**«Contra 0.83.0», punto 2 —la forma deíctica y la persistencia— sin cambios.** «Usá ese archivo» sigue sin
resolverse, porque `mentions()` compara el nombre del ítem contra el texto. Es del 118 y del 127, no de
acá.

**«Contra 0.83.0», punto 3 — cerrado.** Era el punto 3 de arriba.

**Prioridad** — el caso la sostenía explícitamente en «una exención que vale por toda la sesión y que no
aparece en ninguna corrida de `check`». Eso es justamente lo que se cerró, y por eso el caso se cierra acá
y el resto baja a **baja** en el 127.

### Lo que apareció y el caso no preveía

**El registro de chat no sabía a qué instancia pertenecía.** Vive en el temporal del sistema, que es uno
solo por máquina, así que leerlo desde `check` sin más habría hecho que una instancia reportara las
exenciones de la de al lado — un aviso que dice algo falso, que es peor que no avisar. Hubo que anotar la
raíz en el registro para poder filtrar, y la prueba monta **dos** instancias justamente para fijar eso.

**Un registro viejo no trae la raíz y queda afuera a propósito.** Decir «concedido» sin saber dónde es lo
que el filtro existe para evitar, así que se calla en vez de adivinar.

### Qué se corrió

- **Rojo previo**, con el motor sin tocar: la concesión ocurría —`CHAT.unauthorized(...)` devolvía `[]`, o
  sea que el guard la dejaba pasar y la anotaba— y `check` no mostraba nada: `actual []`. Es el agujero de
  auditoría del caso, reproducido.
- **Verde**: `tests 2, pass 2, fail 0`, y la suite entera en **770 de 770** con `npm run ci` en 0. Que la
  puerta no se moviera importa acá más que de costumbre: `chat.js` lo consultan siete guards, y
  `test/wiring/hooks.test.js` quedó en **98 de 98**.
- **Mutaciones**, en copia desechable bajo el scratchpad de la sesión (R23), con la copia verificada verde
  antes de mutar:
  - que el registro deje de anotar la instancia → `pass 0, fail 1`;
  - quitar el filtro por instancia → `pass 0, fail 1`. Ésta es la que importa: sin ella el verde no diría
    nada sobre la mitad que evita el aviso falso, porque una lista sin filtrar también contiene la ruta
    correcta.
- **Los comentarios que se ajustaron después de esa corrida** se contrastaron contra la copia certificada:
  **0 líneas ejecutables** de diferencia en los dos archivos tocados, así que el verde sigue valiendo sin
  rehacerlo.
