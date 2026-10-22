---
caso: 430
titulo: ni el workflow ni el skill de autobuild saben que una tarea la revisa otra sesión, así que el programador se revisa y la cierra solo
estado: resuelto
resuelto-en: 0.114.0
prioridad: media
version-detectada: 0.113.2
---

# 430 — El traspaso programador → revisor de 0.112.0 está escrito y ningún `/autobuild` lo sigue

**🟢 resuelto en 0.114.0** · detectado en 0.113.2 · prioridad **media**. Un programador lanzado con el comando del recorrido se
revisa y cierra su propia tarea, en cualquier runner, salvo que el pedido lo contradiga a mano.

## Resumen

`teamwork.md:218-230` (desde 0.112.0, `deeefea1`) reparte una tarea entre quien construye y quien revisa: «Quien
construye reclama, escribe su plan en el WIP, construye y commitea, y ahí se detiene: deja el WIP en `phase: Review`».
`PROTOCOL.md:87-89` lo repite en el paso 12: «Si la tarea la revisa otra sesión, quien construye se detiene acá».

Ese commit tocó `PROTOCOL.md`, `teamwork.md`, `engine/cli/claims.js` y su prueba, y nada del recorrido:

- **Claude**: `automatization/workflows/autobuild.js` no tiene rol ni traspaso —ninguna mención de «otra sesión»,
  `teamwork` o un rol en todo el archivo—, así que `/autobuild` corre de Classify a Done.
- **Antigravity y Codex**: el skill (`automatization/shared/skills/autobuild/SKILL.md:8-9`) dice «Toma solamente la
  primera tarea aprobada, persiste el estado en WIP y ejecuta Build, Review, Verify y QA en orden». Manda a leer
  `PROTOCOL.md`, donde está la condición, pero no dice cómo saber si se cumple.
- **Gemini**: su comando propio (`automatization/runners/gemini/commands/cauce/autobuild.toml`) pide «el ciclo de
  autobuild fase por fase», igual sin rol.

Y la condición del paso 12 no se puede leer de ningún lado: ni la línea de la tarea, ni el WIP, ni `ops.config.json`
dicen que la revisa otra sesión. El `cast` nombra cargos, no sesiones. Hoy lo sabe sólo quien escribe el pedido.

## Reproducción

1. Instancia con una tarea promovida y el runner de Antigravity instalado.
2. `agy -p "/cauce:autobuild"` en la carpeta de sesión.
3. `agy` construye, revisa con su propio criterio, verifica, hace QA y escribe `done/<tarea>.md`: no queda nada para
   un revisor aparte.

No se corrió en esta revisión: sale de leer el skill y el workflow. Para Claude el mismo resultado se lee en el
recorrido, que no tiene una fase que se detenga antes de Done.

## Síntoma

En la instancia de origen no se dejó llegar a eso: cada pedido a `agy` agregó a mano «construye y commitea, deja el
WIP en `phase: Review` y PARA; no escribas en `done/`». Con eso `agy` 1.4.4 paró en Review en las cinco tareas del
release, pero la parada la sostiene el pedido de quien lo lanza, no Cauce.

## Causa raíz

El traspaso se agregó como documentación y como semántica de `release`, sin una forma de pedirlo: ni un argumento del
recorrido, ni un campo del WIP. `automatization/shared/skills/autobuild/SKILL.md:9` y `autobuild.js` siguen
describiendo el recorrido entero de una sola sesión, que era el modelo antes de 0.112.0.

## Fix propuesto

Que el recorrido lea un rol del pedido, igual que lee la línea (`/autobuild pagos --role build`), en los cuatro
runners: el workflow de Claude, el skill compartido y el comando de Gemini. Para `build`, «construye y commitea, deja
el WIP en `phase: Review` y detente»; para `review`, «toma la tarea por ese estado y juzga con lo que está en disco»,
con los dos cierres de `teamwork.md`. Sin rol, el recorrido entero de siempre.

**Decisión pendiente** antes de construir: qué hace `build` entre Build y Commit. `teamwork.md:223` dice «construye y
commitea» y nada más; `PROTOCOL.md` pone el alto en el paso 12, Commit, que viene **después** de Review (9), Verify
(10) y QA (11). Leídos juntos, el programador se revisa igual y después deja el WIP en `phase: Review` con una
revisión ya hecha. Lo razonable parece que `build` corra Verify —los gates son de quien commitea— y deje Review y QA
al revisor, pero eso cambia el texto de los dos documentos y no se decide desde el caso.

