# OPS-006 — Escalar la ceremonia con la superficie del cambio

**Estado:** Aceptado
**Fecha:** 2026-08-22
**Responsable:** Cauce
**Reemplaza:** ninguna

> Decide cuánto proceso corre una tarea y quién la mira. No decide qué fases existen.

## Contexto

La máquina de fases sirve para el cambio que cruza contratos, datos o permisos. Corrida entera sobre un typo o
un umbral interno cuesta un plan, una crítica, un review y un QA para una línea, y ese costo no lo paga la
tarea: lo paga la cola, porque cada vuelta es contexto que se reenvía [fuente: ../../rules/system/process.md].

Bajar la ceremonia por tamaño es la salida obvia y es la equivocada. Un `if` en el chequeo de permisos son tres
líneas y puede tirar la autorización de todo un servicio; un componente entero de presentación son cuatrocientas
y lo peor que hace es verse mal. Lo que predice el riesgo es qué superficie toca el cambio, no cuánto ocupa.

## Decisión

**La tarea declara un carril, y el carril decide qué fases corren; el cast decide quién la mira.** Son una sola
decisión —la clasificación— y viaja escrita en la línea de la tarea, así que se toma una vez al promoverla y no
una vez por corrida.

Lo que fija el carril es la superficie: `express` cuando la aceptación nombra un valor literal y el resultado no
lo mira nadie; `directo` cuando es igual de mecánico pero cambia algo que alguien ve; `lite` para comportamiento
nuevo dentro de un servicio conocido; `full` cuando cruza contratos, datos, autenticación o permisos, o cuando
la aceptación tiene un borde sin decidir.

El carril reduce ceremonia y nunca seguridad, aceptación ni evidencia: WIP, Verify y el registro en DONE corren
en los cuatro carriles del recorrido.

## Alternativas consideradas

- **Derivar el carril en cada corrida:** costaba una llamada por tarea y el resultado se tiraba al terminar,
  así que la misma tarea podía clasificarse distinto dos veces sin que nadie lo viera.
- **Una sola ceremonia para todo:** predecible y cara. La cola avanza al ritmo de la tarea más chica.
- **Escalar por tamaño del diff:** medible y mal correlacionado con el riesgo, que es lo que se quiere acotar.

## Consecuencias

**Ganamos:**

- La tarea mecánica no paga el proceso de la tarea riesgosa, y la riesgosa no se abarata por ser corta.
- La clasificación es auditable antes de ejecutar: está escrita y `check` la contrasta contra el catálogo.

**Costos que aceptamos:**

- Un carril mal elegido baja ceremonia donde hacía falta. Se acota con el criterio escrito y con que la tarea
  sin clasificar sea un estado válido que dispara al clasificador, en vez de un default silencioso.
- Cada carril es un contrato que mantener alineado entre la prosa, el motor y el workflow.

## La salida que el recorrido no tenía (caso 380)

Los cuatro carriles bajan ceremonia **dentro** del recorrido, y el piso no baja de seis o siete agentes ni en
`express`. Medido en una instancia real: tres tareas de pantalla de una o dos horas costaron 47 agentes y 10,67 M
tokens propios, y escribir el código fue el 17 %. Ningún carril decía «esto lo hace la sesión».

Desde 0.108.0 hay un quinto valor, `manual`, y no es un carril del recorrido sino su salida: `context` no se lo
ofrece a ningún runner, y si el clasificador lo elige la corrida suelta la reserva y sigue. Se eligió un valor
nuevo y no redefinir `express` porque `express` sirve a una corrida que nadie mira y `manual` necesita una sesión
que la retome, y porque las entradas de `done/` que dicen `express` pasarían a contar algo que no pasó.

Es la única excepción a «la superficie y no el tamaño»: `manual` sí mira el tamaño —una hora—, porque lo que
decide es quién la hace más barato y no cuánta revisión merece. Por eso hereda los dos pisos que el tamaño no
ve: nunca sobre una superficie de «Qué no se puede romper» —el recorrido lo comprueba cuando el clasificador la
devuelve; escrita a mano, lo cuida sólo quien escribe la línea—, y ante la duda no es `manual`. La evidencia no baja:
la sesión la cierra con prueba en rojo, mutación, gate, commit y `done/`, sin revisor, como `express`.

## Estado de implementación

Construido: el vocabulario vive en el motor, `check` rechaza un carril inexistente y distingue la tarea sin
clasificar, y una prueba contrasta las copias del workflow y del protocolo contra el motor.

Pendiente: no hay medición de si el carril elegido fue el correcto. Se sabría comparando hallazgos de review
por carril, y hoy no se registra esa dimensión en DONE.
