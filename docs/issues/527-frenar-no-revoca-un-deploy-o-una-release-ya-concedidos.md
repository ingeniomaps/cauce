---
caso: 527
titulo: «pará» o «no despliegues nada» no revocan un deploy, un workflow o una release que la sesión ya concedió
estado: resuelto
resuelto-en: 0.123.1
prioridad: media
version-detectada: 0.123.0
---

# 527 — «pará» o «no despliegues nada» no revocan un deploy, un workflow o una release que la sesión ya concedió

**🟢 resuelto en 0.123.1** · detectado en 0.123.0 · prioridad **media**: deja pasar del lado peligroso, sobre los
actos más caros de R10, pero sólo en el reintento de algo que la persona ya ordenó en la misma sesión.

## Resumen

Lo que un guard deja pasar por una orden del chat queda concedido para el resto de la sesión (`AP.pending`, caso 116).
Para revocarlo, el mensaje siguiente tiene que nombrar el ítem: `record` (`engine/hooks/chat.js:195` de 1f7dc984) filtra lo
concedido con `mentions(text, item).denied`. Un «pará» o una negación que no nombra el comando —«no despliegues
nada», «no publiques nada»— no lo nombran, así que `terraform apply`, `gh workflow run …` o `gh release create …`
siguen pasando por `concedido`.

El 524 lo cerró para los PR, que se conceden por número y se revocan con la misma lectura. El push no tiene el
problema: se autoriza sin conceder (`engine/hooks/push.js:205-212`), así que vale para esa operación y no para la
siguiente.

## Reproducción

Por la entrada real de los hooks (`run.js prompt` y `run.js destructive`, `permission_mode: dontAsk`), en un banco
propio con `{ "mode": "embedded", "runner": { "allowPush": false } }`, los dos mensajes en la misma sesión, con
`real-524.sh` del 524 (manda la orden, corre el comando, manda el segundo mensaje y lo corre de nuevo).

## Síntoma

Medido el 2026-11-20, igual con el motor de `origin/main` (0.123.0) y con la rama `fix/519-523-chat-y-historias`:

```
«corré terraform apply» → pasa ; «pará» → pasa   (terraform apply)
«corré terraform apply» → pasa ; «no despliegues nada» → pasa   (terraform apply)
«corré gh workflow run deploy.yml --repo o/api» → pasa ; «pará» → pasa
«corré gh workflow run deploy.yml --repo o/api» → pasa ; «no despliegues nada» → pasa
«corré gh release create v1 --repo o/api» → pasa ; «no publiques nada» → pasa
«corré terraform apply» → pasa ; «gracias» → pasa   (terraform apply)
```

## Causa raíz

- `engine/hooks/chat.js:195`: lo concedido sólo se revoca si el mensaje nombra el ítem (`mentions`), salvo un PR por
  su número desde el 524 (`revokesPull`, `engine/hooks/orders.js`).
- `engine/hooks/chat.js:165`: `HALT` («pará», «esperá», «cancelá», «stop») frena lo que el mensaje en curso ordena y lo
  que queda pendiente, pero no toca lo concedido.

## Fix propuesto

Pide una decisión, porque cambia qué sobrevive de un mensaje al siguiente en toda instancia. Tres formas, de más
angosta a más ancha:

1. **Que `HALT` revoque todo lo concedido.** Es explícito y raro: 31 de 6457 mensajes humanos. Medido el 2026-11-20
   sobre los `.jsonl` de `$HOME/.claude/projects` de esta máquina, con `NEGATION` y `HALT` del motor, contando los
   mensajes de tipo `user` en texto que no empiezan con una etiqueta.
2. **Que la negación vaga revoque sólo la familia de publicar** —PR, workflow, release, deploy—, no los archivos ni los
   comandos comunes: 2945 de esos 6457 mensajes (45,6 %) traen una negación, y revocar todo con eso dejaría lo concedido
   casi sin efecto.
3. **Que la familia de publicar no se herede**, como el push: cada operación pide su orden o su «dale».