## Tradeoffs

- Un flag nuevo que `line-scope.js` tiene que tolerar en `FLOW` (`engine/hooks/line-scope.js:54`,
  `/^\s*[/$](?:cauce:)?autobuild(?![\w-])(.*)$/s`) sin confundirlo con el nombre de la línea.
- En Claude el rol pide fases nuevas en un workflow que ya está exento de la puerta de 500 líneas por crecer de a una
  fase (`test/repo/repo.test.js:156`): es justo esa razón, pero suma.
- Un agente puede ignorar un texto que el workflow de Claude impondría: en los runners sin workflow el rol es una
  instrucción, no una fase.

## Contexto de descubrimiento

Instancia de una empresa, línea `pagos` en modo release local, 2026-10-21: coordinación lanza `agy -p` como
programador y una sesión Claude aparte revisa, en cinco tareas.

## Relacionados

- 431 (en el mismo traspaso, el carril no llega a quien arma el pedido).
- 428 (en `agy` tampoco corren los guards del proyecto).

## Cierre

**Resuelto en 0.114.0**, a pedido del dueño el 2026-10-21. La decisión pendiente la tomó él: quien construye corre las
fases de su carril hasta Commit, salvo Review y QA, y quien revisa corre Review, Verify y QA y cierra.

El rol se pide con `--role build` o `--role review`, junto a la línea si la hay, en los cuatro runners:

- el recorrido de Claude, `automatization/workflows/autobuild.js` (`ROLE_FLAG`);
- el skill que comparten Antigravity y Codex, `automatization/shared/skills/autobuild/SKILL.md`;
- el comando de Gemini, que ahora además recibe `{{args}}`.

`PROTOCOL.md`, paso 12, y el traspaso de `teamwork.md` dicen lo mismo. Hay cuatro paradas nuevas en el vocabulario
(`engine/planning/stops.js` y `PROTOCOL.md`): `role-unknown`, `review-not-ready`, `review-pending` y `review-returned`.

El caso, sección por sección:

- **Resumen, «en Claude el traspaso lo ordena el workflow».** Era falso, y ahora sí: con `--role build` el recorrido
  saltea Review y QA y, después del commit, deja el WIP en `phase: Review` y para con `review-pending`. Comprueba que
  la fase quedó escrita releyendo el contexto, y si no quedó para con `wip-not-persisted`. No suelta la reserva ni
  escribe en `done/`.
- **Resumen, «la condición no se puede leer de ningún lado».** La lee el pedido, que es donde está. Con `--role
  review` el recorrido toma sólo una tarea con el WIP en `phase: Review` (`review-not-ready` si no la hay), no la
  reconstruye aunque quede un paso sin tildar, cita el commit de quien construyó en vez de commitear, y si no aprueba
  no corrige: anota los hallazgos en `## Bloqueos`, devuelve el WIP a `phase: Build` y para con `review-returned`.
- **Decisión pendiente.** Tomada. Quien construye corre Verify porque los gates son de quien commitea, y quien revisa
  los vuelve a correr, porque la evidencia de `done/` sale de la corrida que cierra.
- **Tradeoffs, `FLOW` de `line-scope.js`.** Recorrerlo encontró un defecto. `/autobuild pagos --role build` dejaba
  «pagos --role build» como el nombre de la línea, que no existe, así que la sesión quedaba anotada como la principal
  y los guards le cerraban los árboles de su propia línea. `line-scope` le saca ahora el rol (`ASKED_ROLE`), con la
  misma forma que el recorrido.
- **Tradeoffs, la excepción de 500 líneas.** No hizo falta: el rol corre dentro de las fases que ya había, y el `meta`
  del recorrido no cambió.
- **Tradeoffs, el agente que ignora el texto.** Fuera de Claude el rol es una instrucción. Las corridas reales de
  abajo muestran que `agy` lo sigue en los tres caminos; que todo runner lo siga siempre no se puede afirmar.
- **Encontrado de más.** Un `--role` mal escrito corría el recorrido entero, que es justo el programador revisándose
  solo: ahora para con `role-unknown` antes de gastar un agente. Y el prompt que transcribe el contexto no pedía
  `wip.phase`, que `ops context` ya emitía: sin eso la fase no llegaba al recorrido.
