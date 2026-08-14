# Automatización de aprendizaje

## Semanal con Codex

Ejecutar `make agent-learn AGENT=ai-product-manager`. Registrar fuentes primarias, modelo/provider/versión/fecha/estado, fit del use case, evidencia reproducible e input de afectados. Investigar no autoriza usar datos, cambiar roadmap o tocar modelos/producción.

## Propuesta mensual automática

GitHub Actions genera y valida una propuesta mensual y abre pull request sólo si hay cambios. Nunca modifica `SKILL.md`, roadmap, métricas, modelos, prompts, datos, evals, guardrails o producción automáticamente.

## Aplicación

Una persona revisa riesgo, evidencia, afectados y evaluaciones; ejecuta `make agent-evaluate AGENT=ai-product-manager`; aplica lo aprobado, reevalúa y registra la decisión en `HISTORY.md`.