Recomendación: 1 y 3 juntas. La 3 es el criterio que el push ya tiene escrito (volver a publicar agrega consecuencia),
y la 1 cubre lo demás sin listas de palabras nuevas.

Prueba: «corré terraform apply», después «pará», y el reintento frena; roja hoy.

## Tradeoffs

- La 3 obliga a repetir la orden para cada deploy de una tanda, como ya pasa con el push.
- La 1 hace que un «pará» le quite también la lectura de un archivo concedida antes; se vuelve a pedir.
- `HALT` está anclado al inicio del mensaje: «ok, pará» no lo dispara. Ampliarlo cambia también lo que frena el
  mensaje en curso.

## Contexto de descubrimiento

Revisión independiente del caso 524, 2026-11-20: al medir si la revocación por número dejaba otros huecos, encontró que
la misma forma vale para lo concedido que no es un PR. Reproducido en la misma sesión con el motor de `main` y el de la
rama.

## Relacionados

- **524** — el mismo hueco, para un PR por su número.
- **116** — lo concedido se hereda en la sesión.
- **225** — los actos que publican sin ser un push.

## Cierre

La persona eligió la recomendación, las dos formas juntas (2026-11-20). Las reglas de publicar de `delivery.js` llevan
un sexto campo en la tabla (`deliveryRules`, `engine/hooks/delivery.js:129` de `4275b4a8`), y `destructive` las pregunta con
`AP.pendingNow` en vez de `AP.pending` (`engine/hooks/shell.js:266`): valen para el turno de la orden o del «dale» y no
se conceden, igual que el push. Lo que pasa por la persona queda igual en `planning/.grant-log` (`unauthorizedNow` con
`logged`, `engine/hooks/chat.js:401`), y el bloqueo dice que el «dale» vale para su turno (`turn` en `AP.HOW`). Y
`record` (`engine/hooks/chat.js:193`) vacía lo concedido cuando el mensaje arranca frenando (`HALT`), sin importar qué
nombre. `revokesPull`, del 524, quedó muerto —un PR ya no se hereda— y se quitó.

Línea de base: la reproducción de arriba más diez secuencias, con el motor de `origin/main` y el de la rama.

Contra el caso:

- **Fix 1, `HALT` revoca todo lo concedido:** se hizo. También con un mensaje que no es de la persona: un aviso nunca
  arranca con «pará», así que distinguirlo no se podía observar, y revocar es la dirección segura.
- **Fix 2, la negación vaga revoca publicar:** se decidió que no; lo cubre el 3, sin revocar de más.
- **Fix 3, publicar no se hereda:** se hizo, para todas las reglas de `delivery.js`, incluidos los `deployCommands`.
- **Recomendación, 1 y 3 juntas:** es lo que se construyó.
- **Fix, la prueba:** se hizo, en `test/hooks/delivery.test.js`, y reemplaza a la del 524, que daba por hecho que un PR
  se hereda.
- **Tradeoff, repetir la orden para cada deploy de una tanda:** se cumple sólo entre mensajes. Dentro del turno de la
  orden el agente reintenta y corre varias veces lo mismo; con el mensaje siguiente se vuelve a pedir.
- **Tradeoff, «pará» le quita también la lectura de un archivo:** se cumple; se vuelve a pedir.
- **Tradeoff, `HALT` anclado al inicio:** queda así; «ok, pará» no revoca. Ampliarlo cambia también lo que frena el
  mensaje en curso, y no se pidió. Y lee como freno la preposición: «Para el próximo release revisá el README» vacía
  lo concedido. La revisión contó 17 mensajes que empiezan con «para» en los registros de esta máquina, y los 17 eran
  preposición. Va en la dirección segura y se vuelve a pedir; es el mismo `HALT` que ya frenaba el mensaje en curso.

Lo que el caso no preveía:

