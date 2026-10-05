---
caso: 250
titulo: el recorrido registra como acción humana toda observación que no corrige
estado: resuelto
resuelto-en: 0.101.0
prioridad: alta
version-detectada: 0.100.0
---

# 250 — Build y Review mandan a `HUMAN_ACTIONS.md` todo lo que dejan sin corregir, sea o no una decisión de una persona

**🟢 resuelto en 0.101.0** · detectado en 0.100.0 · prioridad **alta**.

**Prioridad alta**: no rompe ninguna entrega, pero es el freno que más pesa en el uso real. En globex dejó
20 filas pendientes en dos días para 6 tareas, y sólo 2 pedían el criterio de una persona. El dueño lo
describió así: «sólo debería frenar el push a main y una que otra cosa crítica, no tanto como lo hemos
estado viviendo».

## Resumen

El recorrido tiene un solo destino para lo que Build marca `kind: 'open'` y para lo que Review decide no
mandar a corregir: una fila `pendiente` en `HUMAN_ACTIONS.md`. No distingue una decisión de producto de una
nota de redacción, de una mutación que nadie corrió o de trabajo chico ya identificado. La tabla que
`AGENTS.md` define como «lo que sólo puede hacer una persona» se llena de cosas que podía cerrar el revisor,
QA o quien cierra la tarea, y la persona las recibe de a siete en el checkpoint del hito.

Son tres daños distintos:

1. **Atención**: cada fila es una pregunta a una persona. 18 de 20 no la necesitaban.
2. **Señal**: las dos que sí eran decisiones (una regla de producto y dónde se observa un e2e) llegaron
   mezcladas con «el comentario quedó en dos líneas».
3. **Costo**: escribir filas es trabajo de agentes. En la corrida `wf_259e41f0-42d`, 6 de 37 agentes
   (`open-decisions` ×2, `review-human` ×2, `human-row`, `ready-human`) existieron sólo para eso.

## Reproducción

Sin arnés corrido para este caso. Lo que sigue es la corrida real; el esbozo del final **no se corrió**.

Corridas reales del recorrido instalado (`.claude/workflows/autobuild.js`, 0.100.0) en globex, sidecar,
2026-10-04 y 2026-10-05, sobre los hitos `ci-verde` y `seguridad-del-loop`. La última es `wf_259e41f0-42d`
(37 agentes, 4,13 M de tokens, 2 tareas entregadas y 1 frenada en Ready).

Esbozo para el arnés (hipótesis, no ejecutado): un Build que devuelve
`discovered: [{ kind: 'open', detail: 'el comentario quedó en dos líneas; es redacción' }]` debería
producir un prompt con label `open-decisions` que pide una fila en `HUMAN_ACTIONS.md`.

## Síntoma

Filas que el recorrido abrió, contadas por la columna Origen de `planning/HUMAN_ACTIONS.md` de globex:

```
3  Build de account-coverage-branches (2026-10-04)
2  Build de account-parser-de-set-cookie (2026-10-05)
3  Build de api-knip (2026-10-04)
3  Build de api-log-sin-credenciales (2026-10-04)
3  Build de api-routing-no-saltea-al-dueno-en-lane-ia (2026-10-05)
4  Build de aprobar-por-correo-misma-regla (2026-10-04)
1  Review de account-coverage-branches (2026-10-04)
1  Ready de api-approvals-separar-el-canal-de-correo (2026-10-05)
```

Cómo se cerraron las 20 (clasificación de quien las resolvió con el dueño, no del motor):

| Clase | Filas | Ejemplo real | Quién podía cerrarla |
|---|---|---|---|
| «Aceptar como está» | 6 | «decidir si el comentario de `knip.jsonc` queda en dos líneas o vuelve a una» | el revisor del cast |
| Promover trabajo ya identificado | 5 | «`approvals.service.ts` queda en 402 líneas sobre el umbral de 400» | una persona, con un sí o un no |
| Trabajo chico sin nada que decidir | 4 | «`globex-run.sh:8` sigue nombrando argon2 en un comentario» | quien cierra la tarea |
| Mutación declarada y no corrida | 3 | «hipótesis, no comprobada: quitar `genReqId` pondría rojo ese caso» | QA, corriéndola en su copia |
| Decisión real | 2 | «¿el routing sigue la misma regla que `resolve`?» | una persona |

