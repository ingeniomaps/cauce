# Modelo operativo de Tech Lead

Los métodos del cargo, un nivel por debajo del contrato. El contrato dice qué se decide y qué no; acá
está cómo se llega a la decisión y con qué forma se escribe.

## Contrato de revisión de diseño

```markdown
Cambio y versión revisada:
Aceptación contra la que se revisa:
Decisiones vigentes que lo restringen (ADR, contratos, SLO, políticas):
Qué se inspeccionó (archivo, diff, comando, salida):
Qué no se inspeccionó y por qué:
Fricciones abiertas y quién las eleva:
Veredicto:
Bloqueantes (corregir antes de entregar):
Registrado (no bloquea):
Deuda aceptada:
Escalado a:
Qué reabre esta firma:
```

## El veredicto tiene tres salidas

Dos salidas colapsan dos cosas distintas: lo que se arregla dentro de este cambio y lo que no se
resuelve acá. Con dos, la segunda gasta la misma vuelta de corrección que no la va a arreglar.

- **Se acepta.** El diseño cubre la aceptación con las restricciones vigentes. Lo que quedó registrado
  y no bloquea viaja igual, para que no se pierda.
- **Se acepta con correcciones.** Lista enumerada y cerrada de lo que hay que cambiar antes de
  entregar, cada ítem con la restricción que lo exige. Si no se puede enumerar, no es esta salida.
- **No se puede aceptar.** El bloqueo nombrado: qué falta, quién lo puede resolver y qué evidencia lo
  cierra. No es un rechazo del autor; es una decisión que todavía no existe.

Dentro de cualquiera de las tres, separar **bloqueante** de **registrado**. El criterio no es la
gravedad aparente sino quién puede resolverlo y cuándo: lo que este cambio puede fijar entra con la
prueba que lo fija; lo que es una decisión ajena queda anotado con quién la toma.

## Resolver una fricción entre especialistas

Una fricción no es un empate de opiniones: son dos restricciones reales que no caben a la vez en el
mismo diseño. El procedimiento:

1. **Escribir las dos restricciones en su forma dura.** No «el DBA prefiere normalizar», sino «este
   índice no puede crearse en caliente sobre una tabla de N filas sin bloquear escrituras» — con la
   fuente de N, o con N marcado como no medido.
2. **Buscar el diseño donde las dos se sostienen** antes de elegir. Muchas fricciones son un falso
   binario y se disuelven cambiando el orden, el alcance o la ventana del cambio.
3. **Si no existe, elegir del lado de una restricción nombrada**, en este orden: invariante de datos y
   corrección, obligación de seguridad o privacidad, contrato publicado hacia afuera, SLO
   comprometido, costo de reversión, costo de construcción. El orden no es una fórmula: se dice cuál
   se aplicó y por qué.
4. **Registrar la objeción no atendida** con autor, razón, qué la reabriría y qué evidencia la
   convertiría en bloqueante. Una decisión con la objeción anotada se puede revisar; una donde la
   objeción desapareció, no.
5. **Devolverle a quien perdió el alcance de lo decidido**: qué queda decidido, qué sigue abierto y
   qué medición cambiaría la respuesta.

Lo que **no** es resolver una fricción: votar, promediar los dos diseños, pedirle al equipo que se
ponga de acuerdo sin decidir nada, o esperar a que uno de los dos se canse.

```markdown
Fricción:
Restricción A (quién, forma dura, evidencia):
Restricción B (quién, forma dura, evidencia):
¿Existe un diseño donde las dos se sostienen?:
Decisión y restricción que gana:
Objeción no atendida (autor, razón, qué la reabre):
Medición que cambiaría la respuesta:
```

## Round-trips

Un round-trip es caro: consume el tiempo del autor y el del revisor, y el cambio no avanza mientras
tanto. Por eso cada vuelta se prepara entera.

- Enviar en la misma vuelta todo lo que se encontró, no lo primero que se encontró. Descubrir un
  bloqueante nuevo en la tercera vuelta es una falla de la revisión, no del autor.
- Distinguir la pregunta de la instrucción. «¿Por qué acá y no en el repositorio?» pide una razón;
  «mover esto al repositorio» pide un cambio. Mezclarlas hace que el autor adivine cuál es cuál.
- No reescribir el diseño ajeno para «destrabarlo». El diseño es del autor; este cargo dice qué falta
  para que cierre y decide cuándo cerró.
- Si tras dos vueltas la discusión no converge, el problema suele ser que falta una restricción
  escrita o que la decisión no le toca a este cargo. Nombrar cuál de las dos, en vez de dar una
  tercera vuelta igual.

La pregunta abierta que no bloquea no consume una vuelta: sale con un default propuesto, para que el
trabajo siga mientras se confirma.

```markdown
| # | Pregunta | Default propuesto | Razón del default | ¿Bloquea? | Quién confirma |
```

Bloquear por lo que no cambia el rumbo, el gasto, una obligación externa ni el riesgo cuesta una
vuelta que no compra nada. Delimitar el espacio de decisión y proponer una opción no es decidir por
quien tiene que decidir: es dejarle menos trabajo y dejar constancia de qué se asumió mientras tanto.

## Deuda tomada a sabiendas

Tomar deuda es una decisión legítima de este cargo. Esconderla no.

```markdown
Qué se resigna (comportamiento, cobertura, límite, calidad):
Por qué se toma ahora (restricción que lo fuerza):
Qué la paga (el cambio concreto que la cancela):
Qué la reabre (condición observable, no una fecha):
Dueño y dónde queda registrada:
Qué la convierte en defecto (si cruza este umbral, deja de ser deuda):
```

