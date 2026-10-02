---
caso: 247
titulo: las ramas que mergea el auto-merge del bot no se borran solas, y el barrido dependía de acordarse
estado: resuelto
resuelto-en: 0.100.0
prioridad: baja
version-detectada: 0.100.0
---

# 247 — Las ramas que mergea el bot no se borran solas, y el barrido dependía de acordarse

**🟢 resuelto en 0.100.0** · detectado en 0.100.0 · prioridad **baja**.

**Prioridad baja**: una rama mergeada que queda no rompe nada, pero se acumulan de a decenas por mes y tapan las
que sí están vivas.

## Resumen

Cuando el merge lo ejecuta el auto-merge que armó el workflow, el autor del merge es `github-actions` y
`delete_branch_on_merge` no borra la rama (caso 183). Para eso existe `prune-merged-branches.sh`, pero se corre
a mano al destrabar cada tanda, y desde el caso 246 **todo** informe de investigación se mergea así: las ramas de
los 53 informes del mes quedan, más las de las propuestas archivadas del 1.

## Reproducción

La investigación mensual y la trimestral lanzadas a mano el 2026-10-02.

## Síntoma

Después de esa tanda quedaron 29 ramas `automation/*-research-2026-10-02`, todas de PR mergeados:

| Quién mergeó | PR | ¿Se borró la rama? |
|---|---|---|
| `app/github-actions` (auto-merge armado por el workflow) | 29 | no |
| `ingeniomaps` (auto-merge armado con el PAT) | 22 | sí |

`gh api repos/ingeniomaps/cauce` devuelve `delete_branch_on_merge=true`. El barrido a mano no se había corrido.
Corrido después, borró las 29.

## Causa raíz

- `.github/scripts/prune-merged-branches.sh`: su encabezado decide que se corra a mano y no como workflow,
  porque el workflow que había (uno por cierre de PR) casi nunca encontraba ramas que borrar.
- `AGENTS.md`, «Destrabar una tanda de investigación»: el barrido es un paso que hay que acordarse de dar.

## Fix propuesto

Lo decidió Manuel el 2026-10-02: un workflow programado, una sola corrida, no una por PR.

- `prune-branches.yml` corre el script el **26** (dos días después de la investigación del 24) y el **3** (dos
  días después del ensamblaje del 1), más `workflow_dispatch`.
- Usa el mismo script, que sólo borra la rama de un PR mergeado que no se movió desde el merge.
- El encabezado del script y `AGENTS.md` dicen que el barrido lo hace el workflow.

## Tradeoffs

- Una rama cuyo PR se mergea después del barrido queda hasta el siguiente. Es inofensivo.
- Dos corridas al mes de unos segundos, en vez de ninguna.

## Contexto de descubrimiento

Manuel vio las 29 ramas abiertas mientras corría la prueba del caso 246 y preguntó qué había pasado.

## Relacionados

- **183**: por qué el auto-merge del bot no borra la rama.
- **246**: por qué ahora todos los informes se mergean así.
- **147**: por qué `--delete-branch` no sirve con `--auto`.

## Cierre

**🟢 resuelto en 0.100.0** · `.github/workflows/prune-branches.yml`, `.github/scripts/prune-merged-branches.sh`,
`AGENTS.md`, `test/repo/ci-schedule.test.js` · PR #781.

El workflow no viaja en el paquete: rige desde el merge a `main`.

### La prueba

Después del merge quedaban dos ramas que había mergeado el bot, las de la prueba del caso 246 (#780 y #782).
Se corrió `prune-branches.yml` a mano, una corrida real en GitHub (`37064293485`, `success`):

```
Image: ubuntu-26.04
automation/tech-lead-research-2026-10-02 borrada: mergeada y sin cambios desde entonces.
automation/ux-designer-research-2026-10-02 borrada: mergeada y sin cambios desde entonces.
```

Quedaron 0 ramas `automation/*`. Borró con el `GITHUB_TOKEN` del workflow (`contents: write`), sin el PAT.
El rojo previo son las 29 ramas del caso, que quedaron porque el barrido dependía de correrse a mano.

### Contra lo que el caso enumeró

- **Workflow programado el 26 y el 3, más `workflow_dispatch`** — **se hizo.** El dispatch es lo que corrió la
  prueba. Los crones se ven recién el 26 de octubre.
- **Mismo script, que sólo borra lo mergeado y sin cambios** — **se hizo**, sin tocar su lógica.
- **Encabezado del script y `AGENTS.md`** — **se hizo.**
- **Tradeoff «una rama mergeada después del barrido queda hasta el siguiente»** — **se acepta.**

