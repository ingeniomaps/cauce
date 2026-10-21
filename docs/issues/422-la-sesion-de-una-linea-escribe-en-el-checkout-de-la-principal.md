---
caso: 422
titulo: la sesión de una línea escribe en el checkout de la principal y ningún guard lo frena
estado: resuelto
resuelto-en: 0.113.0
prioridad: alta
version-detectada: 0.112.0
---

# 422 — Con su plan escrito, la sesión de una línea puede escribir en `app/` —el checkout de la principal— igual que en su árbol, directo o por el enlace a un vecino

**🟢 resuelto en 0.113.0** · detectado en 0.112.0 · prioridad **alta**. Una línea existe para que dos sesiones trabajen a la vez sin
pisarse (`teamwork.md`, «Una línea de trabajo»), y lo que lo garantiza es que cada una escriba en su árbol. Nada lo
comprueba: el aislamiento lo sostiene sólo que el agente se acuerde de dónde está.

## Resumen

`plan-first` (`engine/hooks/files.js:255-256`) sale en cuanto el WIP del runner tiene un plan: con `CAUCE_RUNNER` en el
id de la línea, ese WIP es el de la línea, y la escritura pasa **sea cual sea el archivo**. No mira si el destino está en
el árbol de la línea o en el checkout de siempre. `workspace-boundary` tampoco lo distingue: con la raíz en la carpeta de
sesión —la forma de casi toda instancia sidecar— los dos lados están adentro.

El checkout de la principal está en la rama de la principal, así que lo que la línea escribe ahí no viaja en su rama ni
en su PR, y le aparece a la otra sesión como cambio propio sin commitear.

## Reproducción

El 2026-10-20, sobre un banco `ops bench sidecar` con un segundo repositorio `shared-lib` en la carpeta de sesión y la raíz
`workspaceRoots: [{ name: "main", path: ".." }]`. `ops line . piloto app` armó `lines/piloto/app` y enlazó
`lines/piloto/shared-lib` al original. Con un hito `line: piloto`, `ops claim planning t-piloto --line piloto` y el plan en
el WIP de la línea, los grupos de guards como proceso con `CAUCE_RUNNER=<instancia>#line/piloto` y el `cwd` en el árbol:

```
1 Write en el árbol de la línea (lines/piloto/app/x.js)        → 0
2 Write por el enlace (lines/piloto/shared-lib/index.js)        → 0
3 Bash `echo y > ../shared-lib/index.js` desde el árbol         → 0
4 Write al checkout de la principal (shared-lib/index.js)       → 0
5 Write al checkout de la principal (app/x.js)                  → 0
```

Sólo la 1 es trabajo de la línea. La 5 es el mismo repositorio que la línea trabaja, en el checkout de la otra sesión.

## Causa raíz

`engine/hooks/files.js:255-256`, `planFirst`: `readWip(planning, runner())` con plan devuelve antes del recorrido por
archivo, que es donde `linePlan` (`:240-244`) sabe a qué árbol pertenece cada destino.

## Qué haría falta

- Que en una sesión con línea —`CAUCE_RUNNER` con `#line/<línea>`, o `--line`— una escritura en un repositorio que la línea
  trabaja caiga en su árbol, y que hacerlo en el checkout de siempre de ese repositorio se frene nombrando el árbol donde
  va.
- Decidir qué pasa con un repositorio que la línea **no** trabaja: si frenarlo también (la línea sólo escribe en sus
  árboles) o dejarlo como trabajo de la principal. Lo primero es lo que promete `teamwork.md`.
- Lo mismo por shell, donde `shell-boundary` resuelve destinos y hoy no sabe de líneas.
- El enlace a un vecino (la 2 y la 3) desaparece con el caso 420, que saca los enlaces de las líneas; lo que queda es la 4
  y la 5.

## Contexto de descubrimiento

Al revisar el caso 420, el 2026-10-20: medir si el enlace a un vecino abría una escritura al checkout ajeno mostró que el
checkout ajeno estaba abierto con o sin enlace.

## Relacionados

- 420 — los enlaces de una línea a los repositorios que no trabaja.
- 394 — la disposición de las líneas dentro de la carpeta de sesión.
- 411 — el id de la línea, que es el que `plan-first` lee.

## Cierre

**Resuelto en 0.113.0**, con el diseño que aprobó el dueño el 2026-10-21 («Avanza con ese diseño»). Al mejorar el caso
apareció algo que su reproducción no mostraba: la `CAUCE_RUNNER` con la línea la había puesto yo a mano. Una sesión real no
la tiene, porque se abre en la misma carpeta que la principal y `/autobuild <línea>` no exporta nada. Sin ella,
`plan-first` lee el WIP de la principal, y si la principal tiene un plan en curso —las dos trabajando a la vez, que es el
caso real— la escritura en `app/` también pasaba. Así que el hueco no era sólo de `plan-first`: ningún guard sabía qué
línea llevaba la sesión.