Las tres de mutación se cerraron corriéndola: el revisor de una ya la había corrido en una copia y aun así
la fila quedó abierta, «falta que una persona registre el resultado».

## Causa raíz

En el recorrido instalado, 0.100.0 (`automatization/workflows/autobuild.js` en este repo; las líneas son
las de la copia instalada):

- `autobuild.js:363` — `discovered[].kind` es `edge` u `open`. No hay un tercer valor para lo que es una
  nota y no una decisión.
- `autobuild.js:1151-1163` — todo `kind: 'open'` de Build va a un agente (`open-decisions`) con el pedido
  «Registrá en HUMAN_ACTIONS una fila por cada decisión que la tarea dejó abierta». Sin filtro ni tope.
- `autobuild.js:1263-1281` — lo que Review decide y no corrige va a `registerHuman` (`review-human`). El
  comentario lo dice: «No al INBOX, que es para propuestas […] esto no se promueve, se decide». El tope es
  `INBOX_CAP = 3` por revisión (`autobuild.js:47`).
- `autobuild.js:627` — la fila nace `pendiente` «sin excepción» (caso 180). Es correcto para una decisión,
  y es lo que vuelve caro registrar ahí una nota: no hay forma de dejarla constando sin pedírsela a alguien.

La regla que debería separar los dos casos existe y no llega al recorrido: R13 pide una decisión humana
«sólo cuando las opciones cambian materialmente el rumbo, el gasto, una obligación externa o el riesgo», y
R6 reparte por «quién puede resolverlo, no cuán grave parece».

## Fix propuesto

La forma, no el diff:

1. **Tres destinos en vez de uno.** `discovered[].kind` y los hallazgos no bloqueantes de Review declaran
   cuál son:
   - `decision` — cambia rumbo, gasto, obligación externa o riesgo (el criterio de R13). Fila `pendiente`.
   - `note` — redacción, «se acepta como está», un supuesto ya tomado. Va a `decisions:` de la entrada de
     DONE con `[supuesto: …]`, que el contrato ya admite. Ninguna fila.
   - `debt` — trabajo identificado que no es de esta tarea. Va a `inbox/deuda/`, que es donde `AGENTS.md`
     manda la deuda residual. Promoverla sigue siendo de una persona (BR-OPS-002), pero desde el INBOX.
2. **Una mutación sin correr no es una fila: es trabajo de QA.** QA ya trabaja sobre una copia desechable.
   Lo que Build o Review marcan «hipótesis, no comprobada: romper X pondría rojo Y» entra a QA como caso a
   correr, y su resultado va a `qa:`.
3. **El revisor del cast cierra lo que es de su cargo.** «¿Dos líneas o una?» con el cast nombrando a un
   revisor es un veredicto de ese revisor, con su razón en `review:`.
4. **El prompt de la fila nombra el criterio.** El agente que escribe una fila recibe la pregunta de R13 y
   devuelve, por cada hallazgo, cuál de las cuatro cosas cambia. El que no cambia ninguna se reclasifica.

## Tradeoffs

- Una decisión real mal clasificada como `note` deja de llegarle a una persona. Es el riesgo que el diseño
  actual evita mandando todo. No está medido cuántas de las 20 se habrían clasificado mal; con el criterio
  de R13 aplicado a mano, las 2 reales caen en `decision`.
- `decisions:` de DONE crece. Hoy es opcional y corto.
- Si QA corre las mutaciones pendientes, QA cuesta más por tarea. A cambio desaparecen los agentes que hoy
  escriben esas filas y la vuelta de una persona para pedir que se corran.
- El punto 3 le da al revisor una autoridad que hoy no ejerce. El caso 180 muestra qué pasa cuando un
  agente cierra lo que no le toca: la separación tiene que quedar en el esquema, no en el prompt.

## Validación del 2026-10-05

Contrastado contra el fuente de `0.100.0`, la instancia y el diario de la corrida, antes de arreglar nada.

**Lo que se sostiene.**

- Las cinco citas coinciden con la copia instalada. En el fuente de este repo —que no trae los includes
  expandidos— son `autobuild.js:273` (el `enum`), `:1050-1062` (`open-decisions`), `:1162-1181`
  (`review-human`) y `:526` (`HUMAN_ROW_STATE`); `INBOX_CAP` viene de `shared/inbox.js`.
