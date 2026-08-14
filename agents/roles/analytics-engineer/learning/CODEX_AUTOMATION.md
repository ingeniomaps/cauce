# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=analytics-engineer`. Completar el informe con fuentes primarias, versión/estado, fit de plataforma, evidencia reproducible y equivalencia semántica. Investigar no autoriza consultar datos ni ejecutar SQL.

## Propuesta mensual automática

GitHub Actions genera y valida una propuesta mensual y abre pull request sólo si hay cambios. Nunca modifica `SKILL.md`, modelos, métricas, datos, dashboards o permisos automáticamente.

## Aplicación

Una persona revisa semántica, plataforma, seguridad y evaluaciones; ejecuta `make agent-evaluate AGENT=analytics-engineer`; aplica lo aprobado, reevalúa y registra la decisión en `HISTORY.md`.
