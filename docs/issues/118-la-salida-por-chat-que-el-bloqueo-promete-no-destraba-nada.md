---
caso: 118
titulo: La salida por chat que el bloqueo promete no destraba nada, y desde 0.81 no queda ninguna otra que el agente pueda tomar
estado: resuelto
resuelto-en: 0.83.0
prioridad: media
version-detectada: 0.81.0
---

# 118 — `secrets-shell` enseña «contestá "dale" y reintentá», y reintentar vuelve a frenarse

**🟢 resuelto en 0.83.0** · detectado en 0.81.0 · prioridad **media** —bajada de alta el 2026-09-11, ver
«Contra 0.83.0»— las cuatro vueltas de la sesión real pasan hoy, y un bloqueo dejó de ofrecer para pegar
una ruta que el shell no expandió

## Resumen

`secrets-shell` frena un comando que carga una identidad declarada y ofrece tres salidas, en este orden:

```
Decile a la persona qué se frenó y por qué, y esperá: si contesta «dale», reintentá el mismo cambio y pasa.
Si prefiere aprobarlo a mano, que pegue ella tal cual en venotal-ops/planning/.ops-approval estas líneas:
  …/venotal/venotal-ops/.env.infisical
Valen para ese conjunto y dejan de valer en cuanto cambie. La variable OPS_SECRETS_READ_OVERRIDE=1 …
```

**La primera no funciona.** Se intentó tres veces en una sesión real, con tres formas distintas de
autorización, y las tres volvieron a frenarse con el mismo mensaje.

Y en la misma versión se cerró la única salida que el agente podía tomar por su cuenta: escribir
`planning/.ops-approval`. Entonces, cuando el chat falla, **la operación se detiene hasta que una persona
edite un archivo oculto a mano** — incluso cuando esa persona ya dijo tres veces que sí.

## Reproducción

Instancia sidecar real, 0.81.0, runner Claude Code. El operador quiere que el agente cargue valores en
Infisical usando la identidad declarada en `venotal-ops/.env.infisical`.

| # | Qué dijo la persona en el chat | Qué hizo el agente | Resultado |
|---|---|---|---|
| 1 | «autorizo la lectura del .env.infisical para que llenes todos los campos…» | el comando, con la ruta en una variable de shell | **frenado**, y el mensaje citó la ruta **sin expandir**: `venotal-ops/$O/.env.infisical` |
| 2 | (la misma autorización seguía en pie) | el mismo comando con la ruta absoluta literal | **frenado** |
| 3 | «dale» | el mismo comando, sin cambios | **frenado** |
| 4 | «te doy aprobacion para revisar y usar …/venotal/venotal-ops/.env.infisical» | el mismo comando | **frenado** |

Recién la quinta vuelta pasó, y porque el operador pegó la línea a mano en `.ops-approval`.

El mismo día, el mismo guard volvió a frenar la lectura de `platform/.env.bak` después de un «te doy
permiso» que nombraba el archivo: la aprobación puesta cubría `.env.infisical` y nada más.

## Síntoma

**Un bloqueo que enseña una salida inexistente es peor que uno que no ofrece ninguna.** Quien la sigue
concluye una de dos cosas, y las dos son malas: que el guard está roto, o que hay que apagarlo con
`OPS_SECRETS_READ_OVERRIDE=1` —la salida por sesión, justamente la que la aprobación por ruta vino a
evitar—.

El costo se mide en vueltas: cinco mensajes del operador para una lectura que él había autorizado en el
primero. Sus palabras, textuales: «si te estoy diciendo que hagas una y otra vez esa exigencia nos esta
trabando demasiado».

Y hay un agravante de forma: en el intento 1 el mensaje imprimió la ruta **tal como aparecía en el
comando**, con la variable sin expandir. Si el operador hubiera pegado esa línea, no habría coincidido con
nada y el bloqueo habría seguido, sin que nada explicara por qué.

