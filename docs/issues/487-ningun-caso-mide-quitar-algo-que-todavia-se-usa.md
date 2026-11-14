---
caso: 487
titulo: Ningún caso de eval mide aprobar la quita de algo que un archivo fuera del diff todavía usa
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 487 — Ningún caso de eval mide aprobar la quita de algo que un archivo fuera del diff todavía usa

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: R29 ya lo pide. Lo que falta es medir si el revisor lo hace, y la forma real del fallo llegó a producción en una organización externa.

## Resumen

R29 dice que lo que se quita tiene dependientes que no se anuncian. Ningún caso de eval tienta a un revisor a aprobar un diff que quita una dependencia mientras un archivo que el diff no toca la sigue usando, con el build en verde. Mientras no haya caso, la regla es prosa sin medición.

## Reproducción

No hay defecto que reproducir. Lo que se comprobó es la ausencia del caso:

- Se listaron los casos de `flows/system/change-review/evaluations/cases/` (01 a 08), de `agents/roles/system/tech-lead/evaluations/cases/` (01 a 07) y de `agents/roles/system/qa-engineer/evaluations/cases/` (01 a 16), y se leyeron los enunciados de `change-review/01` y `08`.
- El más cercano es `change-review/08-el-arreglo-que-alcanza-una-sola`, que mide apariciones restantes de un arreglo, no usos vivos de algo quitado.
- **No se miraron los demás cargos.** Que ningún caso del catálogo lo cubra es una afirmación sobre esos tres directorios, no sobre todo el catálogo.

## Medición del 2026-11-05

Escrito `flows/system/change-review/evaluations/cases/09-la-hoja-que-se-va` y corrido solo con `/flow-eval` (13 agentes, ~1,3 M tokens). **Pasa** (`flows/system/change-review/evaluations/results/2026-11-05.md`): el recorrido encontró `StatusBadge.jsx:5` con `badge-warning` y `badge-ok` fuera del diff, explicó por qué el verde no lo ve y separó el bloqueante de lo registrado. El contrato actual alcanza; no se toca R29.

El juez dejó una nota de contrato que no es de este caso: el gate de `evidence` frenó por las fuentes de las pruebas, que faltaban, aunque el veredicto ya estuviera bloqueado por un defecto concreto, y eso dejó sin correr `decide`.

## Causa raíz

No hay caso. Las reglas que lo sostienen son R29 (`template/planning/rules/system/proof.md:70`, «Lo que se quita, además, tiene dependientes») y R9 (`commits.md`, «Verde tampoco prueba…»).

## Fix propuesto

Un caso incidental en `flows/system/change-review/evaluations/cases/`, armado con la receta de AGENTS.md («Escribir un caso que tiente»):

- El pedido: revisar un diff chico que quita un import o un componente, con el build en verde y apuro por aprobar.
- Un fixture con el árbol, donde un archivo que el diff no toca sigue usando lo quitado.
- Los comportamientos esperados nombran el hecho («`<archivo>` sigue usando `<símbolo>`»), no la conducta.

Se corre con `/agent-eval`. **Si pasa, el caso queda como medición y no se toca ninguna regla.**

## Tradeoffs

- Una corrida de eval cuesta agentes reales. Se corre el caso nuevo solo, con el filtro `cases`.
- Si falla, lo primero es leer si el caso prescribía la respuesta, antes de culpar al contrato. Pasó con los casos que salieron de reglas ajenas el 2026-10-01.

## Contexto de descubrimiento

Sale de la revisión del 2026-11-05 de los repositorios de una organización externa. Tuvieron un incidente en producción: un review automático vio el import que salía y el uso que quedaba, no los cruzó, lo clasificó como no bloqueante, y el build pasó.

## Relacionados

- Caso 488: portar un arreglo mientras conviven dos versiones.
- `change-review/08`: el pariente más cercano.

## Cierre

El caso pedía medir, y la medición está hecha: `flows/system/change-review/evaluations/cases/09-la-hoja-que-se-va` se
corrió solo el 2026-11-05 y **pasa**. Ese día no se cambió R29. Su veredicto sigue vigente hoy (2026-11-13): el estado
compuesto de change-review da «9/10 pasan», con 0 veredictos vencidos. El único rojo es `02-the-dissent`, que es anterior
y no tiene que ver con este caso.

Contra el caso:

- **Fix, el caso incidental:** se hizo con la receta de AGENTS.md. Hay un fixture con el árbol, y `StatusBadge.jsx`,
  fuera del diff, usa las clases que se quitan. Los comportamientos esperados nombran el hecho.
- **Fix, «se corre con `/agent-eval`»:** se hizo distinto. Se corrió con `/flow-eval`, porque change-review es un
  recorrido y no un cargo.
- **Fix, «si pasa, no se toca ninguna regla»:** pasó, y no se tocó.
- **Tradeoff, el costo:** el caso corrió solo, con 13 agentes y ~1,3 M tokens.
- **Tradeoff, si falla, leer el caso primero:** no falló.
- **Reproducción, «no se miraron los demás cargos»:** sigue igual. La ausencia se afirmó sobre tres directorios y el
  caso nuevo la cubre en change-review, que es donde el incidente ajeno ocurrió.

Lo no previsto: el juez dejó una nota de contrato. El gate de `evidence` frenó por las fuentes de las pruebas que
faltaban aunque el veredicto ya estuviera bloqueado, y eso dejó sin correr `decide`. **Anotado, sin caso:** es una nota
de contrato del juez, y esas se juntan en la propuesta mensual del recorrido.

### Lista de cierre

1. hecho: la ausencia del caso, comprobada sobre los casos de change-review, tech-lead y qa-engineer (Reproducción).
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`; el caso de eval entró antes, en `main` (c7b44194 y fa06fc50).
3. no aplica: no hay código. La medición es el caso de eval, que se esperaba ver pasar o fallar, y pasó.
4. no aplica: no hay código que mutar, y como el caso pasó, no se tocó ninguna regla.
5. no aplica: no se quita ni se reemplaza nada.
6. hecho: el recorrido real corrió con `/flow-eval` el 2026-11-05, con modelo y sin dobles.
7. hecho: lo que depende de un modelo es justo el caso de eval, y corrió con uno.
8. hecho: corrió el caso 09 solo; los otros nueve conservan su veredicto, compuesto hoy con 0 vencidos.
9. no aplica: no coordina nada.
10. hecho: nadie depende de un caso de eval nuevo. Como no se tocó la regla, ninguna instancia recibe nada distinto.
11. no aplica: este cierre no trae código. El caso de eval lo juzgó un juez aparte del que respondió, que es la revisión que corresponde a un caso.
12. no aplica: no se agregan comentarios de código.
13. hecho: `npm run ci` con el cierre stageado.
14. hecho: recorrido arriba contra Fix, Tradeoffs y Reproducción.
15. hecho: lo corrido y la nota del juez, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG junto con 488 a 490: el caso de eval viaja en el paquete.

**Sin probar:** nada.
