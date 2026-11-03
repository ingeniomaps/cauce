---
caso: 480
titulo: El aviso de veredictos vencidos salta en casi todos los cargos, no mira los casos y nadie lo atiende
estado: resuelto
resuelto-en: 0.119.0
prioridad: media
version-detectada: 0.118.0
---

# 480 — El aviso de veredictos vencidos salta en casi todos los cargos, no mira los casos y nadie lo atiende

**🟢 resuelto en 0.119.0** · detectado en 0.118.0 · prioridad **media**: un veredicto viejo se lee como vigente: 332 de 418 son anteriores a su contrato o su caso, y es lo que cita una propuesta que alguien firma.

## Resumen

`ops evaluate` avisa que el contrato cambió después del veredicto más viejo, y al lado imprime el resultado en verde. Como sale en 45 de 53 cargos, no distingue uno vencido de uno al día. Además compara sólo `SKILL.md`, así que un caso o un fixture cambiado no cuenta.

## Síntoma

`node engine/cli/ops.js evaluate site-reliability-engineer`, 2026-11-02:

```
⚠ el contrato cambió el 2026-09-02 y el veredicto más viejo es del 2026-08-18: mide una versión anterior
✓ site-reliability-engineer: 7 caso(s) — 7/7 pasan (2026-08-18…2026-08-23), 2 propuesta(s), controles estructurales válidos
```

Sobre los 53 cargos de `agents/roles/system/`, con `ops evaluate` para el aviso y `git log` contra la fecha del último veredicto de cada caso para el resto, 2026-11-02:

| Medición | Cantidad |
|---|---|
| Cargos donde sale el aviso | 45 de 53 |
| Cargos con `SKILL.md` posterior a todos sus veredictos | 30 |
| Veredictos vigentes: ni `SKILL.md` ni su caso cambiaron después | 86 de 418 |
| Veredictos con `SKILL.md` posterior | 320 |
| Veredictos con su caso o fixture posterior, que el aviso no mira | 41, en 27 cargos |

El caso de `site-reliability-engineer` cambió el 2026-10-15, después de su último veredicto del 2026-08-23, y el aviso no lo nombra.

También se ve en una propuesta: la de `financial-controller` de 2026-11 cuenta «8/8» juntando veredictos de antes y después del cambio de `SKILL.md` del 2026-09-02. Los informes de `site-reliability-engineer` arrastran el aviso desde hace siete corridas y lo dejan para quien consolide, y la propuesta lo devuelve a quien mantenga el mecanismo.

## Causa raíz

`contractChangedAt` (`engine/agents/evaluations.js:144`) mira sólo `flow.json` o `SKILL.md`. Su resultado se compara en `engine/agents/evaluations.js:293`.

## Fix propuesto

Un veredicto por caso vale si es posterior al último cambio de su contrato y de su caso con fixture, y el resumen cuenta aparte vigentes y vencidos en vez de «7/7 pasan». Probado con un script contra su reproducción, sin tocar el motor, 2026-11-03:

| Cargo | Hoy | Con el criterio |
|---|---|---|
| `site-reliability-engineer` | aviso, y «7/7 pasan» | 0 de 7 vigentes; `06-adversarial-docs` vencido por el contrato y por su caso |
| `financial-controller` | aviso, y «8/8 pasan» | 1 de 8 vigentes |
| `implementation-manager` | sin aviso | 8 de 9 vigentes; `09-stale-aggregate-count` vencido por su fixture nuevo |

El tercero es lo que el aviso de hoy no ve.

## Tradeoffs

Quién depende de lo que toca: `validate` y su `state` los leen `engine/cli/catalog.js:211-220`, que imprime el rango de fechas, y `ops evaluate`. El mensaje lo afirman `test/agents/evaluations.test.js:226` y `test/flows/flows-eval.test.js`. Los 53 `learning/AUTOMATION.md` mandan correr `make agent-evaluate` en cada ciclo de investigación, así que el texto nuevo llega a cada informe mensual.

Decir «vencido» donde hoy dice «pasan» no los hace correr: re-evaluar los 53 cuesta. No todo cambio de `SKILL.md` puede mover un veredicto: comparar por fecha marcaría vencidos casos que un retoque de redacción no toca. Hay que medir eso antes de elegir.

Qué vence a esos 320, medido con `git log` y `git diff --word-diff` sobre cada `SKILL.md`, 2026-11-03:

| Causa | Veredictos |
|---|---|
| Sólo `docs(agents): put the label rule where the deliverable is written` (2026-09-02, 52 cargos): agrega a cada contrato el recorrido de los artefactos que se leen solos, lo que R14 mide | 173 |
| Cambios de 20 palabras o menos | 16 |
| El resto, cambios de contrato de 21 a más de 150 palabras | 131 |

275 de los 320 son de agosto. Casi todo lo que los vence es un cambio de conducta, no de redacción: un criterio que ignore lo menor ahorraría 16. Si esos cambios mueven de verdad un veredicto no se midió: hace falta volver a correr una muestra.

## Contexto de descubrimiento

La revisión de las propuestas de 2026-11, PR 940 y 961.

