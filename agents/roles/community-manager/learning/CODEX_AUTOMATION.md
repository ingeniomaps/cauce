# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=community-manager`. Completar el informe con fuentes primarias, versiones, plataforma/jurisdicción, aplicabilidad y evidencia desidentificada. Investigar no autoriza interactuar con miembros o cambiar comunidades.

## Propuesta mensual automática

GitHub Actions ejecuta `make agent-propose AGENT=community-manager`, valida el agente y abre un pull request sólo si existe propuesta. Nunca cambia `SKILL.md`, normas, canales o sanciones automáticamente.

## Aplicación

Una persona revisa fuentes, riesgos y evaluaciones; ejecuta `make agent-evaluate AGENT=community-manager`; aplica cambios aprobados, reevalúa y registra la decisión en `HISTORY.md`.
