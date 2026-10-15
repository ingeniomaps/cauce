# Ciclo de desarrollo — complejidad (extracto de la skill `development`)

| Complejidad | Modo de ejecucion en Exec | Aplica a |
| ----------- | ------------------------- | -------- |
| **Medium** | `executing-plans` | Requerimientos simples o de complejidad baja/media |
| **High** | `subagent-driven-development` | Cambios arquitectonicos, integraciones, reglas de negocio criticas, o impacto en multiples componentes |

La clasificacion la **propone la fase de Brainstorm** y la **confirma el dev**. El objetivo es evitar
usar la misma capacidad de procesamiento para todos los requerimientos, optimizando costo, tiempo y
calidad segun la complejidad.

**Complejidad `high` = cambio arquitectonico.** Integracion nueva, mecanismo transversal o impacto en
varios componentes. En `high`, el plan debe citar las reglas no negociables de arquitectura.

| ID | Regla |
| -- | ----- |
| DEV-LC-002 | Clasificar complejidad al cierre de Brainstorm; el dev la confirma antes de pasar a Plan |
