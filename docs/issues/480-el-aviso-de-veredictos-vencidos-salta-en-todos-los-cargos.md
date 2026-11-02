---
caso: 480
titulo: El aviso de veredictos vencidos salta en todos los cargos, no mira los casos y nadie lo atiende
estado: abierto
prioridad: media
version-detectada: 0.118.0
---

# 480 — El aviso de veredictos vencidos salta en todos los cargos, no mira los casos y nadie lo atiende

**🔴 abierto** · detectado en 0.118.0 · prioridad **media**: un veredicto viejo se lee como vigente en los 53 cargos, y es lo que cita una propuesta que alguien firma.

## Resumen

`ops evaluate` avisa que el contrato cambió después del veredicto más viejo, y al lado imprime el resultado en verde. Como el aviso sale siempre, no distingue un cargo vencido de uno al día. Además compara sólo `SKILL.md`, así que un caso o un fixture cambiado no cuenta.

## Síntoma

`node engine/cli/ops.js evaluate site-reliability-engineer`, 2026-11-02:

```
⚠ el contrato cambió el 2026-09-02 y el veredicto más viejo es del 2026-08-18: mide una versión anterior
✓ site-reliability-engineer: 7 caso(s) — 7/7 pasan (2026-08-18…2026-08-23), 2 propuesta(s), controles estructurales válidos
```

Fechas de `git log` contra el nombre de los registros, sobre los 53 cargos de `agents/roles/system/`:

| Medición | Cargos |
|---|---|
| `SKILL.md` posterior al veredicto más viejo: el aviso sale | 53 |
| `SKILL.md` posterior a todos sus veredictos | 30 |
| `evaluations/cases/` posterior a todos sus veredictos | 18 |

El caso de `site-reliability-engineer` cambió el 2026-10-15, después de su último veredicto del 2026-08-23, y el aviso no lo nombra.

También se ve en una propuesta: la de `financial-controller` de 2026-11 cuenta «8/8» juntando veredictos de antes y después del cambio de `SKILL.md` del 2026-09-02. Los informes de `site-reliability-engineer` arrastran el aviso desde hace siete corridas y lo dejan para quien consolide, y la propuesta lo devuelve a quien mantenga el mecanismo.

## Causa raíz

`contractChangedAt` (`engine/agents/evaluations.js:144`) mira sólo `flow.json` o `SKILL.md`. Su resultado se compara en `engine/agents/evaluations.js:293`.

## Fix propuesto

Por revisar. Hipótesis, sin probar: un veredicto por caso vale si es posterior al último cambio de su contrato y de su caso con fixture, y el resumen cuenta aparte vigentes y vencidos en vez de «7/7 pasan». El aviso sale sólo si cambia algo que alguien pueda decidir.

## Tradeoffs

Decir «vencido» donde hoy dice «pasan» no los hace correr: re-evaluar los 53 cuesta. No todo cambio de `SKILL.md` puede mover un veredicto: comparar por fecha marcaría vencidos casos que un retoque de redacción no toca. Hay que medir eso antes de elegir.

## Contexto de descubrimiento

La revisión de las propuestas de 2026-11, PR 940 y 961.

## Relacionados

Caso 052, que corrigió un falso aviso en clones superficiales.
