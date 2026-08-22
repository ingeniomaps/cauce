# Metodología

## Separar QUÉ y CÓMO

La épica define comportamiento observable y restricciones, sin prescribir implementación salvo que sea una
restricción real. El plan de la tarea decide tecnología después de leer el código actual.

## Trazabilidad

Cada criterio tiene identificador `CN`; cada historia apunta a criterios con `(→ C1, C2)`. Si una historia
no contribuye a un criterio, sobra o falta un criterio. DONE conserva aceptación, evidencia y commit.

## Context engineering

El contexto mínimo para ejecutar una tarea es: reglas raíz, épica y sus criterios, contexto relevante,
contrato del servicio, tarea y WIP. No cargar todo el historial en el loop caliente.

## Especificación viva

Antes de activar una épica, `## Contexto relevante` debe señalar lo que existe hoy con rutas verificadas.
Si el código contradice la spec, parar y resolver la fuente de verdad; no inventar una tercera versión.

Lo que no se decidió se escribe `Por definir` y no como una decisión provisoria: una épica `open` puede
llevarlos, y `check` los rechaza al activarla. Un borde escrito en prosa afirmativa no se distingue de
uno resuelto, y el que lo ejecute va a decidirlo solo.

## Automatizar invariantes

Lo comprobable debe vivir en validadores o hooks: formatos, duplicados, gates peligrosos y evidencia. El
juicio sigue en review: claridad, adecuación al dominio, UX y decisiones de arquitectura.