`engine/hooks/line-scope.js` lo resuelve en dos partes:

- **Qué línea lleva la sesión.** Primero `CAUCE_RUNNER` si trae `#line/<línea>`. Si no, lo que la sesión misma dijo,
  anotado por id de sesión (`remember`, que corre en `executeAll` antes de los guards, `engine/hooks/run.js:280`): el
  `/autobuild <línea>` que escribe la persona, o el `--line` de un `ops claim` u `ops worktree`. Un subagente lleva el id
  de la sesión que lo lanzó, así que el Build queda alcanzado. Volver a la principal lo dice sólo la persona, con
  `/autobuild` sin línea: un comando del agente puede anotar una línea y no sacarla. `context` no la cambia, porque mirar
  no es llevar, y un `--line` que no está declarado tampoco, porque `ops` lo rechaza.
- **Qué puede escribir.** Dentro de la carpeta de sesión, sus árboles y la instancia (`strayed`, `:80`), mirando la ruta
  escrita y adonde cae. Lo llaman `workspace-boundary` (`engine/hooks/files.js:320`) y `shell-boundary`, para lo que se
  escribe y para lo que se crea o se borra (`engine/hooks/shell.js:244` y `:267`). El bloqueo dice en qué árbol va
  cuando el archivo es del checkout de un repositorio de la línea, y cómo se suma otro repositorio. Afuera de la carpeta
  de sesión no decide nada y la sesión principal no tiene línea. Pasa lo que la persona nombra en el chat, o confirma
  después del bloqueo; un mensaje cualquiera no abre el límite.

**Lo que cambió la revisión del diff** (`/code-review`, 2026-10-21), con el diseño ya aprobado:

- La primera versión dejaba pasar todo el turno en cuanto la persona escribía cualquier cosa (`CHAT.said`, como
  `plan-first`). Un «seguí» apagaba el límite, y eso es justo lo que el caso cuida: el checkout de otra sesión. Ahora pasa
  lo que la aprobación cubre —lo nombrado o lo confirmado— y nada más.
- Un `claim` o un `worktree` sin `--line`, o un texto que los nombrara, le sacaba la línea a la sesión: el agente podía
  apagarse el límite solo. Ahora no la saca.
- La línea salía también del árbol donde estaba parada la sesión, y la principal que entraba a mirar el árbol de una línea
  pasaba a llevarla. Esa vía salió: sin reclamo no hay tarea de la línea, y el reclamo ya la anota.
- `CAUCE_RUNNER` se lee recortado, como en `runner()`: con un espacio de más la línea no coincidía y el límite se apagaba.
- `ops worktree --line` se niega con una tarea que no es de la línea, con el mismo filtro que `claim`: armarle el árbol le
  sumaba su repositorio a la línea (caso 421), y así el agente se ensanchaba dónde escribe sin que nadie lo aprobara.
- Lo que cambian los comandos de git sobre otro checkout —`git -C <sesión>/app switch`, `stash`— no lo ve este guard, que
  mira destinos de escritura: salió como el caso 423, medido, y se resolvió en esta misma versión.

Una segunda pasada, sobre lo que arregló la primera:

- Un comando con otra línea —`ops worktree --line otra`— se la cambiaba a la sesión, y le abría los árboles de otra. Ahora
  un comando sólo le anota línea a la sesión que no tiene ninguna; cambiarla es de la persona, con `/autobuild`. Y tiene
  que ser `ops` corriendo (`node …ops.js` o `npm run ops --`), no un texto que lo cita, como un `grep`.
- El mensaje se lee con las mismas reglas que `autobuild` (`LINE_FLAG`, `MAX_FLAG`): con `/autobuild piloto --foo bar`
  la corrida es la principal, y el guard la leía como línea y la frenaba.
- El filtro de hito de `ops worktree` vale para toda sesión, como en `claim`, y no sólo con `--line`.

Una tercera pasada, sobre lo que arreglaron las dos primeras y el 423:

- El bloqueo decía que la confirmación «sigue valiendo en los mensajes siguientes», y la aprobación que mira dura el turno:
  la confirmación de la persona se perdía en el mensaje siguiente y se leía como que el guard se olvidaba, que es lo que el
  370 había sacado de los otros guards de límites. Ahora el bloqueo dice «vale para este turno».
- El comando de `ops` se reconoce por palabras de shell y por tramo, no con una expresión sobre el texto: `node …/ops.js`,
  el script directo, el `bin` del paquete (`npx cauce`) y `npm run ops --`, con `--line x` o `--line=x`. Antes sólo las dos
  primeras, y con `npx cauce claim --line pagos` la sesión no aprendía la línea que el reclamo sí tomaba.
