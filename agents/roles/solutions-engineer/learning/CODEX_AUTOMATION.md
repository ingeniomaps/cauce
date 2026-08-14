# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=solutions-engineer`. Completar el informe generado con novedades relevantes, versiones, aplicabilidad, evidencia primaria, impacto y recomendación. Investigar no autoriza cambiar `SKILL.md`, materiales, producto ni sistemas.

## Propuesta mensual automática

GitHub Actions ejecuta `make agent-propose AGENT=solutions-engineer`, valida el agente y abre un pull request sólo si existe una propuesta nueva. La propuesta debe citar fuentes, separar método de evidencia de producto y declarar riesgos y casos de evaluación afectados.

## Aplicación

Una persona revisa fit con la empresa, evidencia y compatibilidad; ejecuta `make agent-evaluate AGENT=solutions-engineer`; edita el agente; vuelve a evaluar y registra la decisión en `HISTORY.md`. Nunca hay autoaplicación.