- **Encontrado de más, en la corrida real.** `agy`, al cerrar como revisora, borró el WIP en vez de dejarlo en
  `status: IDLE`. `check` pasa igual. Es conducta del agente y no de este cambio: el skill dice «limpiar», como antes.
- **Prioridad.** No traía condición de escalada.

**Lo que se corrió para saber que funciona.**

- `test/workflows/autobuild-roles.test.js`, nueva: contra el recorrido de HEAD da rojo en las seis. Ocho mutaciones
  en una copia fuera del árbol, con la copia en verde antes, se ponen rojas cada una en su prueba:
  - `build` revisándose, o haciendo QA;
  - `build` sin entregar;
  - `review` corrigiendo;
  - `review` tomando cualquier tarea;
  - `review` reconstruyendo; ésta sobrevivió a la primera versión, porque el WIP de la prueba tenía todos los pasos
    tildados, y se le sumó el caso de un paso sin tildar;
  - `review` commiteando;
  - el rol desconocido corriendo.
- `test/hooks/line-scope.test.js`, la aserción del rol. La primera vez se vio en rojo volviendo atrás el archivo en el
  árbol de trabajo con `git stash`, y no en una copia como pide R23. Se repitió en la copia: sin `ASKED_ROLE`, rojo.
- **`agy` 1.4.4 real**, en una instancia instalada fuera del árbol, con una tarea `lite` y `CAUCE_RUNNER` común:
  - `/cauce:autobuild --role build`: prueba en rojo, implementación, commit `8a05ab2`, WIP en `phase: Review`, nada en
    `done/` y el reclamo puesto. La primera corrida llegó al plazo de impresión de 9 min 40 s leyendo reglas y se
    retomó la misma conversación, que terminó el trabajo.
  - `/cauce:autobuild --role review`: revisó `8a05ab2`, corrió `npm test` y una mutación en una copia temporal
    (`a + b` → `a - b`, «-1 !== 5»), hizo QA por el camino del consumidor y cerró: `done/sumar.md`, la tarea fuera de
    la cola, el reclamo suelto y el estado de planning commiteado.
  - **La devolución**: una tarea entregada a mano con un defecto plantado (`Math.abs(a - b)`, y la prueba de
    `restar(3, 5)` faltante). La revisora no aprobó, anotó los dos hallazgos en `## Bloqueos`, dejó el WIP en
    `phase: Build` y no tocó el código ni el reclamo.
- **El recorrido de Claude real**, `claude -p '/autobuild --role build'`, en otra instancia igual. Paró en
  `review-pending` con el WIP en `phase: Review`, el commit `2ef0615` y nada en `done/`. El diario de la corrida
  (`journal.jsonl`) muestra Triage → Claim → Classify → Ready → Plan → WIP → Build → Verify → Commit, la escritura
  `handoff` y ninguna Review, QA ni Done. Siendo `lite`, tampoco Critique ni Decompose. USD 5,37.
- **El recorrido de Claude real como revisor**, `claude -p '/autobuild --role review'` sobre la misma instancia.
  El diario muestra Triage → Review → Verify → QA → Commit → Done → Closing, con `commit-found` en lugar de un commit
  propio, y ninguna llamada de Build ni de Claim. Cerró la tarea:
  - `done/sumar.md` cita `commit: 2ef0615… (app@feat/sumar)`, el de quien construyó;
  - el WIP quedó en `status: IDLE` y el reclamo suelto;
  - la revisión anotó la mutación `a - b` corrida en una copia, que hizo salir `npm test` con 1. USD 3,37.

**Lo que encontró la revisión del conjunto** (`/code-review high` sobre la rama, después de las corridas de arriba).
Seis huecos del rol, todos en el traspaso entre las dos sesiones, y ninguno visible en las corridas reales porque las
tareas eran chicas y aprobaban:

- **La devolución no volvía a construir.** Quien revisa dejaba los pasos tildados, así que la vuelta siguiente de quien
  construye se salteaba Build. Ahora la devolución agrega al plan un paso sin tildar —«Corregir los hallazgos de
  ## Bloqueos»—, y el recorrido no la da por devuelta si ese paso no quedó. En los runners sin recorrido, el skill le
  dice a quien construye que un WIP en `phase: Build` con hallazgos es una devolución y que los corrija.