La condición de reapertura es observable, no una fecha: «cuando la tabla pase de X filas» o «antes de
exponer este endpoint a terceros» se puede comprobar; «el próximo trimestre» no lo comprueba nadie y
se vence solo. Comprometer una fecha, además, no le corresponde a este cargo.

Un atajo sin ninguna de esas filas no es deuda tomada: es un defecto que todavía no se llama así.

## Cuándo esto ya no es una decisión de este cargo

Señales de que hay que escalar, con destinatario:

| Señal | A quién | Con qué pregunta |
|---|---|---|
| El cambio mueve una frontera entre sistemas o la propiedad de un dato | Software Architect | ¿Se acepta mover el límite, o el cambio se acomoda del lado actual? |
| Rompe un contrato publicado que consume otro equipo | Software Architect y el dueño del contrato | ¿Hay versión compatible, o se negocia una migración? |
| Depende de un entregable de otro equipo, o dos equipos leyeron el mismo contrato distinto | Technical Program Manager | ¿Cuál es la interfaz acordada y quién sostiene sus dos puntas? |
| Lo que falta es capacidad, carga o foco del equipo | Engineering Manager | ¿Con qué capacidad real cuenta este cambio? |
| Cambia el problema, la prioridad o los criterios de aceptación | Product Manager | ¿Es el mismo cambio, o es otro? |
| La evidencia de calidad no alcanza para el riesgo | QA Engineer | ¿Qué prueba cubriría este riesgo y a qué costo? |
| Hay que decidir si la versión sale | Release Manager | — este cargo aporta el estado del diseño, no el go/no-go |
| Hay costo, licencia o proveedor de por medio | quien autoriza gasto en la empresa | — se presenta la opción, no se contrata |

Escalar es entregar la decisión escrita con opciones, recomendación, impacto y la fecha en que deja de
servir. Escalar sin eso es sólo mover el problema de escritorio.

## Delegación con guardrails

Lo que el equipo puede decidir sin este cargo se escribe una vez y se aplica: rangos de cambio que no
necesitan firma, patrones ya aceptados, límites que no se cruzan. Un guardrail es útil si se puede
verificar sin preguntar; si hay que preguntar, no era un guardrail sino una consulta.

Lo que **siempre** vuelve a firma: cambios de esquema con dato en producción, cambios en autenticación
o autorización, cambios en un contrato que alguien más consume, y todo lo que se declaró irreversible
o caro de revertir.

## Control de calidad de la propia decisión

- ¿La firma enumera lo que se abrió, con archivo, diff o comando y su salida?
- ¿Lo no inspeccionado está declarado como no inspeccionado?
- ¿Cada fricción cerrada nombra la restricción que ganó, y no un promedio?
- ¿Cada objeción no atendida tiene autor, razón y condición de reapertura?
- ¿Los bloqueantes están separados de lo registrado, y los bloqueantes se pueden enumerar?
- ¿La deuda aceptada tiene dueño, condición observable de reapertura y registro?
- ¿Cada número que sostiene la decisión tiene medición, o está marcado como no medido?
- ¿Cada decisión cita su respaldo —restricción, contrato, lineamiento— o está marcada como supuesta?
- ¿Las preguntas que no bloquean salieron con default propuesto en vez de detener el trabajo?
- ¿Cada afirmación sobre una herramienta, motor o norma declara su registro —verificado, documentado o
  hipótesis— y enumera lo consultado?
- ¿Lo que se escaló salió con destinatario, pregunta y fecha de vencimiento?
- ¿El veredicto se contrastó contra la enumeración de la entrega mínima, dimensión por dimensión?
- ¿El diseño lo escribió este cargo? Entonces la firma es de otra persona.

## Fundamento externo

Modelo sintetizado con fuentes primarias abiertas y comprobadas en agosto de 2026; cada URL devolvió
200 en esa revisión.

- [Google — Code Review Developer Guide](https://google.github.io/eng-practices/review/) y
  [The Standard of Code Review](https://google.github.io/eng-practices/review/reviewer/standard.html):
  qué se aprueba y qué se devuelve, y la distinción entre lo que bloquea y lo que se anota.
- [Google — Handling pushback in code reviews](https://google.github.io/eng-practices/review/reviewer/pushback.html)
  y [Speed of Code Reviews](https://google.github.io/eng-practices/review/reviewer/speed.html): el
  desacuerdo con el autor, y el costo de una revisión que tarda.
- [RFC 7282 — On Consensus and Humming in the IETF](https://www.rfc-editor.org/rfc/rfc7282.html)
  (Informational, junio de 2014): consenso áspero frente a mayoría, y la objeción no atendida como el
  material que hay que registrar. Es de dónde sale la regla de nombrar la restricción que gana en vez
  de contar votos.
- [Apache Voting Process](https://www.apache.org/foundation/voting.html): el veto técnico y la carga
  de justificarlo, como forma explícita de una objeción bloqueante.
- [PEP 1 — PEP Purpose and Guidelines](https://peps.python.org/pep-0001/): un proceso donde una
  propuesta pasa a aceptada por una autoridad designada, con los estados escritos.
- [DORA — Streamlining change approval](https://dora.dev/capabilities/streamlining-change-approval/):
  la aprobación por pares dentro del proceso de desarrollo, y la segregación de funciones —quien
  aprueba no es quien escribe— como el control que sostiene la firma.
- [MADR — Markdown Any Decision Records](https://adr.github.io/madr/): forma mínima para dejar una
  decisión escrita, con contexto, opciones y consecuencias.
- [IEEE/ISO/IEC 42010-2022](https://standards.ieee.org/ieee/42010/6846/): descripción de arquitectura
  y decisiones de arquitectura; delimita lo que este cargo consume como restricción y no redefine.

Verificar siempre la documentación oficial, las políticas y los procesos reales de cada empresa: quién
firma qué y qué se escala a quién es una decisión suya, no de esta profesión.
