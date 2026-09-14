---
caso: 136
titulo: El detalle de un veredicto en rojo entra entero a la propuesta y sus encabezados de la respuesta quedan como secciones del documento que se firma
estado: resuelto
resuelto-en: 0.88.0
prioridad: media
version-detectada: 0.87.0
---

# 136 — Las secciones de la respuesta de un cargo se cuelan como secciones de su propuesta

**🟢 resuelto en 0.88.0** · detectado en 0.87.0 · prioridad **media** — el documento que se firma dejaba
de tener la estructura que la puerta y quien lo lee esperan

## Resumen

Cuando un caso queda en rojo, su hallazgo viaja a la propuesta con el detalle **entero** del veredicto
(`engine/agents/learning.js:203-205`). Ese detalle es la respuesta que escribió el cargo, y si usó
encabezados de nivel `##` para estructurarse, esos encabezados entran al documento al mismo nivel que
`## Hallazgos`, `## Evidencia` o `## Cambio propuesto`.

El resultado es una propuesta con secciones que no son suyas, intercaladas donde el molde no las espera.

**Medido sobre las siete propuestas `2026-09-r2` del 2026-09-14**, contra los casos cuyo **veredicto final**
—la última corrida gana— quedó en rojo sin sellar:

| cargo | casos rojos vivos | `##` en sus detalles | secciones ajenas en la propuesta |
|---|---|---|---|
| qa-engineer | 2 | 11 | **11** |
| frontend-engineer | 1 | 7 | **7** |
| security-engineer | 0 | 0 | 0 |
| release-manager | 0 | 0 | 0 |
| kyc-aml-specialist | 0 | 0 | 0 |
| finops-engineer | 0 | 0 | 0 |
| database-administrator | 0 | 0 | 0 |

La correspondencia es exacta en los siete. Y el origen se verifica leyendo: las siete secciones ajenas de
`frontend-engineer` —«1. Por qué "con que pasen alcanza" no cierra esta tarea», «3. Archivos que toqué»,
«7. Lo que consulté»— salen literalmente de
`agents/roles/system/frontend-engineer/evaluations/results/2026-09-02.md`, y caen entre las líneas 86 y
258 de la propuesta, dentro del bloque `## Hallazgos` (línea 15) y antes de `## Evidencia` (259).

## Reproducción

Un cargo propio con un veredicto en rojo cuyo detalle traiga encabezados `##`, y una propuesta anterior ya
aplicada para forzar el camino de revisión:

```bash
node engine/cli/ops.js init "$BANCO/demo-ops" --name Demo --mode sidecar --no-install
# agents/roles/probe-engineer/evaluations/results/2026-09-10.md con:
#   ### 01-caso-rojo
#   - Veredicto: no pasa
#   ...
#   ## Sección propia de la respuesta
#   ## Otra sección propia
cd "$BANCO/demo-ops" && node <engine>/cli/ops.js learn probe-engineer --proposal
```

## Síntoma

Corrido el 2026-09-14, con **cero** informes semanales para aislar el mecanismo:

```
+ agents/roles/probe-engineer/learning/proposals/2026-09-r2.md
  0 informe(s) semanal(es) incluidos
```

Los encabezados del documento generado:

```
15:## Hallazgos
23:## Sección propia de la respuesta
27:## Otra sección propia
31:## Evidencia
36:## Cambio propuesto
42:## Riesgos y regresiones
47:## Evaluación
52:## Aprobación humana
```

Las dos secciones que estaban dentro del detalle del veredicto quedaron entre `## Hallazgos` y
`## Evidencia`, indistinguibles de las del molde.

## Causa raíz

Dos decisiones correctas por separado que se suman mal.

- `engine/agents/learning.js:163` — el regex `VERDICT` captura el detalle hasta el próximo
  `### <caso>` + `- Veredicto:`, o el fin del archivo. **Es deliberado y hay que conservarlo**: su
  comentario dice que cortar en cualquier `###` truncaba 285 de los 774 veredictos del repositorio, y que
  `06-adversarial-runbook` conservaba 1.057 de 48.991 caracteres.
- `engine/agents/learning.js:203-205` — el hallazgo de un caso en rojo se compone como
  `### <id> — <corrida>\n\n<corrida>\n\n${item.detail}`, con el detalle en crudo.

La rama del caso que **pasa** no tiene el problema: sólo viaja una línea, la nota de contrato
(`:213-215`). Por eso únicamente contaminan los cargos con rojos vivos.

## Fix propuesto

No está decidido. Tres formas.

1. **Bajar un nivel los encabezados del detalle al componer.** `## x` pasa a `### x`, `###` a `####`. El
   texto se conserva entero y deja de competir con la estructura del documento. Es lo mínimo que arregla
   el síntoma sin tocar el regex.
2. **Encerrar el detalle en una cita.** Prefijar cada línea con `> `: queda visiblemente como material
   citado y ningún encabezado escapa. Cambia cómo se lee un hallazgo largo.
3. **Recortar el detalle.** Rechazada de antemano: es exactamente lo que el comentario del `VERDICT`
   documenta como el defecto anterior, y perder el detalle de un rojo es perder lo que la propuesta tiene
   que corregir.

## Tradeoffs

- **Es cosmético hasta que no lo es.** Hoy sólo afecta cómo se lee el documento; pero
  `engine/agents/learning-seal.js` y `automatization/workflows/agent-promote.js` ubican secciones por su
  encabezado —`section(text, /Cambio propuesto/i)`—, así que un detalle que contenga un
  `## Cambio propuesto` podría hacer que se lea la sección equivocada. No está
  medido si algún resultado real lo contiene.
