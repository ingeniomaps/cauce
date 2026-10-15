---
caso: 380
titulo: el clasificador no puede devolver «hazlo a mano», y una tarea chica paga el recorrido entero
estado: resuelto
resuelto-en: 0.108.0
prioridad: alta
version-detectada: 0.106.0
---

# 380 — El clasificador sólo elige cuánta ceremonia lleva una tarea dentro del recorrido; no tiene una salida que diga «esto lo hace la sesión, sin agentes»

**🟢 resuelto en 0.108.0** · detectado en 0.106.0 · prioridad **alta** — hay una salida `manual`: `context` no ofrece esa tarea a ningún runner y el clasificador puede devolverla; medido, salta poco y nunca sobre lo que necesitaba revisión.
de una o dos horas costaron 47 agentes, y la decisión de sacarlas del recorrido la tuvo que tomar la persona después
de pagarla.

## Resumen

`autobuild` clasifica cada tarea en `express`, `directo`, `lite` o `full` (`automatization/workflows/autobuild.js`,
`CLASSIFY_RULES`). Los cuatro son carriles **del recorrido**: cambian cuántas fases corren, pero toda tarea que
entra a la cola pasa por agentes —plan, WIP, build, verify, commit, done como mínimo—, y cada uno arranca cargando
las instrucciones y las reglas del proyecto. No hay una salida que diga «esta tarea es más barata hecha por la
sesión que la lanzó: devolvela». Esa decisión hoy la toma una persona **antes** de promover, o la descubre después
de pagar la corrida.

Lo que se pide al arreglarlo es contestar dos preguntas, con su razón:

1. **Qué devuelve el recorrido** cuando una tarea conviene hacerla a mano: la tarea sin tocar, con su motivo y lo
   que la sesión necesita para hacerla (aceptación, anclas, mutación declarada), y la corrida sigue con la próxima
   o termina.
2. **Si eso es un carril nuevo** (`a-mano`, al lado de `express`) **o una salida de uno existente** — por ejemplo,
   que `express` deje de lanzar agentes y pase a significar exactamente esto. Las dos tienen costo: un carril nuevo
   es otro valor que `check`, `done/` y los guards tienen que aceptar; reusar `express` cambia el significado de
   entradas de `done/` ya escritas con ese carril.

## Reproducción

Instancia `acme-ops`, Cauce 0.106.0. Épica de ajustes de pantallas de `front-auth` promovida con siete tareas
`[lite]` (validar un campo al salir, mostrar los requisitos de la contraseña, un `placeholder` de ejemplo en el
correo y el celular…). `/autobuild` sobre ese hito, corrida `wf_81ce8e36-77f`:

- 47 agentes, 444 usos de herramientas, 66 minutos, para cerrar **tres** tareas.
- Tokens propios (entrada + creación de caché + salida), sumados de los transcriptos de cada agente: **10,67 M**;
  caché releída aparte: unos 99 M.
- El agente de Build de la tarea del `placeholder` —agregar un atributo en tres formularios y dos claves de i18n—
  usó **76 turnos**.

## Síntoma

Reparto por fase de los 10,67 M propios:

| Fase | Agentes | Tokens propios | % |
|---|---:|---:|---:|
| Build | 6 | 1,85 M | 17,3 |
| Review | 7 | 1,83 M | 17,2 |
| Verify | 8 | 1,61 M | 15,1 |
| Done | 6 | 1,13 M | 10,6 |
| QA | 2 | 0,93 M | 8,7 |
| Plan | 3 | 0,91 M | 8,5 |
| Ready | 3 | 0,83 M | 7,8 |
| WIP | 3 | 0,72 M | 6,8 |
| Commit | 2 | 0,60 M | 5,6 |
| Classify, Triage, Claim | 7 | 0,25 M | 2,4 |

Escribir el código es el 17 %. Las mismas tres tareas cerradas por la sesión —prueba en rojo, mutación en una copia,
commit y bitácora— cuestan una fracción: la tercera se cerró así después de que la corrida se frenara (caso 382), y
el cierre a mano gastó menos que un solo agente de Verify.

## Causa raíz

De diseño, no un defecto de código. `CLASSIFY_RULES` define el lane como «cuántas perspectivas merece la tarea»
y el recorrido siempre las convoca. La escala del costo es por **cantidad de agentes**, y el piso de agentes no
baja de seis o siete ni en `express`.

## Fix propuesto

Una forma, a discutir:

