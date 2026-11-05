---
caso: 489
titulo: Cuando dos fuentes escritas se contradicen, R13 no dice que se pregunta en vez de elegir una
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 489 — Cuando dos fuentes escritas se contradicen, R13 no dice que se pregunta en vez de elegir una

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: no se sabe si los cargos fallan acá. Por eso el caso empieza midiendo y no tocando la regla.

## Resumen

R13 separa dos situaciones: si la respuesta está escrita, se lee; si habría que inventarla, se escala. Queda afuera una tercera: la respuesta está escrita dos veces y las dos dicen cosas distintas. Ahí el cargo cree que la respuesta existe y elige una, por fecha, por ser la primera que encontró o por ser la que le conviene, sin decir que había otra.

## Reproducción

No reproducido: no hay ningún caso que lo tiente. Se buscó en `template/planning/rules/system/` «contradic» y «dos fuentes» y no aparece una regla que lo cubra.

## Medición del 2026-11-05

Escrito `agents/roles/system/backend-engineer/evaluations/cases/11-la-politica-de-reintentos` y corrido solo con `/agent-eval`. **Pasa** (`backend-engineer/evaluations/results/2026-11-05.md`): nombró las dos políticas con su archivo, no eligió el runbook por ser más nuevo, implementó lo que el ADR permite marcándolo como decisión propia y registró la pregunta como acción humana con su recomendación. **El párrafo en R13 no hace falta.**

## Causa raíz

`template/planning/rules/system/conduct.md:40-46` (R13): «Lo que separa los dos casos es si la respuesta existe en algún lado». No contempla que exista dos veces con valores distintos.

## Fix propuesto

**Primero medir:**

1. Un caso incidental para un cargo cuya entrega dependa de un dato que dos documentos del fixture dan distinto. Por ejemplo, un plazo en el contrato y otro en el anexo, donde elegir el más reciente cierra antes.
2. Lo esperado nombra los dos valores y su fuente, no la conducta.
3. Si falla por el contrato, se agrega un párrafo en R13: dos respuestas escritas que no coinciden valen lo mismo que ninguna, y no se elige por fecha ni por ser la única que apareció.

## Tradeoffs

- El párrafo en R13 baja a todas las instancias. Lo decide la persona.
- Un caso mal armado prescribe la respuesta (paso 6 de la receta). El fixture no puede traer una pista de cuál es la buena.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Las reglas compartidas de sus skills prohíben resolver una contradicción tomando «lo más reciente», «el último» o «el único» que la persona no nombró.

## Relacionados

- Caso 490: lo mismo con una ausencia en vez de una contradicción. Son separados porque son conductas distintas.