## Causa raíz

No es wiring: el hook está registrado y el shim es correcto.

- `…/venotal/.claude/settings.json:51-56` registra `UserPromptSubmit` →
  `automatization/hooks/guard-chat.sh`.
- `guard-chat.sh` delega en `run-hook.sh chat`, descarta su salida y **sale siempre con 0**, que es lo
  documentado: sobre el mensaje de una persona un 2 no tendría a qué frenar.

O sea que el mensaje se procesa y la autorización no llega al guard que la necesita. Falta establecer con
qué clave se guarda y con cuál se busca.

**La hipótesis que este caso traía queda descartada.** Decía, marcada como no verificada, que la clave era
el id de runner —derivado de la raíz git del directorio desde el que corre el hook,
`engine/planning/claims.js:53-57`—, y que en una sesión ese directorio se mueve entre la instancia, el repo
de producto y la raíz del workspace. Verificado el 2026-09-11 contra el código de hoy: `chat.js` guarda y
busca **sólo** por `session_id` —`recordPath()` arma el nombre del archivo con él, `record()` no escribe si
falta (`engine/hooks/chat.js:127-139`) y `said()` carga con el mismo id
(`engine/hooks/chat.js:146-152`)—, y el módulo no menciona `runner()` ni git: sus únicos `require` son
`fs`, `os` y `path`. Alternando el `cwd` entre el workspace y la instancia dentro de una misma sesión, las
tres llamadas pasan. Lo que sí había mordido en esa sesión —el WIP escrito a nombre de un id que
`plan-first` veía en IDLE— es real y es de otra pieza: los reclamos sí se guardan por runner, el chat no.

**Lo que queda en pie es el vocabulario de verbos.** `mentions()` exige que la frase que nombra el archivo
traiga un verbo de una lista cerrada (`engine/hooks/chat.js:56-71`), y ni `autorizo`, ni `autorización`, ni
`lectura` están en esa lista, aunque sí estén `revisar`, `usar`, `leer` y `aprobar`. Por eso dos mensajes
que autorizan lo mismo se comportan distinto según con qué palabra lo digan; el detalle medido está en
«Contra 0.83.0».

## Fix propuesto

1. **Que la autorización por chat no dependa del directorio.** Si se guarda por runner, que el id se
   resuelva una sola vez por sesión y no por invocación; si se guarda por sesión, que la clave sea la
   sesión. Lo que no puede es depender de dónde estaba el `cd` cuando llegó el mensaje.
2. **Que el mensaje imprima la ruta resuelta**, no el texto tal como venía en el comando. Una línea con
   `$VAR` sin expandir no sirve para aprobar y manda a la persona a pegar algo que no va a coincidir.
3. **Que el bloqueo diga cuándo la salida por chat no está disponible.** En un runner sin hook de prompt
   —o si la señal no llegó— la primera opción no debería ofrecerse: mejor dos salidas ciertas que tres con
   una que falla.
4. **Y que exista una salida que el agente pueda tomar con la autorización de la persona**, sin
   convertirse en aprobarse solo. Eso es el caso **117**: el problema no es el permiso, es la procedencia.

## Tradeoffs

- Arreglar 1 toca cómo se identifica una sesión, que es la misma pieza de la que dependen el WIP y los
  reclamos: se gana coherencia, pero hay que mirar los tres a la vez.
- 3 hace el mensaje más largo y condicional. Vale la pena: hoy su primera línea es la que más tiempo hace
  perder.

## Contexto de descubrimiento

Instancia real (sidecar, 0.81.0), 2026-09-11/12, armando el contrato de secretos de un proyecto con
Infisical. La actualización a 0.81 ocurrió **en el medio** de ese trabajo: antes del upgrade el mismo
comando pasaba —el guard de lectura por shell no existía— y después del upgrade se frenó cuatro veces.
Eso hace la comparación limpia: no cambió el comando, cambió la versión.