- **La opción 1 modifica el texto del cargo**, y eso es material de evidencia. Bajar un nivel es
  reversible y no cambia palabras, pero conviene decirlo en el documento.
- **La opción 2 es la más segura y la que peor se lee** en un detalle de varias pantallas.
- **Ninguna arregla los documentos ya escritos.** Las dos propuestas contaminadas de hoy quedan como
  están salvo que se regeneren.

## Prioridad

**Media.** No rompe ninguna puerta ni pierde información —el detalle está entero—, y el daño es de
legibilidad sobre un documento que una persona tiene que leer para firmarlo. Sube a alta si se confirma
que un detalle puede contener un encabezado que `section()` confunda con el del molde.

## Contexto de descubrimiento

Apareció mirando por qué dos de las siete propuestas de hoy medían 322 y 284 líneas contra las 68–149 de
las otras cinco. Tres hipótesis previas cayeron antes de dar con el mecanismo: que dependiera del número
de rojos (no: los siete tenían rojos), que dependiera de los `##` en los resultados (no: los cinco limpios
tenían cientos), y que el sellado posterior explicara la diferencia (no: la reconstrucción sobre el árbol
anterior dio lo mismo). Lo que discrimina es el veredicto **final** por caso, que es como
`verdictFindings` compone.

## Relacionados

- **135** — la otra mitad de la misma corrida: esas propuestas además llegaron a la firma sin un cambio
  decidido.

## Cierre

**🟢 resuelto en 0.88.0** · `engine/agents/learning.js`, `test/agents/learning.test.js`

Se tomó la **opción 1**: al componer el hallazgo de un caso en rojo, los encabezados del detalle bajan un
nivel (`/^(#{1,5}) /gm` → `#$1 `). El texto viaja entero, como antes, y deja de competir con las secciones
del molde.

### Contra lo que el caso enumeró

- **Resumen: «los encabezados entran al documento al mismo nivel que `## Hallazgos`»** — arreglado. En el
  banco, `## Sección propia de la respuesta` sale ahora como `### Sección propia de la respuesta`, dentro
  del hallazgo al que pertenece.
- **La tabla de los siete cargos** — se conserva como medición y no hacía falta rehacerla: describe lo que
  había, y el arreglo no cambia qué cargos tenían rojos vivos sino cómo se compone su detalle.
- **Opción 1, bajar un nivel** — es la construida.
- **Opción 2, encerrar el detalle en una cita** — se decidió que no: prefijar cada línea con `> ` cambia
  todo el detalle para resolver un problema de los encabezados, y un contraste de varias pantallas dentro
  de una cita se lee peor. La 1 toca sólo lo que estaba de más.
- **Opción 3, recortar el detalle** — se decidió que no, por lo que el propio caso decía y por lo que el
  comentario del `VERDICT` documenta: recortar fue el defecto anterior, con 285 de 774 veredictos
  truncados.
- **Tradeoff «es cosmético hasta que no lo es»** — es la razón por la que se arregló, y **queda medido a
  medias**: que `seal` y `agent-promote` ubican secciones por su encabezado está verificado leyendo
  `engine/planning/parser.js:54-60`, y **no** se midió si algún resultado real contiene un
  `## Cambio propuesto` adentro. El arreglo lo vuelve inalcanzable de todos modos: ya no hay `##` que
  escape del detalle.
- **Tradeoff «la opción 1 modifica el texto del cargo»** — cierto y asumido. No cambia ninguna palabra:
  sólo el nivel del encabezado, y el comentario en el código lo dice para quien lo lea después.
- **Tradeoff «ninguna arregla los documentos ya escritos»** — sigue siendo cierto: las dos propuestas
  contaminadas del 2026-09 quedan como están salvo que se regeneren.
- **Prioridad media** — sostenida: no se perdía información y el daño era de legibilidad.

### Lo que el caso no preveía

- **Tres hipótesis mías cayeron antes de dar con el mecanismo**, y quedan escritas en el caso porque el
  próximo que lo lea las va a pensar igual: no es el número de rojos (los siete tenían), no son los `##`
  de los resultados (los cinco limpios tenían cientos), y no es el sellado posterior (la reconstrucción
  sobre el árbol anterior dio lo mismo). El discriminador es el **veredicto final por caso**, que es como
  `verdictFindings` compone: un rojo pisado por una corrida verde posterior no viaja.
- **Una cuarta hipótesis falló por un error de medición mío**, y vale decirlo: conté como «sin sellar» dos
  archivos de `finops-engineer` que sí lo estaban, porque filtré por `^(estado|state):` cuando el campo se
  llama `status:`. Eso fabricó una discrepancia que no existía.

### Qué se corrió

- **Rojo previo, en copia por `tar` y con verde de control antes**: 24/24 intactas; al revertir `nested()`,
  **24 → 23 pass / 1 fail**, y la que muere es «los encabezados de la respuesta no se vuelven secciones de
  la propuesta». La otra mutación —revertir el placeholder del 135— **no la toca**.
- **Contra el banco desechable**: con un detalle que trae `## Sección propia` y `### Subsección propia`, el
  documento generado lista exactamente seis `##` —los del molde— y el resto bajó a `###` y `####`, con el
  texto completo.
- **Verde**: `npm run ci` en 0 y la suite entera en verde.