- `CLASSIFY_RULES` gana una salida explícita: la tarea es chica, su aceptación nombra el cambio y no hay una
  decisión de diseño → **devolverla a la sesión**. Criterio medible para no inflarlo: superficie de un solo
  servicio, aceptación con su mutación ya declarada, sin `(depende:)` abierto.
- El recorrido, ante esa salida, no la reclama: escribe por qué la devolvió y sigue con la próxima, o termina si
  era la única. Nada queda reservado.
- `done/` acepta el carril que la sesión declare al cerrarla a mano, con la misma evidencia que cualquier otra
  (`tests:`, `mutaciones:`, `commit:`).

## Tradeoffs

- La sesión que la hace a mano no tiene revisor independiente: la evidencia es la mutación declarada y el gate,
  no una segunda lectura. Para una tarea de presentación es lo que ya pasa en `express`.
- Un umbral mal puesto devuelve tareas que sí necesitaban ceremonia; la contraparte es la regla de Ready, que
  hoy no frena lo que debería (caso 382).

## Contexto de descubrimiento

Al promover la épica, quien escribía la cola etiquetó todas `[lite]`; el clasificador las respetó («Lane [lite]
kept as declared»). Aun reclasificadas como `directo`, habrían corrido plan, WIP, build, verify, un revisor,
commit y done. La persona preguntó si el clasificador no era justamente lo que decía «esto hacelo a mano»; no
lo es, y no hay ningún carril que lo sea.

## Relacionados

- 381 — las fases que juzgan no escalan con el tamaño de la tarea.
- 382 — Ready dejó pasar una aceptación que dependía de algo que no existía.

## Cierre

**Resuelto en 0.108.0**, con un valor nuevo, `manual`, y no redefiniendo `express`. La razón la decidió quien
aprueba y quedó en OPS-006: `express` sirve a una corrida que nadie mira y `manual` necesita una sesión que la
retome, y las entradas de `done/` que dicen `express` pasarían a contar algo que no pasó. Un dato que el caso
no tenía también lo descartaba: las tareas caras venían `[lite]` desde la promoción, así que un `express`
redefinido no las habría tocado.

Recorrido de lo que el caso pedía:

1. **Qué devuelve el recorrido.** Se hizo distinto de lo propuesto en un punto: la tarea ya está reclamada
   cuando se clasifica —en `autobuild.js` la fase `Claim` corre antes que `Classify`—, así que «no la reclama»
   pasó a ser «suelta la reserva». Lo que decide es la cola releída, no el reporte del clasificador: si la línea
   quedó `[manual]`, la corrida corre `ops release`, commitea lo que el clasificador escribió —como cualquier
   parada, caso 279— y sigue con la próxima, sin quedar atada al hito de la devuelta. Si el reporte dice manual y
   la línea no, la tarea corre como cualquier otra. El resultado de la corrida trae `manual: [{ slug, reason }]` con el motivo del clasificador,
   y la línea de la tarea sigue en la cola con su aceptación y su mutación: es lo que la sesión necesita.
2. **Carril nuevo o salida de uno existente.** Carril nuevo en el vocabulario —`LANES` del motor, así que
   `check` y `done/` lo aceptan solos— pero no carril del recorrido: `ops context` no se lo ofrece a ningún
   runner, lo lista aparte (`MANUAL <slug>` en el texto, `manual` en el JSON), y una cola con sólo eso no
   para con `queue-unavailable`. Quien espera a una manual figura esperando a «la sesión, a mano».
3. **Criterio medible en `CLASSIFY_RULES`.** Se hizo con el del caso más dos pisos: un solo servicio,
   aceptación que nombra el cambio y su mutación, sin borde ni decisión de diseño, sin dependencia abierta, una
   hora; ante la duda no es `manual`, y nunca sobre una superficie de «Qué no se puede romper». Ese último piso
   no queda sólo en el prompt: con superficies declaradas, el recorrido pregunta por todas las que esa pasada
   del clasificador dejó `[manual]` —no sólo por la que está tomando: `context` no vuelve a ofrecer las otras—,
   lo mismo que con `express` (caso 205). Lo que no puede determinar cuenta como tocada. Las que la tocan se
   reescriben `[directo]` con su reparto, y si la relectura todavía las ve manuales la corrida para con
   `manual-critical` en vez de pasárselas a la sesión. Una `[manual]` escrita a mano no pasa por ahí: ese piso lo cuida quien escribe la línea, y
   PROTOCOL y OPS-006 lo dicen así.
4. **`done/` acepta el carril que la sesión declare.** Se hizo: `lane: manual` es válido, y como `express` no
   convoca revisor, `review: n/a — razón` no avisa.