## Contra 0.83.0

Medido el 2026-09-11 sobre el código de hoy —0.82.0 publicada, 0.83.0 lista y sin publicar—, en un banco
sidecar y aislando cada mensaje real de la sesión en una sesión de guards propia. **Es una medición, no un
cierre: el caso sigue abierto.**

**Cubierto — la autorización ya no caduca al mensaje siguiente.** La concesión que 0.83.0 agregó por el
**116** alcanza a `secrets-shell` y a una identidad declarada en `organization/secrets.json`: el `cat` de
la identidad se frena, la persona la pide, pasa, y **sigue pasando después de un mensaje cualquiera**. Las
vueltas 2 y 3 de la tabla de la reproducción —«la misma autorización seguía en pie» y el «dale»— dejan de
repetirse por esa causa.

**Parcial — la salida por chat funciona hoy sólo para algunos textos.** Cada mensaje real, aislado:

| Mensaje de la sesión real | Hoy |
|---|---|
| «te doy aprobacion para revisar y usar `<ruta>`» | **pasa** |
| «te doy permiso para leer X» | **pasa** |
| «dale» | **pasa** |
| «autorizo la lectura del .env.infisical para que llenes…» | **se frena** |

Lo que separa las dos filas **no es la autorización sino el verbo**: las tres que pasan traen uno de la
lista cerrada de `engine/hooks/chat.js:56-71` —`revisar`/`usar`, `leer`, y el «dale» que entra por `YES`—,
y la que se frena está escrita con `autorizo` y `lectura`, que no están. Dos de las cuatro vueltas de la
sesión real —la 1 y la 2, que se apoyaban en ese mismo texto— se seguirían frenando hoy.

**Estado de «Fix propuesto», punto por punto:**

1. **«Que la autorización por chat no dependa del directorio»** — ya no aplica: su premisa quedó refutada,
   ver «Causa raíz».
2. **«Que el mensaje imprima la ruta resuelta»** — **sigue vivo**, tal cual: el bloqueo de la vuelta 1 citó
   `…/venotal-ops/$O/.env.infisical`, con la variable sin expandir, y nada de 0.82.0 ni de 0.83.0 tocó eso.
3. **«Que el bloqueo diga cuándo la salida por chat no está disponible»** — cubierto.
4. **«Una salida que el agente pueda tomar»** — es el **117**, que sigue abierto y también parcialmente
   cubierto.

**Prioridad: baja de alta a media.** Lo que la sostenía era que «el bloqueo enseña una salida que no
funciona», y hoy esa salida funciona para la mayoría de los textos y para el «dale» que el propio mensaje
enseña, así que ya no manda a nadie a editar un archivo a mano por sesión entera. Lo que queda —un texto
que autoriza con las palabras equivocadas se frena igual, y sin nada que explique por qué— sigue costando
vueltas y sigue empujando a `OPS_SECRETS_READ_OVERRIDE=1`, que es lo que la mantiene arriba de baja.

## Relacionados

- **117** — la contraparte: no hay forma de registrar una autorización que la persona ya dio, ni de
  conceder algo con alcance. Si 117 se resuelve, este caso deja de ser bloqueante aunque el chat siga sin
  funcionar.
- **116** — «una autorización del chat no sobrevive al mensaje siguiente», resuelto en 0.83.0. Es lo que
  cubre la mitad de este caso: sin él, lo autorizado se perdía al mensaje siguiente aunque el verbo se
  reconociera. Ojo con el número: este caso llegó a escribirse como 116 y se renumeró a 118; el 116 de hoy
  es ése y no éste.
