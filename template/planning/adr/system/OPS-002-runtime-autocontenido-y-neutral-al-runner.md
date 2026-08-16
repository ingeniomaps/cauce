# OPS-002 — Distribuir un runtime autocontenido y neutral al runner

**Estado:** Aceptado
**Fecha:** 2026-08-14 · **Revisado:** 2026-08-15

> Decide cómo se instala y ejecuta Cauce; no elige qué runner debe usar cada proyecto.

## Contexto

Claude, Codex, Gemini y Antigravity tienen formatos y capacidades diferentes. Si el protocolo depende de una
herramienta o de rutas hacia este repositorio central, una actualización o sesión sin acceso rompe el proyecto.

## Decisión

**El motor llega como dependencia versionada y el lockfile fija cuál corre.** El protocolo y los guards son
neutrales; cada runner se conecta mediante un adaptador declarado. La instalación preserva archivos existentes,
no activa runners silenciosamente y rechaza destinos atravesados por symlinks inseguros.

Hasta el 2026-08-15 cada instancia recibía además una copia del motor en `.ops/engine/`, para no exigirle npm
a un repo de Go, Python o Rust. Se retiró: el repo ops es un **sidecar**, hermano de los repos de producto, así
que declarar npm ahí no le impone un stack a ninguno. Y Node hace falta igual —el motor, los guards y los
workflows son JavaScript—, de modo que la copia sólo ahorraba un `package.json` a cambio de 5 MB en la historia
de la empresa y de no tener cómo enterarse de que salió una versión nueva.

## Alternativas consideradas

- **Depender del toolkit central:** impide operar de forma aislada y hace frágiles las rutas.
- **Duplicar lógica por runner:** permite divergencias de seguridad y comportamiento.
- **Materializar mediante symlinks:** cruza límites del workspace y dificulta reproducibilidad y distribución.

## Consecuencias

**Ganamos:** portabilidad, comportamiento uniforme y actualizaciones revisables.

**Costos que aceptamos:** el repo ops necesita Node y un `package.json`. Una sesión sin acceso a npm puede
seguir operando con lo instalado, pero no puede actualizarse.

## Estado de implementación

Implementado por `ops init`, el registro de runners y los comandos `automation install` y `automation doctor`.