- Dejar de conceder se llevaba dos cosas que nadie había anotado, y las encontró la revisión: el bloqueo seguía diciendo
  que el «dale» «sigue valiendo en los mensajes siguientes», y lo autorizado de publicar dejaba de quedar en
  `planning/.grant-log` (caso 127), porque ahí escribe `grant`. Las dos se arreglaron. El rastro ahora anota cada pase,
  también los reintentos del turno, con la forma de siempre (`grantedAt`, `item`, `scope`, `via`, `session`): ya no
  es una línea por concesión sino una por uso autorizado. Un comando que cazan dos reglas a la vez —`terraform apply`
  también declarado en `deployCommands`— deja dos líneas iguales. Nadie parsea el archivo: lo leen sólo las pruebas.

- Un mensaje que no nombra ningún PR ni niega —«gracias»— ordena todos los merges (caso 280), así que tras un merge
  concedido el reintento después de «gracias» pasa por orden, con o sin herencia. Lo que este arreglo cambia para un PR
  es el mensaje que niega o pregunta.
- En la sesión real, el agente escribió `/usr/bin/terraform apply …` por su cuenta, y ninguna regla de R10 reconoce un
  binario con su ruta: pasa sin ninguna aprobación, en `main` y acá. Pide otra decisión y sale como caso propio: el
  **528**.

### Qué se corrió

Por la entrada real de los hooks (`run.js prompt` y `run.js destructive`), un banco propio, una sesión por secuencia
(`main` → ahora):

```
«corré terraform apply» → pasa → pasa «pará» →                pasa  | frena
«corré terraform apply» → pasa «no despliegues nada» →        pasa  | frena
«corré terraform apply» → pasa «gracias» →                    pasa  | frena
«corré gh workflow run deploy.yml --repo o/api» → pasa «gracias» →   pasa  | frena
«corré gh release create v1 --repo o/api» → pasa «no publiques nada» → pasa | frena
«mergeá el #69» → pasa → pasa «gracias» →                     pasa  | pasa    (orden, caso 280)
«mergeá el #69» → pasa «¿cómo va el CI?» →                    pasa  | frena
«hola» → frena «dale» → pasa → pasa «gracias» →               pasa  | frena
«corré docker compose down» → pasa «pará» →                   pasa  | frena
«corré docker compose down» → pasa «gracias» →                pasa  | pasa
«corré docker compose down» → pasa «ok, pará» →               pasa  | pasa    (HALT, anclado al inicio)
```

Los primeros turnos dan igual en los dos motores: la orden y el «dale» siguen valiendo dentro de su turno.

Mutaciones, en una copia, todas rojas en `test/hooks/delivery.test.js`: publicar se hereda (`AP.pending` para todo);
nada se hereda (`AP.pendingNow` para todo); `delivery.js` sin marcar publicar; `HALT` sin revocar; `HALT` sin vaciar lo
concedido; el bloqueo sin `turn`; sin el rastro; y el rastro sin la raíz de la llamada.

### Sesión real

El 2026-11-20, sesiones de Claude Code 2.1.329 (`claude -p --model haiku --permission-mode dontAsk`, sin los ajustes de
usuario) en un banco instalado, con un `gh`, un `docker` y un `terraform` falsos en el `PATH`; el segundo mensaje con
`--resume` en la misma sesión, y el reintento del comando que el agente corrió, por el hook instalado (`guard-shell.sh`):

- «mergeá el PR #69 del repo o/api» y después «¿Quedó mergeado? Contestá sin correr nada.». El agente corrió
  `gh pr merge 69 --repo o/api --merge`. Con `main` (`e270cc75`) quedó concedido y el reintento pasó; con la rama
  (`07bcf16d`), el merge pasó en su turno, no quedó nada concedido y el reintento frenó.
- «corré docker compose down en este proyecto» y después «pará, no hagas nada más». Con `main` (`e02575ca`) el
  reintento pasó; con la rama (`edb71ba8`), frenó.
- Con terraform no se pudo medir lo concedido: los agentes agregaron banderas (`-input=false`, `-no-color`) y el comando
  ya no era el que nombraba la orden, así que frenó en el primer turno con los dos motores. En tres sesiones, con los
  dos motores (`e7538ef3`, `3b3602fd`, `dc115314`), el agente desconfió del falso y corrió el `terraform` real por ruta
  (`init` bajó el proveedor del registro público; `apply` creó un `null_resource` local en el banco), que es lo que
  abrió el 528.

