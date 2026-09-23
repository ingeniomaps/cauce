---
caso: 182
titulo: La investigación semanal no adelanta nada que la mensual no traiga, y cuesta cuatro corridas y hasta cuatro revisiones por cargo al mes
estado: resuelto
resuelto-en: 0.98.0
prioridad: media
version-detectada: 0.97.0
---

# 182 — Investigar cada lunes para un contrato que cambia una vez al mes

**🟢 resuelto en 0.98.0** · detectado en 0.97.0 · prioridad **media**. Toda investigación de cargo pasa
a ser mensual, y el cron del lunes se quita.

## Resumen

Un cargo investiga al ritmo de su fuente más rápida (`TIER_CADENCE`), y las fuentes `advisory`,
`platform` y `project` lo ponían en semanal: 17 de los 53 cargos del catálogo. Pero lo que el ciclo
produce es un cambio de contrato. Ese cambio se firma una vez al mes, el día 1, y le llega a cada empresa
con `upgrade`. Enterarse el día 7 en vez del 24 no lo adelanta.

Lo semanal cuesta cuatro corridas por cargo al mes, y puede pedir hasta cuatro revisiones humanas de la
misma recomendación. Además mete errores: cada informe arrastra los «sin cambios» del anterior sin
volver a comprobarlos.

## Reproducción

```bash
node engine/cli/ops.js agents list --json \
  | node -e 'const a=JSON.parse(require("fs").readFileSync(0));const c={};a.forEach(x=>c[x.cadence]=(c[x.cadence]||0)+1);console.log(c)'
```

Y la medición del valor: clasificar cada hallazgo de las corridas semanales posteriores a la primera
consolidación (07, 14 y 21 de septiembre de 2026) según tres criterios:

- **Novedad**: nuevo, actualización o repetido.
- **Urgencia**: si esperar a la consolidación del día 1 causa un daño concreto a quien usa el contrato.
- **Pasajero**: si una corrida el día 24 ya no lo podría ver.

También se cruzó cada hallazgo con las propuestas aplicadas.

## Síntoma

Antes, sobre 0.97.0: `{ semanal: 17, mensual: 35, trimestral: 1 }`.

La clasificación se escribió antes de medir con su criterio de refutación: lo semanal ganaba si al menos
1 de cada 5 hallazgos era urgente o pasajero. Cuatro agentes leyeron los informes con `git show`; es
una clasificación con criterio, no un conteo mecánico.

| | cantidad |
|---|---|
| Hallazgos, 17 cargos, 3 semanas | ~353 |
| Repetidos, sin hecho nuevo | ~51 % |
| Actualizaciones del mismo tema | ~28 % |
| Nuevos | ~21 % |
| Urgentes | 0 |
| Pasajeros | 2, ninguno usado: Fusion en preview y el plazo de comentarios de un borrador de NIST |
| Aplicados por el ciclo | 0 |

Todo lo que se aplicó en septiembre salió de los informes del 31-08, que se consolidaron el 1-09, o de
commits hechos fuera del ciclo, como `91e27cca` con las URLs de ISO.

Los casos al límite de urgente no lo eran, y una corrida el 24 los habría visto igual:

- El fin de soporte de AWS App Mesh el 30-09.
- El CVE de MLflow en KEV.
- El Decreto 15-2026 de Guatemala.
- El cambio de columna de Snowflake, que estaba pospuesto.

Errores que salen del encadenamiento semana a semana:

- analytics-engineer dejó de reintentar las URLs de ISO por una decisión heredada, y no vio que
  `91e27cca` ya las había arreglado.
- data-engineer afirmó que una URL «que ningún archivo del cargo usa» había sido el origen de un 403;
  hasta el 09-09 estaba en su `sources.yaml`.
- database-administrator publicó una fecha de GA errada el 14 y la corrigió el 21.
- mlops-engineer sigue consultando una URL que ya no está en su catálogo.

## Causa raíz

- **`engine/agents/learning-sources.js`, `TIER_CADENCE`**: `advisory`, `platform` y `project` mapeaban a
  `semanal`. El comentario lo justificaba con «llegar un mes tarde es llegar tarde». Eso vale para quien
  actúa sobre el aviso, no para un ciclo cuya salida se aplica una vez al mes.
- **`.github/workflows/agent-learning.yml`**: el cron `17 13 * * 1` y su entrada en `POR_CRON`.

## Fix propuesto