- **089** — misma familia: una salida angosta que no destrababa porque la ruta no coincidía en la forma.
- **120** — salió de acá: la negación contraída en inglés («doesn't», «isn't», «can't») no se reconoce.

## Cierre

**🟢 resuelto en 0.83.0** · `engine/hooks/chat.js`, `engine/hooks/approval.js`,
`engine/hooks/secrets-shell.js`, `test/wiring/hooks.test.js`

### Contra lo que el caso enumeró

- **Resumen, «la primera salida no funciona»** — cerrado por el vocabulario: los cuatro mensajes reales de
  la tabla pasan hoy, cada uno aislado en su propia sesión de guards. La salida está abajo.
- **Resumen, «se cerró la única salida que el agente podía tomar»** — no se tocó: es el **117**, que sigue
  abierto. Este caso no le abre ninguna vía al agente; lo que arregla es que la de la persona funcione.
- **Reproducción, vueltas 1 y 2** — pasan. Las dos se apoyaban en «autorizo la lectura del .env.infisical
  para que llenes…», que era el texto que el verbo no reconocía.
- **Reproducción, vueltas 3 y 4** — ya pasaban contra 0.83.0 y se volvieron a correr acá: siguen pasando.
  El «dale» se midió como lo que es, la respuesta a un bloqueo que quedó pendiente, y no un mensaje suelto.
- **Reproducción, el `platform/.env.bak` del mismo día** — se miró y **no** es un defecto propio: «te doy
  permiso para leer X» ya autorizaba, y lo que ese párrafo describe —una aprobación puesta a mano cubre el
  conjunto que nombra y nada más— es el alcance por diseño que el 089 dejó escrito. Hoy la vía que lo
  destraba sin editar nada es el chat, y esa fila está medida abajo.
- **Síntoma, «el bloqueo enseña una salida inexistente»** — cerrado para el vocabulario, que era la causa
  medida.
- **Síntoma, el agravante de forma** —la ruta impresa sin expandir— **cerrado, y distinto de como el caso
  lo pedía**: ver «Fix propuesto 2».
- **Causa raíz, «lo que queda en pie es el vocabulario de verbos»** — cerrado. El criterio con que se
  eligió cada palabra está escrito en `chat.js`, donde nació: entran las formas con que una persona
  **concede** —primera persona e imperativo, en español y en inglés— y quedan afuera los sustantivos que
  nombran el acto (`lectura`, `permiso`, `autorizacion`), porque aparecen igual en una pregunta que no
  autoriza nada. Eso es exactamente lo que el **109** decidió y este caso no reabre: se comprobó que los
  tres sustantivos y las preguntas del 109 siguen frenando.
- **Causa raíz, la hipótesis del id de runner** — ya estaba descartada y verificada en «Contra 0.83.0»; no
  se tocó ni `claims.js` ni nada de sesión.
- **Fix propuesto 1, «que la autorización no dependa del directorio»** — no aplica: su premisa quedó
  refutada antes de este arreglo, y así está declarado en «Contra 0.83.0».
- **Fix propuesto 2, «que el mensaje imprima la ruta resuelta»** — **se hizo distinto, con la razón**: no se
  puede resolver. La variable la expande el shell de la sesión, que es otro proceso; el hook nunca la ve.
  Entonces no hay ninguna ruta resuelta que imprimir, y lo que se hizo es lo que sí cierra el daño: el
  bloqueo **deja de ofrecer esa línea para pegar** y dice por qué —la aprobación compara texto, así que esa
  línea sólo valdría para un comando escrito igual— y qué hacer: correrlo con la ruta escrita, y ahí el
  bloqueo vuelve a decir qué pegar. La salida por chat no se pierde: lo frenado se sigue anotando y un
  «dale» lo aprueba igual, lo que se comprobó con una mutación propia (M7).
- **Fix propuesto 3, «que el bloqueo diga cuándo la salida por chat no está disponible»** — ya estaba
  cubierto y se volvió a observar en esta corrida: sin sesión de chat el mensaje no ofrece el «dale», dice
  «Aprobalo pegando tal cual…» y nada más. No se tocó.
- **Fix propuesto 4, «una salida que el agente pueda tomar»** — es el **117**, abierto y fuera de alcance.
- **Tradeoff «arreglar 1 toca cómo se identifica una sesión»** — queda sin efecto, porque el punto 1 no
  aplica. No se tocó el WIP, ni los reclamos, ni la clave de sesión.
- **Tradeoff «3 hace el mensaje más largo y condicional»** — se cumple, y ahora también por el punto 2: el
  mensaje crece cuando hay algo que no se puede pegar. La salida completa está abajo; vale la pena por lo
  mismo que decía el caso.
- **Prioridad** — la condición que la sostenía en media («un texto que autoriza con las palabras
  equivocadas se frena igual, y sin nada que explique por qué») queda cerrada por las dos mitades: el texto
  ya no se frena, y cuando algo se frena sin línea que pegar el mensaje explica por qué. Con eso se va
  también el empuje hacia `OPS_SECRETS_READ_OVERRIDE=1`.
- **«Contra 0.83.0», la tabla de los cuatro mensajes** — las cuatro filas pasan; era la enumeración más
  reciente del caso y es la que se volvió a correr entera.
- **«Contra 0.83.0», lo declarado como cubierto** (la concesión del **116**) — no se tocó, y se volvió a
  ejercer: la prueba nueva depende de que lo concedido sobreviva al mensaje siguiente.
- **Relacionados** — **117** sigue abierto; **116** se respetó y su herencia apareció como trampa en la
  prueba (abajo); del **089** se conserva la propiedad que perseguía y la prueba nueva la vuelve a medir.

### Lo que el caso no preveía

- **`${VAR}` era peor que `$VAR`.** La separación de palabras corta en el `{`, así que
  `cat ops/${O}/.env.infisical` dejaba suelto `/.env.infisical`: una ruta **absoluta**, en la raíz del
  sistema de archivos, que el comando no lee y que el bloqueo ofrecía aprobar. El caso sólo había visto la
  forma sin llaves. Se cerró sacando las llaves antes de separar, y la mutación M3 lo cuida.
- **La prueba del vocabulario pasaba diga lo que diga la lista.** Escrita con una sola sesión de chat para
  todos los mensajes, el primero que autoriza deja pasar a los demás por la concesión del **116**: la
  prueba quedaba verde aunque ninguna palabra nueva existiera. Se vio porque un mensaje que tenía que
  frenar pasó. Ahora cada mensaje abre su propia sesión, y por eso el rojo previo es real.
- **Las palabras nuevas no abren una clase de falso positivo, extienden una que ya estaba.** Medido sobre
  el motor **base**: una pregunta con un verbo que ya estaba en la lista —«¿quién lee el .env?», «¿alguien
  revisa el .env?», «does this use the .env?»— ya autorizaba. O sea que el tradeoff del 109 («un verbo en
  la frase no garantiza que pida esa acción») sigue valiendo tal cual, ni mejor ni peor.
- **La negación contraída en inglés no se reconoce**, y eso **no** lo trajo este cambio: «the tool doesn't
  read the .env» autoriza igual que «the tool doesn't allow the .env», con un verbo viejo y con uno nuevo.
  No se arregló acá porque toca a toda la lista y a todos los guards que pasan por `mentions`, que es otra
  decisión: salió como caso **120**.

### Qué se corrió

Todo en bancos desechables bajo el scratchpad de la sesión, invocando los guards por
`engine/hooks/run.js`. Las rutas van abreviadas como `<banco>`.

- **Los cuatro mensajes reales, antes y después** —cada uno en su propia sesión, contra
  `cat <banco>/.env.infisical`—:

  ```
  antes (base = 208e2fd1)              después
  PASA   «te doy aprobacion para revisar y usar <banco>/.env.infisical»        PASA
  PASA   «te doy permiso para leer .env.infisical»                             PASA
  frena  «autorizo la lectura del .env.infisical para que llenes…»             PASA
  PASA   «dale» (tras un bloqueo pendiente)                                    PASA
  ```

  Y las formas vecinas que también se midieron: «autorizá la lectura del .env.infisical», «te autorizo a
  que uses .env.infisical», «permito que se lea el .env.infisical» y «apruebo el acceso al .env.infisical»
  frenaban las cuatro y pasan las cuatro.
- **Los controles del 109, en la misma corrida**: «¿para qué sirven las credentials?», «¿qué tiene el
  .env.infisical?» y «el .env.infisical tiene algo raro? no sé» frenan antes y después. Lo mismo «no leas
  el .env.infisical» y «no autorizo la lectura del .env.infisical»: la negación sigue frenando también con
  las palabras nuevas.
- **El bloqueo de la ruta sin expandir, antes**: ofrecía pegar
  `<banco>/ops/$O/.env.infisical` —una línea que **no existe en disco**—, y con `${O}` ofrecía
  `/.env.infisical`. Pegada la ofrecida, sólo destrababa el comando escrito igual; el mismo comando con la
  ruta escrita seguía frenado. **Después**: no ofrece ninguna línea y dice
  «Por archivo no hay línea que pegar para `<banco>/ops/$O/.env.infisical`: la ruta llegó con una expansión
  del shell sin resolver, y la aprobación compara texto, así que esa línea sólo valdría para un comando
  escrito igual. Volvé a correrlo con la ruta escrita y el bloqueo va a decir qué pegar.» Con la ruta
  escrita, lo que el mensaje dice pegar destraba ese mismo bloqueo, que es la propiedad del 089.
- **El rojo previo**: las dos pruebas nuevas, copiadas sobre el motor de `main` = `208e2fd1` en una copia
  desechable, **0 de 2**, cada una por su motivo —«Got unwanted exception: autorizo la lectura del .env…» y
  «The input did not match the regular expression /Por archivo no hay línea que pegar/»—. Sobre el motor
  arreglado, 2 de 2.
- **Siete mutaciones**, cada una en una copia desechable (R23), comprobadas aplicadas antes de contar y
  sobre una base en verde (`fail 0 / pass 2`):

  ```
  M1 chat.js sin los verbos de autorizar en español        fail 1 → ROJA
  M2 chat.js sin los verbos de autorizar en inglés         fail 1 → ROJA
  M3 secrets-shell.js no saca las llaves de ${VAR}         fail 1 → ROJA
  M4 secrets-shell.js ofrece pegar todo                    fail 1 → ROJA
  M5 HOW ignora qué se puede pegar                         fail 1 → ROJA
  M6 HOW no dice por qué no hay línea que pegar            fail 1 → ROJA
  M7 HOW anota para el «dale» sólo lo que se puede pegar   fail 1 → ROJA
  ```

  M7 es la que cuida que quitar la línea no haya quitado la salida: con ella puesta, el «dale» deja de
  aprobar lo que no se podía pegar y la prueba se cae.
- **La pasada de comentarios (R11) con la sonda en 0.22**: marcó tres pares propios que la puerta en 0.45
  no ve —`chat.js:52 ↔ hooks.test.js:2413` en **0.421**, el noveno más alto del repositorio;
  `approval.js:82 ↔ secrets-shell.js:42` en 0.250; `secrets-shell.js:36 ↔ hooks.test.js:2468` en 0.231—.
  Los tres eran la misma razón escrita dos veces: el comentario de la prueba transcribiendo el del código,
  y el porqué de la ruta sin resolver en los dos módulos. Corregidos —la razón queda donde nació—, la sonda
  vuelve a 25 pares, todos preexistentes y en líneas que este cambio no tocó.
- **Las puertas**: `npm run ci` código **0**, cobertura de 65 archivos en su piso o por encima;
  `npm test` código **0**, **762 de 762**. Ningún piso de cobertura se bajó.
