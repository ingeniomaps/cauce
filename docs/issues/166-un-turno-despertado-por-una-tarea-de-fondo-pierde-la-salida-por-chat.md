---
caso: 166
titulo: Un turno despertado por una notificación de tarea pierde la salida por chat, y el bloqueo manda a copiar y pegar con la persona mirando
estado: resuelto
resuelto-en: 0.95.0
prioridad: media
version-detectada: 0.94.0
---

# 166 — Un turno despertado por una tarea de fondo pierde la salida por chat

**🟢 resuelto en 0.95.0** · detectado en 0.94.0 · prioridad **media** — el bloqueo vuelve a ofrecer el
«dale» en un turno despertado, y medirlo mostró que la causa era otra que la que el caso nombraba

## Resumen

`AP.HOW()` tiene dos redacciones y el propio comentario dice cuál vale cuando hay alguien
(`engine/hooks/approval.js:88-91`):

> «Con una persona en el chat, además, deja anotado lo que se frenó —para eso llama a `hold`— y lo dice
> primero: contestar es más corto que editar un archivo, y es lo que la persona ya está haciendo.»

Esa redacción sale sólo si `CHAT.hold(input, lines)` devuelve `true`, y `hold` devuelve `false` cuando
`said(input)` no encuentra el registro del mensaje **en curso**.

**Un turno que despertó una notificación de tarea de fondo no es el mensaje de la persona**, así que
`idOf(input)` no coincide con `saved.id` y `said` devuelve `null` — aunque el registro exista, aunque
tenga `"human": true` y aunque la persona esté leyendo el bloqueo en ese instante. El agente recibe la
redacción de «no hay nadie a quien preguntarle», repite lo único que le ofrecieron —pegar líneas en
`.ops-approval`— y la persona termina copiando y pegando un comando que no hacía falta.

Lo que confirma que la salida por chat estaba disponible: **el «dale» funcionó las dos veces**, en el
mensaje siguiente. Lo que faltó no fue el mecanismo, fue ofrecerlo.

## Reproducción

En una sesión de Claude Code con una persona presente:

1. La persona pide algo que toca un archivo que el guard va a frenar.
2. El agente lanza un subagente (o cualquier trabajo de fondo) y termina el turno.
3. Vuelve la notificación de la tarea y el agente retoma **en ese turno** e intenta el cambio.
4. `guard-files` frena y el mensaje arranca en «Aprobalo pegando tal cual en …», sin la frase del «dale».

Medido el 2026-09-16, dos veces en la misma sesión (`29e97538-30bd-4955-9c65-2f3431505b23`), las dos
inmediatamente después de una `task-notification`. El registro de la sesión en `/tmp/cauce-chat/` tenía
`"human": true` en ambos momentos.

## Causa raíz

`engine/hooks/chat.js:198-204`:

```js
function said(input) {
  if (process.env.CI || input.agent_id || !input.session_id) return null
  const saved = load(input.session_id)
  if (!saved || !saved.human || saved.flow) return null
  const current = idOf(input)
  return current && saved.id && current !== saved.id ? null : saved
}
```

La última línea es correcta **para autorizar**: impide que un «dale» de hace tres mensajes cubra algo que
se frenó ahora. El problema es que `hold()` —que sólo quiere *anotar lo frenado y saber si hay alguien a
quien preguntarle*— pasa por la misma puerta (`chat.js:305-317`), y ahí esa comparación no protege nada:
**preguntar no es conceder**.

> Verificado: las líneas citadas y que `files.js:263` llama a `AP.HOW('OPS_PLAN_FIRST_OVERRIDE', [raw], input)`,
> o sea que el guard sí usa `HOW` y no arma su propio texto.
> Hipótesis, no comprobada acá: que el turno despertado por la notificación llegue con un `prompt_id`
> distinto del que anotó el mensaje de la persona. Es la única rama de `said` compatible con lo observado
> —registro presente, `human: true`, sin subagente, `session_id` correcto— pero no instrumenté el hook
> para leer el `prompt_id` que efectivamente llegó.

