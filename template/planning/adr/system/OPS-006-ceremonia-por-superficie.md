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
en los cuatro.

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
- Cuatro carriles son cuatro contratos que mantener alineados entre la prosa, el motor y el workflow.

## Estado de implementación

Construido: el vocabulario vive en el motor, `check` rechaza un carril inexistente y distingue la tarea sin
clasificar, y una prueba contrasta las copias del workflow y del protocolo contra el motor.

Pendiente: no hay medición de si el carril elegido fue el correcto. Se sabría comparando hallazgos de review
por carril, y hoy no se registra esa dimensión en DONE.
