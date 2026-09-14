---
caso: 136
titulo: El detalle de un veredicto en rojo entra entero a la propuesta y sus encabezados de la respuesta quedan como secciones del documento que se firma
estado: abierto
prioridad: media
version-detectada: 0.87.0
---

# 136 — Las secciones de la respuesta de un cargo se cuelan como secciones de su propuesta

**🔴 abierto** · detectado en 0.87.0 · prioridad **media** — el documento que se firma deja de tener la
estructura que la puerta y quien lo lee esperan

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