## Fix propuesto

Partir la pregunta en dos, que hoy están fundidas:

```js
// Hay una persona a quien preguntarle: no exige que este turno sea el suyo.
function present(input) {
  if (process.env.CI || input.agent_id || !input.session_id) return null
  const saved = load(input.session_id)
  if (!saved || !saved.human || saved.flow) return null
  return saved
}

// Esta persona autorizó esto ahora: sigue exigiendo que el mensaje sea el mismo.
function said(input) {
  const saved = present(input)
  if (!saved) return null
  const current = idOf(input)
  return current && saved.id && current !== saved.id ? null : saved
}
```

`hold()` pasa a usar `present`; `authorized()` y todo lo que concede siguen con `said`, sin cambio. El
efecto es que el bloqueo ofrece el «dale» siempre que haya alguien, y no concede nada de más: lo pendiente
queda anotado y lo aprueba el mensaje siguiente, que es exactamente el circuito que el 116 dejó armado.

## Tradeoffs

Aflojar `hold` no afloja ninguna concesión: lo único que cambia es qué texto se imprime y que `pending`
quede escrito en un turno que no era de la persona. El riesgo que hay que no cruzar es el opuesto —hacer
que `authorized` herede el mensaje viejo—, y este fix lo deja intacto a propósito.

Queda un borde honesto: si la persona se fue de la máquina, el bloqueo va a ofrecer un «dale» que nadie
va a contestar. Cuesta una línea de texto y sigue estando el pegado abajo; hoy, en cambio, cuando la
persona **sí** está, le cobramos un copiar y pegar.

## Prioridad

Media. No produce un resultado incorrecto ni deja pasar nada: produce fricción, en el momento exacto en
que Cauce quería evitarla. Lo que la sube de baja a media es que se dispara sola en el patrón más común
de una sesión larga —lanzar trabajo de fondo y retomar cuando vuelve—, así que no es un caso raro.

## Lo relacionado, que no se pide arreglar acá

**La aprobación por conjunto vuelve a frenar con cada archivo nuevo.** El texto lo dice —«valen para ese
conjunto y dejan de valer en cuanto cambie»— y para un commit está bien. Pero en un directorio donde se
itera (crear un archivo, editarlo, crear otro) es un bloqueo por cada archivo: en la sesión que originó
este caso fueron tres por la misma carpeta, ya aprobada dos veces.

No propongo el fix porque no sé si el alcance por conjunto es deliberado, y ampliarlo a un directorio es
exactamente la clase de permiso más ancho que `approval.js:114-116` desaconseja. Lo dejo como pregunta:
si es a propósito, que el mensaje lo diga —«esta aprobación no cubre archivos nuevos»— porque hoy se lee
como si la carpeta hubiera quedado autorizada.

## Contexto de descubrimiento

2026-09-16, trabajo de diseño en `cubiko/servers/design/roax-dropi/` con Claude Code. Lo señaló la
persona, no el agente: después del tercer «pegá esto en `.ops-approval`» preguntó si no sería mejor que
se le ofreciera aprobar por chat. El agente estaba repitiendo lo que el bloqueo le decía; el bloqueo
estaba eligiendo la redacción equivocada.

## Cierre

**Resuelto en 0.95.0, con un arreglo distinto del que el caso proponía.** El síntoma era exacto y el
razonamiento estaba bien construido; la rama de `said` que lo causaba era otra, y el fix propuesto no lo
arreglaba. Se supo corriéndolo, no leyéndolo.

Recorriendo lo que el caso enumeró:

- **«El agente recibe la redacción de no hay nadie a quien preguntarle» → comprobado y cerrado.**
  Reproducido contra el motor: tras el mensaje de la persona, `HOW` devuelve «Decile a la persona qué se
  frenó…»; tras la notificación, «Aprobalo pegando tal cual en…». Con el arreglo devuelve la primera en
  los dos turnos.
