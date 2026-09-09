---
caso: 057
titulo: Un hito que expandió el runner se lee igual que uno que escribió una persona
estado: resuelto
resuelto-en: 0.71.0
prioridad: media
version-detectada: 0.70.0
---

# 057 — La expansión de una épica no deja dicho quién la escribió

**🟢 resuelto en 0.71.0** · detectado en 0.70.0 · prioridad **media** — no produce trabajo falso, pero borra de dónde vino el que hay

## Resumen

La fase Pick de `autobuild` expande la próxima épica aprobada a un hito nuevo del BACKLOG. Escribe el
hito, la prosa de cada historia y sus referencias a criterios, y **nada en el archivo dice que lo escribió
un runner**. Un hito expandido y uno que redactó una persona son indistinguibles al leerlos.

Mientras la expansión sea correcta eso parece un detalle. Deja de serlo cuando hay que juzgarla: quien
revisa el BACKLOG no tiene cómo saber cuál de los hitos merece una segunda lectura, y quien audita
después de un incidente —como el del caso [056](056-un-planning-inexistente-se-lee-como-cola-vacia.md),
donde seis historias entraron sobre una lectura fallida— tiene que reconstruirlo desde el `journal.jsonl`
del recorrido, que no vive en el repositorio.

Es la contrapartida de lo que el 056 ya cerró: allá se impidió que la expansión ocurra sobre un estado que
no se leyó; acá falta que la que sí ocurre quede firmada.

## Reproducción

1. En una instancia con un roadmap que tenga una épica abierta y aprobada, y el BACKLOG sin tareas en cola.
2. Correr `autobuild`.
3. Abrir el hito nuevo en `planning/BACKLOG.md`.
4. Buscar qué lo distingue de un hito escrito a mano. No hay nada.

## Síntoma

El hito que emitió la corrida del 2026-09-08 traía sus seis historias con hito, prosa y referencias a la
ADR que fija el orden. La expansión estaba bien hecha —y eso es parte del problema: se lee como trabajo
legítimo—. Lo único que decía de dónde salió era el `journal.jsonl` del recorrido, que no se commitea.

## Causa raíz

`automatization/workflows/autobuild.js`, fase Pick. El prompt de expansión pide conservar el slug, las
referencias y el servicio de cada historia, y no pide ninguna marca de origen:

```
Leé ${ROADMAP}. Expandí sólo la próxima épica abierta y aprobada en un hito nuevo de ${BACKLOG},
conservando el slug de cada historia, sus referencias a criterios y su servicio.
```

No es un defecto de implementación: es una dimensión que el diseño no pidió.

## Fix propuesto

Que el hito emitido lleve una línea que lo diga, con la fecha y el recorrido que lo produjo. La forma
exacta la decide quien mantenga el formato del BACKLOG — tiene que sobrevivir a `check`, que valida la
estructura del archivo, y no debería confundirse con una nota de contenido.

Una alternativa que no toca el formato: que la expansión quede registrada en `HUMAN_ACTIONS.md` como una
fila para revisar, en vez de marcarse dentro del BACKLOG. Cambia el costo —una fila que alguien tiene que
cerrar— por una garantía mayor: nadie la descubre tarde.

**No se propone una de las dos acá**: la primera es más barata y la segunda es más fuerte, y elegir
depende de cuánto se confíe en la expansión desatendida, que es una decisión del mantenedor.

## Y dónde está la línea de la autonomía

Viene del 056, que lo dejó planteado en «Relacionados» sin destino: `AGENTS.md` dice que el runner «nunca
amplía el alcance ni promueve sus propias ideas», y expandir una épica **aprobada** a un hito nuevo vive
en la frontera de esa frase — no es una idea propia, y sí es escribir trabajo que nadie pidió en esa
corrida.

Hoy la regla se lee como una prohibición absoluta y el recorrido hace algo que la roza, así que quien la
lea de un lado o del otro llega a conclusiones distintas sobre si el ciclo la respeta. Decirlo en el texto
es parte de este caso y no de otro: firmar la expansión y declarar que es legítima son la misma decisión
vista de los dos lados.

**Toca `template/`**, así que baja a todos los consumidores en su próximo `upgrade`. No es una redacción:
es fijar hasta dónde llega la autonomía del runner, y lo decide quien mantiene el toolkit.

## Tradeoffs

- Marcar dentro del BACKLOG mete metadatos de proceso en un archivo que se lee como contenido, y eso
  tiende a acumularse.
- La vía de `HUMAN_ACTIONS.md` frena el encadenado desatendido de épicas, que es justamente lo que
  `autobuild` compra a quien lo usa así.
