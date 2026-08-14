# OPS-001 — Usar planning como fuente de verdad operativa

**Estado:** Aceptado
**Fecha:** 2026-08-14

> Decide dónde viven intención, estado y evidencia; no decide la arquitectura del producto.

## Contexto

Los agentes pierden contexto entre sesiones y los chats no son un registro durable. Mantener estado paralelo
en conversaciones, tickets y memoria del runner hace imposible saber qué está aprobado, activo o terminado.

## Decisión

**La instancia usa `planning/` como fuente de verdad operativa, legible y validable.** `INBOX.md` recibe ideas,
el roadmap define resultados, `BACKLOG.md` contiene trabajo promovido, `WIP.md` conserva una única ejecución y
`DONE.md` registra evidencia. El protocolo define las transiciones permitidas.

## Alternativas consideradas

- **Usar la conversación del agente:** no es durable ni verificable fuera de la sesión.
- **Usar solo el proveedor externo:** mezcla intención curada con estado remoto y pierde recuperación local.

## Consecuencias

**Ganamos:** recuperación determinista, revisión humana y trazabilidad portable.

**Costos que aceptamos:** el estado debe mantenerse consistente y pasar validaciones antes de cada transición.

## Estado de implementación

Implementado por el parser, el CLI, el protocolo, los guards y las pruebas del toolkit.
