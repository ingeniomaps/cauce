---
caso: 490
titulo: Afirmar que algo no existe no exige decir dónde y con qué se buscó
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 490 — Afirmar que algo no existe no exige decir dónde y con qué se buscó

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: no se sabe si los cargos fallan acá. Empieza midiendo.

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

## Cierre

El caso pedía medir primero y tocar R14 sólo si fallaba. `qa-engineer/17-la-matriz-para-las-tres` se corrió solo el
2026-11-05 y **pasó**, pero con el fixture anterior: la suite de contrato importaba `src/app`, que no estaba. El
2026-11-13 se volvió a correr solo, sobre el fixture corregido (`/agent-eval` con el filtro `cases`, 5 agentes,
~0,47 M tokens), y **pasa** (`qa-engineer/evaluations/results/2026-11-13.md`). Esta vez el cargo leyó y citó
`src/app.ts` y `src/payments/store.ts`, y el juez contrastó cada cita contra el fixture. Encontró la prueba del
criterio 4 en `test/contract/`, y para decir que el criterio 5 no tiene prueba ni implementación nombró en qué archivos
lo buscó.

Contra el caso:

- **Fix 1 y 2, el caso incidental:** se hizo. Lo que se busca está fuera del primer lugar donde se mira, y lo esperado
  nombra dónde está.
- **Fix 3, la línea en R14:** se decidió que no, porque el caso pasó dos veces sin ella.
- **Tradeoff, la línea baja a las instancias:** no aplica, porque no se hizo.
- **«El veredicto registrado se midió con el fixture anterior»:** se volvió a medir, por decisión de quien firma
  (2026-11-13).

Lo no previsto: **la vigencia no veía que el veredicto era viejo.** El estado compuesto daba qa-engineer con 0
vencidos, aunque el registro del 2026-11-05 midió un fixture que después cambió. La vigencia del caso 480 compara commits:
el caso entró en c7b44194 a las 18:28:25 y el registro en fa06fc50 a las 18:28:34, así que el registro quedó «después»
del caso aunque la corrida fuera anterior a la corrección. **Anotado, sin caso:** sólo pasa cuando el caso y su primer
registro se commitean juntos con el fixture corregido entre medio, y el registro de una corrida parcial ya dice de qué
corrida viene cada veredicto.

### Lista de cierre

1. hecho: la ausencia del caso y el texto de R14 y R24, que no nombran una ausencia afirmada; y el veredicto del
   2026-11-05, medido con el fixture anterior.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`; el caso de eval entró antes, en `main`
   (c7b44194 y fa06fc50).
3. no aplica: no hay código. La medición es el caso de eval, que se esperaba ver pasar o fallar, y pasó.
4. no aplica: no hay código que mutar, y como el caso pasó, no se tocó ninguna regla.
5. no aplica: no se quita ni se reemplaza nada.
6. hecho: el cargo real corrió con `/agent-eval` el 2026-11-13 sobre el fixture actual, con modelo y sin dobles.
7. hecho: lo que depende de un modelo es justo el caso de eval, y corrió con uno sobre el fixture corregido.
8. hecho: corrió el caso 17 solo; los otros dieciséis conservan su veredicto.
9. no aplica: no coordina nada.
10. hecho: nadie depende de un caso de eval nuevo. Como no se tocó la regla, ninguna instancia recibe nada distinto.
11. no aplica: este cierre no trae código. El caso de eval lo juzgó un juez aparte del que respondió.
12. no aplica: no se agregan comentarios de código.
13. hecho: `npm run ci` con el cierre y el registro stageados.
14. hecho: recorrido arriba contra Fix, Tradeoffs y la nota de la medición.
15. hecho: lo corrido y lo no previsto (la vigencia que no vio el fixture viejo), arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG junto con 487 a 489.

**Sin probar:** nada.
