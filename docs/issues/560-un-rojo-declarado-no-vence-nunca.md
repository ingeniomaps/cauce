---
caso: 560
titulo: un rojo declarado en gate-known-red no vence nunca
estado: resuelto
resuelto-en: 0.125.0
prioridad: media
version-detectada: 0.124.0
---

# 560 — Un rojo declarado en `gate-known-red` vale para siempre

**🟢 resuelto en 0.125.0** · detectado en 0.124.0 · prioridad **media**: una exención sin vencimiento es la forma en que un gate se apaga de a poco, y detrás de un gate declarado un rojo nuevo no frena.

## Resumen

`engine/core/known-red.js` acepta `<raíz>: <gate> — <motivo>` sin fecha. Su propio encabezado reconoce el costo: «un rojo nuevo dentro de un gate ya declarado no frena». Lo único que hay es que `check` lista cada declaración mientras exista. R27 pide declarar cada excepción; no pide que caduque.

## Reproducción

Una fila `app: lint — heredado` declarada en septiembre: `verify` sigue sin frenar por `lint` hoy, y mañana, con el lint de esa raíz roto por otra razón.

## Síntoma

Nada lo distingue: la fila de hace meses y la de ayer se leen igual, y `check` las lista igual.

## Causa raíz

`engine/core/known-red.js:23` (`LINE`): el formato no tiene dónde decir hasta cuándo.

## Fix propuesto

- Un sufijo opcional `· vence AAAA-MM-DD`. Vencida, la fila no cuenta: `verify` frena y nombra el vencimiento en el bloqueo. El mismo día del vencimiento todavía cuenta. Una fecha imposible es error.
- Sin fecha sigue contando esta versión, y `check` lo avisa: deja de contar en la minor siguiente a 0.125.0. Es la deprecación de R29 —qué la reemplaza y cuándo se borra—.
- La fecha de hoy sale de `TODAY` de `engine/cli/io.js`, el único lugar que la calcula.

## Tradeoffs

- Baja a las instancias: las filas que existen pasan a avisar en `check`. Lo decidió la persona el 2026-11-24.
- Cuándo deja de contar una fila sin fecha queda dicho y no construido: lo hace la minor siguiente, y este caso lo nombra para que no se pierda.

## Contexto de descubrimiento

Auditoría del 2026-11-24 sobre lo que una instancia real construyó por su cuenta desde la anterior (2026-11-21), buscando lo que sirve a cualquier empresa. Medido acá, no tomado de la instancia. La instancia arrastraba dos rojos de lint declarados que, medidos, no eran reales: el lint no podía cargar su configuración.

## Relacionados

- 241 — el rojo declarado.
- 547 — el `verify` de la raíz, que es el gate que se declara.

## Cierre

- **Fix, `· vence AAAA-MM-DD`**: se hizo (`engine/core/known-red.js`). Vencida no cuenta y `verify` lo nombra; el mismo
  día todavía cuenta. «Vence» vale en cualquier mayúscula.
- **Sin fecha avisa y deja de contar en la minor siguiente**: se hizo el aviso. Dejar de contar no está construido: lo
  hace la minor siguiente a 0.125.0, y este caso lo nombra para que no se pierda.
- **La fecha de hoy**: `check` y `verify` le pasan `TODAY` de `cli/io.js`; `core` no depende de `cli`. `verify` lee la
  zona horaria de su propia instancia.
- **Lo que la revisión agregó**: una fecha mal escrita cuenta como sin fecha y `check` la nombra, en vez de apagar la
  exención; un vencimiento con texto detrás se reporta; y el error de forma enseña el sufijo.

Lo que se corrió: las pruebas de `test/hooks/known-red.test.js` con `verify` real sobre un commit y `check` real, rojas
antes del arreglo y verdes después. Cinco mutaciones en una copia, las cinco rojas (la de vencer el mismo día sobrevivía: el contraste del cierre
encontró que la prueba leía una línea que cuenta siempre; se reordenó y quedó roja): contar lo vencido, vencer el mismo
día, `vence` sólo en minúscula, `verify` sin la fecha, y la errata que no cuenta.

**Sin probar:** que las filas sin fecha dejen de contar; es de la minor siguiente.

### Lista de cierre

1. hecho: una fila vencida seguía exentando con el motor anterior; la prueba nueva lo mostró en rojo.
2. hecho: rama `fix/cases-from-an-instance-audit-2`.
3. hecho: las pruebas nuevas en rojo antes y en verde después.
4. hecho: cinco mutaciones en una copia, las cinco rojas.
5. no aplica: agrega un vencimiento; lo que existía sigue contando y avisa.
6. hecho: `verify` y `check` reales sobre una instancia con commits, sin dobles.
7. no aplica: no depende de un modelo, un runner ni un sistema externo.
8. hecho: las pruebas corrieron con el motor final.
9. no aplica: no coordina nada entre runners, raíces ni ramas.
10. hecho: dependían `verify.js`, `cli/validate.js`, el README del molde y la prueba de lectura, que se actualizaron.
11. hecho: cinco pasadas de `/code-review` sobre el diff de la tanda y una sexta acotada a los últimos cambios; cada hallazgo de lo que esta tanda empeoraba se arregló, y lo previo o menor quedó anotado en el cierre que le toca.
12. hecho: pasada de comentarios sobre el diff; la puerta de comentarios (repetidos y doce palabras) pasa.
13. hecho: `npm run ci` con los archivos nuevos stageados, 1999 de 1999, exit 0.
14. hecho: este cierre recorre el Fix propuesto, los Tradeoffs y lo que la revisión agregó.
15. hecho: nombra lo corrido con su salida, lo que el enunciado no preveía, y lleva su línea `**Sin probar:**`.
16. hecho: `resuelto` con `resuelto-en: 0.125.0` en el frontmatter y en el encabezado; entrada en el CHANGELOG de 0.125.0.
