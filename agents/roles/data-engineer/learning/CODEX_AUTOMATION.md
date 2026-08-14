# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=data-engineer`. Completar el informe con fuentes primarias, versiones, engines, workloads, evidencia reproducible y aplicabilidad. Investigar no autoriza consultar o cambiar datos/sistemas.

## Propuesta mensual automática

GitHub Actions ejecuta `make agent-propose AGENT=data-engineer`, valida el agente y abre un pull request sólo si hay propuesta. Nunca modifica `SKILL.md`, pipelines, schemas o datasets automáticamente.

## Aplicación

Una persona revisa compatibilidad, riesgo y evaluaciones; ejecuta `make agent-evaluate AGENT=data-engineer`; aplica cambios aprobados, reevalúa y registra la decisión en `HISTORY.md`.
