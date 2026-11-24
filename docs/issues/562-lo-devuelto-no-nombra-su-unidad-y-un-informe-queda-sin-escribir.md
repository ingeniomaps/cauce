---
caso: 562
titulo: lo devuelto no nombra la unidad que lo lleva, y un informe vuelve sin escribirse
estado: resuelto
resuelto-en: 0.125.0
prioridad: media
version-detectada: 0.124.0
---

# 562 — Un hallazgo marcado como devuelto no está en ninguna unidad, y un informe que vuelve queda sólo en contexto

**🟢 resuelto en 0.125.0** · detectado en 0.124.0 · prioridad **media**: los dos se pierden sin que nada falle, en cualquier cargo que reparte trabajo a subagentes.

## Resumen

R15 dice que lo que no le toca a una unidad «sale como unidad propia antes de cerrar», y R6 que «queda registrada con qué la cierra y quién puede tomarla». Ninguna dice que la marca que manda algo a otra parte nombre una unidad que exista. R16 dice que el análisis queda donde se escribió y lo lee quien sintetiza; no dice que un informe que vuelve por handoff se escriba al volver.

## Reproducción

No es un defecto de código: es una conducta que las reglas no piden. Se comprueba leyendo `template/planning/rules/system/conduct.md` (R15) y `runs.md` (R16).

## Síntoma

En una instancia: tres hallazgos de una medición quedaron marcados como devueltos sin estar en ninguna tanda, y tres informes de subagentes quedaron sólo en el contexto de quien los pidió hasta el cierre.

## Causa raíz

R15 y R16 no lo dicen.

## Fix propuesto

- R15: «sale como unidad propia» quiere decir que esa unidad existe; la marca nombra la unidad que lo lleva, y está escrita en el mismo cambio.
- R16: lo que vuelve se escribe donde va apenas vuelve; la síntesis no arranca con un informe sin escribir, y el que no encontró nada lo dice con qué miró.

## Tradeoffs

- Baja a las instancias y suma peso a cada agente: el bloque de reglas pasa de 46,x a 48,0 KB junto con el caso 563, y `test/wiring/rules.test.js` lo declara.

## Contexto de descubrimiento

Auditoría del 2026-11-24 sobre lo que una instancia real construyó por su cuenta desde la anterior (2026-11-21), buscando lo que sirve a cualquier empresa. Medido acá, no tomado de la instancia.

## Relacionados

- 563 — la otra regla de esta tanda.

## Cierre

- **R15, la marca nombra su unidad**: se hizo (`template/planning/rules/system/conduct.md`).
- **R16, el informe se escribe al volver**: se hizo (`template/planning/rules/system/runs.md`).
- **Tradeoff, el peso**: el bloque de reglas pasa a 48,0 KB por agente, junto con el 563, y `test/wiring/rules.test.js`
  lo declara con su historia.

Lo que se corrió: `test/wiring/rules.test.js`, que se puso rojo por el peso nuevo (48,0 contra 46,x) y verde al
declararlo. No hay código que mutar.

**Sin probar:** que un cargo coordinador escriba los informes al volver; lo mediría un caso de eval, que no se escribió.

### Lista de cierre

1. hecho: R15 y R16 no lo decían; leído en las dos reglas antes del cambio.
2. hecho: rama `fix/cases-from-an-instance-audit-2`.
3. hecho: la prueba del peso, roja con el texto nuevo y verde al declararlo.
4. no aplica: es texto de regla; no hay código que mutar.
5. no aplica: agrega dos frases, no quita nada.
6. no aplica: una regla no se ejerce en un banco; lo haría un eval de cargo, anotado en Sin probar.
7. no aplica: no se corrió un eval de cargo; anotado en Sin probar.
8. no aplica: no hay prueba real.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: dependía la prueba del peso de las reglas, actualizada.
11. hecho: cinco pasadas de `/code-review` sobre el diff de la tanda y una sexta acotada a los últimos cambios; cada hallazgo de lo que esta tanda empeoraba se arregló, y lo previo o menor quedó anotado en el cierre que le toca.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios (repetidos y doce palabras) pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1999 de 1999, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que la revisión agregó.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.125.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.125.0.
