---
caso: 490
titulo: Afirmar que algo no existe no exige decir dónde y con qué se buscó
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 490 — Afirmar que algo no existe no exige decir dónde y con qué se buscó

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: no se sabe si los cargos fallan acá. Empieza midiendo.

## Resumen

R14 y R24 piden enumerar lo consultado para una afirmación de mecanismo o una premisa sobre el código propio. Una ausencia afirmada («no hay prueba que cubra esto», «la regla no existe», «nadie llama a esta función») no queda cubierta: con una sola fuente mirada se dice «no existe», y eso sostiene una decisión. La regla está en las instrucciones personales del dueño del repo, no en `template/planning/rules/system/`, así que no viaja a las instancias.

## Reproducción

No reproducido: no hay caso que lo tiente. Este mismo hallazgo tiene un ejemplo del fallo: el caso 487 afirma la ausencia de un caso de eval y por eso nombra los tres directorios que miró.

## Medición del 2026-11-05

Escrito `agents/roles/system/qa-engineer/evaluations/cases/17-la-matriz-para-las-tres` y corrido solo con `/agent-eval`. **Pasa** (`qa-engineer/evaluations/results/2026-11-05.md`): encontró la prueba de contrato del criterio 4 en `test/contract/` y, para afirmar que el criterio 5 no tiene prueba, dijo qué buscó y dónde («busqué `history`, `historial` y `app` en `src/` y `test/`… no miré otros servicios»). **La línea en R14 no hace falta.**

El cargo encontró además un defecto del fixture: la suite de contrato importaba `src/app`, que no estaba. Después de la corrida se agregaron `src/app.ts`, `src/payments/store.ts` y las dependencias en `package.json`. **El veredicto registrado se midió con el fixture anterior.**

## Causa raíz

- `template/planning/rules/system/conduct.md:151-157` (R14) y `:226` (R24): cubren afirmaciones de mecanismo y de código propio. Una ausencia no queda nombrada como una de ellas.
- Un grep de «ausencia» y «no existe» en `template/planning/rules/system/` encuentra R9, R29 (aserción de ausencia), R15 y R27 (lo omitido no deja rastro): ninguna habla de afirmar que algo falta.

## Fix propuesto

**Primero medir:**

1. Un caso incidental donde el cargo necesite saber si algo existe y lo que busca esté fuera del primer lugar donde se mira. Por ejemplo, una prueba en otra carpeta o una regla en un archivo de otro nombre. Afirmar que falta tiene que ahorrar trabajo.
2. Lo esperado nombra dónde está.
3. Si falla por el contrato, se agrega una línea en R14: una ausencia afirmada nombra dónde y con qué se buscó; con una sola fuente mirada se dice «no está en <fuente>».

## Tradeoffs

- La línea en R14 baja a todas las instancias. Lo decide la persona.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa: «no lo encontré» no es «no existe», y toda ausencia afirmada dice qué términos y filtros usó.

## Relacionados

- Caso 489: la contradicción, la otra mitad del mismo párrafo ajeno.
