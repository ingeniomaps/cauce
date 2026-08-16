# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=data-scientist`. Completar el informe con fuentes primarias, método/versión, dominio, supuestos, evidencia reproducible y aplicabilidad. Investigar no autoriza consultar datos o lanzar experimentos.

## Propuesta mensual automática

GitHub Actions genera y valida una propuesta mensual, abriendo pull request sólo si hay cambios. Nunca modifica `SKILL.md`, métricas, experimentos o datasets automáticamente.

## Aplicación

Una persona revisa método, dominio y evaluaciones; ejecuta `make agent-evaluate AGENT=data-scientist`; aplica cambios aprobados, reevalúa y registra la decisión en `HISTORY.md`.