- Lo que la llamada sabe de la línea se resuelve una vez por llamada, no una por destino.
- Se decidió que no: que una sesión principal que corre `claim` o `worktree` con `--line` quede llevando la línea. Decir
  `--line` en `claim` es decir qué línea se lleva —`teamwork.md` lo dice así—, y volver a la principal es `/autobuild`.

**Lo que se decidió no cubrir**, por la misma razón por la que ningún guard es un límite de seguridad (`chat.js`, en su
encabezado): frena la forma habitual de equivocarse, no a un agente que decide saltarlo. La revisión los señaló, y así
quedan dichos:

- El registro de la línea vive en el temporal, como el del chat, y el temporal no lo cuida ningún guard: borrarlo le saca
  la línea a la sesión.
- Sacar la línea de `ops.config.json`, cambiar `mode` o sumarle un repositorio no pide confirmación. Y el agente puede
  correr `ops line . piloto <repo>`, que lo hace igual; cuidar la edición del archivo y no el comando no cuidaría nada.
- Cambiarle el `service:` a una tarea de la línea suma otro repositorio la próxima vez que pida su árbol.

Los tres son escrituras deliberadas sobre lo que define el límite, no escribir en el checkout equivocado, que es lo que
este caso midió.

El enunciado, ítem por ítem:

- **Que una escritura en un repositorio de la línea caiga en su árbol, y en el checkout de siempre se frene nombrando el
  árbol**: se hizo. El mensaje es «<sesión>/app/x.js va en el árbol de la línea: <sesión>/lines/piloto/app/x.js».
- **Decidir qué pasa con un repositorio que la línea no trabaja**: se decidió frenarlo, que es lo que promete
  `teamwork.md`. También el árbol de otra línea y lo suelto en la carpeta de sesión. El bloqueo dice cómo se suma el
  repositorio a la línea, y desde el caso 421 una tarea de la línea lo suma sola al pedir su árbol.
- **Lo mismo por shell**: se hizo, en `shell-boundary`, incluidos `rm` y `mkdir`.
- **El enlace a un vecino desaparece con el 420**: sí. La 2 de la reproducción ya no existe, y la 3 —un `echo` por ruta
  relativa al checkout del vecino— ahora frena.

`plan-first` no se tocó. Lo que el caso le atribuía —que no mira en qué árbol cae el archivo— no es suyo: su pregunta es
si hay plan, y dónde puede escribir una sesión lo contestan los guards de límites.

**Lo que se corrió para saber que funciona.**

- `test/hooks/line-scope.test.js`, tres pruebas: lo que la sesión de una línea puede escribir y lo que no, por archivo y por
  shell, con la principal sin cambios; de dónde sale la línea (lo dicho, `CAUCE_RUNNER` con un espacio de más) y de dónde
  no (un comando sin `--line` o con otra línea, un `grep` que cita `ops`, un `/autobuild` que `autobuild` no lee como línea,
  la carpeta donde está parada), con un `--line piloto; echo` como lo escribió un agente real;
  y que un «dale, seguí» no abre el límite, que confirmar el bloqueo sí —también al subagente que reintenta— y que lo
  nombrado con su ruta pasa.
- Mutaciones en una copia fuera del árbol. La primera tanda, quince, sobre el diseño de antes de la revisión; cuatro
  sobrevivieron primero, tres por pruebas que no podían verlas y una porque un `--line` no declarado borraba la línea, y se
  corrigieron. La segunda, dieciocho sobre lo que quedó, todas en rojo: que un mensaje cualquiera abra el turno; que pase
  sin confirmar; que un comando sin `--line` la saque y que `/autobuild` solo no la saque; anotarla con `context` o con
  un `--line` no declarado; exigir espacio tras el nombre; no recortar `CAUCE_RUNNER`; que cuente la carpeta donde está
  parada; sin anotar; sin el freno de archivos o el de shell; dejar pasar el árbol de otra línea; no leer el `sessionId`
  de agy, y que `ops worktree --line` tome una tarea ajena, calle los avisos o cambie el código de error. La tercera, ocho
  sobre la segunda pasada, todas en rojo: que un comando cambie de línea, que citar `ops` cuente, que el mensaje se lea con
  otras reglas que `autobuild`, que la principal arme el árbol de una tarea ajena y que el enlace se sume con `..`; y del
  419, ignorar el filtro, ignorar `core.fsmonitor` y un mensaje que no nombra el hook. La cuarta, sobre la tercera pasada,
  todas en rojo: que `node …/ops.js`, `npx cauce` o `--line=x` no anoten la línea, y que el bloqueo prometa que la
  confirmación dura más que el turno.
