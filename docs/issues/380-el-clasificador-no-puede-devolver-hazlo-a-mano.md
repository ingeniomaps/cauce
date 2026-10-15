---
caso: 380
titulo: el clasificador no puede devolver «hazlo a mano», y una tarea chica paga el recorrido entero
estado: abierto
prioridad: alta
version-detectada: 0.106.0
---

# 380 — El clasificador sólo elige cuánta ceremonia lleva una tarea dentro del recorrido; no tiene una salida que diga «esto lo hace la sesión, sin agentes»

**🔴 abierto** · detectado en 0.106.0 · prioridad **alta** — es el caso más caro de los medidos: tres tareas de pantalla
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