- Las 20 filas existen y se reparten como dice la tabla: 18 de Build, 1 de Review, 1 de Ready. Están
  enteras en la rama `chore/cierre-parser-y-routing` de `globex-ops`; en su `main` hoy hay menos.
- El diario de `wf_259e41f0-42d` tiene 37 agentes, y 6 con esas cuatro etiquetas.

**Reproducido en el arnés** (el esbozo de arriba, ahora corrido), con cinco hallazgos `open` tomados de
la tabla, uno por clase:

```
250 · stopped: undefined · done: ["T-1"]
250 · prompt open-decisions pide fila en HUMAN_ACTIONS: true · hallazgos que lleva: 5 de 5
250 · prompts que reciben algún open de Build: [ 'Build|open-decisions' ]
```

Los cinco van a la fila y a ningún otro lado. Dos pruebas lo fijan en verde: «una decisión abierta queda
escrita y el recorrido sigue» (`autobuild-review.test.js`) y la de `autobuild.test.js:384`.

**Lo que el caso dice de más: Review no tiene este defecto.** Review ya reparte en tres. Lo que bloquea
se corrige; lo que marca `decision: true` va a la fila, con tope de tres; el resto va al INBOX por
`review-noted`, también con tope (`:1209-1224`). En la misma corrida `review-noted` corrió dos veces. El
dato lo confirma: de las 20 filas, Review abrió una.

**La causa es de Build, y es más angosta.** `discovered` tiene dos valores donde Review tiene tres
destinos, y el propio prompt de Build define `open` como «lo notaste y no impide entregar la aceptación:
se registra para que lo decida quien corresponde» (`:1025-1028`). Todo lo que Build nota y no arregla es,
por definición, una decisión de una persona. Y esa escritura no tiene tope: la de Review sí.

**Qué cambia en el fix.** El punto 1 se achica a darle a Build lo que Review ya tiene: un valor para la
nota y otro para la deuda, que van al INBOX con su tope, y `open` reservado para lo que cumple el
criterio de R13. El punto 4 es el texto de ese criterio en el prompt de Build. Los puntos 2 y 3 son otra
cosa y piden decisión del dueño antes de construirse:

- **2, que QA corra la mutación que nadie corrió**: cambia cuánto cuesta QA por tarea. Salió como caso
  256, y este caso se cierra sin él.
- **3, que el revisor cierre lo que es de su cargo**: le da una autoridad que hoy no ejerce, y roza el 180.

Sin ellos el arreglo ya saca de la tabla las clases «aceptar como está», «trabajo chico» y «promover
trabajo identificado»: 15 de las 20. Las 3 de mutación quedan como nota en el INBOX hasta que se decida
el punto 2.

## Contexto de descubrimiento

globex, sidecar, 0.100.0. Tres corridas del recorrido en dos días sobre tareas chicas (cambios de 40 a 116
líneas). Ninguna terminó su alcance: pararon en `verify-hollow`, `edge-unproven` y `not-ready`. Al cerrar
cada hito hubo una ronda de siete decisiones con el dueño, que aceptó todas las recomendaciones en bloque
las tres veces: señal de que no eran decisiones. Es el camino principal, no un borde: pasó en las 6 tareas.

## Relacionados

- **249** — lo que la crítica anota sin bloquear se pierde. Es el defecto opuesto en otra fase: ahí lo no
  bloqueante no llega a nadie; acá le llega a una persona.
- **248** — una segunda crítica con condiciones frena como si bloqueara. Misma familia: el recorrido no
  distingue lo que impide entregar de lo que se anota.
- **180** — el runner cierra su propia acción humana. Es la razón de que la fila nazca `pendiente`, y el
  límite que el fix no puede cruzar.
- **256** — una mutación declarada y no corrida termina en una fila. Era el punto 2 de este fix.
- **251** — el paso de Commit no corta rama. Abrió una de las 20 filas («decidir desde qué rama se
  commitea») que tampoco era una decisión.

## Cierre

**Resuelto en 0.101.0**, por la forma que dejó la validación: darle a Build los tres destinos que Review
ya tenía.