- La reproducción del caso, con los guards como proceso sobre un banco `ops bench sidecar` con `shared-lib`, la sesión como
  raíz y planes en las dos sesiones, sin `CAUCE_RUNNER` y con la línea dicha por `/autobuild piloto`: el árbol, 0; el `echo`
  a `../../../shared-lib`, 2; el checkout de `shared-lib`, 2; el de `app`, 2; el planning de la instancia, 0; la sesión
  principal en `app`, 0.
- Dos sesiones reales de Claude Code (`claude -p`) sobre una copia del banco en `/var/tmp`, con un subagente que escribía
  en el árbol y en `app/`. La primera (USD 0,94) encontró un defecto propio: el agente corrió `--line piloto; echo
  "exit=$?"`, el patrón exigía un espacio después del nombre y la sesión quedó sin línea. La frenó `plan-first` sólo
  porque la principal no tenía plan. Corregido, y con su mutación. En la segunda (USD 0,37), con plan en las dos, el árbol
  quedó escrito y `app/piloto.js` no existe. El bloqueo que recibió el subagente fue «esta sesión lleva la línea piloto, y
  escribe sólo en sus árboles (lines/piloto/…) y en la instancia: /var/tmp/w422/app/piloto.js va en el árbol de la línea:
  /var/tmp/w422/lines/piloto/app/piloto.js».

- Antigravity, que el primer cierre no había mirado. Su puente manda el id de la sesión como `sessionId`
  (`automatization/runners/antigravity/hook.js:139`), y el módulo leía sólo `session_id`, así que en agy la línea no se
  anotaba nunca. Ahora lee los dos nombres. La prueba lo ejerce con la forma de agy, y quitarlo la pone en rojo. Corrido
  por el puente instalado (`automation install . antigravity`) sobre una copia del banco, con entradas de la forma de agy:
  el `claim --line piloto; echo ok` quedó anotado; la escritura en `app/x.js` salió `deny`, con el mensaje de la línea;
  la del árbol, `allow`, y la de otra conversación en `app/`, `allow`. El puente no pasa los mensajes de la persona, así
  que en agy la línea se aprende del `--line` de `claim` o `worktree`, que es lo que corre `/cauce:autobuild`.
- Una sesión real de cada uno de los otros tres runners, el 2026-10-21, sobre un banco instalado en `/var/tmp` con la
  línea `piloto` vacía y planes en las dos sesiones: Gemini 0.63.0 (`gemini -p --yolo`), Antigravity 1.4.3 (`agy -p
  --dangerously-skip-permissions`) y Codex 0.162.1 (`codex exec -m gpt-6-luna`). Los pasos venían en un archivo del banco
  y no en el pedido, que si nombraba las rutas las aprobaba por el chat. En los tres: `ops worktree --line piloto` sumó
  `app` a la línea y anotó la línea con el id de la sesión del runner —el `session_id` de Gemini y de Codex, el
  `conversationId` de agy—; escribir en `lines/piloto/app` pasó; escribir `app/piloto.js` y `git -C app switch -c tmp` se
  frenaron con «esta sesión lleva la línea piloto…», y `app` quedó en `master`, sin `piloto.js`. `git -C app status` pasó
  en agy y en Codex. En Gemini lo negó Gemini mismo, «Tool execution denied by policy», no un guard: repetido por el shim
  con la sesión de la línea dio exit 0, y en una sesión nueva de Gemini corrió.

- Una corrida real de `/autobuild piloto` (`claude -p`, USD 6,77), sobre un banco instalado en `/var/tmp` con la línea
  `piloto` vacía, un hito de la línea con una tarea `lite` sobre `app` y la sesión principal con su tarea en vuelo. La
  línea salió del mensaje: el registro de la sesión se escribió a las 13:46:58.033Z, en el mismo instante en que llegó
  `/autobuild piloto` (13:46:58.069Z), y 43 segundos antes del primer `claim --line piloto`. `ops worktree --line` le sumó
  `app` a la línea vacía, la tarea se construyó en `lines/piloto/app` —commit `2af133e` en `line/piloto`, con
  `src/piloto.js` y su prueba— y el checkout `app/` de la principal quedó en su commit de antes, sin `piloto.js`. Ningún
  agente del recorrido chocó con un bloqueo: cero falsos positivos en una corrida entera.

**Lo que queda dicho y no comprobado por un guard:** la línea se aprende de lo que la sesión dice. Una sesión de línea
que escribe antes de correr `/autobuild`, `claim` o `worktree`, y sin `CAUCE_RUNNER`, juzga como la principal —también
parada en su árbol—. Es la misma premisa con que `plan-first` le pide el plan: sin reclamo no hay tarea de la línea.
