---
caso: 488
titulo: Mientras conviven lo deprecado y su reemplazo, nada pide llevar un arreglo de uno al otro
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 488 — Mientras conviven lo deprecado y su reemplazo, nada pide llevar un arreglo de uno al otro

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: el defecto vuelve el día que se migra, y no lo mide ningún caso. Si termina tocando R29, baja a todas las instancias.

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

## Cierre

El caso pedía medir primero y tocar R29 sólo si fallaba. `frontend-engineer/10-la-fecha-un-dia-antes` se corrió solo
el 2026-11-05 y con el catálogo el 2026-11-12, en la renovación de los veredictos vencidos, y **pasa** las dos veces. Su veredicto está vigente hoy:
frontend-engineer da «7/10 pasan», con 0 vencidos, y el 10 no está entre los rojos (02, 03 y 09, que son anteriores).

Contra el caso:

- **Fix 1, el caso incidental:** se hizo. Hay un `DatePicker` deprecado y un `DateField` de reemplazo con el mismo
  corrimiento, y lo esperado nombra el reemplazo y el defecto.
- **Fix 2, la frase en R29:** se decidió que no, porque el caso pasó dos veces sin ella.
- **Tradeoff, el paso 2 baja a las instancias:** no aplica, porque no se hizo.
- **Tradeoff, el costo:** corrió un solo caso, y después entró en la renovación del catálogo.

### Lista de cierre

1. hecho: la ausencia del caso y el párrafo de deprecación de R29, que no habla de un arreglo mientras conviven las dos versiones.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`; el caso de eval entró antes, en `main` (c7b44194 y fa06fc50).
3. no aplica: no hay código. La medición es el caso de eval, que se esperaba ver pasar o fallar, y pasó.
4. no aplica: no hay código que mutar, y como el caso pasó, no se tocó ninguna regla.
5. no aplica: no se quita ni se reemplaza nada.
6. hecho: el cargo real corrió con `/agent-eval` el 2026-11-05 y el 2026-11-12, con modelo y sin dobles.
7. hecho: lo que depende de un modelo es justo el caso de eval, y corrió con uno dos veces.
8. hecho: corrió el caso 10 solo, y con el catálogo el 2026-11-12; hoy se compuso con 0 vencidos.
9. no aplica: no coordina nada.
10. hecho: nadie depende de un caso de eval nuevo. Como no se tocó la regla, ninguna instancia recibe nada distinto.
11. no aplica: este cierre no trae código. El caso de eval lo juzgó un juez aparte del que respondió, que es la revisión que corresponde a un caso.
12. no aplica: no se agregan comentarios de código.
13. hecho: `npm run ci` con el cierre stageado.
14. hecho: recorrido arriba contra Fix y Tradeoffs.
15. hecho: lo corrido, arriba. No hubo nada que el enunciado no previera.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG junto con 487, 489 y 490.

**Sin probar:** nada.
