---
caso: 497
titulo: La entrada del CHANGELOG de un cargo copia el primer párrafo de la propuesta y no dice qué cambió
estado: resuelto
resuelto-en: 0.120.0
prioridad: media
version-detectada: 0.119.0
---

# 497 — La entrada del CHANGELOG de un cargo copia el primer párrafo de la propuesta y no dice qué cambió

**🟢 resuelto en 0.120.0** · detectado en 0.119.0 · prioridad **media**: es lo que lee quien actualiza antes de decidir, y en la tanda 2026-11 sale ilegible en la mayoría de los cargos.

## Resumen

Cuando `agent-promote` sella una propuesta aplicada, el motor escribe una entrada en la versión abierta del `CHANGELOG` con el primer párrafo de «Cambio propuesto», cortado a 240 caracteres. Las propuestas no abren ese párrafo diciendo qué cambia, sino dónde y por qué («Tres archivos.», «No se toca `SKILL.md`…», «Único archivo a tocar: …»). La entrada termina hablando del documento, a menudo cortada a la mitad, y quien lee el `CHANGELOG` para decidir si actualiza no se entera de qué cambió en el cargo.

## Reproducción

Medido el 2026-11-05 sobre las 35 propuestas firmadas del período 2026-11 que están en `main`, aplicando a cada «Cambio propuesto» la misma función del motor (`summarize`, copiada tal cual en un `node -e`):

```
{ propuestas: 35, cortadas: 20, empiezan_por_metadato: 27 }
accounting-specialist: Tres archivos. Los dos primeros cierran lo que recomendaron los informes del 2026-10-02 y del 2026-10-24 (H1/H3 y H3/H5); el tercero cierra el hueco d
ai-governance-lead: No se toca `SKILL.md`, `evaluations/expected-behaviors.yaml` ni ningún caso: los cambios son de catálogo de fuentes y de referencia, no de contrato de
ai-product-manager: **Único archivo a tocar: `agents/roles/system/ai-product-manager/learning/sources.yaml`.**
backend-engineer: Los dos informes semanales citados (2026-10-02, 2026-10-24) no aportan cambio propio: sus hallazgos son confirmación de ausencia de cambio en fuentes
```

El conteo de «empiezan por un metadato» sale de una regex sobre las primeras palabras, así que es aproximado. El de «cortadas» es exacto.

## Síntoma

La entrada real que dejó el piloto del 2026-11-05 para ui-designer, en `CHANGELOG.md`, sección `0.120.0`:

```
- **`ui-designer`**: Un solo archivo cambia, por el único hallazgo de los dos informes que lo pide: H4 de
  `learning/reports/2026-10-24.md`, con el antecedente de H5 de `learning/reports/2026-10-02.md`. El resto del
  contrato del cargo —`SKILL.md`… (propuesta `2026-11.md`).
```

No dice que Material Design quedó marcada como `unverified-no-body`, que es lo único que cambió.

## Causa raíz

- `engine/agents/learning-seal.js:86-90`, `summarize`: toma el primer párrafo de «Cambio propuesto» y lo corta en 240 caracteres.
- `engine/agents/learning-seal.js:75-77`: le pasa ese resumen a `changelog.noteAgentChange` (`engine/core/changelog.js:57-63`).
- Nada le pide a la propuesta que su primer párrafo sea un resumen. El molde de `engine/agents/learning.js:159` deja «Por definir», y el prompt de `automatization/workflows/agent-propose.js:79` pide «el texto exacto a agregar o reemplazar, archivo por archivo», no una línea que lo resuma.

## Fix propuesto

1. El prompt de `agent-propose.js` y el molde de `learning.js` piden que «Cambio propuesto» abra con una línea `**En una línea:** <qué cambia en el cargo>`, sin metadatos ni rutas.
2. `summarize` toma esa línea si existe, y si no, se queda con lo de hoy.
3. Una prueba: una propuesta con esa línea produce esa entrada; una sin ella sigue produciendo lo de hoy.
4. Una mutación: hacer que `summarize` ignore la línea pone la prueba en rojo.

**Mientras no esté:** las entradas de la tanda 2026-11 se reescriben a mano, cada una en el commit en que se aplica el cargo.

## Tradeoffs

- **Las propuestas ya firmadas no tienen la línea,** así que para ellas el motor sigue escribiendo lo de hoy. Por eso la tanda en curso se corrige a mano.
- **No baja a las instancias:** el `CHANGELOG` de cargos sólo se escribe en el toolkit (`learning-seal.js:72-74`). Sí cambia el prompt del ciclo mensual, que es del repositorio.
- **Una línea más que pedir.** Si el agente la deja con metadatos igual, vuelve el problema. La prueba puede rechazar una línea que empiece por un conteo de archivos.

