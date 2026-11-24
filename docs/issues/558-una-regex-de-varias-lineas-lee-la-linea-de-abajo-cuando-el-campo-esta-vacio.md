---
caso: 558
titulo: una regex de varias líneas lee la línea de abajo cuando el campo está vacío
estado: resuelto
resuelto-en: 0.125.0
prioridad: alta
version-detectada: 0.124.0
---

# 558 — Con la bandera `m`, un `\s` antes de capturar cruza de línea, y un campo vacío toma la línea de abajo

**🟢 resuelto en 0.125.0** · detectado en 0.124.0 · prioridad **alta**: `ops learn --applied` sellaba como firmada una propuesta sin responsable.

## Resumen

`/^-\s*Responsable:\s*(.+)$/m` sobre `- Responsable:\n- Fecha: 2026-11-01` captura `- Fecha: 2026-11-01`: el `\s*` consume el salto de línea. En `engine/agents/learning-seal.js:58` eso pasa el control que exige un responsable antes de sellar. El mismo patrón estaba en 19 regex del motor, entre ellas las que leen `*** Delete File:` en dos guards (`engine/hooks/files.js`, `engine/hooks/input.js`).

## Reproducción

```bash
node -e "console.log(JSON.stringify('- Responsable:\n- Fecha: 2026-11-01'.match(/^-\s*Responsable:\s*(.+)$/m)[1]))"
```

Y por el camino real: una propuesta de recorrido firmada con `- Responsable:` vacío, y `L.seal` (`test/flows/flows-learning.test.js`).

## Síntoma

```
"- Fecha: 2026-11-01"
```

y `L.seal` sella la propuesta en vez de negarse con «todavía no la decidió nadie».

## Causa raíz

`engine/agents/learning-seal.js:58`, y el mismo `\s[*+](` en literales con bandera `m` de `catalog.js`, `evaluations.js`, `learning-files.js`, `learning.js`, `copy.js`, `onboarding.js`, `files.js`, `input.js`, `adoption.js`, `business-rules.js`, `checkpoints.js`, `parser.js` y `structure.js` (19 lugares, medidos con la prueba de abajo).

## Fix propuesto

Entre la etiqueta y lo que se captura, `[ \t]` en lugar de `\s`, que no cruza de línea. Y una prueba de repositorio (`test/repo/multiline-captures.test.js`) que recorre `engine/` y `automatization/` y falla con cualquier literal de bandera `m` que capture después de un `\s` cuantificado.

## Tradeoffs

- La prueba lee literales con un regex, no con un parser: puede no ver uno armado con `new RegExp`. Cuida la forma que existe.
- `parser.js:458` cuenta viñetas: un `-` solo, sin espacio, deja de contarse; antes contaba porque `\s+` tomaba el salto.

## Contexto de descubrimiento

Auditoría del 2026-11-24 sobre lo que una instancia real construyó por su cuenta desde la anterior (2026-11-21), buscando lo que sirve a cualquier empresa. Medido acá, no tomado de la instancia. La instancia lo encontró en su propio parser, con un `title:` vacío que pasaba su control.

## Relacionados

- 486 — la firma atada a lo que se aprobó.

## Cierre

- **Fix, `[ \t]` en lugar de `\s`**: se hizo en las 19 regex del enunciado y, por la revisión, en 7 más que capturan
  `\S` o una clase (las tres de `status:` de `learning-seal.js` y `learning.js`, `promote.js`, `structure.js`) y en tres
  sin bandera `m` que leen documentos enteros: `QUESTION` y `DROPPED` de `business-rules.js` y `tier:` de
  `learning-sources.js`.
- **Prueba de repositorio**: se hizo (`test/repo/multiline-captures.test.js`), ampliada a `\s` antes de `(`, `\S` o una
  clase. No ve las regex armadas con `new RegExp` ni las sin `m`; lo dice su comentario.
- **Tradeoff, `parser.js` deja de contar un `-` solo**: es así.
- **Lo que el enunciado no preveía**: con `status:` vacío, `seal` se tragaba el `---` del frontmatter; y una
  «Pregunta abierta» o una «Razón de baja» vacías contaban como escritas.

Lo que se corrió: la firma real (`L.seal` en `test/flows/flows-learning.test.js`) con `- Responsable:` vacío: con el
motor anterior sella, con el arreglo se niega; la prueba da rojo contra `learning-seal.js` de HEAD. Las de
`test/planning/contracts.test.js` para la pregunta y la razón vacías, rojas contra `business-rules.js` de HEAD (1 y 2
fallas). La puerta de repositorio marcó 19 lugares antes y 0 después. Una mutación en una copia, roja: devolver la regex
de la firma a `\s*`.

**Sin probar:** `tier:` vacío en `learning-sources.js`, que no tiene prueba propia; y las 126 regex sin `m` que no leen
documentos, que no se tocaron.

### Lista de cierre

1. hecho: la captura de `- Fecha: …` por la regex de la firma, y la puerta con 19 lugares, antes del arreglo.
2. hecho: rama `fix/cases-from-an-instance-audit-2`.
3. hecho: las pruebas de la firma, la pregunta y la razón, rojas contra el motor anterior y verdes después.
4. hecho: una mutación en una copia (la regex de la firma), roja; las otras regex las cuida la puerta de repositorio.
5. no aplica: no quita una conducta; corrige lo que se leía mal.
6. hecho: la función de sellado real y `check` real, sin dobles; la firma vacía dejó de sellar.
7. no aplica: no depende de un modelo, un runner ni un sistema externo.
8. hecho: las pruebas corrieron con el motor final.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: se buscaron todas las regex de la familia con la puerta; quien leía `status:`, `Pregunta abierta`, `Razón de baja` y `tier:` quedó corregido.
11. hecho: cinco pasadas de `/code-review` sobre el diff de la tanda y una sexta acotada a los últimos cambios; cada hallazgo de lo que esta tanda empeoraba se arregló, y lo previo o menor quedó anotado en el cierre que le toca.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios (repetidos y doce palabras) pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1999 de 1999, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que la revisión agregó.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.125.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.125.0.