- **Sin medir**: no se sabe con qué frecuencia se expande de verdad. Una sola corrida observada no dice
  si esto ocurre todas las semanas o dos veces al año, y esa frecuencia cambia cuál de las dos vías
  conviene.

## Contexto de descubrimiento

Cerrando el caso 056. Es el tercer bloque de su «Fix propuesto», el único que no dependía de los otros
dos, y sale como caso propio en vez de quedar adentro de uno cerrado.

## Relacionados

- [056](056-un-planning-inexistente-se-lee-como-cola-vacia.md) — de donde sale. Allá se impidió expandir
  sobre una lectura fallida; acá falta firmar la que sí corresponde.
- [058](058-autobuild-no-comprueba-su-raiz-antes-de-empezar.md) — el otro que salió del mismo cierre.

## Cierre

**Resuelto en 0.71.0.** El recorrido de lo que enumeró:

- **Se tomó la primera de las dos vías: la marca en el BACKLOG.** El prompt de expansión pide una línea
  debajo del encabezado del hito, con quién la escribió, cuándo y de qué épica sale.
- **La elección se decidió con la frecuencia medida, que es lo que este caso dejaba abierto.** Su tradeoff
  decía que «esa frecuencia cambia cuál de las dos vías conviene», y medirla refutó la suposición de que
  expandir era raro: ocurría al menos una vez por corrida que terminara su hito, y la última siempre se
  descartaba. Eso salió como caso [061](061-autobuild-expande-el-hito-siguiente-y-corta-sin-usarlo.md) y,
  arreglado, la expansión volvió a ser rara **por una razón**: a lo sumo una por corrida, y sólo cuando lo
  escrito se ejecuta en esa misma vuelta.
- **La segunda vía —una fila en `HUMAN_ACTIONS.md`— se descartó, con su razón.** Resuelve un problema más
  grande que el que este caso enuncia: obligar a que alguien revise antes de seguir. Lo enunciado es de
  trazabilidad —«quien revisa no tiene cómo saber cuál merece una segunda lectura»— y eso lo cierra la
  marca. La fila, además, frenaría la corrida siguiente cada vez, para trabajo que la anterior ya ejecutó
  y que salió de una épica aprobada. Lo que la activaría es ver una expansión que no debió ocurrir.
- **Tradeoff «marcar dentro del BACKLOG mete metadatos de proceso en un archivo de contenido» — se paga, y
  se acotó dónde.** La línea va **debajo** del encabezado y no en el título: el parser lee el encabezado
  con un patrón exacto, así que ahí adentro se la comería el título. Comprobado sobre una instancia de
  verdad: con la marca puesta, `check` sale en 0 y `context` devuelve la tarea igual.
- **Tradeoff «la vía de HUMAN_ACTIONS frena el encadenado desatendido» — no se paga, porque no se tomó.**
- **Tradeoff «sin medir: no se sabe con qué frecuencia se expande» — medido, y fue lo que decidió el
  caso.** No en producción —el `journal.jsonl` no se commitea— sino sobre el arnés, que establece qué
  puede pasar. Para elegir entre las dos vías alcanzaba con eso.
- **La sección «Y dónde está la línea de la autonomía» no se hizo, y sale como caso propio: el 062.** Al ir
  a escribir esa aclaración apareció que `AGENTS.md` ya trata el caso análogo —una recurrencia vencida
  tampoco la promueve el runner, aunque esté aprobada y escrita— y lo resuelve **al revés**. Eso no es una
  redacción que faltaba: son dos casos análogos con salidas opuestas, y elegir cuál manda es política.

Lo que apareció al escribir la prueba: **la razón de este cambio no puede vivir en el test y en el código
a la vez.** La primera versión repetía en el test el porqué que ya estaba junto al prompt, y la puerta de
razones repetidas lo marcó. El test dice ahora sólo lo suyo — por qué se afirma sobre el prompt y no
sobre un BACKLOG resultante.

## Retirado en 0.71.0

Lo que este caso construyó **ya no existe**: `autobuild` dejó de promover épicas al BACKLOG, así que no
hay expansión que firmar ni que acotar. La razón está en el
[062](062-la-recurrencia-no-se-promueve-y-la-epica-si.md): el roadmap llama `open` a «candidata editable
que aún no fue promovida», así que pegarla en la cola es promoverla, y BR-OPS-002 la deja fuera hasta que
la apruebe una persona.

El cierre de arriba queda como está —describe lo que se hizo y por qué, y era correcto mientras la
expansión existía—. Esta nota está para que nadie lo lea como vigente.
