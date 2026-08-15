# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=partnerships-manager`. Completar el informe con cambios de ecosistema, regulación, estándares y prácticas, citando fuentes primarias, estado, jurisdicción y aplicabilidad. Investigar no autoriza modificar partners, acuerdos o sistemas.

## Propuesta mensual automática

GitHub Actions ejecuta `make agent-propose AGENT=partnerships-manager`, valida el agente y abre un pull request sólo si hay propuesta. Nunca modifica `SKILL.md` ni aplica decisiones.

## Aplicación

Una persona revisa fit, fuentes, riesgos y evaluaciones; ejecuta `make agent-evaluate AGENT=partnerships-manager`; aplica cambios aprobados, reevalúa y registra la decisión en `HISTORY.md`.