## Relacionados

Caso 052, que corrigió un falso aviso en clones superficiales.

## Cierre

`ops evaluate` cuenta vencido cada veredicto anterior al último cambio de su contrato o de su caso con fixture, y el resumen dice cuántos siguen valiendo. Salida real, motor anterior → éste, 2026-11-03:

| Cargo | Antes | Ahora |
|---|---|---|
| `site-reliability-engineer` | «el veredicto más viejo es del 2026-08-18: mide una versión anterior» y «7/7 pasan» | «después de 7 de 7 veredicto(s)» y «7/7 pasan (…), 0 vigente(s): 7 mide(n) una versión anterior» |
| `financial-controller` | igual, «8/8 pasan» | «1 vigente(s): 7 mide(n) una versión anterior» |
| `implementation-manager` | sin aviso | «1 caso(s) cambiaron después de su veredicto (09-stale-aggregate-count)» y «8 vigente(s)» |
| `security-engineer` | sin aviso | vence `06-adversarial-docs`, cambiado después de su veredicto, y no `09`, creado el día de su corrida |

Contra el enunciado:

- **Causa raíz, `contractChangedAt` sólo mira el contrato.** Se hizo: `caseChangedAt` suma el caso y su carpeta de fixture.
- **Fix propuesto, por caso y contando vigentes.** Se hizo, como estaba escrito. El aviso sale sólo si hay algo vencido.
- **Tradeoff, re-evaluar cuesta.** Se decidió que no acá: el caso muestra qué vence, y volver a correrlos es otra decisión, cara. La muestra de 5 casos sigue propuesta.
- **Tradeoff, no todo cambio de `SKILL.md` mueve un veredicto.** Se midió: 16 de 320 vencen por cambios de 20 palabras o menos, así que ignorar lo menor no salva casi nada. Se dejó el criterio por fecha.

Encontrado y no previsto:

- **La fecha del committer daba vencidos falsos.** Un caso creado el día de su corrida y commiteado al día siguiente, o movido por un rebase, salía vencido: 5 en 4 cargos. Se cambió a la fecha del autor, para el contrato y para el caso.
- **Declarado:** la fecha del autor no ve una edición del caso escrita antes de un veredicto y aplicada después por un cherry-pick o un rebase; ningún workflow ni el motor lo hacen sobre casos.
- **El comentario de `composed`** decía que el cambio se compara contra el veredicto más viejo. Corregido.

### Lista de cierre

1. hecho: la salida de `ops evaluate` en cuatro cargos y las mediciones de la tabla de arriba, antes de tocar el código.
2. hecho: `fix/cases-480-481`.
3. hecho: `test/flows/flows-eval.test.js` y `test/agents/evaluations.test.js`: las dos pruebas viejas del mensaje en rojo, y la nueva en rojo con el motor anterior; todas en verde con éste.
4. hecho: 14 mutaciones en una copia, entre los dos casos, todas en rojo. Sobrevivieron dos en la primera tanda y cada una sumó su prueba: cortar la lista en cuatro y el clon superficial.
5. hecho: la quita del aviso viejo, con aserción de ausencia («el veredicto más viejo es») y la salida de antes y después lado a lado, arriba.
6. hecho: `ops evaluate` sobre cargos reales del catálogo, que es el camino real: tabla de arriba.
7. no aplica: no depende de un modelo ni de un runner; es una lectura de git.
8. hecho: corrió sobre el motor final.
9. hecho: tres veredictos de fechas distintas, y un contrato y un fixture que cambian en momentos distintos, en la prueba nueva.
10. hecho: `validate` y `summary` los usa sólo `engine/cli/catalog.js`; dos pruebas afirmaban el mensaje viejo y se actualizaron. El texto nuevo llega a los informes de investigación, que corren `make agent-evaluate`; ningún código lo lee.
11. hecho: dos pasadas. La primera halló los vencidos falsos por la fecha del committer, arreglados; la segunda, sobre eso y sobre los 60 sujetos: «nada impide»; 5 vencidos falsos pasan a vigentes y ninguno real se pierde.
12. hecho: pasada uno por uno sobre el diff; corrigió el comentario de `composed` y quitó una razón repetida. Repetida al final sobre los comentarios que sumaron los arreglos de la revisión: el de la fecha del autor queda, y se acortaron dos de la prueba que repetían la razón del código.
13. hecho: `npm run ci` en exit 0, con todo stageado.
14. hecho: arriba, contra el caso entero.
15. hecho: arriba y la línea de abajo.
16. hecho: frontmatter y encabezado en 0.119.0, con su entrada en el CHANGELOG.

Después del cierre, 2026-11-03, se corrió la muestra que quedaba propuesta: cinco veredictos vencidos sólo por la regla del 2026-09-02 —`site-reliability-engineer` 01, 03 y 05, `financial-controller` 01 y 03— y el caso 09 de `implementation-manager` con su fixture nuevo. Los seis pasan, igual que antes. Con eso la regla del 2026-09-02 no movió esos veredictos; no dice nada de los otros 314.

**Sin probar:** los otros 314 veredictos vencidos.
