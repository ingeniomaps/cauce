---
caso: 061
titulo: `autobuild` expande el hito siguiente justo antes de decidir que no lo va a tocar
estado: resuelto
resuelto-en: 0.71.0
prioridad: media
version-detectada: 0.71.0
---

# 061 — La expansión ocurre antes del corte que la vuelve inútil

**🟢 resuelto en 0.71.0** · detectado en 0.71.0 · prioridad **media** — escribe en el BACKLOG al final de cada corrida trabajo que esa corrida descarta

## Resumen

`autobuild` corta cuando la tarea que sigue es de otro hito: es el corte deliberado que evita encadenar
hitos sin que nadie mire entre uno y otro. Pero la fase Pick **expande antes de llegar a ese corte**, así
que el orden real es: se le acaba el hito, escribe el siguiente en el BACKLOG, lo relee, ve que es de
otro hito y termina.

El hito nuevo queda escrito y sin tocar. No es una promoción indebida —la épica estaba aprobada, que es
lo que [056](056-un-planning-inexistente-se-lee-como-cola-vacia.md) cerró— pero sí es trabajo que la
propia corrida decidió no hacer, escrito por ella misma un instante antes de decidirlo.

Y cambia el tamaño de un problema que ya estaba anotado: [057](057-la-expansion-de-una-epica-no-dice-quien-la-escribio.md)
supone que expandir es raro y su tradeoff dice que la frecuencia decide cuál de sus dos vías conviene.
No es raro: ocurre **al menos una vez por corrida que termine su hito**.

## Reproducción

No hace falta una instancia ni gastar agentes: el arnés del recorrido lo reproduce en milisegundos.

```js
// El caso puro: la corrida trabaja un hito, lo termina, y la cola queda vacía.
const conTarea = baseScript()[KEY.context]
const vacio = { blocked: '', hasTask: false, wipActive: false, queued: 0, lane: '', readOk: true,
  cast: { build: '', review: [] } }
const otroHito = { ...conTarea, slug: 'T-9', hito: 'H2' }

const { result, asked, written } = await runFlow(
  { [KEY.pick]: { expanded: true, hito: 'H2' } },
  { contexts: [conTarea, vacio, otroHito] },
)
```

## Síntoma

```
   tareas construidas : ["T-1"]
   expansiones        : 1
   ¿escribió BACKLOG? : true
   ¿usó lo expandido? : false
```

Y arrancando con la cola ya vacía, **dos** expansiones y una sola tarea construida: la primera se usa y
la segunda queda escrita al cerrar.

## Causa raíz

`automatization/workflows/autobuild.js`, el bucle de tareas. La condición de expansión sólo mira el
estado del planning:

```js
if (planning.readOk && !planning.hasTask && !planning.queued) { …expandir… }
if (!planning.hasTask || (currentMilestone && planning.hito !== currentMilestone)) break
```

No mira si la corrida va a poder usar lo que expanda. Cuando `currentMilestone` ya está fijado —o sea,
cuando la corrida ya eligió su hito— el `break` de la línea siguiente es seguro, y aun así la expansión
ya ocurrió.

## Fix propuesto

No expandir cuando la corrida ya fijó su hito, porque en ese caso el corte de abajo es inevitable:

```diff
-  if (planning.readOk && !planning.hasTask && !planning.queued) {
+  if (planning.readOk && !currentMilestone && !planning.hasTask && !planning.queued) {
```

Queda viva la expansión que sí se usa: la de una corrida que arranca con la cola vacía, donde
`currentMilestone` todavía está sin fijar y lo expandido se ejecuta en la misma vuelta.

## Tradeoffs

- Se pierde dejar el BACKLOG «cargado» para la corrida siguiente. Eso hoy parece una ventaja y no lo es:
  la próxima corrida arranca con la cola vacía y expande igual, así que lo único que cambia es **cuándo**
  se escribe — y escribirlo al final de una corrida que ya decidió parar es lo que vuelve difícil saber
  quién lo pidió.
