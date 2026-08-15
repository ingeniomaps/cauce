# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=developer-relations-engineer`. Completar el informe con fuentes primarias, versiones, plataformas, evidencia reproducible y aplicabilidad al producto. Investigar no autoriza publicar, cambiar repositorios ni interactuar con la comunidad.

## Propuesta mensual automática

GitHub Actions ejecuta `make agent-propose AGENT=developer-relations-engineer`, valida el agente y abre un pull request sólo si hay propuesta. Nunca aplica cambios a `SKILL.md` ni a contenido público.

## Aplicación

Una persona revisa fuentes, compatibilidad y evaluaciones; ejecuta `make agent-evaluate AGENT=developer-relations-engineer`; aplica cambios aprobados, reevalúa y registra la decisión en `HISTORY.md`.
