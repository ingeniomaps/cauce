# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=cloud-architect`. Registrar fuentes primarias, proveedor/servicio/región/versión/fecha/estado, evidencia y fit del workload. Investigar no autoriza acceder o cambiar cloud real.

## Propuesta mensual automática

GitHub Actions genera y valida una propuesta mensual y abre pull request sólo si hay cambios. Nunca modifica `SKILL.md`, cuentas, recursos, redes, DNS, permisos, datos, pipelines o infraestructura automáticamente.

## Aplicación

Una persona revisa tradeoffs, riesgo, costo y evaluaciones; ejecuta `make agent-evaluate AGENT=cloud-architect`; aplica lo aprobado, reevalúa y registra la decisión en `HISTORY.md`.