- Si alguien depende de ese efecto para preparar trabajo entre corridas, esto se lo quita. No hay señal
  de que alguien lo haga: no está documentado en ningún lado y el corte por hito dice lo contrario.
- **No medido en producción**: la frecuencia sale del arnés, no de corridas reales. Lo que el arnés
  establece es qué **puede** pasar, y para eso alcanza; cuántas veces pasa por semana necesitaría el
  `journal.jsonl` de una instancia, que no se commitea.

## Contexto de descubrimiento

Midiendo para decidir el 057. La pregunta era con qué frecuencia se expande, porque de eso dependía cuál
de sus dos vías conviene. La medición refutó la hipótesis —«expandir es raro»— y de paso mostró que buena
parte de esas expansiones son de trabajo que la corrida descarta.

## Relacionados

- [057](057-la-expansion-de-una-epica-no-dice-quien-la-escribio.md) — decide sobre la frecuencia que este
  caso cambia, así que conviene arreglar éste antes.
- [056](056-un-planning-inexistente-se-lee-como-cola-vacia.md) — cerró que se expandiera sobre una lectura
  fallida; esto es expandir sobre una lectura buena y no usarlo.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró:

- **El fix se hizo tal cual.** La expansión pide además que la corrida no haya fijado su hito, que es
  cuando el corte de abajo deja de ser inevitable.
- **Medido antes y después, con el mismo arnés que lo destapó.** Una corrida que arranca con la cola vacía
  pasa de dos expansiones a **una**; una que termina su hito pasa de una a **cero**. Las tareas
  construidas no cambian en ninguno de los dos casos, que es lo que había que cuidar.
- **Tradeoff «se pierde dejar el BACKLOG cargado» — se confirma, y sigue sin ser una pérdida.** La corrida
  siguiente arranca con la cola vacía y expande igual, así que lo único que cambia es cuándo se escribe.
- **Tradeoff «si alguien depende de ese efecto» — comprobado, y no hay nadie.** Ningún documento del
  repositorio lo menciona: el único lugar donde aparecía la frase era este mismo caso al enunciarlo.
- **Tradeoff «no medido en producción» — sigue sin medirse, y no cambia la decisión.** Lo que el arnés
  establece es qué **puede** pasar, y con eso alcanza para saber que expandir con el hito fijado nunca
  sirve. Cuántas corridas por semana terminan su hito necesitaría el `journal.jsonl` de una instancia, que
  no se commitea — y ese número no cambiaría el arreglo, sólo su tamaño.
- **La razón por la que este caso existía —que cambia la frecuencia sobre la que decide el 057— queda
  cerrada.** Con el arreglo puesto, la expansión ocurre a lo sumo una vez por corrida y **sólo cuando lo
  expandido se ejecuta en esa misma vuelta**. Ahora sí es rara, que era la hipótesis que la medición había
  refutado antes del arreglo.

Lo que apareció al escribir la prueba y no estaba en el enunciado: **medir «se escribió al BACKLOG»
buscando esa palabra en las escrituras mide otra cosa.** Classify y Done la nombran de forma legítima en
sus prompts, así que la primera versión de la aserción se ponía roja por el motivo equivocado. Lo que
distingue a la expansión es el texto de su propio prompt.

## Retirado en 0.71.0

Lo que este caso construyó **ya no existe**: `autobuild` dejó de promover épicas al BACKLOG, así que no
hay expansión que firmar ni que acotar. La razón está en el
[062](062-la-recurrencia-no-se-promueve-y-la-epica-si.md): el roadmap llama `open` a «candidata editable
que aún no fue promovida», así que pegarla en la cola es promoverla, y BR-OPS-002 la deja fuera hasta que
la apruebe una persona.

El cierre de arriba queda como está —describe lo que se hizo y por qué, y era correcto mientras la
expansión existía—. Esta nota está para que nadie lo lea como vigente.