Después de las correcciones de la revisión se repitieron con la versión final: el merge pasó en su turno, quedó en
`.grant-log` como `orden`, no se concedió nada y el reintento después de la pregunta frenó (`1b73ddcb`); y el
`docker compose down` frenó después de «pará» (`371f04e1`). En total, 14 sesiones (28 invocaciones de `claude -p`,
contando las que no midieron), USD 0,44.

**Sin probar:** un terraform concedido en una sesión real de Claude Code, por lo de arriba. Pasa por la misma tabla y
la misma rama de `destructive` que el merge, que sí se ejerció en sesión real, y la entrada real de los hooks lo
cubrió (las cinco primeras filas).

### Lista de cierre

1. hecho: la reproducción y las diez secuencias, con el motor de `origin/main` y el de la rama.
2. hecho: en la rama `fix/519-523-chat-y-historias`.
3. hecho: las dos pruebas nuevas, corridas contra el motor de antes del 527 (`1f7dc984`) en una copia, rojas: en la
   primera cae la aserción del merge seguido de «¿cómo va el CI?» (`pasa pasa pasa` en vez de `pasa pasa frena`), y
   `assert` corta ahí; en la segunda, el bloqueo decía «sigue valiendo en los mensajes siguientes». Verdes después.
   Las filas de después —`docker compose down` tras «pará», entre ellas— se vieron rojas con las mutaciones del 4.
4. hecho: ocho mutaciones, todas rojas.
5. hecho: lo que se quita es heredar lo que publica y que lo concedido sobreviva a un «pará»; la salida de antes y
   después está arriba, con las filas que tienen que seguir pasando. `revokesPull` se quitó porque nada lo usa; lo que
   aseguraba lo cubren las filas de «no mergees el #69» y «pará».
6. hecho: por la entrada real de los hooks y en sesiones reales, sin el arnés de las pruebas.
7. hecho: sesiones reales de Claude Code con los dos motores, arriba.
8. hecho: las pruebas de `test/hooks`, la entrada real con once secuencias y las sesiones reales, repetidas con la
   versión final del código. Lo último que cambió después fue un comentario de `approval.js`.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: la tabla de `rulesOf` la leen `destructive` y `unplaced`, que toma los campos por posición y no usa el sexto;
    `deliveryRules` también lo lee una prueba, por posición. Lo concedido lo leen `why`, `grantedIn` y `scopes`, que se
    filtra con él.
11. hecho: dos pasadas independientes. La primera encontró las dos quitas de arriba —el texto del bloqueo y el
    rastro— y se arreglaron; la segunda, sobre lo que cambió, nada que impida entregar, y anotó la línea doble con dos
    reglas, la preposición «para» y un comentario viejo de `approval.js`, que se corrigió.
12. hecho: uno por uno sobre el diff final. La razón de no heredar lo que publica estaba escrita en `shell.js` y ya
    vivía en `push.js`, y quedó sólo la referencia; el encabezado de la prueba repetía su nombre y se acortó. La medición
    con el tokenizador a 0,22 que se citaba acá había corrido sobre el diff de otro commit (el script comparaba
    `HEAD~1..HEAD`); la rehizo el contraste del cierre sobre `4275b4a8`. Dos pares pasan de 0,22: la forma de la tabla de
    reglas, descrita en `delivery.js` y en `shell.js` (0,226, anterior a la rama, y el 527 había ampliado las dos copias),
    que se dejó sólo en `shell.js`; y el rastro de `unauthorizedNow` frente al de `grants.test.js` (0,242), que comparten
    vocabulario y no razón.
13. hecho: `npm run ci` con el cambio y los casos stageados, `exit 0`.
14. hecho: recorrido arriba contra el Fix, la recomendación y los Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba, con su línea «Sin probar».
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.123.1`, y entrada en el CHANGELOG, junto con la del 524.
