# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=ai-governance-lead`. Completar el informe con fuentes primarias, versión, estado legal, jurisdicción, rol, fechas y revisión competente. Investigar no autoriza reclasificar, aprobar o cambiar sistemas.

## Propuesta mensual automática

GitHub Actions genera y valida una propuesta mensual, abriendo pull request sólo si hay cambios. Nunca modifica `SKILL.md`, inventarios, decisiones o excepciones automáticamente.

## Aplicación

Una persona revisa aplicabilidad y obtiene Legal/owners cuando corresponda; ejecuta `make agent-evaluate AGENT=ai-governance-lead`; aplica cambios aprobados, reevalúa y registra la decisión en `HISTORY.md`.
