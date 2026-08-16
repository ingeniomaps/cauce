# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=implementation-manager`. Completar el informe con fuentes primarias, versiones, aplicabilidad, novedades de implementación y evidencia. Investigar no autoriza cambiar contratos, planes activos, configuraciones ni sistemas.

## Propuesta mensual automática

GitHub Actions ejecuta `make agent-propose AGENT=implementation-manager`, valida el agente y abre un pull request sólo si hay una propuesta. Ninguna propuesta se aplica automáticamente ni convierte una práctica externa en requisito contractual.

## Aplicación

Una persona revisa la propuesta, fit con la empresa y casos afectados; ejecuta `make agent-evaluate AGENT=implementation-manager`; edita el agente; reevalúa y registra la decisión en `HISTORY.md`.
