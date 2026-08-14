# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=machine-learning-engineer`. Completar el informe con fuentes primarias, versiones, modelos/casos de uso, jurisdicción, evidencia reproducible y cambios de estado —incluidos drafts o revisiones—. Investigar no autoriza entrenar o desplegar.

## Propuesta mensual automática

GitHub Actions genera y valida una propuesta mensual, abriendo pull request sólo si hay cambios. Nunca modifica `SKILL.md`, datasets, prompts, modelos o endpoints automáticamente.

## Aplicación

Una persona revisa aplicabilidad, riesgo y evaluaciones; ejecuta `make agent-evaluate AGENT=machine-learning-engineer`; aplica cambios aprobados, reevalúa y registra la decisión en `HISTORY.md`.
