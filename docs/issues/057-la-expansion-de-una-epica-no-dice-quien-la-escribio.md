---
caso: 057
titulo: Un hito que expandió el runner se lee igual que uno que escribió una persona
estado: abierto
prioridad: media
version-detectada: 0.70.0
---

# 057 — La expansión de una épica no deja dicho quién la escribió

**🔴 abierto** · detectado en 0.70.0 · prioridad **media** — no produce trabajo falso, pero borra de dónde vino el que hay

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