5. **Tradeoff: sin revisor independiente.** Se aceptó y se dice en PROTOCOL: la evidencia es la prueba en rojo,
   la mutación, el gate y el commit, igual que en `express`.
6. **Tradeoff: un umbral mal puesto.** Medido abajo; el 382 sigue abierto y es el otro lado de esto.

Lo que el caso no preveía:

- **Quien promueve también escribe el carril, y el clasificador respeta lo declarado.** Por eso `manual` está
  en la sección Lanes de PROTOCOL, que es lo que lee quien escribe la cola, y no sólo en el prompt del
  clasificador.
- **La sesión que hace la tarea manual la reclama y escribe su WIP** —`plan-first` se lo pide—, con el mismo
  id de runner que la corrida que lance después. Sin cuidarlo, ese WIP le entregaba la tarea a la corrida, que
  la construía con agentes en el carril completo y sin reparto; y el reclamo hacía negar el siguiente con
  «este runner ya tiene …» sobre una tarea que `context` no mostraba. Ahora `context` la nombra en
  `manualHeld` («reclamada por este runner») y la corrida para con `manual-held` sin soltarla: soltarla le
  quitaría la tarea a quien la está haciendo.
- **«Sin cast» era motivo para reclasificar**, y una manual no lleva reparto: el prompt ahora exceptúa las
  `[manual]`.

Las tres últimas salieron de una revisión independiente del diff, junto con el hito que quedaba fijado por la
tarea devuelta y la devolución que confiaba en el reporte. Una segunda pasada sobre esos arreglos encontró que
el piso crítico miraba sólo la tarea tomada, que una reescritura fallida terminaba en manos de la sesión, que la
reescrita quedaba sin reparto y que el motivo se perdía si el reporte decía otro carril. Todo se arregló con su
prueba.

**Prueba.**

- Dieciséis mutaciones, cada una en una copia del árbol, todas en rojo: `context` ofreciendo la tarea manual, el
  reclamo de este runner invisible y la espera sin dueño (`context-manual.test.js`); la corrida sin soltar la
  reserva, la cola con sólo manuales parando como trabada, el resultado sin la lista, sin `manual-held`,
  devolviendo por el reporte en vez de la cola, sin el piso de superficie crítica, con el hito fijado por la
  devuelta y con el prompt que reclasificaba las manuales; y de la segunda pasada, el piso mirando sólo la
  tarea tomada, sin parar ante una reescritura fallida, con la duda contada como «no toca», el motivo leído del
  reporte y la espera por la sesión sin nombrar (`autobuild-lanes.test.js`). La del prompt sobrevivió la
  primera vez —nada miraba esa frase— y se le agregó la aserción antes de verla en rojo.
- Banco real (`ops bench suelto`) con una tarea `[manual]` y una `[full]`: `check` sale 0 y `context` ofrece la
  `[full]` y lista `MANUAL correo-largo-con-puntos: la hace la sesión, sin agentes`. Control con el motor de
  `main` sobre el mismo banco: `lane "manual" no existe; usá express | directo | lite | full`, exit 1.
- **Umbral, medido sobre las doce tareas de la épica real** —no siete: el caso contó las de la corrida—, sin
  carril ni reparto y con las reglas nuevas, tres corridas del clasificador (Opus 5.5, unos USD 0,21 cada una).
  Hipótesis: vuelven `manual` las de pantalla chicas. La refutaban: `manual` en el selector de país o el menú del
  sistema de diseño (decisión), en la pastilla del correo (borde abierto: si el token trae el correo), en el
  ejemplo del celular (depende de un país que no existe, caso 382) o en las dos con `(depende:)`; o ninguna
  `manual`. Resultado: ninguna de ésas salió `manual` en ninguna corrida —país y pastilla `full` las tres veces,
  el ejemplo `lite` citando que el selector «sigue abierto»—. Salieron `manual` el correo largo con puntos
  suspensivos (2 de 3) y los términos en el pie (1 de 3), y las demás quedaron en su carril.

**Lo que la medición dice y conviene leer antes de esperar mucho de esto:** el umbral es conservador y donde
salta está en el borde —las dos que salieron `manual` no lo hicieron las tres veces—. En esta épica habría
devuelto una tarea de doce, y las tres que costaron la corrida siguen en `lite`, con razón: validación en tres
pantallas, requisitos de contraseña con un componente compartido y un ejemplo que depende de lo que falta. Lo
caro de esas tres ya no es la salida que faltaba sino lo que cobran las fases que juzgan, que es el 381.
Aflojar el umbral es una decisión de producto que esta medición no toma.

