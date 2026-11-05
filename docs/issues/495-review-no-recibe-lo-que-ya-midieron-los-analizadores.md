---
caso: 495
titulo: Review corre antes de los gates y no recibe lo que un analizador ya decide sin juicio
estado: descartado
prioridad: baja
version-detectada: 0.119.0
---

# 495 — Review corre antes de los gates y no recibe lo que un analizador ya decide sin juicio

**⚪ descartado** · detectado en 0.119.0 · prioridad **baja**: medido el 2026-11-05 en los diarios, lo mecánico es 1 de 31 bloqueantes.

## Resumen

En `autobuild`, Review revisa el diff y después Verify corre los gates declarados del proyecto (lint, typecheck, pruebas). Review no sabe qué van a medir esas puertas, así que puede gastar juicio en lo mecánico (largo de línea, sombreado, imports sin usar), repetir lo que el linter dirá después o contradecirlo. La fuente ajena midió que lo mecánico pedido a un modelo varía entre corridas sobre el mismo commit.

## Reproducción

**No reproducido.** Lo comprobado leyendo:

- `automatization/workflows/autobuild.js:1929`: Review (`label: 'review'`).
- `:2157`: Verify, después, que corre `contract.gates` (`:2142-2145`).
- `engine/cli/contract.js:257`: los gates salen de `verify` de cada raíz.

Medido el 2026-11-05 con un guion de Node sobre los `journal.jsonl` de esta máquina (`~/.claude/projects/*/*/subagents/workflows/*/journal.jsonl`), uniendo `started` y `result` por `agentId` y quedándose con `label: review`:

| | Cantidad |
|---|---|
| Diarios | 280 |
| Corridas con Review | 126 |
| Resultados de Review | 191 |
| Hallazgos | 1.125 |
| Bloqueantes | 31 |
| Bloqueantes que nombran lint, formato, imports sin usar, largo de línea o sombreado | 3 |
| De esos 3, mecánicos de verdad (leídos uno por uno) | 1 |

- **El mecánico** es un spec que no pasaba el lint del repositorio. Review lo encontró corriendo el linter del proyecto con su configuración, exit 1, que es lo que este caso proponía.
- **Los otros dos** sólo nombran una palabra: una fila de documentación que declaraba mal una versión de acción, y una clase CSS cuya hoja quitaba el cambio, que es un dependiente de una quita (R29).

El problema que la fuente ajena midió no aparece en Cauce.

## Causa raíz

El orden de las fases, y que Review no recibe la salida de ningún analizador.

## Fix propuesto

**Primero la medición de arriba.** Si la fracción es significativa:

- Correr los gates declarados que no escriben antes de Review y pasarle su salida, diciéndole que no repita lo mecánico.
- O, más barato, decirle a Review qué gates corren después, para que no los adelante.

## Tradeoffs

- **Correr gates antes de Review** suma una corrida de puerta por tarea, y R26 pide que una puerta no escriba en el árbol. Sólo entran las que no escriben.
- **Reordenar fases es una quita** (R29): hay que comparar la salida de antes y la de después sobre el mismo caso.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Su revisión de PR manda lo mecánico al linter, con la misma configuración que la CI y sólo sobre líneas añadidas, y el revisor modelo no lo repite. Según ellos, dos corridas sobre el mismo commit dieron 8 y 16 hallazgos. El número no se reprodujo.

## Relacionados

- Caso 484 y caso 485: el mismo Review.

## Cierre

Descartado el 2026-11-05 por decisión de la persona, sobre la medición de «Reproducción».

- **Correr los gates antes de Review y pasarle su salida:** no. Sobre 1.125 hallazgos de 191 Reviews, sólo 1 de 31 bloqueantes era mecánico, y Review ya lo encontró corriendo el linter del proyecto.
- **Decirle a Review qué gates corren después:** no, por lo mismo. No hay hallazgos mecánicos que Review esté adelantando.
- **La comparación antes y después que pedía Tradeoffs:** no aplica, porque no se cambia nada.

Se reabre si los diarios de una instancia muestran Reviews que bloquean por lo que un linter declarado del proyecto ya decide.

**Sin probar:** los hallazgos no bloqueantes no se clasificaron uno por uno; el grep marcó 127, en su mayoría menciones de «lint» en contexto, no hallazgos mecánicos.