## Contexto de descubrimiento

Al aplicar el piloto de las propuestas 2026-11 (PR #981) el 2026-11-05: la entrada de ui-designer se leyó mal y se midió sobre las 35.

## Relacionados

AGENTS.md, sección «Se publica mergeando el PR de release…»: la entrada de los cargos la escribe el motor.

## Cierre

«Cambio propuesto» abre con `**En una línea:** <qué cambia en el cargo>`. Lo piden el prompt de `agent-propose` y los
dos moldes de cargo, el mensual y el de revisión, y la entrada del CHANGELOG sale de esa línea. Sin ella, sale el primer
párrafo, como antes.

Línea de base: la medición del caso sobre las 35 propuestas de 2026-11, 20 cortadas y 27 que abren con un metadato.

Contra el caso:

- **Fix 1, el prompt y el molde:** se hizo. Los moldes siguen empezando con «Por definir», que es como el motor sabe que
  una propuesta no está decidida, y la línea va después. La prueba lo comprueba con `blankProposal`.
- **Fix 2, `summarize` toma la línea:** se hizo. También la encuentra escrita como viñeta.
- **Fix 3, la prueba con y sin la línea:** se hizo, en `learning-changelog.test.js`.
- **Fix 4, la mutación:** ignorar la línea pone la prueba en rojo.
- **«Mientras no esté», las entradas de 2026-11 a mano:** ya se habían reescrito; no hay nada más que hacer.
- **Tradeoff, las propuestas ya firmadas no tienen la línea:** sigue así. En la reproducción del 500 la entrada de
  ux-designer de 2026-11 sale todavía como «Cuatro puntos. **A–C** vienen de…». Las que se compongan desde ahora sí la
  traen.
- **Tradeoff, rechazar una línea que empiece por un conteo de archivos:** se decidió que no. Sería un filtro de
  palabras, y la regla de este repositorio es que un guard no decide con una lista de palabras: lo que la propuesta
  quiso decir lo lee quien la firma.
- **Tradeoff, no baja a las instancias:** se confirma. La entrada sólo se escribe en el toolkit. El molde sí viaja,
  y en una empresa sólo cambia el texto de lo que hay por decidir.

Lo que el caso no preveía: el molde de revisión también es de cargos y escribe en el CHANGELOG al sellar, así que pide
la misma línea.

### Lista de cierre

1. hecho: la medición del caso, y la prueba nueva en rojo sobre el motor de antes.
2. hecho: en la rama de la tanda, `fix/484-re-review-checks-what-it-asked`.
3. hecho: la prueba en rojo antes («la entrada sale de su línea») y en verde después, también la de la viñeta.
4. hecho: cuatro mutaciones, en rojo: ignorar la línea en `summarize`, no aceptarla como viñeta, y sacarla del molde y
   del prompt.
5. hecho: no se quita nada. Sin la línea, la entrada es la de antes, y la prueba lo comprueba.
6. hecho: el prompt real de `agent-propose`, sacado del workflow renderizado, con `claude -p` y Sonnet, sobre la
   propuesta de backend-engineer de noviembre devuelta a «Por definir». «Cambio propuesto» abrió con «**En una línea:**
   el cargo deja, junto a cada número que declara haber medido, el comando y la entrada con que se midió…»: qué cambia,
   sin rutas ni conteos. USD 0,44.
7. hecho: lo que depende de un modelo corrió con uno (punto 6).
8. hecho: corrieron componer con el prompt nuevo, sellar con la línea, sin ella y en forma de viñeta, y el molde. No
   corrió una composición dentro de `agent-learning.yml` en GitHub.
9. no aplica: no coordina nada.
10. hecho: leen el molde `blankProposal` y el job que detecta propuestas en blanco, por el prefijo «Por definir», que no
    cambió. Nadie más lee el texto del molde.
11. hecho: las tres pasadas del 500, que revisaron este diff. De la primera salió el arreglo de la línea escrita como
    viñeta.
12. hecho: la pasada de comentarios del 500.
13. hecho: `npm run ci` con los cambios stageados.
14. hecho: recorrido arriba contra Fix, «Mientras no esté» y Tradeoffs.
15. hecho: lo corrido y lo no previsto, arriba.
16. hecho: estado y encabezado en `resuelto`, `resuelto-en: 0.120.0`, y entrada en el CHANGELOG junto con el 500.

**Sin probar:** una composición dentro de `agent-learning.yml` en GitHub, con su modelo.