- `TIER_CADENCE`: los tres tipos rápidos pasan a `mensual`, y `CADENCES` pierde `semanal`.
- El workflow pierde el cron del lunes, su entrada en `POR_CRON` y la opción manual `semanal`. El prompt
  pide cubrir todo lo publicado desde el informe anterior, porque la corrida mensual tiene un mes de
  novedades para leer.
- El informe se llama «Investigación» a secas. Los mensajes del CLI, el Makefile, los 53
  `AUTOMATION.md` y el cuerpo de los PR dejan de decir «semanal».

No se evaluó la alternativa de consolidar cada semana: cuadruplica las firmas humanas para acelerar un
cambio que igual espera a `upgrade`.

## Tradeoffs

- **Se pierde el aviso temprano** para quien leía los informes como noticias. La corrida del 24 los ve
  igual, y ninguno de septiembre necesitaba antes.
- **Una corrida mensual tiene que cubrir un mes de novedades de una vez.** Pesa en los cargos con
  changelogs rápidos: en ai-product-manager, 15 de los 19 hallazgos nuevos de su grupo salieron de
  Anthropic y OpenAI. Lo cubre la instrucción del prompt, y el informe anterior está en
  `learning/reports/` para leer desde dónde seguir.
- **Un solo mes de datos.** La razón de fondo no depende de eso: mientras el contrato se firme una vez
  al mes y llegue con `upgrade`, ninguna cadencia más rápida lo adelanta.

## Prioridad

Media. No rompe nada, pero es el mayor gasto recurrente del ciclo y el origen de la mitad de lo que se
revisa.

## Contexto de descubrimiento

Revisando la tanda del 2026-09-21, surgió la pregunta de por qué una recomendación vuelve cada semana.
El caso 179 resolvió la parte de los rechazos. Éste se pregunta si la semana era la unidad correcta.

## Relacionados

- **179**: el motivo de una propuesta descartada llega al informe siguiente. Con la cadencia mensual
  sigue haciendo falta: sin él, lo rechazado vuelve una vez al mes en vez de una vez por semana.

## Cierre

**Resuelto en 0.98.0, por el camino que el caso propone.** Recorriendo lo que enumeró:

- **`TIER_CADENCE` y `CADENCES` → se hizo.**
- **El cron, `POR_CRON` y la opción manual → se hizo.** Los comentarios del workflow que describían la
  vuelta de cada lunes se reescribieron. Los que cuentan historia, como el de la credencial faltante,
  quedan como están.
- **El prompt → se hizo**: «Cubrí todo lo que tus fuentes publicaron desde tu informe anterior».
- **Textos → se hizo**, salvo en un lugar, a propósito: **los 53 `SKILL.md` siguen diciendo «Guardar
  informes semanales en `learning/reports/`»**. `contractChangedAt` fecha el contrato por el último
  commit que tocó `SKILL.md`, así que cambiar esa palabra marcaría a los 53 cargos con «el contrato
  cambió… mide una versión anterior» hasta volver a evaluarlos a todos. La palabra no cambia qué hace el
  cargo; se corrige cuando cada contrato se toque por otra razón.
- **La sección de `AGENTS.md` «Destrabar una tanda semanal» → renombrada** a «Destrabar una tanda de
  investigación». El procedimiento no cambia.

### Qué se corrió

- **Después del cambio**, la misma invocación de la reproducción: `{ mensual: 52, trimestral: 1 }`.
- **Aserciones de ausencia**, porque es una quita: ningún tipo de fuente, solo ni combinado, devuelve
  `semanal`; ningún cron fija día de semana; el dispatch no ofrece `semanal`. **Tres mutaciones en una
  copia del árbol, las tres en rojo**:
  - Devolver `advisory` a `semanal` pone en rojo «la cadencia de investigación se deriva de las
    fuentes…».
  - Volver a poner el cron del lunes pone en rojo «cada cron investiga su cadencia…».
  - Volver a ofrecer `semanal` en el dispatch pone en rojo la misma prueba.
- La corrida real del 24 es la que lo confirma en producción; hasta entonces lo medido es la derivación
  y el workflow.

### Prueba real posterior, 2026-09-23

Desde una instancia (banco `suelto`), no desde el repositorio: `node tools/ops.js agents list --json` dio
`{ mensual: 52, trimestral: 1 }`, y `learn` sobre un cargo forkeado armó el informe con el encabezado
`# Investigación — 2026-09-23`. El disparo del cron del 24 no se forzó: pondría a investigar a los 52.
