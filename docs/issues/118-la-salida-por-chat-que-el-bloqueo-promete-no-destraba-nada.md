---
caso: 118
titulo: La salida por chat que el bloqueo promete no destraba nada, y desde 0.81 no queda ninguna otra que el agente pueda tomar
estado: abierto
prioridad: media
version-detectada: 0.81.0
---

# 118 — `secrets-shell` enseña «contestá "dale" y reintentá», y reintentar vuelve a frenarse

**🔴 abierto** · detectado en 0.81.0 · prioridad **media** —bajada de alta el 2026-09-11, ver «Contra
0.83.0»— la salida por chat hoy destraba la mayoría de los textos y se sigue frenando en los que no traen
un verbo de la lista cerrada: dos de las cuatro vueltas de la sesión real seguirían frenándose

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