`discovered[].kind` suma `debt` y `note`. `open` queda para lo que cumple el criterio de R13 y es lo único
que abre una fila; `debt` va a `inbox/deuda/` con su remitente; `note` va a `decisions:` de la entrada de
`done/` como `[supuesto: …]`. Cada destino recibe hasta tres por tarea, el tope de Review, y lo que no
entra queda contado en el hecho de build que llega a `done/`.

### El recorrido de lo que este caso enumeró

- **Fix 1, tres destinos — se hizo**, para Build. Review ya los tenía y no se tocó.
- **Fix 2, que QA corra la mutación sin correr — salió como caso 256.** Mientras tanto una mutación
  declarada y no corrida es `debt`: deja de ser una pregunta y sigue sin correrse.
- **Fix 3, que el revisor del cast cierre lo de su cargo — se decidió que no.** Lo que ese punto quería
  sacar de la tabla —«aceptar como está»— ya sale como `note`, sin darle a nadie una autoridad nueva.
- **Fix 4, que el prompt nombre el criterio — se hizo**, en el prompt de Build, que es quien clasifica. El
  agente que escribe la fila ya no recibe nada que reclasificar.
- **Daño 1, atención, y daño 2, señal — medidos abajo.**
- **Daño 3, costo — baja por un lado y sube por otro.** `open-decisions` deja de correr cuando no hay
  decisión, y aparece `build-debt` cuando hay deuda. No está medido cuántos agentes ahorra una corrida
  entera.
- **Tradeoff «una decisión real mal clasificada deja de llegarle a una persona» — pasó en la medición, y
  se corrigió.** Ver la sonda.
- **Tradeoff «`decisions:` de DONE crece» — se paga**, con tope de tres.
- **Tradeoff del punto 3 y el 180 — no aplica**: nadie cierra nada, la fila sigue naciendo `pendiente`.
- **Lo de Ready** —una de las 20 filas— no se tocó: `not-ready` es una parada, y ahí la fila es correcta.

### Lo que el caso no preveía

- Que Review no tenía el defecto; está en la validación.
- **Un hallazgo no encaja en ninguna de las tres**: «la fase Commit tiene que cortar una rama antes». Es
  un aviso para otra fase de la misma corrida, y las dos sondas lo pusieron en lugares distintos. Ese en
  particular lo resuelve el 251; la clase —Build avisándole algo a una fase posterior— no tiene canal.

### Qué se corrió

- **La reproducción, antes y después**, en el arnés. Antes: cinco hallazgos, los cinco en el prompt de
  `open-decisions`. Después: la decisión en la fila, las dos deudas en `build-debt` hacia
  `planning/inbox/deuda/`, la nota en el prompt de Done, y ninguna fila cuando no hay decisión.
- **Nueve mutaciones.** Ocho en rojo a la primera: la deuda y la nota volviendo a abrir fila —que es lo
  quitado—, la deuda sin escribirse, la nota sin llegar al cierre, el tope, el conteo de lo que no entra,
  la deuda yendo a Propuestas y la decisión dejando de abrir fila. **Una sobrevivió**: la deuda sin
  remitente, porque la aserción encontraba el remitente en otra parte del mismo prompt. Se endureció y se
  vio en rojo.
- **Dos sondas con un agente real**, sobre los 18 hallazgos `open` originales de Build en cuatro corridas
  de globex, sacados de sus diarios, con el texto literal del prompt nuevo. Lo que desmentía el arreglo
  era que la mayoría siguiera en `open`, o que la decisión de producto no cayera ahí.
  - Primera: 0 `open`, 13 `debt`, 5 `note`. **La decisión de producto —si el routing deja de escalar al
    manager— fue a `debt`**, con la razón «dudoso con open». Es el tradeoff del caso, ocurriendo.
  - Se agregó una línea al prompt: «Si dudás entre open y otra, es open». Segunda sonda, agente nuevo:
    1 `open` —esa decisión, citando la línea—, 14 `debt`, 3 `note`.
  - Es una muestra de dos y clasifica texto sin ver el código. Dice que de 18 filas queda 1; no dice
    cuánto varía.
- **La puerta entera**, `npm run ci`.
- **Lo que no se corrió**: un `autobuild` de punta a punta, y que un agente real escriba bien el archivo
  en `inbox/deuda/` —el arnés mira el prompt, no el disco—.