- **Quien revisa miraba el árbol, que está limpio.** Ahora busca primero el commit de quien construyó (`Task: <id>`),
  la revisión recibe ese commit para mirarlo con `git show`, y sin commit para con `review-not-ready`.
- **Quien revisa escribía la prueba que faltaba**, que quedaba fuera de todo commit. Con un gate en rojo o un QA en
  rojo paraba sin avisarle a nadie. Las tres cosas ahora devuelven la tarea con el hallazgo.
- **`commitPerTask` apagado** dejaba la tarea trabada: quien construye decía «commiteada (?)» y quien revisa no
  encontraba commit nunca. Ahora una dice que no hay commit, y la otra revisa el árbol.
- **La evidencia de Build no cruzaba de sesión.** Las puertas que la leen —`verify-untested`, las mutaciones
  declaradas— no tenían nada que juzgar en la sesión que revisa. Ahora quien construye la deja en
  `## Evidencia de Build` del WIP, y quien revisa la lee de ahí.
- **Quien construye podía retomar una tarea ya entregada**, y terminaba en `commit-failed` sin nada que grabar. Ahora
  para con `review-pending`.

Y en `teamwork.md`, trabajar en paralelo con ids propios contradecía el rol. Ahora dice que quien revisa corre con el
id de quien construyó, y `review-not-ready` manda a `ops runners` para encontrarlo.

Cada uno tiene su aserción en `test/workflows/autobuild-roles.test.js`, que pasó de seis pruebas a nueve. Ocho
mutaciones en una copia fuera del árbol, una por arreglo, se ponen rojas.

**El lazo de devolución, de punta a punta con `agy` 1.4.4 real**, con el skill de estos arreglos reinstalado:

- sobre la tarea `restar` que la revisora anterior había devuelto, `/cauce:autobuild --role build` leyó los hallazgos
  de `## Bloqueos`, cambió `Math.abs(a - b)` por `a - b`, agregó la prueba de `restar(3, 5) === -2`, commiteó `c49d7be`
  y volvió a entregar en `phase: Review`;
- `/cauce:autobuild --role review` la aprobó, con la mutación inversa (`a - b` → `Math.abs(a - b)`, «2 !== -2») en una
  copia temporal, y la cerró: `done/restar.md` registra los dos commits, el reclamo quedó suelto y el estado de
  planning commiteado.

**La segunda pasada de revisión**, sobre los arreglos de arriba, encontró cinco más:

- Con los gates en rojo **y** una prueba faltante, quien revisa caía en el bucle que escribe pruebas antes de
  devolver. Ahora devuelve antes, con las dos cosas.
- Después de una devolución la tarea tiene dos commits, y la búsqueda traía sólo el último: se revisaba la corrección
  sin lo corregido y `done/` citaba la mitad. Ahora trae todos (`git log --reverse --grep='Task: <id>'`), la revisión
  mira cada uno y `done/` los cita separados por «; », cada uno con su sufijo, como pide R8.
- Cada entrega agregaba otra sección `## Evidencia de Build`. Ahora queda una sola, con lo de antes y lo nuevo.
- La evidencia de quien construyó que no se sostiene —un rojo sin su fallo, un borde cuya prueba no es ningún rojo, o
  pruebas declaradas que ningún gate corre— paraba con el WIP en `phase: Review`, que ninguno de los dos roles mueve.
  Ahora se devuelve.
- Un commit «encontrado» sin hash mandaba a revisar el árbol, que está limpio. Ahora para con `review-not-ready`.

Las paradas que quedan en `phase: Review` son las de quien revisa: un agente que no contesta, una revisión que no
nombra qué abrió, un Verify sin comandos. Ahí la revisión se reintenta, que es lo que corresponde. Cada arreglo tiene
su aserción —la suite quedó en once pruebas— y siete mutaciones en una copia se ponen rojas.

**El lazo en Gemini, el 2026-10-22.** El de arriba se corrió en `agy`; en Gemini sólo había una sesión `--role review`
devolviendo una tarea (la del caso 436). Sobre esa misma instancia, con la tarea devuelta, se corrió lo que faltaba:

- **`/cauce:autobuild --role build`**: tomó el WIP en `phase: Build` con su hallazgo en `## Bloqueos`, corrigió el
  divisor `'0'`, commiteó `d0370e1 fix: reject string zero divisor with RangeError` encima del original y dejó el WIP
  en `phase: Review`, sin escribir en `done/` ni soltar la reserva.
- **`/cauce:autobuild --role review`**: aprobó lo corregido, cerró `done/dividir.md` con `critique:` copiada del
  `## Crítica` del WIP tal cual, dejó el WIP en `status: IDLE`, soltó la reserva y `check` quedó sin errores.

Dos flojedades de Gemini en esa entrada, que `check` no marca. `commit:` trae también el commit del fixture, que no
lleva `Task: dividir`, además de los dos de la tarea. Y `review:` dice «aprobado por banco@cauce.local» en lugar de los
cargos que revisaron. Son de quien escribe la entrada, no del recorrido —el de Claude arma los dos con los hechos—, y
con una corrida no salen como caso.

**La revisión de la rama entera** encontró tres defectos más en los roles (`automatization/workflows/autobuild.js`).
Se revisaron tres veces, y dos de los arreglos cambiaron entre una pasada y la siguiente, así que cada uno cuenta su
recorrido:

- **Cómo encuentra quien revisa los commits de la tarea.** El `git log --grep='Task: <id>'` no estaba anclado:
  `Task: login` traía también los commits de `login-rate-limit`. La primera respuesta fue anclarlo; la segunda,
  escapar el slug, porque `check` acepta `t-1.2` y su punto encontraba `t-1x2`. La tercera pasada mostró que eso
  seguía roto: un slug con apóstrofo rompía las comillas del shell, y los caracteres de una regex extendida dependen de
  la configuración de git. Ahora el slug no entra al comando. Se lista el valor de cada trailer con `git log --reverse
  --format='%h %(trailers:key=Task,valueonly,separator=%x2C)'` y se comparan los valores con el id, exactos. Medido en
  un repositorio de prueba con git 2.43, sale cada commit con el valor exacto de su `Task:`, incluido
  `fix-user's-login`. La cuarta pasada mostró dos cosas de esa forma. Sin filtro, el log entero de un repositorio
  grande no entra en lo que el agente lee. Y un commit con dos `Task:` sale como `login,otra`, así que «exacto» lo
  perdía. Ahora git filtra con `-F --grep='Task: <id>'`, texto fijo, con el slug citado para el shell, y el valor se
  compara uno por uno entre los separados por coma. Medido igual: con `-F`, `t-1.2` se busca literal aunque git tenga
  `grep.patternType=extended`, `fix-user's-login` pasa citado, y el commit con dos tareas aparece.
- **Una corrida sin rol retomaba una tarea entregada.** Sólo `--role build` se negaba a tomar un WIP en
  `phase: Review`, y sin rol se lo trataba como una reanudación: revisaba un árbol limpio, sin el commit de quien la
  construyó. Ahora frena con `review-pending` salvo con `--role review`.
- **Qué devuelve quien revisa.** Devolvía todo veredicto que no fuera `aprobado`. Un `con-condiciones` sin nada
  bloqueante le dejaba a quien construye un paso sin nada que hacer, y ahora sigue como en una sesión sola. Con el
  `bloqueado` se fue y se volvió:
  - la primera versión lo hacía parar con `review-blocked`;
  - la segunda lo devolvía, para no dejar el WIP en `phase: Review`;
  - la tercera mostró que devolverlo era peor. Le pasaba a quien construye decisiones y sospechas sin comprobar como
    cosas a corregir, sin tope de vueltas, y una decisión nunca llegaba a una persona.

  Un `bloqueado` es «no puedo aprobar» por algo que este cambio no resuelve (R3). Ahora para, igual que en una sesión
  sola. El estado no queda trabado, como había supuesto la segunda pasada: `--role review` toma justamente las tareas
  en `phase: Review`, así que resuelto el bloqueo se vuelve a correr. Lo que faltaba era decirlo, y el mensaje de la
  parada ahora lo dice, con la otra salida: anotarlo en `## Bloqueos` y pasar el WIP a `phase: Build` si lo tiene que
  corregir quien la construyó.

