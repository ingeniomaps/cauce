---
caso: 076
titulo: El carril queda registrado y nadie lo contrasta contra la ceremonia que la tarea recibió
estado: abierto
prioridad: baja
version-detectada: 0.76.0
---

# 076 — Saber con qué carril corrió no es lo mismo que saber si le correspondía

**🔴 abierto** · detectado en 0.76.0 · prioridad **baja** — el dato existe desde 0.76.0 y todavía no
contesta la pregunta por la que se lo guardó

## Resumen

El [074](074-el-carril-no-sobrevive-al-cierre-y-ops-006-no-se-puede-auditar.md) puso `lane:` en la
entrada de DONE, y con eso el registro dice **con qué carril corrió** cada tarea. La pregunta que
motivaba guardarlo era otra y sigue sin contestarse: **si ese carril era el que su superficie pedía**.

`OPS-006` advierte el error concreto: elegir el carril por el tamaño del diff y no por la superficie que
toca. Una tarea `express` con cinco condiciones de aceptación es esa señal, y hoy nadie la mira.

## Reproducción

No hay una todavía: hace falta una instancia con entradas que ya declaren `lane:`, y el campo existe
desde 0.76.0. Eso es parte de por qué este caso no se hizo dentro del 074.

## Síntoma

Ninguno. `check` pasa, la entrada se lee completa y el carril está escrito. Lo que no está es el
contraste — la misma forma de R15 que originó el 074, un paso más arriba.

## Fix propuesto

Un aviso de `check` que cruce el carril declarado contra lo que la propia entrada muestra:

- una entrada `express` cuya aceptación tiene más de una condición —`express` existe para el valor
  literal, y varias condiciones son la señal que la ADR nombra—;
- una entrada `full` cuyo `qa:` no describe ninguna verificación observada;
- una `lite` o `full` cuyo `tests:` es `n/a — razón` para todos sus criterios.

Avisos y no errores, por lo mismo que el campo avisa: es un juicio sobre el contenido, y un juicio que
frena una entrega por una heurística se termina apagando.

## Tradeoffs

- **Es una heurística sobre prosa**, no una comprobación de forma. Un falso positivo semanal sobre una
  entrada correcta enseña a ignorar el aviso, y entonces también se ignora el que sí importa.
- **Hoy sería ruido puro**: toda entrada escrita antes de 0.76.0 cae en `sin clasificar`, así que el
  cruce no tendría contra qué cruzar. Por eso lo que lo activa es que el aviso de cobertura del 074
  —«N entrada(s) sin lane:»— llegue a cero en una instancia real.

## Contexto de descubrimiento

Cerrando el 074. Ese caso enumeraba este cruce dentro de su «Fix propuesto» y no se hizo: necesita el
campo poblado para no ser ruido. Sale como caso propio en vez de quedarse adentro de un caso cerrado,
que es donde R15 dice que una dimensión se pierde.

## Relacionados

- [074](074-el-carril-no-sobrevive-al-cierre-y-ops-006-no-se-puede-auditar.md) — puso el campo del que
  esto depende, y de cuyo cierre sale.
- **OPS-006** — la ADR que nombra el error que este cruce buscaría: elegir el carril por el tamaño del
  diff y no por la superficie.
