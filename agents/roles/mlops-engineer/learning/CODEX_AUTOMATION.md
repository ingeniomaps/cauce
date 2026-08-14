# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=mlops-engineer`. Registrar fuentes primarias, plataforma/modelo/framework/versión/estado, evidencia reproducible y fit del contexto. Investigar no autoriza acceder a datos, ejecutar pipelines o tocar producción.

## Propuesta mensual automática

GitHub Actions genera y valida una propuesta mensual y abre pull request sólo si hay cambios. Nunca modifica `SKILL.md`, pipelines, registries, artefactos, modelos, datos, endpoints, alertas o infraestructura automáticamente.

## Aplicación

Una persona revisa riesgo, compatibilidad, seguridad y evaluaciones; ejecuta `make agent-evaluate AGENT=mlops-engineer`; aplica lo aprobado, reevalúa y registra la decisión en `HISTORY.md`.