También se renombraron dos nombres locales del bloque que entrega, `carried` y `handed`, que tapaban la función y la
variable de afuera. La duplicación de paradas que la revisión señaló se dejó como está (R6). La tercera pasada señaló
que el `bloqueado` quedaba repartido en dos ramas que dependían de su orden, y ahora es una sola.

Tres hallazgos se decidieron no cambiar:

- **Devolver el `bloqueado` cuando todos sus hallazgos son bloqueantes comprobados** (cuarta pasada). Un `bloqueado`
  dice que lo que falta no se resuelve en este cambio (R3). Un revisor que encuentra sólo cosas que quien construye
  puede corregir tiene `con-condiciones`, que sí se devuelve.
- **Sin rol ya no se retoma un WIP en `phase: Review` de una sesión sola** (segunda pasada). No pasa: ese estado sólo
  lo escribe la entrega de `--role build`. Ni el recorrido de una sesión, ni `PROTOCOL.md`, ni el skill lo piden fuera
  de los roles, y se buscó en los tres.
- **Quien revisa desde otro árbol o en otra rama no encuentra el commit** (primera pasada). Termina en
  `review-not-ready` con «no encontré el commit», que es el lado seguro, y el mensaje dice qué falta.

Las pruebas están en `test/workflows/autobuild-roles.test.js`:
- en «quien revisa juzga el commit de quien construyó…», la búsqueda por texto fijo y por el valor exacto del trailer,
  con un slug con apóstrofo;
- «una corrida sin rol no retoma una tarea entregada para revisar»;
- «quien revisa no devuelve lo que no bloquea, y una revisión bloqueada para diciendo cómo se retoma».

Sobre el código final se vieron en rojo, en una copia, cinco mutaciones:
- que el `bloqueado` no pare;
- que pare sin decir cómo se retoma;
- devolver lo que no bloquea;
- volver al `--grep`;
- y la corrida sin rol que retoma lo entregado.

En la segunda pasada, la mutación del `bloqueado` había sobrevivido una vez: el `bloqueado` de la prueba traía un
hallazgo bloqueante y se devolvía por él.

**La prueba real de la búsqueda final, el 2026-10-22.** Las corridas reales de arriba fueron antes de que las pasadas
cambiaran la búsqueda y el `bloqueado`. Se sembró una instancia fuera del árbol con la tarea `dividir` entregada en
`phase: Review` y tres commits en su rama: dos con `Task: dividir` (`fc40dd8`, `a505db1`) y, entre los dos, uno de
otra tarea de slug parecido, `78ad0d6` con `Task: dividir-entero`. Después se corrió `claude -p '/autobuild --role
review'`.

- **La primera corrida no llegó a buscar nada, y encontró otro defecto.** El `ops context` que corrió el recorrido
  devolvió `"blocked":""`, y el agente que lo copia al esquema contestó `"blocked":"awaiting-review"`. La corrida paró
  buscando un `AWAITING_REVIEW.md` que nunca existió (USD 0,79). El pedido nombraba uno por uno los campos a copiar y
  se olvidaba de dos obligatorios, `blocked` y `queued`, así que el agente los deducía. Con el WIP en `phase: Review`,
  dedujo «esperando revisión». El hueco es anterior a esta rama, pero los roles lo vuelven frecuente: `phase: Review`
  pasó de durar un instante a ser el estado de toda tarea entregada. Ahora el pedido manda a copiar los dos tal cual,
  sin deducirlos del WIP. Lo prueba «el pedido de contexto copia blocked y queued del comando, sin deducirlos», en
  `test/workflows/autobuild.test.js`, que estuvo en rojo sin el arreglo.
- **La segunda, con el arreglo, cerró la tarea** (USD 4,49):
  - `commit-found` devolvió `fc40dd8; a505db1` y dejó afuera `78ad0d6`;
  - `done/dividir.md` cita `commit: fc40dd8 (app@feat/dividir); a505db1 (app@feat/dividir)`, con la crítica copiada
    del WIP;
  - el WIP quedó en `status: IDLE`;
  - las lecturas del contexto durante la revisión llegaron con `blocked` vacío. La última, `awaiting-review`, es la
    del checkpoint que el recorrido escribe al cerrar la última tarea del hito.

  El revisor, además, marcó por su cuenta que `78ad0d6` iba en la misma rama sin revisar, y preguntó si se entregaba
  con su propia revisión o se sacaba.
