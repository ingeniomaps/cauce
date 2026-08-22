# ADR-NNN — Título corto en imperativo

**Estado:** Propuesto
**Fecha:** YYYY-MM-DD
**Responsable:** Persona o equipo
**Reemplaza:** ninguna | [NNN](NNN-slug.md)

> Una frase opcional que delimita qué decide esta ADR y qué queda fuera.

## Contexto

Explicar el problema, las fuerzas que compiten y el costo de no decidir. Una persona nueva debe entenderlo
sin depender de conversaciones privadas. Separar la decisión si necesita abarcar problemas independientes.

Respaldar cada afirmación no obvia con `[fuente: ruta#sección|ADR-NNN|URL]`. Lo que todavía no esté probado se
declara como `[supuesto: explicación]`; si requiere una respuesta humana, también se registra en
`../HUMAN_ACTIONS.md`.

## Decisión

**Expresar en una frase qué se elige.** Después definir límites, responsabilidades y contratos relevantes.
Una ADR decide una dirección durable; no reemplaza el plan de implementación ni afirma trabajo inexistente.

## Alternativas consideradas

- **Alternativa:** por qué se descartó con las restricciones conocidas.
- **No decidir todavía:** qué costo o riesgo produciría.

## Consecuencias

**Ganamos:**

- Beneficio concreto y verificable.

**Costos que aceptamos:**

- Complejidad, deuda o restricción introducida, junto con su mitigación cuando exista.

## Estado de implementación

Separar lo construido de lo objetivo. Enumerar pruebas, migraciones y follow-ups pendientes. Una ADR propuesta
no se presenta como implementada; una aceptada debe indicar cómo se verificó o qué parte sigue en transición.
