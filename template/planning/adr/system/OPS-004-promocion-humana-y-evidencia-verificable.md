# OPS-004 — Exigir promoción humana y evidencia verificable

**Estado:** Aceptado
**Fecha:** 2026-08-14

> Decide quién autoriza intención nueva y cuándo puede afirmarse que una tarea terminó.

## Contexto

Un agente puede producir ideas y cambios plausibles sin autoridad de producto ni evidencia del camino real.
Permitir que apruebe sus propuestas o declare éxito por inspección convierte una sugerencia en alcance y oculta
fallas funcionales.

## Decisión

**Los agentes pueden proponer, pero una persona controla la promoción de intención nueva y las acciones externas.**
Una tarea solo termina con aceptación observable y resultados reales de las verificaciones aplicables. Los
bloqueos que requieren autoridad se registran en `HUMAN_ACTIONS.md` o `AWAITING_REVIEW.md`.

## Alternativas consideradas

- **Autopromoción por confianza o puntuación:** no concede autoridad ni elimina el riesgo de ampliar alcance.
- **Éxito por revisión estática:** no demuestra ejecución, integración ni comportamiento de usuario.

## Consecuencias

**Ganamos:** control de alcance, auditoría y afirmaciones respaldadas por evidencia.

**Costos que aceptamos:** ciertos hitos se detienen hasta obtener una decisión o ejecutar una prueba real.

## Estado de implementación

Implementado por el protocolo, los estados de planning, los guards, las propuestas de agentes y los checkpoints
humanos de las integraciones.
