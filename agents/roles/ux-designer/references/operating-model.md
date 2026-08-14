# Modelo operativo de UX Design

## Diseñar desde resultados

Traducir la oportunidad aprobada a:

```markdown
Usuario y contexto:
Trabajo o resultado buscado:
Evidencia disponible:
Restricciones confirmadas:
Supuestos por validar:
Señal de éxito:
```

No empezar por pantallas cuando todavía no está claro el resultado o la tarea.

## Flujo de diseño

1. Representar el journey actual y localizar fallos verificables.
2. Definir tareas y objetos que el usuario entiende.
3. Proponer pocas alternativas, incluida simplificar o eliminar pasos.
4. Dibujar el flujo completo antes de detallar pantallas.
5. Diseñar contenido, jerarquía, controles y feedback.
6. Cubrir estados y accesibilidad desde el inicio.
7. Elegir un prototipo proporcional a la incertidumbre.
8. Revisar con diseño, producto e ingeniería.
9. Validar con el método apropiado y registrar lo aprendido.

## Especificar un flujo

```markdown
# Flujo — <resultado>

## Contexto y evidencia
## Actor, entrada y precondiciones
## Camino principal
## Alternativas y decisiones
## Errores y recuperación
## Estados, permisos y datos extremos
## Accesibilidad y contenido funcional
## Instrumentación o señal de éxito
## Supuestos y validación pendiente
```

## Revisión heurística

Para cada problema registrar:

```markdown
Ubicación:
Principio afectado:
Evidencia observable:
Impacto en la tarea:
Frecuencia o alcance conocido:
Severidad y justificación:
Recomendación:
Validación pendiente:
```

Usar heurísticas para detectar riesgos, no para atribuir comportamiento a usuarios que no participaron.

## Accesibilidad

Diseñar para que la experiencia sea perceptible, operable, comprensible y robusta. Incluir navegación por teclado, orden y visibilidad del foco, nombres accesibles, alternativas textuales, estructura semántica, prevención y corrección de errores, objetivos táctiles adecuados y autenticación accesible. Verificar con revisión técnica y personas con discapacidad cuando el alcance lo requiera.

## Control de calidad

- ¿Cada pantalla o paso sirve a una tarea identificada?
- ¿Existe salida, cancelación o recuperación segura?
- ¿Se cubrieron todos los estados relevantes?
- ¿Etiquetas y jerarquía usan lenguaje del usuario?
- ¿La interacción evita depender sólo de color, gesto, tiempo o memoria?
- ¿Los supuestos y restricciones están claramente separados?
- ¿La validación propuesta responde la incertidumbre principal?
- ¿El artefacto deja libertad técnica a ingeniería y visual a UI Design?

## Fundamento externo

Modelo sintetizado con fuentes revisadas en agosto de 2026:

- [ISO 9241-210:2019](https://www.iso.org/standard/77520.html): integrar diseño centrado en las personas durante el ciclo de vida de sistemas interactivos.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): criterios comprobables para contenido perceptible, operable, comprensible y robusto.
- [Nielsen Norman Group: heurísticas de usabilidad](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary1_A4_compressed.pdf): principios para inspeccionar feedback, control, consistencia, prevención y recuperación.
- [GOV.UK Design System Patterns](https://design-system.service.gov.uk/patterns/): patrones documentados para tareas concretas, adaptables al contexto.

Aplicar las normas, políticas y necesidades reales de cada empresa; ninguna lista sustituye validación con usuarios.
