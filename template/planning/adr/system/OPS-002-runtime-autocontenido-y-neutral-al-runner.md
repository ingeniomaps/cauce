# OPS-002 — Distribuir un runtime autocontenido y neutral al runner

**Estado:** Aceptado
**Fecha:** 2026-08-14

> Decide cómo se instala y ejecuta Project Ops; no elige qué runner debe usar cada proyecto.

## Contexto

Claude, Codex, Gemini y Antigravity tienen formatos y capacidades diferentes. Si el protocolo depende de una
herramienta o de rutas hacia este repositorio central, una actualización o sesión sin acceso rompe el proyecto.

## Decisión

**Cada instancia recibe una copia autocontenida del motor en `.ops/engine/`.** El protocolo y los guards son
neutrales; cada runner se conecta mediante un adaptador declarado. La instalación preserva archivos existentes,
no activa runners silenciosamente y rechaza destinos atravesados por symlinks inseguros.

## Alternativas consideradas

- **Depender del toolkit central:** impide operar de forma aislada y hace frágiles las rutas.
- **Duplicar lógica por runner:** permite divergencias de seguridad y comportamiento.
- **Materializar mediante symlinks:** cruza límites del workspace y dificulta reproducibilidad y distribución.

## Consecuencias

**Ganamos:** portabilidad, comportamiento uniforme y actualizaciones revisables.

**Costos que aceptamos:** cada instancia conserva una copia que debe actualizarse explícitamente sin sobrescribir
personalizaciones.

## Estado de implementación

Implementado por `ops init`, el registro de runners y los comandos `automation install` y `automation doctor`.
