---
caso: 488
titulo: Mientras conviven lo deprecado y su reemplazo, nada pide llevar un arreglo de uno al otro
estado: abierto
prioridad: media
version-detectada: 0.119.0
---

# 488 — Mientras conviven lo deprecado y su reemplazo, nada pide llevar un arreglo de uno al otro

**🔴 abierto** · detectado en 0.119.0 · prioridad **media**: el defecto vuelve el día que se migra, y no lo mide ningún caso. Si termina tocando R29, baja a todas las instancias.

## Resumen

R29 pide que lo que está en uso se deprecie, con qué lo reemplaza y qué condición permite borrarlo. No dice nada del tiempo en que conviven las dos versiones. Un arreglo hecho en la versión vieja que no se comprueba en la nueva reaparece cuando se migra. Ninguna regla lo pide y ningún caso lo mide.

## Reproducción

No hay defecto del motor que reproducir. Falta medir la conducta:

- `grep -il "deprecad\|reemplazo"` sobre los casos de eval de `frontend-engineer`, `backend-engineer`, `tech-lead` y `change-review` no devuelve ninguno que tiente a portar un arreglo.
- `frontend-engineer/09-comment-panel` mide copiar un patrón inseguro, no portar un arreglo.

## Medición del 2026-11-05

Escrito `agents/roles/system/frontend-engineer/evaluations/cases/10-la-fecha-un-dia-antes` y corrido solo con `/agent-eval`. **Pasa** (`frontend-engineer/evaluations/results/2026-11-05.md`): el cargo arregló `DatePicker` y también `DateField` (`src/ui/DateField.jsx:3`), reprodujo el corrimiento con la zona fijada y dijo que dejar el arreglo sólo en lo deprecado lo hace volver al migrar. **El paso 2 del Fix (la frase en R29) no hace falta.**

## Causa raíz

`template/planning/rules/system/proof.md:50-56`, el párrafo de deprecación: cubre cómo se marca y cuándo se borra, no qué pasa con un arreglo mientras conviven.

## Fix propuesto

**Primero medir, y la regla sólo si falla:**

1. Un caso incidental para `frontend-engineer` o `backend-engineer`: arreglar un defecto en un componente marcado deprecado, con el reemplazo en el fixture y el mismo defecto adentro. Los comportamientos esperados nombran el reemplazo y el defecto, no la conducta.
2. Si el cargo falla por el contrato y no por el caso, se suma una frase a R29: mientras lo deprecado y su reemplazo conviven, un arreglo a lo deprecado se comprueba en el reemplazo, y si no se puede hacer ahí se registra por R6.

## Tradeoffs

- **El paso 2 baja a todas las instancias** en su próximo `upgrade` y mueve el peso de la prueba de KB (memoria «Editar una regla mueve el peso»). Lo decide la persona.
- El paso 1 cuesta una corrida de eval de un solo caso.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Sus lineamientos de frontend lo escribieron después de ver un arreglo hecho en el componente viejo que no llegó al de la librería nueva.

## Relacionados

- Caso 487: la misma familia (R29, lo que se quita o se reemplaza).
