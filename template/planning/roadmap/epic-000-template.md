---
epic: 000
title: Plantilla (no ejecutar)
status: template
service: ruta-principal
---

# Épica 000 — Plantilla

## Resultado

Qué cambia para el usuario o el sistema.

## Fuera de alcance

- Lo que decidimos no hacer en esta épica, para que no entre solo. Lo que todavía no se puede decidir
  no va acá: va en Riesgos.

## Criterios

Cada criterio nombra tres cosas: el disparador, el sujeto y el resultado observable. Sin disparador no
se sabe cuándo probarlo; sin sujeto, a quién. Los bordes son criterios como cualquier otro —el input
vacío, el permiso ajeno, el sistema del que depende caído—: escritos acá se rastrean y se prueban;
escritos en prosa se pierden.

- **C1** — Cuando <disparador>, <sujeto> obtiene <resultado observable>.
- **C2** — Al <borde>, <sujeto> obtiene <resultado observable>, y <lo que no cambia> no cambia.

## Contexto relevante

- Estado actual y rutas reales, verificadas en el repositorio; los ADR de `../adr/` y las invariantes
  de `../business-rules/` que rigen este resultado. Es lo que el ejecutor lee antes de decidir el cómo.

## Historias

- [ ] **slug-de-historia** (→ C1) — Incremento ≤4h. _Aceptación: resultado observable._ (service: ruta)
- [ ] **slug-del-borde** (→ C2) — Incremento ≤4h. _Aceptación: resultado observable._ (service: ruta)

## Riesgos y decisiones humanas

- Lo que no se puede decidir acá: supuestos, dependencias y acciones que necesitan una persona.
  Escribir `Ninguno` cuando se hayan revisado.