- **«La última línea de `said` es la que lo causa» → refutado, midiéndolo.** La notificación entra por el
  **mismo hook** que un mensaje: es un `UserPromptSubmit` cuyo texto arranca con `<task-notification>`, y
  `record` calcula `human = !/^\s*</.test(text)`, así que reescribe el registro con `human: false`.
  `said` devuelve `null` en `!saved.human` y nunca llega a comparar los ids. El caso marcó esa rama como
  hipótesis no comprobada y acertó en marcarla: era falsa.
- **«El registro tenía `human: true` en ambos momentos» → así se leía después, y por eso engañó.** El
  registro es uno por sesión y se reescribe en cada mensaje: la notificación lo dejó en `false` y el «dale»
  siguiente lo devolvió a `true`. Quien lo abrió más tarde vio el estado posterior al bloqueo, no el que
  había cuando el bloqueo ocurrió.
- **«`hold` pasa por la misma puerta que `authorize`, y ahí esa comparación no protege nada» → cierto, y
  es lo que se arregló.** El diagnóstico de fondo —preguntar no es conceder— era correcto; lo que estaba
  mal era qué condición sobraba.
- **El fix propuesto → no se aplicó, porque no arregla el caso.** Su `present()` conserva
  `if (!saved || !saved.human || saved.flow) return null`, y la notificación deja `human` en `false`. Se
  corrió tal como está escrito contra la secuencia real: devuelve `null`, o sea que el «dale» seguiría sin
  ofrecerse.
- **«Lo relacionado, que no se pide arreglar acá» → salió como caso propio, el 170.** La pregunta que
  dejaba abierta quedó contestada de paso: el alcance por conjunto **es** deliberado y el «dale» aprueba
  exactamente lo que se frenó —`approved: ["Write /d/a.md"]`, `granted: []`—. Lo que queda es que la rama
  del chat no dice ese alcance y la del pegado sí, que es una decisión de redacción.

### Lo que se hizo en su lugar

Que haya alguien a quien preguntarle pasa a ser de la **sesión** y no del mensaje: `record` arrastra un
`askable` a través de los mensajes no humanos, igual que ya arrastraba `granted` y por la razón que su
propio comentario daba —«un aviso del runner en el medio no le quita a nadie lo que ya autorizó»—. `hold`
pregunta por eso; `said` quedó intacta, letra por letra.

El arrastre se corta donde tiene que cortarse: un `$flow` deja `askable` en falso, así que un recorrido no
hereda una persona mirando por una notificación que llegó en el medio.

### Qué se corrió

- **La medición que refutó el diagnóstico**: 244 registros reales de `/tmp/cauce-chat/`, uno con
  `human: false`, y su texto es `<task-notification>` — o sea que la notificación sí pasa por
  `UserPromptSubmit`. Es el dato que el caso no tuvo y que cambia la causa.
- **Reproducción determinista** de la secuencia entera contra el motor —mensaje humano, notificación,
  bloqueo—, con las dos redacciones pegadas arriba. Después del arreglo: el «dale» se ofrece, `pending`
  queda en `["ruta"]` —anotar lo frenado es lo que hace que ofrecerlo sirva— y `said()` sigue devolviendo
  `null`, que es la propiedad que no podía moverse.
- **El fix del propio caso, corrido**: `present()` tal como está escrito devuelve `null` sobre la secuencia
  real.
- **Tres mutaciones, las tres en rojo.** Que `said` herede la presencia —la dirección peligrosa— la agarra
  una prueba que ya existía. Que `askable` no se arrastre devuelve el defecto. Que se arrastre ignorando
  el recorrido lo agarra una prueba nueva, que se escribió justamente porque esa rama no la miraba nadie.
- `npm run ci` exit 0: **900 pruebas**, 0 en rojo, 0 salteadas, cobertura 73 archivos en su piso.
